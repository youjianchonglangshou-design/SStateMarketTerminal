from __future__ import annotations

"""Read-only probability layer for the live SState Market Terminal.

Schema v4 uses the same CCI20 + SMA14 features as HistoricalTraining v3.7.
CCI is an independent correction layer: S0.5/S1/S2/S3 and the original
BB/HA Level 1-5 hierarchy remain unchanged.
"""

import json
import math
from functools import lru_cache
from pathlib import Path
from typing import Any

MODEL_PATH = Path(__file__).resolve().parent / "models" / "probability_model.json"
DISPLAY_HORIZONS = (6, 12, 18)
PRIMARY_HORIZON = 18
MAX_PREVIEW_LEVEL = 5

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

CCI_QUANTILE_FIELDS = {
    "cci_sma_gap": "cci_sma_gap_q",
    "cci_slope_3d": "cci_slope_q",
    "cci_smoothing_slope_3d": "cci_smoothing_slope_q",
    "cci_distance_to_neg100": "cci_distance_to_neg100_q",
    "midline_slope_5d": "bb_midline_slope_q",
    "midline_improvement": "bb_midline_improvement_q",
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


def _bin_run(value: int) -> str:
    if value <= 1:
        return "1"
    if value == 2:
        return "2"
    return "3_PLUS"


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


def _bandwidth_trend(record: dict[str, Any]) -> tuple[str, float]:
    upper = list(record.get("_bb_upper_series") or [])
    lower = list(record.get("_bb_lower_series") or [])
    mid = list(record.get("_bb_basis_series") or [])
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
    for u, l, m in zip(upper[-4:], lower[-4:], mid[-4:]):
        uf, lf, mf = _safe_float(u), _safe_float(l), _safe_float(m)
        if uf is None or lf is None or mf is None:
            return "UNKNOWN", 0.0
        widths.append(((uf - lf) / abs(mf) * 100.0) if abs(mf) > 1e-18 else 0.0)
    delta = widths[-1] - widths[0]
    if delta > 0.20:
        return "EXPANDING", delta
    if delta < -0.20:
        return "CONTRACTING", delta
    return "FLAT", delta


def _cci_series(record: dict[str, Any]) -> tuple[list[Any], list[Any], list[Any]]:
    cci = list(record.get("_cci_last30") or [])
    smoothing = list(record.get("_cci_smoothing_ma_last30") or [])
    colors = list(record.get("_cci_smoothing_color_last30") or [])
    if len(cci) >= 3 and len(smoothing) >= 3:
        return cci, smoothing, colors
    chart = list(record.get("chart_30d") or [])
    if chart:
        cci = [x.get("cci") for x in chart]
        smoothing = [x.get("cci_smoothing_ma") for x in chart]
        colors = [x.get("cci_smoothing_color") for x in chart]
    return cci, smoothing, colors


def _cci_zone(value: float | None) -> str:
    if value is None:
        return "UNKNOWN"
    if value < -150.0:
        return "LT_NEG150"
    if value < -120.0:
        return "NEG150_NEG120"
    if value <= -80.0:
        return "NEG120_NEG80"
    if value < 0.0:
        return "NEG80_0"
    if value < 100.0:
        return "0_100"
    return "GE_100"


def _relation(cci: float | None, smoothing: float | None) -> str:
    if cci is None or smoothing is None:
        return "UNKNOWN"
    if cci > smoothing:
        return "ABOVE"
    if cci < smoothing:
        return "BELOW"
    return "TIE"


def _relation_series(cci_values: list[Any], smoothing_values: list[Any]) -> list[str]:
    return [_relation(_safe_float(c), _safe_float(s)) for c, s in zip(cci_values, smoothing_values)]


def _relation_age(relations: list[str]) -> int:
    valid = [x for x in relations if x != "UNKNOWN"]
    if not valid:
        return 0
    current = valid[-1]
    age = 1
    for value in reversed(valid[:-1]):
        if value != current:
            break
        age += 1
    return age


def _cross_event(relations: list[str]) -> str:
    valid = [x for x in relations if x != "UNKNOWN"]
    if len(valid) < 2:
        return "UNKNOWN"
    previous, current = valid[-2], valid[-1]
    if previous in {"BELOW", "TIE"} and current == "ABOVE":
        return "CCI_CROSS_UP"
    if previous in {"ABOVE", "TIE"} and current == "BELOW":
        return "CCI_CROSS_DOWN"
    if previous == current:
        return "NO_NEW_CROSS"
    return "OTHER_CROSS"


def _normalize_smoothing_color(value: Any) -> str:
    text = str(value or "").strip().lower()
    if text == "yellow":
        return "YELLOW"
    if text == "purple":
        return "PURPLE"
    if text == "gray":
        return "GRAY"
    return "UNKNOWN"


def _smoothing_age(colors: list[Any]) -> int:
    valid = [_normalize_smoothing_color(x) for x in colors]
    valid = [x for x in valid if x != "UNKNOWN"]
    if not valid:
        return 0
    current = valid[-1]
    age = 1
    for value in reversed(valid[:-1]):
        if value != current:
            break
        age += 1
    return age


def _smoothing_turn(colors: list[Any]) -> str:
    valid = [_normalize_smoothing_color(x) for x in colors]
    valid = [x for x in valid if x != "UNKNOWN"]
    if len(valid) < 2:
        return "UNKNOWN"
    previous, current = valid[-2], valid[-1]
    if previous == "PURPLE" and current == "YELLOW":
        return "PURPLE_TO_YELLOW"
    if previous == "YELLOW" and current == "PURPLE":
        return "YELLOW_TO_PURPLE"
    if previous == current:
        return "NONE"
    if previous == "GRAY" or current == "GRAY":
        return "GRAY_TRANSITION"
    return "OTHER_TURN"


@lru_cache(maxsize=4)
def load_probability_model(path: str | None = None) -> dict[str, Any]:
    model_path = Path(path) if path else MODEL_PATH
    if not model_path.exists():
        return {"available": False, "reason": "model_file_missing", "model_path": str(model_path)}
    try:
        payload = json.loads(model_path.read_text(encoding="utf-8"))
    except Exception as exc:
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
    purple = opportunity.get("purple_structure") or {}
    base_quality = purple.get("base_quality") or {}
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

    cci_series, smoothing_series, color_series = _cci_series(record)
    cci = _safe_float(cci_series[-1]) if cci_series else None
    smoothing = _safe_float(smoothing_series[-1]) if smoothing_series else None
    relations = _relation_series(cci_series, smoothing_series)
    relation = next((x for x in reversed(relations) if x != "UNKNOWN"), "UNKNOWN")
    cross = _cross_event(relations)
    relation_age = _relation_age(relations)
    smoothing_direction = _normalize_smoothing_color(color_series[-1]) if color_series else "UNKNOWN"
    smoothing_age = _smoothing_age(color_series)
    gap = (cci - smoothing) if cci is not None and smoothing is not None else None
    cci_slope = _slope_last3(cci_series)
    smoothing_slope = _slope_last3(smoothing_series)
    zone = _cci_zone(cci)
    cross_on_yellow = (
        "CROSS_UP_YELLOW"
        if cross == "CCI_CROSS_UP" and smoothing_direction == "YELLOW"
        else "CROSS_UP_OTHER"
        if cross == "CCI_CROSS_UP"
        else "NO_CROSS_UP"
    )

    current_run = int(current.get("current_color_run_length") or 1)

    return {
        "midline_state": str(midline.get("state") or "unknown"),
        "midline_slope_5d": float(midline.get("recent_5d_slope_pct_per_day") or 0.0),
        "midline_improvement": float(midline.get("slope_improvement_pct_per_day") or 0.0),
        "bandpos": bandpos,
        "bandpos_bin": _bin_bandpos(bandpos),
        "trigger_stage": str(opportunity.get("trigger_stage") or "T0"),
        "bandwidth_trend": bandwidth_state,
        "bandwidth_delta_3d": round(float(bandwidth_delta), 8),
        "ha_color": str(current.get("ha_color") or "unknown"),
        "current_run_length": current_run,
        "current_run_bin": _bin_run(current_run),
        "state_age_bars": int(state_age_bars) if state_age_bars is not None else None,
        "state_age_bin": str(state_age_bin) if state_age_bin else None,
        "higher_low_base": bool(base_quality.get("qualified", False)),
        "purple2_passed": str(opportunity.get("trigger_stage") or "T0") == "T2",
        "cci": round(cci, 8) if cci is not None else None,
        "cci_zone": zone,
        "cci_distance_to_neg100": round(abs(cci + 100.0), 8) if cci is not None else None,
        "cci_smoothing_ma": round(smoothing, 8) if smoothing is not None else None,
        "cci_sma_gap": round(gap, 8) if gap is not None else None,
        "cci_sma_relation": relation,
        "cci_relation_age_days": int(relation_age),
        "cci_relation_age_bin": _bin_age(max(1, relation_age)) if relation_age else "UNKNOWN",
        "cci_cross_event": cross,
        "cci_slope_3d": round(cci_slope, 8) if cci_slope is not None else None,
        "cci_smoothing_slope_3d": round(smoothing_slope, 8) if smoothing_slope is not None else None,
        "cci_smoothing_direction": smoothing_direction,
        "cci_smoothing_age_days": int(smoothing_age),
        "cci_smoothing_age_bin": _bin_age(max(1, smoothing_age)) if smoothing_age else "UNKNOWN",
        "cci_smoothing_turn_event": _smoothing_turn(color_series),
        "cci_cross_on_yellow": cross_on_yellow,
        "cci_regime": (
            f"{relation}_{smoothing_direction}"
            if relation != "UNKNOWN" and smoothing_direction != "UNKNOWN"
            else "UNKNOWN"
        ),
    }


def _signature(features: dict[str, Any], fields: list[str]) -> str:
    if not fields:
        return "BASELINE"
    return "|".join(f"{field}={features.get(field)}" for field in fields)


def _outcome_payload(node: dict[str, Any]) -> dict[str, Any]:
    outcomes = node.get("outcomes") or {}

    def p(key: str) -> float | None:
        return _safe_float((outcomes.get(key) or {}).get("probability"))

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
        return {OUTCOME_SUCCESS: success, OUTCOME_ALIVE: 0.0, OUTCOME_FAIL: 0.0, OUTCOME_OTHER: 1.0 - success}
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
    return hnode["baseline"], {"level": 0, "fields": [], "signature": "BASELINE", "fallback": True}


def _apply_cci_binning(features: dict[str, Any], binning: dict[str, Any]) -> dict[str, Any]:
    enriched = dict(features)
    for raw_field, q_field in CCI_QUANTILE_FIELDS.items():
        value = _safe_float(features.get(raw_field))
        node = binning.get(raw_field) or {}
        q33, q67 = _safe_float(node.get("q33")), _safe_float(node.get("q67"))
        if value is None or q33 is None or q67 is None:
            enriched[q_field] = "UNKNOWN"
        elif value <= q33:
            enriched[q_field] = "LOW"
        elif value <= q67:
            enriched[q_field] = "MID"
        else:
            enriched[q_field] = "HIGH"
    return enriched


def _lookup_cci_facets(
    state_node: dict[str, Any],
    hnode: dict[str, Any],
    features: dict[str, Any],
    min_samples: int,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    expert = hnode.get("cci_expert") or {}
    enriched = _apply_cci_binning(features, state_node.get("cci_binning") or {})
    if not expert:
        return [], enriched
    matches: list[dict[str, Any]] = []
    for facet in expert.get("facets") or []:
        fields = list(facet.get("fields") or [])
        sig = _signature(enriched, fields)
        rule = _find_rule(list(facet.get("rules") or []), sig, min_samples)
        if rule is None:
            continue
        matches.append({
            "name": str(facet.get("name") or "facet"),
            "fields": fields,
            "signature": sig,
            "rule": rule,
        })
    return matches, enriched


def _combine_with_cci(
    base_node: dict[str, Any],
    baseline_node: dict[str, Any],
    cci_matches: list[dict[str, Any]],
    *,
    prior_strength: float,
    raw: bool = False,
) -> tuple[dict[str, float], float, list[dict[str, Any]]]:
    base_probs = _outcome_probs(base_node, raw=raw)
    if not cci_matches:
        return base_probs, 0.0, []
    baseline_probs = _outcome_probs(baseline_node, raw=raw)
    eps = 1e-9
    weighted_logs = {key: 0.0 for key in OUTCOME_KEYS}
    weights: list[float] = []
    audit: list[dict[str, Any]] = []

    for match in cci_matches:
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
            "structural_survival_probability": round(facet_probs[OUTCOME_SUCCESS] + facet_probs[OUTCOME_ALIVE], 6),
            "true_fail_probability": round(facet_probs[OUTCOME_FAIL], 6),
        })

    weight_sum = sum(weights)
    if weight_sum <= 0:
        return base_probs, 0.0, audit
    blend_strength = min(1.0, weight_sum / len(weights))
    logs: dict[str, float] = {}
    for key in OUTCOME_KEYS:
        avg_log_ratio = weighted_logs[key] / weight_sum
        logs[key] = math.log(max(eps, base_probs[key])) + blend_strength * avg_log_ratio
    peak = max(logs.values())
    exp_values = {key: math.exp(value - peak) for key, value in logs.items()}
    total = sum(exp_values.values())
    return {key: exp_values[key] / total for key in OUTCOME_KEYS}, blend_strength, audit


