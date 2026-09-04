from __future__ import annotations

"""Read-only probability layer for the live SState Market Terminal.

Schema v5 uses CCI-PRIMARY path trees. S-state selects the target/question only;
CCI20/SMA14 path memory + BB midline path + HA context directly determine the
4-way probability. Legacy Schema 4 models remain readable during deployment.
"""

import json
import math
from functools import lru_cache
from pathlib import Path
from typing import Any

from symbols_config import is_rwa_symbol

MODEL_PATH = Path(__file__).resolve().parent / "models" / "probability_model.json"
DISPLAY_HORIZONS = (6, 12, 18)
PRIMARY_HORIZON = 18
MAX_PREVIEW_LEVEL = 6

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

PATH_QUANTILE_FIELDS = {
    "cci_sma_gap": "cci_sma_gap_q",
    "cci_gap_velocity_1d": "cci_gap_velocity_q",
    "cci_gap_acceleration": "cci_gap_acceleration_q",
    "cci_slope_1d": "cci_slope_1d_q",
    "cci_slope_3d": "cci_slope_3d_q",
    "cci_acceleration": "cci_acceleration_q",
    "cci_smoothing_slope_1d": "cci_smoothing_slope_1d_q",
    "cci_smoothing_slope_3d": "cci_smoothing_slope_3d_q",
    "cci_distance_to_neg100": "cci_distance_to_neg100_q",
    "cci_distance_to_zero": "cci_distance_to_zero_q",
    "midline_slope_1d": "midline_slope_1d_q",
    "midline_slope_3d": "midline_slope_3d_q",
    "midline_slope_change_3d": "midline_slope_change_q",
    "price_high_delta_pct": "price_high_delta_q",
    "cci_high_delta": "cci_high_delta_q",
    "price_low_delta_pct": "price_low_delta_q",
    "cci_low_delta": "cci_low_delta_q",
}

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


