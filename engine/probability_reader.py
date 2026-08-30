from __future__ import annotations

"""Read-only probability layer for the live SState Market Terminal.

The S-state engine remains the source of truth. This module maps the current
engine output to the probability model produced by HistoricalTraining.

Schema v3 adds DMI Expert as an *independent correction layer*. It never
changes S0.5/S1/S2/S3. The legacy BB/HA Level 1-5 match is selected first,
then eligible DMI facets adjust the four-way outcome distribution using the
same reliability-weighted geometric-mean combiner used by HistoricalTraining.
Schema v1/v2 stays backward compatible.
"""

import json
import math
from functools import lru_cache
from pathlib import Path
from typing import Any

MODEL_PATH = Path(__file__).resolve().parent / "models" / "probability_model.json"
DISPLAY_HORIZONS = (6, 12, 18)  # 24H / 48H / 72H
PRIMARY_HORIZON = 18            # 3 days for swing-capital efficiency
MAX_PREVIEW_LEVEL = 5           # live monitor exports HistoricalTraining-compatible state_age_bars
DMI_AXIS = 20.0

OUTCOME_SUCCESS = "SUCCESS_WITHIN_HORIZON"
OUTCOME_ALIVE = "ALIVE_SLOW"
OUTCOME_FAIL = "TRUE_FAIL"
OUTCOME_OTHER = "OTHER"
OUTCOME_KEYS = (OUTCOME_SUCCESS, OUTCOME_ALIVE, OUTCOME_FAIL, OUTCOME_OTHER)
OUTCOME_LABELS_ZH = {
    OUTCOME_SUCCESS: "期限內成功",
    OUTCOME_ALIVE: "還活著只是慢",
    OUTCOME_FAIL: "真失敗",
    OUTCOME_OTHER: "其他",
}

DMI_QUANTILE_FIELDS = {
    "di_abs_gap": "di_abs_gap_q",
    "di_axis_distance": "di_axis_distance_q",
    "di_plus_slope_3d": "di_plus_slope_q",
    "di_minus_slope_3d": "di_minus_slope_q",
    "di_gap_slope_3d": "di_gap_slope_q",
    "adx": "adx_q",
    "adx_slope_3d": "adx_slope_q",
}