def _prediction_payload(
    base_node: dict[str, Any],
    base_meta: dict[str, Any],
    baseline_node: dict[str, Any],
    cci_matches: list[dict[str, Any]],
    enriched: dict[str, Any],
    *,
    prior_strength: float,
    version: str | None,
) -> dict[str, Any]:
    combined, blend_strength, audit = _combine_with_cci(
        base_node, baseline_node, cci_matches, prior_strength=prior_strength, raw=False
    )
    raw_combined, _, _ = _combine_with_cci(
        base_node, baseline_node, cci_matches, prior_strength=prior_strength, raw=True
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
    survival = success + combined[OUTCOME_ALIVE]
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
        "cci_expert": {
            "available": bool(cci_matches),
            "version": version,
            "matched_facets": audit,
            "matched_facet_count": len(audit),
            "blend_strength": round(blend_strength, 6),
            "bins": {
                **{q_field: enriched.get(q_field) for q_field in CCI_QUANTILE_FIELDS.values()},
                "cci_zone": enriched.get("cci_zone"),
                "cci_cross_event": enriched.get("cci_cross_event"),
                "cci_smoothing_direction": enriched.get("cci_smoothing_direction"),
                "cci_smoothing_turn_event": enriched.get("cci_smoothing_turn_event"),
                "cci_regime": enriched.get("cci_regime"),
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
    cci_version = (model.get("cci_expert_contract") or {}).get("version")
    cci_matches, enriched = _lookup_cci_facets(state_node, hnode, features, min_samples)

    if not cci_matches:
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
            "cci_expert": {
                "available": False,
                "version": cci_version,
                "matched_facets": [],
                "matched_facet_count": 0,
                "blend_strength": 0.0,
                "bins": {
                    **{q_field: enriched.get(q_field) for q_field in CCI_QUANTILE_FIELDS.values()},
                    "cci_zone": enriched.get("cci_zone"),
                    "cci_cross_event": enriched.get("cci_cross_event"),
                    "cci_smoothing_direction": enriched.get("cci_smoothing_direction"),
                    "cci_smoothing_turn_event": enriched.get("cci_smoothing_turn_event"),
                    "cci_regime": enriched.get("cci_regime"),
                },
            },
        }

    return _prediction_payload(
        base_node,
        base_meta,
        hnode["baseline"],
        cci_matches,
        enriched,
        prior_strength=float(model.get("prior_strength", 20.0)),
        version=cci_version,
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
    predictions = {
        str(h): lookup_probability(model, state=state, horizon=int(h), features=features, max_level=MAX_PREVIEW_LEVEL)
        for h in horizons
    }
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
        "cci_expert_version": (model.get("cci_expert_contract") or {}).get("version"),
    }


def human_feature_summary(features: dict[str, Any]) -> str:
    return "｜".join([
        str(features.get("midline_state") or "中軌未知"),
        f"CCI {features.get('cci') if features.get('cci') is not None else '—'}",
        str(features.get("cci_zone") or "CCI區域未知"),
        str(features.get("cci_cross_event") or "交叉未知"),
        str(features.get("cci_smoothing_direction") or "SMA方向未知"),
        str(features.get("ha_color") or "HA未知"),
    ])


def state_target_label(state: str) -> str:
    return {
        "S0.5": "S1 或更高",
        "S1": "BandPos > 0.75",
        "S2": "S3",
        "S3": "BandPos > 0.75",
    }.get(str(state), "未建模")