def _safe_float(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _aligned_float_series(values: list[Any]) -> list[float | None]:
    return [_safe_float(value) for value in values]


def _valid_series(values: list[Any]) -> list[float]:
    return [value for value in (_safe_float(x) for x in values) if value is not None]


def _slope(values: list[Any], lookback: int) -> float | None:
    series = _valid_series(values)
    if len(series) < lookback + 1:
        return None
    return (series[-1] - series[-1 - lookback]) / float(lookback)


def _pct_slope(values: list[Any], lookback: int, end_offset: int = 0) -> float | None:
    series = _aligned_float_series(values)
    end = len(series) - 1 - max(0, int(end_offset))
    start = end - max(1, int(lookback))
    if start < 0 or end < 0:
        return None
    a = series[start]
    b = series[end]
    if a is None or b is None or abs(a) <= 1e-18:
        return None
    return ((b - a) / abs(a) * 100.0) / float(max(1, lookback))


def _bandwidth_trend(record: dict[str, Any]) -> tuple[str, float]:
    upper = list(record.get("_bb_upper_series") or [])
    lower = list(record.get("_bb_lower_series") or [])
    mid = list(record.get("_bb_basis_series") or [])
    if len(upper) < 4 or len(lower) < 4 or len(mid) < 4:
        return "UNKNOWN", 0.0
    widths = []
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
    if value < 150.0:
        return "100_150"
    return "GE_150"


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
    if not relations:
        return 0
    index = len(relations) - 1
    while index >= 0 and relations[index] == "UNKNOWN":
        index -= 1
    if index < 0:
        return 0
    current = relations[index]
    age = 1
    index -= 1
    while index >= 0:
        if relations[index] == "UNKNOWN":
            index -= 1
            continue
        if relations[index] != current:
            break
        age += 1
        index -= 1
    return age


def _cross_events(
    cci_values: list[Any],
    smoothing_values: list[Any],
    color_values: list[Any],
) -> list[dict[str, Any]]:
    cci = _aligned_float_series(cci_values)
    smoothing = _aligned_float_series(smoothing_values)
    relations = _relation_series(cci_values, smoothing_values)
    colors = [_normalize_smoothing_color(x) for x in color_values]
    output: list[dict[str, Any]] = []
    for index in range(1, min(len(relations), len(cci), len(smoothing))):
        previous, current = relations[index - 1], relations[index]
        event = None
        if previous in {"BELOW", "TIE"} and current == "ABOVE":
            event = "UP"
        elif previous in {"ABOVE", "TIE"} and current == "BELOW":
            event = "DOWN"
        if event is None:
            continue
        value = cci[index]
        output.append({
            "index": index,
            "type": event,
            "cci": value,
            "sma": smoothing[index],
            "zone": _cci_zone(value),
            "sma_direction": colors[index] if index < len(colors) else "UNKNOWN",
        })
    return output


def _cross_event(relations: list[str]) -> str:
    if len(relations) < 2:
        return "UNKNOWN"
    previous, current = relations[-2], relations[-1]
    if previous in {"BELOW", "TIE"} and current == "ABOVE":
        return "CCI_CROSS_UP"
    if previous in {"ABOVE", "TIE"} and current == "BELOW":
        return "CCI_CROSS_DOWN"
    if previous == current and current != "UNKNOWN":
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
    normalized = [_normalize_smoothing_color(x) for x in colors]
    if not normalized:
        return 0
    index = len(normalized) - 1
    while index >= 0 and normalized[index] == "UNKNOWN":
        index -= 1
    if index < 0:
        return 0
    current = normalized[index]
    age = 1
    index -= 1
    while index >= 0:
        if normalized[index] == "UNKNOWN":
            index -= 1
            continue
        if normalized[index] != current:
            break
        age += 1
        index -= 1
    return age


def _smoothing_turn(colors: list[Any]) -> str:
    normalized = [_normalize_smoothing_color(x) for x in colors]
    if len(normalized) < 2:
        return "UNKNOWN"
    previous, current = normalized[-2], normalized[-1]
    if previous == "PURPLE" and current == "YELLOW":
        return "PURPLE_TO_YELLOW"
    if previous == "YELLOW" and current == "PURPLE":
        return "YELLOW_TO_PURPLE"
    if previous == current:
        return "NONE"
    if current == "GRAY" or previous == "GRAY":
        return "GRAY_TRANSITION"
    return "OTHER_TURN"


def _midline_phase_at(midlines: list[Any], end_index: int | None = None) -> tuple[str, float | None, float | None]:
    values = _aligned_float_series(midlines)
    if not values:
        return "UNKNOWN", None, None
    end = len(values) - 1 if end_index is None else int(end_index)
    if end < 3:
        return "UNKNOWN", None, None

    def slope_at(offset_end: int, lookback: int = 3) -> float | None:
        start = offset_end - lookback
        if start < 0:
            return None
        a, b = values[start], values[offset_end]
        if a is None or b is None or abs(a) <= 1e-18:
            return None
        return ((b - a) / abs(a) * 100.0) / float(lookback)

    current = slope_at(end, 3)
    previous = slope_at(end - 3, 3) if end >= 6 else None
    if current is None:
        return "UNKNOWN", current, None
    change = current - previous if previous is not None else 0.0
    # This threshold only defines visual "flat" geometry; outcome direction remains learned.
    flat = 0.03
    if abs(current) <= flat:
        phase = "FLAT"
    elif current > 0:
        phase = "RISING_ACCEL" if change > 0 else "RISING_DECEL"
    else:
        phase = "FALLING_IMPROVE" if change > 0 else "FALLING_WORSEN"
    return phase, current, change


def _gap_motion(gaps: list[float | None], relation: str) -> tuple[str, float | None, float | None]:
    if len(gaps) < 2 or gaps[-1] is None or gaps[-2] is None:
        return "UNKNOWN", None, None
    velocity = float(gaps[-1]) - float(gaps[-2])
    acceleration = None
    if len(gaps) >= 3 and gaps[-3] is not None:
        previous_velocity = float(gaps[-2]) - float(gaps[-3])
        acceleration = velocity - previous_velocity
    if relation == "BELOW":
        state = "BELOW_APPROACHING" if velocity > 0 else "BELOW_SEPARATING"
    elif relation == "ABOVE":
        state = "ABOVE_EXPANDING" if velocity >= 0 else "ABOVE_PULLBACK"
    else:
        state = "TIE_OR_UNKNOWN"
    return state, velocity, acceleration


def _retest_state(relations: list[str], gaps: list[float | None], smoothing_direction: str) -> str:
    if not relations or not gaps or gaps[-1] is None:
        return "UNKNOWN"
    current_relation = relations[-1]
    recent_relations = relations[-4:]
    if smoothing_direction == "YELLOW":
        if len(recent_relations) >= 3 and recent_relations[-3:] == ["ABOVE", "BELOW", "ABOVE"]:
            return "YELLOW_RECLAIM_AFTER_BREAK"
        if current_relation == "BELOW":
            return "YELLOW_BREAK_BELOW"
        positive = [float(x) for x in gaps[-6:] if x is not None and float(x) > 0]
        if current_relation == "ABOVE" and positive:
            peak = max(positive)
            current = float(gaps[-1])
            if peak > 0 and current < peak * 0.50:
                return "YELLOW_RETEST_NEAR_SMA"
            return "YELLOW_ABOVE"
    if smoothing_direction == "PURPLE":
        if len(recent_relations) >= 3 and recent_relations[-3:] == ["BELOW", "ABOVE", "BELOW"]:
            return "PURPLE_REJECT_AFTER_BREAK"
        if current_relation == "ABOVE":
            return "PURPLE_BREAK_ABOVE"
        negative = [abs(float(x)) for x in gaps[-6:] if x is not None and float(x) < 0]
        if current_relation == "BELOW" and negative:
            peak = max(negative)
            current = abs(float(gaps[-1]))
            if peak > 0 and current < peak * 0.50:
                return "PURPLE_RETEST_NEAR_SMA"
            return "PURPLE_BELOW"
    return f"{smoothing_direction}_{current_relation}"


def _divergence_features(record: dict[str, Any], cci_values: list[Any]) -> dict[str, Any]:
    highs = _aligned_float_series(list(record.get("_raw_highs_last30") or []))
    lows = _aligned_float_series(list(record.get("_raw_lows_last30") or []))
    cci = _aligned_float_series(cci_values)
    if len(highs) < 10 or len(lows) < 10 or len(cci) < 10:
        return {
            "cci_divergence": "UNKNOWN",
            "price_high_delta_pct": None,
            "cci_high_delta": None,
            "price_low_delta_pct": None,
            "cci_low_delta": None,
        }

    def finite_window(values: list[float | None], start: int, end: int) -> list[float]:
        return [float(x) for x in values[start:end] if x is not None]

    prior_highs, recent_highs = finite_window(highs, -10, -5), finite_window(highs, -5, None)
    prior_lows, recent_lows = finite_window(lows, -10, -5), finite_window(lows, -5, None)
    prior_cci, recent_cci = finite_window(cci, -10, -5), finite_window(cci, -5, None)
    if not all((prior_highs, recent_highs, prior_lows, recent_lows, prior_cci, recent_cci)):
        return {
            "cci_divergence": "UNKNOWN",
            "price_high_delta_pct": None,
            "cci_high_delta": None,
            "price_low_delta_pct": None,
            "cci_low_delta": None,
        }

    prior_price_high, recent_price_high = max(prior_highs), max(recent_highs)
    prior_price_low, recent_price_low = min(prior_lows), min(recent_lows)
    prior_cci_high, recent_cci_high = max(prior_cci), max(recent_cci)
    prior_cci_low, recent_cci_low = min(prior_cci), min(recent_cci)

    high_pct = ((recent_price_high - prior_price_high) / abs(prior_price_high) * 100.0) if abs(prior_price_high) > 1e-18 else 0.0
    low_pct = ((recent_price_low - prior_price_low) / abs(prior_price_low) * 100.0) if abs(prior_price_low) > 1e-18 else 0.0
    high_cci_delta = recent_cci_high - prior_cci_high
    low_cci_delta = recent_cci_low - prior_cci_low

    if high_pct > 0.20 and high_cci_delta < -5.0:
        divergence = "BEARISH_PRICE_HH_CCI_LH"
    elif low_pct < -0.20 and low_cci_delta > 5.0:
        divergence = "BULLISH_PRICE_LL_CCI_HL"
    else:
        divergence = "NONE"

    return {
        "cci_divergence": divergence,
        "price_high_delta_pct": round(high_pct, 8),
        "cci_high_delta": round(high_cci_delta, 8),
        "price_low_delta_pct": round(low_pct, 8),
        "cci_low_delta": round(low_cci_delta, 8),
    }


def _cci_path_features(record: dict[str, Any]) -> dict[str, Any]:
    cci_series = list(record.get("_cci_last30") or [])
    smoothing_series = list(record.get("_cci_smoothing_ma_last30") or [])
    color_series = list(record.get("_cci_smoothing_color_last30") or [])
    midline_series = list(record.get("_bb_basis_series") or [])

    cci_values = _aligned_float_series(cci_series)
    smoothing_values = _aligned_float_series(smoothing_series)
    cci = cci_values[-1] if cci_values else None
    smoothing = smoothing_values[-1] if smoothing_values else None
    relations = _relation_series(cci_series, smoothing_series)
    relation = relations[-1] if relations else "UNKNOWN"
    cross_event = _cross_event(relations)
    smoothing_direction = _normalize_smoothing_color(color_series[-1]) if color_series else "UNKNOWN"
    relation_age = _relation_age(relations)
    smoothing_age = _smoothing_age(color_series)
    events = _cross_events(cci_series, smoothing_series, color_series)

    gaps: list[float | None] = []
    for c, s in zip(cci_values, smoothing_values):
        gaps.append((c - s) if c is not None and s is not None else None)
    gap = gaps[-1] if gaps else None
    gap_motion, gap_velocity, gap_acceleration = _gap_motion(gaps, relation)

    last_event = events[-1] if events else None
    days_since_last_cross = (len(cci_series) - 1 - int(last_event["index"])) if last_event else None
    recent_21 = [e for e in events if len(cci_series) - 1 - int(e["index"]) <= 20]
    up_events = [e for e in recent_21 if e["type"] == "UP"]
    down_events = [e for e in recent_21 if e["type"] == "DOWN"]

    if last_event:
        if days_since_last_cross == 0:
            count = len(up_events) if last_event["type"] == "UP" else len(down_events)
            cross_cycle = f"{last_event['type']}_{'SECOND_PLUS' if count >= 2 else 'FIRST'}_21D"
        elif days_since_last_cross is not None and days_since_last_cross <= 3:
            cross_cycle = f"POST_{last_event['type']}_1_3D"
        else:
            cross_cycle = f"POST_{last_event['type']}_4PLUS"
    else:
        cross_cycle = "NO_CROSS_30D"

    previous_same = None
    if last_event:
        same = [e for e in events[:-1] if e["type"] == last_event["type"]]
        previous_same = same[-1] if same else None

    midline_phase, midline_slope_3d, midline_slope_change_3d = _midline_phase_at(midline_series)
    last_cross_midline_phase = "UNKNOWN"
    if last_event and midline_series:
        # CCI and BB last-30 series are aligned to the same daily points.
        last_cross_midline_phase = _midline_phase_at(midline_series, int(last_event["index"]))[0]

    retest_state = _retest_state(relations, gaps, smoothing_direction)
    divergence = _divergence_features(record, cci_series)

    cci_slope_1d = _slope(cci_series, 1)
    cci_slope_2d = _slope(cci_series, 2)
    cci_slope_3d = _slope(cci_series, 3)
    smoothing_slope_1d = _slope(smoothing_series, 1)
    smoothing_slope_3d = _slope(smoothing_series, 3)
    midline_slope_1d = _pct_slope(midline_series, 1)
    if midline_slope_3d is None:
        midline_slope_3d = _pct_slope(midline_series, 3)

    cci_acceleration = None
    if cci_slope_1d is not None and len(cci_series) >= 3:
        previous = None
        a, b = _safe_float(cci_series[-3]), _safe_float(cci_series[-2])
        if a is not None and b is not None:
            previous = b - a
        if previous is not None:
            cci_acceleration = cci_slope_1d - previous

    return {
        "cci": round(cci, 8) if cci is not None else None,
        "cci_zone": _cci_zone(cci),
        "cci_distance_to_neg100": round(abs(cci + 100.0), 8) if cci is not None else None,
        "cci_distance_to_zero": round(abs(cci), 8) if cci is not None else None,
        "cci_smoothing_ma": round(smoothing, 8) if smoothing is not None else None,
        "cci_sma_gap": round(gap, 8) if gap is not None else None,
        "cci_sma_relation": relation,
        "cci_relation_age_days": int(relation_age),
        "cci_relation_age_bin": _bin_age(max(1, relation_age)) if relation_age else "UNKNOWN",
        "cci_cross_event": cross_event,
        "cci_cross_cycle": cross_cycle,
        "cci_days_since_last_cross": int(days_since_last_cross) if days_since_last_cross is not None else None,
        "cci_last_cross_type": str(last_event["type"]) if last_event else "NONE",
        "cci_last_cross_zone": str(last_event["zone"]) if last_event else "UNKNOWN",
        "cci_last_cross_value": round(float(last_event["cci"]), 8) if last_event and last_event.get("cci") is not None else None,
        "cci_last_cross_sma_direction": str(last_event["sma_direction"]) if last_event else "UNKNOWN",
        "cci_last_cross_midline_phase": last_cross_midline_phase,
        "cci_previous_same_cross_zone": str(previous_same["zone"]) if previous_same else "NONE",
        "cci_previous_same_cross_value": round(float(previous_same["cci"]), 8) if previous_same and previous_same.get("cci") is not None else None,
        "cci_up_cross_count_21d": len(up_events),
        "cci_down_cross_count_21d": len(down_events),
        "cci_up_cross_count_bin": "0" if len(up_events) == 0 else "1" if len(up_events) == 1 else "2_PLUS",
        "cci_down_cross_count_bin": "0" if len(down_events) == 0 else "1" if len(down_events) == 1 else "2_PLUS",
        "cci_gap_motion": gap_motion,
        "cci_gap_velocity_1d": round(gap_velocity, 8) if gap_velocity is not None else None,
        "cci_gap_acceleration": round(gap_acceleration, 8) if gap_acceleration is not None else None,
        "cci_retest_state": retest_state,
        "cci_slope_1d": round(cci_slope_1d, 8) if cci_slope_1d is not None else None,
        "cci_slope_2d": round(cci_slope_2d, 8) if cci_slope_2d is not None else None,
        "cci_slope_3d": round(cci_slope_3d, 8) if cci_slope_3d is not None else None,
        "cci_acceleration": round(cci_acceleration, 8) if cci_acceleration is not None else None,
        "cci_smoothing_slope_1d": round(smoothing_slope_1d, 8) if smoothing_slope_1d is not None else None,
        "cci_smoothing_slope_3d": round(smoothing_slope_3d, 8) if smoothing_slope_3d is not None else None,
        "cci_smoothing_direction": smoothing_direction,
        "cci_smoothing_age_days": int(smoothing_age),
        "cci_smoothing_age_bin": _bin_age(max(1, smoothing_age)) if smoothing_age else "UNKNOWN",
        "cci_smoothing_turn_event": _smoothing_turn(color_series),
        "cci_cross_on_yellow": (
            "CROSS_UP_YELLOW" if cross_event == "CCI_CROSS_UP" and smoothing_direction == "YELLOW"
            else "CROSS_UP_OTHER" if cross_event == "CCI_CROSS_UP" else "NO_CROSS_UP"
        ),
        "cci_regime": f"{relation}_{smoothing_direction}" if relation != "UNKNOWN" and smoothing_direction != "UNKNOWN" else "UNKNOWN",
        "midline_path_phase": midline_phase,
        "midline_slope_1d": round(midline_slope_1d, 8) if midline_slope_1d is not None else None,
        "midline_slope_3d": round(midline_slope_3d, 8) if midline_slope_3d is not None else None,
        "midline_slope_change_3d": round(midline_slope_change_3d, 8) if midline_slope_change_3d is not None else None,
        **divergence,
    }



def _record_with_chart_series(record: dict[str, Any]) -> dict[str, Any]:
    out = dict(record or {})
    chart = list(out.get("chart_30d") or [])
    if chart:
        out.setdefault("_cci_last30", [x.get("cci") for x in chart])
        out.setdefault("_cci_smoothing_ma_last30", [x.get("cci_smoothing_ma") for x in chart])
        out.setdefault("_cci_smoothing_color_last30", [x.get("cci_smoothing_color") for x in chart])
        out.setdefault("_bb_basis_series", [x.get("bb_midline") for x in chart])
        out.setdefault("_bb_upper_series", [x.get("bb_upper") for x in chart])
        out.setdefault("_bb_lower_series", [x.get("bb_lower") for x in chart])
        out.setdefault("_raw_highs_last30", [x.get("real_high") for x in chart])
        out.setdefault("_raw_lows_last30", [x.get("real_low") for x in chart])
    return out


@lru_cache(maxsize=4)
def load_probability_model(path: str | None = None) -> dict[str, Any]:
    model_path = Path(path) if path else MODEL_PATH
    if not model_path.exists():
        return {"available": False, "reason": "model_file_missing", "model_path": str(model_path)}
    try:
        payload = json.loads(model_path.read_text(encoding="utf-8"))
    except Exception as exc:
        return {"available": False, "reason": f"model_load_error:{type(exc).__name__}", "model_path": str(model_path)}
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
    path_record = _record_with_chart_series(record)
    bandwidth_state, bandwidth_delta = _bandwidth_trend(path_record)
    state_age_bars = record.get("_state_age_bars") if record.get("_state_age_bars") is not None else record.get("state_age_bars")
    state_age_bin = record.get("_state_age_bin") or record.get("state_age_bin")
    current_run = int(current.get("current_color_run_length") or 1)
    symbol = str(record.get("symbol") or record.get("幣種") or "").upper()
    features = {
        "market_type": "US_STOCK" if symbol and is_rwa_symbol(symbol) else "CRYPTO",
        "state": str(opportunity.get("market_state_id") or "OTHER"),
        "trigger_stage": str(opportunity.get("trigger_stage") or "T0"),
        "midline_state": str(midline.get("state") or "unknown"),
        "midline_slope_5d": float(midline.get("recent_5d_slope_pct_per_day") or 0.0),
        "midline_improvement": float(midline.get("slope_improvement_pct_per_day") or 0.0),
        "bandpos": bandpos,
        "bandpos_bin": _bin_bandpos(bandpos),
        "ha_color": str(current.get("ha_color") or "unknown"),
        "current_run_length": current_run,
        "current_run_bin": _bin_run(current_run),
        "state_age_bars": int(state_age_bars) if state_age_bars is not None else None,
        "state_age_bin": str(state_age_bin) if state_age_bin else None,
        "bandwidth_trend": bandwidth_state,
        "bandwidth_delta_3d": round(float(bandwidth_delta), 8),
        "higher_low_base": bool(base_quality.get("qualified", False)),
        "purple2_passed": str(opportunity.get("trigger_stage") or "T0") == "T2",
    }
    features.update(_cci_path_features(path_record))
    return features


def _apply_path_binning(features: dict[str, Any], binning: dict[str, Any]) -> dict[str, Any]:
    enriched = dict(features or {})
    for raw_field, q_field in PATH_QUANTILE_FIELDS.items():
        value = _safe_float(features.get(raw_field))
        node = binning.get(raw_field) or {}
        q25, q50, q75 = _safe_float(node.get("q25")), _safe_float(node.get("q50")), _safe_float(node.get("q75"))
        if value is None or q25 is None or q50 is None or q75 is None:
            enriched[q_field] = "UNKNOWN"
        elif value <= q25:
            enriched[q_field] = "Q1"
        elif value <= q50:
            enriched[q_field] = "Q2"
        elif value <= q75:
            enriched[q_field] = "Q3"
        else:
            enriched[q_field] = "Q4"
    return enriched


def _outcome_payload(node: dict[str, Any]) -> dict[str, Any]:
    outcomes = node.get("outcomes") or {}
    def p(key: str) -> float:
        return float((outcomes.get(key) or {}).get("probability", 0.0) or 0.0)
    success, alive, fail, other = p(OUTCOME_SUCCESS), p(OUTCOME_ALIVE), p(OUTCOME_FAIL), p(OUTCOME_OTHER)
    if not outcomes:
        success = float(node.get("probability", 0.0) or 0.0)
        alive = 0.0
        fail = float(node.get("true_fail_probability", 0.0) or 0.0)
        other = max(0.0, 1.0 - success - fail)
    return {
        "outcomes": outcomes,
        "success_probability": success,
        "alive_slow_probability": alive,
        "true_fail_probability": fail,
        "other_probability": other,
        "structural_survival_probability": success + alive,
        "late_success_4_7d": node.get("late_success_4_7d"),
    }


def _walk_path_tree(tree: dict[str, Any], features: dict[str, Any]) -> tuple[dict[str, Any], list[dict[str, str]]]:
    node = tree
    path: list[dict[str, str]] = []
    while isinstance(node, dict) and not bool(node.get("leaf", True)):
        field = str(node.get("split_field") or "")
        if not field:
            break
        value = str(features.get(field) if features.get(field) is not None else "UNKNOWN")
        child = (node.get("children") or {}).get(value)
        if not isinstance(child, dict):
            break
        path.append({"field": field, "value": value})
        node = child
    return node, path


def _lookup_primary_path(model: dict[str, Any], state_node: dict[str, Any], hnode: dict[str, Any], features: dict[str, Any]) -> dict[str, Any]:
    enriched = _apply_path_binning(features, state_node.get("path_binning") or {})
    tree = hnode.get("path_tree") or hnode.get("baseline") or {}
    node, path = _walk_path_tree(tree, enriched)
    payload = _outcome_payload(node)
    depth = int(node.get("depth", len(path)) or len(path))
    fields = [item["field"] for item in path]
    signature = "|".join(f"{item['field']}={item['value']}" for item in path) or "STATE_BASELINE"
    version = (model.get("cci_primary_contract") or {}).get("version")
    primary = {
        "available": True,
        "version": version,
        "depth": depth,
        "matched_path": path,
        "matched_path_count": len(path),
        "bins": {q: enriched.get(q) for q in PATH_QUANTILE_FIELDS.values()},
        "path_features": {k: enriched.get(k) for k in (
            "market_type", "midline_path_phase", "cci_zone", "cci_cross_cycle",
            "cci_last_cross_zone", "cci_last_cross_midline_phase", "cci_gap_motion",
            "cci_retest_state", "cci_divergence", "cci_smoothing_direction",
            "cci_smoothing_turn_event", "ha_color",
        )},
    }
    compatibility = {
        "available": True, "version": version, "mode": "PRIMARY_PATH",
        "matched_facets": [], "matched_facet_count": 0, "blend_strength": 1.0,
        "bins": primary["bins"], "matched_path": path,
    }
    return {
        "available": True,
        "probability": float(payload["success_probability"]),
        "raw_probability": float(node.get("raw_probability", payload["success_probability"]) or 0.0),
        "samples": int(node.get("samples", 0) or 0),
        "wins": int(node.get("wins", 0) or 0),
        "level": depth,
        "fields": fields,
        "signature": signature,
        "wilson95": node.get("wilson95"),
        "fallback": len(path) == 0,
        **payload,
        "cci_primary": primary,
        "cci_expert": compatibility,
    }



def build_cci_path_commentary(
    state: str,
    features: dict[str, Any],
    primary: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Translate the SAME CCI PRIMARY path features into a short UI comment.

    This is deliberately not a second scoring model. It never changes probability;
    it only explains the current path using features already consumed by Schema 5.
    S0/OTHER are not probability-modeled, but still receive a mechanical structure
    comment from the same CCI/BB/HA path extractor.
    """
    f = features or {}
    p = primary or {}
    st = str(state or "OTHER")
    mid = str(f.get("midline_path_phase") or "UNKNOWN")
    cycle = str(f.get("cci_cross_cycle") or "NO_CROSS_30D")
    retest = str(f.get("cci_retest_state") or "UNKNOWN")
    gap_motion = str(f.get("cci_gap_motion") or "UNKNOWN")
    divergence = str(f.get("cci_divergence") or "NONE")
    sma = str(f.get("cci_smoothing_direction") or "UNKNOWN")
    turn = str(f.get("cci_smoothing_turn_event") or "UNKNOWN")
    ha = str(f.get("ha_color") or "unknown").lower()
    relation = str(f.get("cci_sma_relation") or "UNKNOWN")
    last_cross_zone = str(f.get("cci_last_cross_zone") or "UNKNOWN")
    up_count = int(f.get("cci_up_cross_count_21d") or 0)
    down_count = int(f.get("cci_down_cross_count_21d") or 0)
    days_since = f.get("cci_days_since_last_cross")
    try:
        days_since_n = int(days_since) if days_since is not None else None
    except (TypeError, ValueError):
        days_since_n = None

    rising_mid = mid in {"RISING_ACCEL", "RISING_DECEL"}
    improving_mid = mid in {"FLAT", "FALLING_IMPROVE", "RISING_ACCEL", "RISING_DECEL"}
    weak_mid = mid in {"FLAT", "FALLING_IMPROVE", "FALLING_WORSEN"}
    hard_falling = mid == "FALLING_WORSEN"
    second_up = cycle == "UP_SECOND_PLUS_21D" or (up_count >= 2 and cycle.startswith("POST_UP"))
    first_up = cycle == "UP_FIRST_21D" or (up_count == 1 and cycle.startswith("POST_UP"))
    second_down = cycle == "DOWN_SECOND_PLUS_21D" or (down_count >= 2 and cycle.startswith("POST_DOWN"))
    first_down = cycle == "DOWN_FIRST_21D" or (down_count == 1 and cycle.startswith("POST_DOWN"))
    deep_low_cross = last_cross_zone in {"LT_NEG150", "NEG150_NEG120", "NEG120_NEG80"}
    near_zero_cross = last_cross_zone in {"NEG80_0", "0_100"}
    bullish_ha = ha in {"yellow", "green", "bullish"}

    label = "結構觀察｜等待CCI路徑確認"
    detail = "目前尚未形成更具辨識度的 CCI PRIMARY 路徑。"
    tone = "neutral"

    if st == "S0.5":
        if retest == "YELLOW_RECLAIM_AFTER_BREAK" and rising_mid:
            label, detail, tone = (
                "假跌破回收｜多方結構仍在",
                "CCI 短暫跌破黃色 SMA 後重新站回；布林中軌仍維持上升背景，屬回踩後 reclaim。",
                "positive",
            )
        elif retest == "YELLOW_RETEST_NEAR_SMA" and improving_mid:
            label, detail, tone = (
                "黃階梯承接｜右側回踩守住",
                "CCI 已在黃色 SMA 上方建立距離後回踩接近 SMA，且中軌沒有重新惡化。",
                "positive",
            )
        elif second_up and improving_mid and (sma == "YELLOW" or bullish_ha):
            label, detail, tone = (
                "右V共振｜二次上穿・中軌改善",
                "21 日內已出現第二次以上 CCI 上穿；中軌由下斜改善/走平，並伴隨黃 SMA 或黃平均K共振。",
                "strong",
            )
        elif second_up and improving_mid:
            label, detail, tone = (
                "右V確認｜二次上穿・中軌改善",
                "第二次以上 CCI 上穿出現在較友善的中軌背景，和第一次深跌反彈的左V不同。",
                "positive",
            )
        elif first_up and hard_falling and deep_low_cross:
            label, detail, tone = (
                "左V反彈｜首次低位上穿",
                "CCI 第一次在 -100 附近或更低位置上穿，但布林中軌仍明顯惡化，歷史上更像深跌後反彈。",
                "caution",
            )
        elif first_up and improving_mid:
            label, detail, tone = (
                "首次上穿｜反轉仍待二次確認",
                "CCI 已第一次上穿且中軌背景改善，但尚未形成二次上穿/黃階梯承接等右V確認。",
                "setup",
            )
        elif gap_motion == "BELOW_APPROACHING" and improving_mid:
            label, detail, tone = (
                "右V醞釀｜CCI快速逼近SMA",
                "CCI 尚在 SMA 下方，但 gap 正在收斂；若中軌持續改善，下一次上穿具有較高辨識價值。",
                "setup",
            )
        elif sma == "YELLOW" and relation == "ABOVE":
            label, detail, tone = (
                "黃階梯建立｜多方動能接管",
                "CCI 已站在上升中的 smoothingMA 上方；S0.5 正從築底轉向右側動能確認。",
                "positive",
            )
        elif hard_falling:
            label, detail, tone = (
                "築底反彈｜中軌仍有下壓",
                "目前仍處 S0.5，但布林中軌下斜惡化尚未解除，CCI 訊號先視為反彈而非完整反轉。",
                "caution",
            )
        else:
            label, detail, tone = (
                "築底觀察｜等待右V共振",
                "S0.5 已進入築底區，重點等待二次上穿、中軌改善與黃 SMA/平均K的共振。",
                "setup",
            )

    elif st == "S1":
        if retest == "YELLOW_RECLAIM_AFTER_BREAK" and rising_mid:
            label, detail, tone = (
                "回踩收復｜趨勢結構延續",
                "CCI 跌破黃 SMA 後重新站回，中軌仍上斜，屬趨勢內回踩收復。",
                "positive",
            )
        elif retest == "YELLOW_RETEST_NEAR_SMA" and rising_mid:
            label, detail, tone = (
                "健康回踩｜CCI守住黃階梯",
                "S1 已建立黃 SMA，CCI 回踩接近黃階梯但未破壞上升中軌。",
                "positive",
            )
        elif divergence == "BEARISH_PRICE_HH_CCI_LH" and mid in {"RISING_DECEL", "FLAT"}:
            label, detail, tone = (
                "動能放緩｜留意頂背離",
                "價格高點延伸但 CCI 高點降低，且中軌升勢開始降速/走平；趨勢仍在但動能需留意。",
                "caution",
            )
        elif sma == "YELLOW" and relation == "ABOVE" and rising_mid:
            label, detail, tone = (
                "趨勢建立｜黃階梯延伸",
                "CCI 位於黃色 smoothingMA 上方，布林中軌同步上斜，屬 S1 正常趨勢延伸。",
                "strong",
            )
        elif gap_motion == "BELOW_APPROACHING" and improving_mid:
            label, detail, tone = (
                "動能重整｜等待CCI再上穿",
                "S1 結構仍在，CCI 位於 SMA 下方但正在逼近；等待重新上穿確認續攻。",
                "setup",
            )
        elif mid == "RISING_DECEL":
            label, detail, tone = (
                "趨勢續行｜中軌升勢放緩",
                "中軌仍上斜但速度下降，S1 尚未破壞；重點觀察 CCI 是否維持黃階梯上方。",
                "setup",
            )
        else:
            label, detail, tone = (
                "趨勢建立｜觀察CCI延伸",
                "S1 已完成早期突破，接下來由 CCI/SMA 路徑確認是否持續擴張。",
                "neutral",
            )

    elif st == "S2":
        if second_down and divergence == "BEARISH_PRICE_HH_CCI_LH" and weak_mid:
            label, detail, tone = (
                "二次衰竭｜頂背離・中軌降速",
                "21 日內第二次以上 CCI 死叉，並出現價格新高/CCI低高點；中軌已走平或轉弱，屬末浪衰竭風險。",
                "risk",
            )
        elif second_down and mid in {"FLAT", "FALLING_IMPROVE", "FALLING_WORSEN"}:
            label, detail, tone = (
                "二次死叉｜轉弱風險升高",
                "CCI 已出現第二次以上死叉，而中軌不再維持明顯上斜；S2 由普通回踩轉向真正衰竭風險。",
                "risk",
            )
        elif first_down and rising_mid:
            label, detail, tone = (
                "二浪回踩｜中軌仍上斜",
                "高位第一次 CCI 死叉出現在仍上斜的中軌背景，更接近一浪後普通二浪回踩，不直接視為大跌。",
                "positive",
            )
        elif cycle in {"UP_FIRST_21D", "UP_SECOND_PLUS_21D"} and near_zero_cross and improving_mid:
            label, detail, tone = (
                "再蓄力｜CCI零軸附近重上穿",
                "整理後 CCI 在 -80~+100 區域重新上穿，且中軌未明顯惡化，歷史上屬三浪重新啟動候選。",
                "strong",
            )
        elif retest in {"YELLOW_RETEST_NEAR_SMA", "YELLOW_RECLAIM_AFTER_BREAK"} and rising_mid:
            label, detail, tone = (
                "二浪承接｜三浪仍有空間",
                "CCI 在黃色 SMA 附近完成回踩/收復，布林中軌仍上斜，結構更接近續漲前整理。",
                "positive",
            )
        elif rising_mid:
            label, detail, tone = (
                "回踩整理｜上升結構未破",
                "雖處 S2 回踩階段，但布林中軌仍維持上斜；先視為趨勢內整理，等待下一次 CCI 啟動。",
                "setup",
            )
        elif mid == "FLAT":
            label, detail, tone = (
                "高檔整理｜等待再啟動或衰竭",
                "中軌走平本身不是空頭答案；需由下一次 CCI 金叉/死叉、背離與黃紫 SMA 路徑決定方向。",
                "neutral",
            )
        else:
            label, detail, tone = (
                "結構轉弱｜留意二次死叉",
                "S2 中軌背景已偏弱，若再出現第二次死叉或頂背離，真失敗風險會明顯提高。",
                "caution",
            )

    elif st == "S3":
        if second_down and divergence == "BEARISH_PRICE_HH_CCI_LH":
            label, detail, tone = (
                "末浪衰竭｜二次死叉・頂背離",
                "S3 已在成熟段，CCI 第二次以上死叉又伴隨價格新高/CCI低高點，屬最後一噴後的衰竭警訊。",
                "risk",
            )
        elif divergence == "BEARISH_PRICE_HH_CCI_LH" and mid in {"RISING_DECEL", "FLAT"}:
            label, detail, tone = (
                "高檔背離｜末浪動能降速",
                "價格續創高但 CCI 動能未同步，中軌也開始降速/走平；S3 仍強但不宜忽略衰竭。",
                "caution",
            )
        elif retest in {"YELLOW_RETEST_NEAR_SMA", "YELLOW_RECLAIM_AFTER_BREAK"} and rising_mid:
            label, detail, tone = (
                "趨勢續航｜黃階梯回踩承接",
                "CCI 在黃 SMA 附近完成回踩或 reclaim，中軌仍上斜，S3 屬健康續航。",
                "positive",
            )
        elif sma == "YELLOW" and relation == "ABOVE" and gap_motion == "ABOVE_EXPANDING":
            label, detail, tone = (
                "三浪延伸｜CCI動能仍擴張",
                "CCI 位於黃 SMA 上方且距離持續擴大，S3 尚處動能擴張段。",
                "strong",
            )
        elif sma == "PURPLE" and rising_mid:
            label, detail, tone = (
                "高檔回踩｜中軌仍上斜",
                "CCI smoothingMA 已轉紫，但布林中軌仍上斜；先視為成熟趨勢內回踩，不直接等同反轉。",
                "setup",
            )
        elif mid in {"FLAT", "FALLING_IMPROVE", "FALLING_WORSEN"} and sma == "PURPLE":
            label, detail, tone = (
                "高檔降速｜保護既有趨勢成果",
                "S3 已成熟且 SMA 轉紫，中軌又失去明顯上斜；重點從追漲轉為觀察衰竭。",
                "caution",
            )
        else:
            label, detail, tone = (
                "趨勢成熟｜觀察CCI衰竭訊號",
                "S3 仍屬完成度較高的趨勢段，後續以二次死叉、背離與中軌降速作為主要風險訊號。",
                "neutral",
            )

    elif st == "S0":
        if first_up and hard_falling and deep_low_cross:
            label, detail, tone = (
                "左V反彈｜中軌仍明顯下壓",
                "CCI 第一次低位上穿，但中軌仍惡化；目前只視為 S0 反彈，不升級成反轉。",
                "caution",
            )
        elif second_up and improving_mid:
            label, detail, tone = (
                "底部反轉醞釀｜等待升級S0.5",
                "CCI 已出現第二次以上上穿且中軌背景改善，但價格結構尚未完成 S0.5 條件。",
                "setup",
            )
        elif gap_motion == "BELOW_APPROACHING":
            label, detail, tone = (
                "超賣修復｜CCI逼近SMA",
                "CCI 尚未上穿，但與 SMA 距離快速收斂；先觀察是否形成有效底部交叉。",
                "setup",
            )
        else:
            label, detail, tone = (
                "反彈區｜結構尚未升級",
                "S0 只代表反彈候選；需等待中軌改善、CCI路徑共振與價格結構升級。",
                "neutral",
            )

    else:  # OTHER
        if divergence == "BEARISH_PRICE_HH_CCI_LH" and weak_mid:
            label, detail, tone = (
                "未分類弱化｜CCI背離・中軌失速",
                "目前不符合正式 S-state 考題，但 CCI 背離與中軌失速同時存在，偏向風險結構。",
                "risk",
            )
        elif sma == "YELLOW" and rising_mid:
            label, detail, tone = (
                "趨勢存在｜尚未符合S-state考題",
                "CCI/SMA 與中軌仍偏多，但價格形態沒有落入 S0~S3 的正式掃描條件。",
                "setup",
            )
        elif gap_motion == "BELOW_APPROACHING" or gap_motion == "ABOVE_PULLBACK":
            label, detail, tone = (
                "整理等待｜CCI正在接近關鍵交叉",
                "目前屬 OTHER，但 CCI/SMA 距離正在收斂；等待下一個有效 S-state 或交叉路徑。",
                "neutral",
            )
        else:
            label, detail, tone = (
                "結構未分類｜等待有效S-state",
                "目前沒有落入正式 S0/S0.5/S1/S2/S3 考題，僅保留 CCI/BB 路徑觀察。",
                "neutral",
            )

    matched_path = list(((p.get("cci_primary") or {}).get("matched_path") or p.get("matched_path") or []))
    signature = "｜".join(f"{x.get('field')}={x.get('value')}" for x in matched_path if isinstance(x, dict))
    return {
        "version": "CCI-PATH-COMMENT-v1",
        "state": st,
        "label": label,
        "detail": detail,
        "tone": tone,
        "mode": "MODEL_PATH_EXPLAINER" if st in {"S0.5", "S1", "S2", "S3"} else "STRUCTURE_ONLY",
        "matched_samples": int(p.get("samples", 0) or 0),
        "matched_level": int(p.get("level", 0) or 0),
        "path_signature": signature,
        "features": {
            "midline_path_phase": mid,
            "cci_cross_cycle": cycle,
            "cci_last_cross_zone": last_cross_zone,
            "cci_retest_state": retest,
            "cci_gap_motion": gap_motion,
            "cci_divergence": divergence,
            "cci_smoothing_direction": sma,
            "cci_smoothing_turn_event": turn,
            "ha_color": ha,
            "days_since_last_cross": days_since_n,
        },
    }

def _signature(features: dict[str, Any], fields: list[str]) -> str:
    if not fields:
        return "BASELINE"
    return "|".join(f"{field}={features.get(field)}" for field in fields)


def _find_rule(rules: list[dict[str, Any]], signature: str, min_samples: int) -> dict[str, Any] | None:
    for rule in rules:
        if rule.get("signature") == signature and int(rule.get("samples", 0)) >= min_samples:
            return rule
    return None


def _legacy_lookup(model: dict[str, Any], hnode: dict[str, Any], features: dict[str, Any], max_level: int) -> dict[str, Any]:
    min_samples = int(model.get("default_min_samples", 50))
    levels = [x for x in (hnode.get("levels") or []) if int(x.get("level", 0)) <= int(max_level)]
    for level in reversed(levels):
        fields = list(level.get("fields") or [])
        sig = _signature(features, fields)
        rule = _find_rule(list(level.get("rules") or []), sig, min_samples)
        if rule is not None:
            payload = _outcome_payload(rule)
            return {
                "available": True, "probability": payload["success_probability"],
                "raw_probability": float(rule.get("raw_probability", payload["success_probability"]) or 0.0),
                "samples": int(rule.get("samples", 0) or 0), "wins": int(rule.get("wins", 0) or 0),
                "level": int(level.get("level", 0) or 0), "fields": fields, "signature": sig,
                "wilson95": rule.get("wilson95"), "fallback": False, **payload,
                "cci_primary": {"available": False, "version": None, "matched_path": []},
                "cci_expert": {"available": False, "version": (model.get("cci_expert_contract") or {}).get("version")},
            }
    base = hnode.get("baseline") or {}
    payload = _outcome_payload(base)
    return {
        "available": True, "probability": payload["success_probability"],
        "raw_probability": float(base.get("raw_probability", payload["success_probability"]) or 0.0),
        "samples": int(base.get("samples", 0) or 0), "wins": int(base.get("wins", 0) or 0),
        "level": 0, "fields": [], "signature": "BASELINE", "wilson95": base.get("wilson95"),
        "fallback": True, **payload,
        "cci_primary": {"available": False, "version": None, "matched_path": []},
        "cci_expert": {"available": False, "version": (model.get("cci_expert_contract") or {}).get("version")},
    }


def lookup_probability(model: dict[str, Any], *, state: str, horizon: int, features: dict[str, Any], max_level: int = MAX_PREVIEW_LEVEL) -> dict[str, Any]:
    if not model.get("available", True):
        return {"available": False, "reason": model.get("reason", "model_unavailable")}
    state_node = (model.get("states") or {}).get(state)
    if not state_node:
        return {"available": False, "reason": "state_missing"}
    hnode = (state_node.get("horizons") or {}).get(str(horizon))
    if not hnode:
        return {"available": False, "reason": "horizon_missing"}
    if (model.get("cci_primary_contract") or {}).get("version") or int(model.get("schema_version") or 0) >= 5:
        return _lookup_primary_path(model, state_node, hnode, features)
    return _legacy_lookup(model, hnode, features, max_level)


def predict_record(record: dict[str, Any], opportunity: dict[str, Any] | None = None, horizons: tuple[int, ...] = DISPLAY_HORIZONS) -> dict[str, Any]:
    opp = opportunity or record.get("_long_opportunity") or record.get("opportunity_long") or {}
    state = str(opp.get("market_state_id") or "OTHER")
    # Always extract the CCI/BB/HA path so S0/OTHER can receive a mechanical
    # structure comment even though they are not formal probability targets.
    features = extract_live_features(record, opp)
    model = load_probability_model()

    if state not in {"S0.5", "S1", "S2", "S3"}:
        commentary = build_cci_path_commentary(state, features, None)
        return {
            "available": False, "reason": "state_not_modeled", "state": state,
            "features": features, "path_commentary": commentary,
            "model_id": model.get("model_id") if model.get("available") else None,
            "schema_version": model.get("schema_version") if model.get("available") else None,
        }
    if not model.get("available"):
        commentary = build_cci_path_commentary(state, features, None)
        return {
            "available": False, "reason": model.get("reason", "model_unavailable"), "state": state,
            "features": features, "path_commentary": commentary,
        }

    predictions = {str(h): lookup_probability(model, state=state, horizon=int(h), features=features, max_level=MAX_PREVIEW_LEVEL) for h in horizons}
    primary = predictions.get(str(PRIMARY_HORIZON)) or {}
    target = ((model.get("states") or {}).get(state) or {}).get("target")
    primary_version = (model.get("cci_primary_contract") or {}).get("version")
    commentary = build_cci_path_commentary(state, features, primary)
    return {
        "available": bool(primary.get("available")), "state": state, "target": target,
        "features": features, "predictions": predictions, "primary_horizon": PRIMARY_HORIZON,
        "primary": primary, "model_id": model.get("model_id"), "schema_version": model.get("schema_version"),
        "generated_at": model.get("generated_at"), "max_level": MAX_PREVIEW_LEVEL,
        "cci_primary_version": primary_version,
        "cci_expert_version": primary_version or (model.get("cci_expert_contract") or {}).get("version"),
        "path_commentary": commentary,
    }


def human_feature_summary(features: dict[str, Any]) -> str:
    return "｜".join([
        str(features.get("midline_path_phase") or features.get("midline_state") or "中軌未知"),
        f"CCI {features.get('cci') if features.get('cci') is not None else '—'}",
        str(features.get("cci_cross_cycle") or features.get("cci_cross_event") or "交叉未知"),
        str(features.get("cci_retest_state") or "回踩未知"),
        str(features.get("cci_smoothing_direction") or "SMA方向未知"),
        str(features.get("ha_color") or "HA未知"),
    ])


def state_target_label(state: str) -> str:
    return {"S0.5": "S1 或更高", "S1": "BandPos > 0.75", "S2": "S3", "S3": "BandPos > 0.75"}.get(str(state), "未建模")