def _safe_float(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _bin_bandpos(value: float) -> str:
    if value < 0.25:
        return "LT_025"
    if value < 0.50:
        return "025_050"
    if value < 0.60:
        return "050_060"
    if value < 0.75:
        return "060_075"
    return "GE_075"


def _bin_age(value: int) -> str:
    if value <= 1:
        return "1"
    if value <= 3:
        return "2_3"
    if value <= 6:
        return "4_6"
    return "7_PLUS"


def _valid_series(values: list[Any]) -> list[float]:
    output: list[float] = []
    for value in values:
        number = _safe_float(value)
        if number is not None:
            output.append(number)
    return output


def _slope_last3(values: list[Any]) -> float | None:
    series = _valid_series(values)
    if len(series) < 3:
        return None
    return (series[-1] - series[-3]) / 2.0


def _dmi_relation(di_plus: float | None, di_minus: float | None) -> str:
    if di_plus is None or di_minus is None:
        return "UNKNOWN"
    if di_plus > di_minus:
        return "PLUS"
    if di_minus > di_plus:
        return "MINUS"
    return "TIE"


def _dmi_axis_zone(di_plus: float | None, di_minus: float | None) -> str:
    if di_plus is None or di_minus is None:
        return "UNKNOWN"
    plus_above = di_plus > DMI_AXIS
    minus_above = di_minus > DMI_AXIS
    plus_below = di_plus < DMI_AXIS
    minus_below = di_minus < DMI_AXIS
    if plus_above and minus_above:
        return "BOTH_ABOVE_20"
    if plus_below and minus_below:
        return "BOTH_BELOW_20"
    if plus_above and not minus_above:
        return "PLUS_ONLY_ABOVE_20"
    if minus_above and not plus_above:
        return "MINUS_ONLY_ABOVE_20"
    return "TOUCHING_20"


def _bandwidth_trend(record: dict[str, Any]) -> tuple[str, float]:
    """Use the exact historical-training definition whenever live arrays exist."""
    upper = list(record.get("_bb_upper_series") or [])
    lower = list(record.get("_bb_lower_series") or [])
    mid = list(record.get("_bb_basis_series") or [])

    # snapshot records keep the same values in chart_30d.
    if len(upper) < 4 or len(lower) < 4 or len(mid) < 4:
        chart = list(record.get("chart_30d") or [])
        if len(chart) >= 4:
            tail = chart[-4:]
            upper = [x.get("bb_upper") for x in tail]
            lower = [x.get("bb_lower") for x in tail]
            mid = [x.get("bb_midline") for x in tail]

    if len(upper) < 4 or len(lower) < 4 or len(mid) < 4:
        return "UNKNOWN", 0.0

    widths: list[float] = []
    try:
        for u, l, m in zip(upper[-4:], lower[-4:], mid[-4:]):
            uf = _safe_float(u)
            lf = _safe_float(l)
            mf = _safe_float(m)
            if uf is None or lf is None or mf is None:
                return "UNKNOWN", 0.0
            widths.append(((uf - lf) / abs(mf) * 100.0) if abs(mf) > 1e-18 else 0.0)
    except (TypeError, ValueError):
        return "UNKNOWN", 0.0

    delta = widths[-1] - widths[0]
    if delta > 0.20:
        return "EXPANDING", delta
    if delta < -0.20:
        return "CONTRACTING", delta
    return "FLAT", delta


def _dmi_series(record: dict[str, Any]) -> tuple[list[Any], list[Any], list[Any]]:
    plus = list(record.get("_di_plus_last30") or [])
    minus = list(record.get("_di_minus_last30") or [])
    adx = list(record.get("_adx_last30") or [])
    if len(plus) >= 3 and len(minus) >= 3 and len(adx) >= 3:
        return plus, minus, adx

    chart = list(record.get("chart_30d") or [])
    if chart:
        plus = [x.get("di_plus") for x in chart]
        minus = [x.get("di_minus") for x in chart]
        adx = [x.get("adx") for x in chart]
    return plus, minus, adx


@lru_cache(maxsize=4)
def load_probability_model(path: str | None = None) -> dict[str, Any]:
    model_path = Path(path) if path else MODEL_PATH
    if not model_path.exists():
        return {
            "available": False,
            "reason": "model_file_missing",
            "model_path": str(model_path),
        }
    try:
        payload = json.loads(model_path.read_text(encoding="utf-8"))
    except Exception as exc:  # UI must not break if model JSON is damaged.
        return {
            "available": False,
            "reason": f"model_load_error:{type(exc).__name__}",
            "model_path": str(model_path),
        }
    payload["available"] = True
    payload["model_path"] = str(model_path)
    return payload


def extract_live_features(record: dict[str, Any], opportunity: dict[str, Any]) -> dict[str, Any]:
    current = opportunity.get("current") or {}
    midline = opportunity.get("midline") or {}
    try:
        bandpos = float(current.get("ha_band_position", 0.5) or 0.5)
    except (TypeError, ValueError):
        bandpos = 0.5
    bandwidth_state, bandwidth_delta = _bandwidth_trend(record)

    state_age_bars = record.get("_state_age_bars")
    state_age_bin = record.get("_state_age_bin")
    if state_age_bars is None:
        state_age_bars = record.get("state_age_bars")
    if not state_age_bin:
        state_age_bin = record.get("state_age_bin")

    plus_series, minus_series, adx_series = _dmi_series(record)
    di_plus = _safe_float(plus_series[-1]) if plus_series else None
    di_minus = _safe_float(minus_series[-1]) if minus_series else None
    adx = _safe_float(adx_series[-1]) if adx_series else None
    relation = _dmi_relation(di_plus, di_minus)
    di_gap = (di_plus - di_minus) if di_plus is not None and di_minus is not None else None
    di_abs_gap = abs(di_gap) if di_gap is not None else None
    di_axis_distance = (
        (abs(di_plus - DMI_AXIS) + abs(di_minus - DMI_AXIS)) / 2.0
        if di_plus is not None and di_minus is not None
        else None
    )
    plus_slope = _slope_last3(plus_series)
    minus_slope = _slope_last3(minus_series)
    gap_series: list[float] = []
    for p, m in zip(plus_series, minus_series):
        pf = _safe_float(p)
        mf = _safe_float(m)
        if pf is not None and mf is not None:
            gap_series.append(pf - mf)
    gap_slope = _slope_last3(gap_series)
    adx_slope = _slope_last3(adx_series)

    # HistoricalTraining measures relation age in consecutive 4H replay cutoffs.
    # analysis_core exports exactly that replayed age. If its replayed relation
    # does not equal the current daily-DMI relation, do not use cross_momentum;
    # the other three DMI facets remain valid.
    dmi_age = record.get("_dmi_relation_age_bars")
    dmi_age_bin = record.get("_dmi_relation_age_bin")
    dmi_age_relation = record.get("_dmi_relation_age_relation")
    if dmi_age is None:
        dmi_age = record.get("dmi_relation_age_bars")
    if not dmi_age_bin:
        dmi_age_bin = record.get("dmi_relation_age_bin")
    if not dmi_age_relation:
        dmi_age_relation = record.get("dmi_relation_age_relation")

    relation_age_valid = bool(
        dmi_age is not None
        and str(dmi_age_relation or "UNKNOWN") == relation
        and relation in {"PLUS", "MINUS", "TIE"}
    )
    if relation_age_valid:
        try:
            dmi_age = max(1, int(dmi_age))
        except (TypeError, ValueError):
            relation_age_valid = False
    if not relation_age_valid:
        dmi_age = None
        dmi_age_bin = None
    elif not dmi_age_bin:
        dmi_age_bin = _bin_age(int(dmi_age))

    return {
        # Legacy Level 1-5 features.
        "midline_state": str(midline.get("state") or "unknown"),
        "bandpos": bandpos,
        "bandpos_bin": _bin_bandpos(bandpos),
        "trigger_stage": str(opportunity.get("trigger_stage") or "T0"),
        "bandwidth_trend": bandwidth_state,
        "bandwidth_delta_3d": round(float(bandwidth_delta), 8),
        "state_age_bars": int(state_age_bars) if state_age_bars is not None else None,
        "state_age_bin": str(state_age_bin) if state_age_bin else None,
        # DMI Expert raw features, kept identical to HistoricalTraining v3.
        "di_plus": round(di_plus, 8) if di_plus is not None else None,
        "di_minus": round(di_minus, 8) if di_minus is not None else None,
        "di_gap": round(di_gap, 8) if di_gap is not None else None,
        "di_abs_gap": round(di_abs_gap, 8) if di_abs_gap is not None else None,
        "di_axis_distance": round(di_axis_distance, 8) if di_axis_distance is not None else None,
        "di_plus_slope_3d": round(plus_slope, 8) if plus_slope is not None else None,
        "di_minus_slope_3d": round(minus_slope, 8) if minus_slope is not None else None,
        "di_gap_slope_3d": round(gap_slope, 8) if gap_slope is not None else None,
        "adx": round(adx, 8) if adx is not None else None,
        "adx_slope_3d": round(adx_slope, 8) if adx_slope is not None else None,
        "dmi_relation": relation,
        "dmi_axis_zone": _dmi_axis_zone(di_plus, di_minus),
        "dmi_cross_age_bars": int(dmi_age) if dmi_age is not None else None,
        "dmi_cross_age_bin": str(dmi_age_bin) if dmi_age_bin else "UNKNOWN",
        "dmi_cross_age_valid": relation_age_valid,
    }


def _signature(features: dict[str, Any], fields: list[str]) -> str:
    if not fields:
        return "BASELINE"
    return "|".join(f"{field}={features.get(field)}" for field in fields)


def _outcome_payload(node: dict[str, Any]) -> dict[str, Any]:
    """Normalize v2/v3 four-way settlement fields while staying v1-compatible."""
    outcomes = node.get("outcomes") or {}

    def p(key: str) -> float | None:
        item = outcomes.get(key) or {}
        value = item.get("probability")
        return _safe_float(value)

    success = p(OUTCOME_SUCCESS)
    alive = p(OUTCOME_ALIVE)
    true_fail = p(OUTCOME_FAIL)
    other = p(OUTCOME_OTHER)

    if success is None:
        success = _safe_float(node.get("probability")) or 0.0

    survival = _safe_float(node.get("structural_survival_probability"))
    if survival is None and alive is not None:
        survival = success + alive

    return {
        "outcomes": outcomes,
        "success_probability": success,
        "alive_slow_probability": alive,
        "true_fail_probability": true_fail,
        "other_probability": other,
        "structural_survival_probability": survival,
        "late_success_4_7d": node.get("late_success_4_7d"),
    }


def _outcome_probs(node: dict[str, Any], *, raw: bool = False) -> dict[str, float]:
    outcomes = node.get("outcomes") or {}
    field = "raw_probability" if raw else "probability"
    values: dict[str, float] = {}
    for key in OUTCOME_KEYS:
        item = outcomes.get(key) or {}
        value = _safe_float(item.get(field))
        if value is None and raw:
            value = _safe_float(item.get("probability"))
        values[key] = max(0.0, float(value or 0.0))
    total = sum(values.values())
    if total <= 0:
        success = max(0.0, min(1.0, float(node.get("probability", 0.0) or 0.0)))
        return {
            OUTCOME_SUCCESS: success,
            OUTCOME_ALIVE: 0.0,
            OUTCOME_FAIL: 0.0,
            OUTCOME_OTHER: 1.0 - success,
        }
    return {key: value / total for key, value in values.items()}


def _find_rule(rules: list[dict[str, Any]], signature: str, min_samples: int) -> dict[str, Any] | None:
    for rule in rules:
        if rule.get("signature") == signature and int(rule.get("samples", 0)) >= min_samples:
            return rule
    return None


def _lookup_base_rule(
    hnode: dict[str, Any],
    features: dict[str, Any],
    min_samples: int,
    max_level: int,
) -> tuple[dict[str, Any], dict[str, Any]]:
    levels = [x for x in (hnode.get("levels") or []) if int(x.get("level", 0)) <= int(max_level)]
    for level in reversed(levels):
        fields = list(level.get("fields") or [])
        sig = _signature(features, fields)
        rule = _find_rule(list(level.get("rules") or []), sig, min_samples)
        if rule is not None:
            return rule, {
                "level": int(level.get("level", 0)),
                "fields": fields,
                "signature": sig,
                "fallback": False,
            }
    return hnode["baseline"], {
        "level": 0,
        "fields": [],
        "signature": "BASELINE",
        "fallback": True,
    }


def _apply_dmi_binning(features: dict[str, Any], binning: dict[str, Any]) -> dict[str, Any]:
    enriched = dict(features)
    for raw_field, q_field in DMI_QUANTILE_FIELDS.items():
        value = _safe_float(features.get(raw_field))
        node = binning.get(raw_field) or {}
        q33 = _safe_float(node.get("q33"))
        q67 = _safe_float(node.get("q67"))
        if value is None or q33 is None or q67 is None:
            enriched[q_field] = "UNKNOWN"
        elif value <= q33:
            enriched[q_field] = "LOW"
        elif value <= q67:
            enriched[q_field] = "MID"
        else:
            enriched[q_field] = "HIGH"
    return enriched


def _lookup_dmi_facets(
    state_node: dict[str, Any],
    hnode: dict[str, Any],
    features: dict[str, Any],
    min_samples: int,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    expert = hnode.get("dmi_expert") or {}
    if not expert:
        return [], dict(features)
    enriched = _apply_dmi_binning(features, state_node.get("dmi_binning") or {})
    matches: list[dict[str, Any]] = []
    for facet in expert.get("facets") or []:
        name = str(facet.get("name") or "facet")
        fields = list(facet.get("fields") or [])
        # Training cross_momentum requires 4H relation-age semantics. If the
        # live replay age could not be verified, skip this one facet rather
        # than manufacturing a daily-age substitute.
        if name == "cross_momentum" and not bool(features.get("dmi_cross_age_valid")):
            continue
        sig = _signature(enriched, fields)
        rule = _find_rule(list(facet.get("rules") or []), sig, min_samples)
        if rule is None:
            continue
        matches.append({
            "name": name,
            "fields": fields,
            "signature": sig,
            "rule": rule,
        })
    return matches, enriched


def _combine_with_dmi(
    base_node: dict[str, Any],
    baseline_node: dict[str, Any],
    dmi_matches: list[dict[str, Any]],
    *,
    prior_strength: float,
    raw: bool = False,
) -> tuple[dict[str, float], float, list[dict[str, Any]]]:
    """Exact HistoricalTraining v3 DMI Expert combiner."""
    base_probs = _outcome_probs(base_node, raw=raw)
    if not dmi_matches:
        return base_probs, 0.0, []

    baseline_probs = _outcome_probs(baseline_node, raw=raw)
    eps = 1e-9
    weighted_logs = {key: 0.0 for key in OUTCOME_KEYS}
    weights: list[float] = []
    audit: list[dict[str, Any]] = []

    for match in dmi_matches:
        rule = match["rule"]
        n = int(rule.get("samples", 0))
        reliability = n / (n + max(1.0, float(prior_strength)))
        weights.append(reliability)
        facet_probs = _outcome_probs(rule, raw=raw)
        for key in OUTCOME_KEYS:
            ratio = max(eps, facet_probs[key]) / max(eps, baseline_probs[key])
            weighted_logs[key] += reliability * math.log(ratio)
        audit.append({
            "name": match["name"],
            "fields": match["fields"],
            "signature": match["signature"],
            "samples": n,
            "reliability": round(reliability, 6),
            "success_probability": round(facet_probs[OUTCOME_SUCCESS], 6),
            "structural_survival_probability": round(
                facet_probs[OUTCOME_SUCCESS] + facet_probs[OUTCOME_ALIVE], 6
            ),
            "true_fail_probability": round(facet_probs[OUTCOME_FAIL], 6),
        })

    weight_sum = sum(weights)
    if weight_sum <= 0:
        return base_probs, 0.0, audit

    # Facets overlap; HistoricalTraining uses a reliability-weighted geometric
    # mean instead of multiplying every likelihood ratio at full strength.
    blend_strength = min(1.0, weight_sum / len(weights))
    logs: dict[str, float] = {}
    for key in OUTCOME_KEYS:
        avg_log_ratio = weighted_logs[key] / weight_sum
        logs[key] = math.log(max(eps, base_probs[key])) + blend_strength * avg_log_ratio

    peak = max(logs.values())
    exp_values = {key: math.exp(value - peak) for key, value in logs.items()}
    total = sum(exp_values.values())
    combined = {key: exp_values[key] / total for key in OUTCOME_KEYS}
    return combined, blend_strength, audit


def _dmi_prediction_payload(
    base_node: dict[str, Any],
    base_meta: dict[str, Any],
    baseline_node: dict[str, Any],
    dmi_matches: list[dict[str, Any]],
    enriched_features: dict[str, Any],
    *,
    prior_strength: float,
    version: str | None,
) -> dict[str, Any]:
    combined, blend_strength, audit = _combine_with_dmi(
        base_node,
        baseline_node,
        dmi_matches,
        prior_strength=prior_strength,
        raw=False,
    )
    raw_combined, _, _ = _combine_with_dmi(
        base_node,
        baseline_node,
        dmi_matches,
        prior_strength=prior_strength,
        raw=True,
    )

    outcome_payload = {
        key: {
            "label_zh": OUTCOME_LABELS_ZH[key],
            "probability": round(combined[key], 6),
            "raw_probability": round(raw_combined[key], 6),
        }
        for key in OUTCOME_KEYS
    }
    success = combined[OUTCOME_SUCCESS]
    survival = combined[OUTCOME_SUCCESS] + combined[OUTCOME_ALIVE]

    return {
        "available": True,
        "probability": float(success),
        "raw_probability": float(raw_combined[OUTCOME_SUCCESS]),
        "samples": int(base_node.get("samples", 0)),
        "wins": int(base_node.get("wins", 0)),
        "level": int(base_meta["level"]),
        "fields": list(base_meta["fields"]),
        "signature": str(base_meta["signature"]),
        "wilson95": base_node.get("wilson95"),
        "fallback": bool(base_meta.get("fallback", False)),
        "outcomes": outcome_payload,
        "success_probability": float(success),
        "alive_slow_probability": float(combined[OUTCOME_ALIVE]),
        "structural_survival_probability": float(survival),
        "true_fail_probability": float(combined[OUTCOME_FAIL]),
        "other_probability": float(combined[OUTCOME_OTHER]),
        "late_success_4_7d": base_node.get("late_success_4_7d"),
        "dmi_expert": {
            "available": bool(dmi_matches),
            "version": version,
            "matched_facets": audit,
            "matched_facet_count": len(audit),
            "blend_strength": round(blend_strength, 6),
            "bins": {
                q_field: enriched_features.get(q_field)
                for q_field in DMI_QUANTILE_FIELDS.values()
            },
        },
    }


def lookup_probability(
    model: dict[str, Any],
    *,
    state: str,
    horizon: int,
    features: dict[str, Any],
    max_level: int = MAX_PREVIEW_LEVEL,
) -> dict[str, Any]:
    if not model.get("available", True):
        return {"available": False, "reason": model.get("reason", "model_unavailable")}

    state_node = (model.get("states") or {}).get(state)
    if not state_node:
        return {"available": False, "reason": "state_missing"}
    hnode = (state_node.get("horizons") or {}).get(str(horizon))
    if not hnode:
        return {"available": False, "reason": "horizon_missing"}

    min_samples = int(model.get("default_min_samples", 50))
    base_node, base_meta = _lookup_base_rule(hnode, features, min_samples, max_level)

    # Schema v1/v2 or v3 horizons without DMI remain exactly backward-compatible.
    dmi_matches, enriched = _lookup_dmi_facets(state_node, hnode, features, min_samples)
    dmi_version = (model.get("dmi_expert_contract") or {}).get("version")
    if not dmi_matches:
        return {
            "available": True,
            "probability": float(base_node.get("probability", 0.0)),
            "raw_probability": float(base_node.get("raw_probability", base_node.get("probability", 0.0))),
            "samples": int(base_node.get("samples", 0)),
            "wins": int(base_node.get("wins", 0)),
            "level": int(base_meta["level"]),
            "fields": list(base_meta["fields"]),
            "signature": str(base_meta["signature"]),
            "wilson95": base_node.get("wilson95"),
            "fallback": bool(base_meta.get("fallback", False)),
            **_outcome_payload(base_node),
            "dmi_expert": {
                "available": False,
                "version": dmi_version,
                "matched_facets": [],
                "matched_facet_count": 0,
                "blend_strength": 0.0,
                "bins": {
                    q_field: enriched.get(q_field)
                    for q_field in DMI_QUANTILE_FIELDS.values()
                },
            },
        }

    return _dmi_prediction_payload(
        base_node,
        base_meta,
        hnode["baseline"],
        dmi_matches,
        enriched,
        prior_strength=float(model.get("prior_strength", 20.0)),
        version=dmi_version,
    )


def predict_record(
    record: dict[str, Any],
    opportunity: dict[str, Any] | None = None,
    horizons: tuple[int, ...] = DISPLAY_HORIZONS,
) -> dict[str, Any]:
    opp = opportunity or record.get("_long_opportunity") or record.get("opportunity_long") or {}
    state = str(opp.get("market_state_id") or "OTHER")
    if state not in {"S0.5", "S1", "S2", "S3"}:
        return {"available": False, "reason": "state_not_modeled", "state": state}

    model = load_probability_model()
    if not model.get("available"):
        return {"available": False, "reason": model.get("reason", "model_unavailable"), "state": state}

    features = extract_live_features(record, opp)
    predictions: dict[str, Any] = {}
    for horizon in horizons:
        predictions[str(horizon)] = lookup_probability(
            model,
            state=state,
            horizon=int(horizon),
            features=features,
            max_level=MAX_PREVIEW_LEVEL,
        )

    primary = predictions.get(str(PRIMARY_HORIZON)) or {}
    target = ((model.get("states") or {}).get(state) or {}).get("target")
    return {
        "available": bool(primary.get("available")),
        "state": state,
        "target": target,
        "features": features,
        "predictions": predictions,
        "primary_horizon": PRIMARY_HORIZON,
        "primary": primary,
        "model_id": model.get("model_id"),
        "schema_version": model.get("schema_version"),
        "generated_at": model.get("generated_at"),
        "max_level": MAX_PREVIEW_LEVEL,
        "dmi_expert_version": (model.get("dmi_expert_contract") or {}).get("version"),
    }


def human_feature_summary(features: dict[str, Any]) -> str:
    mid_map = {
        "rising": "中軌上斜",
        "flat": "中軌平緩",
        "flattening": "中軌走平",
        "falling": "中軌下斜",
        "unknown": "中軌未知",
    }
    band_map = {
        "LT_025": "位置<0.25",
        "025_050": "位置0.25-0.50",
        "050_060": "位置0.50-0.60",
        "060_075": "位置0.60-0.75",
        "GE_075": "位置>0.75",
    }
    trig_map = {
        "T0": "T0等待轉黃",
        "T1": "T1剛觸發",
        "T2": "T2已觸發",
    }
    bw_map = {
        "EXPANDING": "布林擴張",
        "CONTRACTING": "布林收縮",
        "FLAT": "布林平穩",
        "UNKNOWN": "布林未知",
    }
    parts = [
        mid_map.get(str(features.get("midline_state") or "unknown"), f"中軌{features.get('midline_state') or '未知'}"),
        band_map.get(str(features.get("bandpos_bin") or ""), f"位置{features.get('bandpos_bin') or '?'}"),
        trig_map.get(str(features.get("trigger_stage") or "T0"), f"觸發{features.get('trigger_stage') or 'T0'}"),
        bw_map.get(str(features.get("bandwidth_trend") or "UNKNOWN"), f"布林{features.get('bandwidth_trend') or '未知'}"),
    ]
    age_bin = str(features.get("state_age_bin") or "")
    age_map = {"1": "狀態第1根4H", "2_3": "狀態2-3根4H", "4_6": "狀態4-6根4H", "7_PLUS": "狀態7+根4H"}
    if age_bin:
        parts.append(age_map.get(age_bin, f"狀態年齡{age_bin}"))
    relation = str(features.get("dmi_relation") or "UNKNOWN")
    if relation in {"PLUS", "MINUS", "TIE"}:
        relation_zh = {"PLUS": "DI+領先", "MINUS": "DI−領先", "TIE": "DI平手"}[relation]
        cross_age = features.get("dmi_cross_age_bin")
        if cross_age and cross_age != "UNKNOWN":
            relation_zh += f"({cross_age})"
        parts.append(relation_zh)
    return "｜".join(parts)


def state_target_label(state: str) -> str:
    return {
        "S0.5": "3日內轉強",
        "S1": "3日內上攻",
        "S2": "3日內轉S3",
        "S3": "3日內續強",
    }.get(state, "3日機率")
