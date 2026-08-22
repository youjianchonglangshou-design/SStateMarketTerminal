"""建立供 ChatGPT 分析使用的 30 日視覺等價 snapshot JSON；布林帶本身仍為 BB20。"""
from __future__ import annotations

import hashlib
import json
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable, Optional

import numpy as np
import pandas as pd

from github_sync import load_snapshot_from_github, sync_snapshot_to_github
import scoring_rules as _scoring_engine

EXPECTED_ENGINE_API_VERSION = "opportunity-state-v4.8-30d-structure"
ENGINE_API_VERSION = getattr(_scoring_engine, "ENGINE_API_VERSION", "legacy-or-missing")
OPPORTUNITY_ENGINE_VERSION = getattr(_scoring_engine, "OPPORTUNITY_ENGINE_VERSION", "ENGINE-MISMATCH")
PURPLE2_RULE_VERSION = getattr(_scoring_engine, "PURPLE2_RULE_VERSION", "P2-MISMATCH")
build_long_opportunity = getattr(_scoring_engine, "build_long_opportunity", None)
build_pattern_flags = getattr(_scoring_engine, "build_pattern_flags", None)
classify_pattern = getattr(_scoring_engine, "classify_pattern", None)
score_hint = getattr(_scoring_engine, "score_hint", None)
ENGINE_FILES_SYNCED = (
    ENGINE_API_VERSION == EXPECTED_ENGINE_API_VERSION
    and all(callable(fn) for fn in (build_long_opportunity, build_pattern_flags, classify_pattern, score_hint))
)
from sector_config import SECTOR_TAGS
from symbols_config import get_rwa_sector_tags, is_rwa_symbol
from probability_reader import load_probability_model, predict_record

TW_TZ = timezone(timedelta(hours=8))
SCHEMA_VERSION = "crypto-monitor-ai-v13-level5-probability"
AI_LAYER_REVISION = "state-first-v5-s3-dashboard-direct-t2-line"
GROUP_LIMIT = 20
STATE_HISTORY_LIMIT = 120

STATE_ACTION = {
    "S3": "PRIMARY",
    "S0.5": "EARLY_ENTRY",
    "S1": "WATCH_ONLY",
    "S2": "WAIT_RESULT",
    "S0": "BOUNCE_ONLY",
    "OTHER": "SKIP",
}

STATE_ACTION_ZH = {
    "S3": "主要操作",
    "S0.5": "最佳早期進場",
    "S1": "只觀察真假突破",
    "S2": "等待回踩結果",
    "S0": "只視為反彈",
    "OTHER": "略過",
}

def snapshot_ai_layer_complete(snapshot: Any) -> bool:
    """確認目前快照已真正輸出 v13 Level-5 probability AI Layer，而不是舊 schema / session cache。

    這只驗證輸出 schema，不碰 S0/S0.5/S1/S2/S3 判定演算法。
    """
    if not isinstance(snapshot, dict):
        return False

    batch = snapshot.get("batch") or {}
    if str(batch.get("schema_version") or "") != SCHEMA_VERSION:
        return False
    # v5: S3 Dashboard 在輸出行直接沿用 S-state 引擎的 T2 最終結果。
    # 舊 session 即使有 state-age、但尚未寫入 probability，也必須失效重建。
    if str(batch.get("ai_analysis_layer") or "") != AI_LAYER_REVISION:
        return False

    for key in ("state_action", "state_action_zh", "ai_state_dashboard", "records"):
        if key not in snapshot:
            return False

    dashboard = snapshot.get("ai_state_dashboard")
    if not isinstance(dashboard, dict) or not all(
        state in dashboard for state in ("S3", "S0.5", "S1", "S2")
    ):
        return False

    records = snapshot.get("records") or []
    if records and not all("historical_probability" in record for record in records):
        return False

    records = snapshot.get("records")
    if not isinstance(records, list):
        return False

    record_by_symbol: dict[str, dict[str, Any]] = {}
    for record in records:
        if not isinstance(record, dict):
            return False
        # Legacy 必須退出 AI JSON。
        if "legacy_reference" in record:
            return False
        # 歷史欄位每筆都要存在，才能從這版開始累積。
        if "state_history" not in record or not isinstance(record.get("state_history"), list):
            return False

        opportunity = record.get("opportunity_long") or {}
        state = str(opportunity.get("market_state_id") or "OTHER")
        if state == "S0.5":
            quality = record.get("s05_quality")
            if not isinstance(quality, dict):
                return False
            # S0.5 的摘要欄位也必須直接等於引擎的 T2 passed 結果。
            if bool(quality.get("purple2_passed")) != _engine_purple2_passed(opportunity):
                return False
        if state == "S3" and not isinstance(record.get("s3_room"), dict):
            return False

        symbol = str(record.get("symbol") or "")
        if symbol:
            record_by_symbol[symbol] = record

    # AI Dashboard 不得自行重算 Purple-2 passed。
    # S3 / S0.5 已由 S 引擎輸出 T2，Dashboard 必須直接沿用該結果。
    # 任何舊 cache（例如 actual AND relative 造成 false）都會在此失效。
    for dashboard_state in ("S3", "S0.5"):
        for card in dashboard.get(dashboard_state) or []:
            if not isinstance(card, dict):
                return False
            symbol = str(card.get("symbol") or "")
            record = record_by_symbol.get(symbol)
            if not record:
                return False
            opportunity = record.get("opportunity_long") or {}
            if str(opportunity.get("market_state_id") or "OTHER") != dashboard_state:
                return False
            expected_passed = (
                str(opportunity.get("trigger_stage") or "") == "T2"
                if dashboard_state == "S3"
                else _engine_purple2_passed(opportunity)
            )
            if bool(card.get("purple2_passed")) != expected_passed:
                return False

    return True


CHART_SEMANTICS = {
    "window_days": 30,
    "source": "same_30_daily_points_used_by_streamlit_chart",
    "price_axis": "actual_price",
    "bb_formula": "ordinary_daily_close_SMA20_plus_minus_2_population_std",
    "ha_ladder": "daily_heikin_ashi_open_close; yellow=close>open, purple=close<open",
    "real_daily_candle": "ordinary daily OHLC aligned 1:1 with each HA/BB point; used for structural 1.236 invalidation",
    "ha_vs_midline_pct": "(HA_close-BB_midline)/BB_midline*100",
    "band_width_pct": "(BB_upper-BB_lower)/abs(BB_midline)*100",
    "ha_band_position": "0=lower_band, 0.5=band_center, 1=upper_band; values may be <0 or >1",
    "visual_summary": {
        "recent_5d": "short-term visual geometry",
        "full_30d": "whole displayed 30-day chart geometry",
        "midline_direction": "rising/falling/flat",
        "bandwidth_state": "expanding/contracting/stable",
        "expansion_direction": "upward/downward/two_sided/contracting/none",
        "note": "raw chart_30d remains authoritative; summary labels are mechanical aids for AI",
    },
    "ai_reading_order": [
        "ai_state_dashboard",
        "S3",
        "S0.5",
        "S1_watch_only",
        "S2_wait_result",
        "chart_30d_on_demand",
    ],
    "long_opportunity": {
        "scope": "fast long-side opportunity scanner; it intentionally ignores structures outside S0/S0.5/S1/S2/S3",
        "priority": "S3 > S0.5 > S2 > S1 > S0 > OTHER (S1/S2 are both 3 stars; S2 sorts first as later progress)",
        "S0": "below midline: fresh yellow break above Purple-2 after a mainly one-way purple liquidation leg; bounce only",
        "S0.5": "below midline: fresh yellow break above Purple-2 with either friendly midline OR a visible second-leg base (Higher-Low/W/Cup/double-bottom) inside the 30d window",
        "S1": "yellow run originated from below midline, beat its state-scoped Purple-2 and crossed above midline; remains S1 while still in the early midline-to-upper-band zone, regardless of yellow day count",
        "S2": "wave-2 waiting state after a visible first-wave push; live purple must enter the actionable upper-midline zone. Failed small yellow bounces do not erase S2 memory; Purple-2 is frozen only after a completed purple run turns yellow",
        "S3": "S2 pullback finished, turned yellow and beat the completed pullback Purple-2; stays S3 only while BB band-position still leaves entry room, not by a fixed day count",
        "midline_regime": "rising / flat / flattening / falling from recent 5d midline slope",
        "near_midline": "adaptive BB band-position geometry, not a fixed price percentage",
        "dynamic_purple2": "Dynamic L/R/Fib Purple-2 is now scoped mainly to below-midline S0/S0.5. S2 does not guess P2 while purple is still open; S3 freezes the finished S2 purple run and uses the purple immediately before that run's lowest purple.",
        "engine_version": OPPORTUNITY_ENGINE_VERSION,
        "purple2_rule_version": PURPLE2_RULE_VERSION,
        "one_star_note": "one star is not failure; it can mean mature expansion / do-not-chase or otherwise poor long entry timing",
    },
}

_EMOJI_COLOR = {
    "🟢": "green",
    "🔴": "red",
    "⚫": "flat",
}


def _safe_float(value: Any, default: Optional[float] = None):
    try:
        if value is None or value is pd.NA:
            return default
        result = float(value)
        if np.isnan(result) or np.isinf(result):
            return default
        return result
    except Exception:
        return default


def _round(value: Any, digits: int = 8):
    number = _safe_float(value)
    return None if number is None else round(number, digits)


def _color_name(value: Any) -> str:
    return _EMOJI_COLOR.get(str(value), str(value or "unknown").lower())


def _ha_step_color(open_value: Any, close_value: Any) -> str:
    open_number = _safe_float(open_value)
    close_number = _safe_float(close_value)
    if open_number is None or close_number is None:
        return "unknown"
    if close_number > open_number:
        return "yellow"
    if close_number < open_number:
        return "purple"
    return "flat"


def _format_date(timestamp: Any, fallback: Any) -> str:
    try:
        # Pionex 時戳已在 main.py 加 8 小時，以 UTC 解讀即可得到台灣日期。
        return datetime.fromtimestamp(
            float(timestamp) / 1000.0,
            tz=timezone.utc,
        ).strftime("%m/%d")
    except Exception:
        return str(fallback)


def _build_ladder_history(record: dict[str, Any]) -> list[dict[str, Any]]:
    percentages = list(record.get("_ha_pct_series") or [])
    opens = list(record.get("_ha_opens_last30") or record.get("_ha_opens_last20") or [])
    closes = list(record.get("_ha_closes_last30") or record.get("_ha_closes_last20") or [])
    times = list(record.get("_ha_times_last30") or record.get("_ha_times_last20") or [])

    history: list[dict[str, Any]] = []
    for index, percentage in enumerate(percentages):
        history.append(
            {
                "date": _format_date(times[index], index) if index < len(times) else str(index),
                "pct": _round(percentage, 6),
                "color": _ha_step_color(
                    opens[index] if index < len(opens) else None,
                    closes[index] if index < len(closes) else None,
                ),
            }
        )
    return history


def _pct_change(start: Any, end: Any) -> Optional[float]:
    start_value = _safe_float(start)
    end_value = _safe_float(end)
    if start_value is None or end_value is None or abs(start_value) < 1e-18:
        return None
    return (end_value - start_value) / abs(start_value) * 100.0


def _trend_metrics(values: list[Any], lookback: int) -> dict[str, Any]:
    cleaned = [_safe_float(value) for value in values]
    cleaned = [value for value in cleaned if value is not None]
    if not cleaned:
        return {
            "days": 0,
            "direction": "unknown",
            "change_pct": None,
            "slope_pct_per_day": None,
        }

    window = cleaned[-min(max(2, lookback), len(cleaned)) :]
    if len(window) < 2:
        return {
            "days": len(window),
            "direction": "flat",
            "change_pct": 0.0,
            "slope_pct_per_day": 0.0,
        }

    change_pct = _pct_change(window[0], window[-1])
    base = abs(float(np.mean(window)))
    if base < 1e-18:
        slope_pct_per_day = 0.0
    else:
        x = np.arange(len(window), dtype=float)
        slope = float(np.polyfit(x, np.asarray(window, dtype=float), 1)[0])
        slope_pct_per_day = slope / base * 100.0

    # 約 0.05%/日以下視為肉眼上的平緩；5 日約 ±0.25%，30 日約 ±1.45%。
    flat_threshold = max(0.25, 0.05 * (len(window) - 1))
    if change_pct is None or abs(change_pct) <= flat_threshold:
        direction = "flat"
    elif change_pct > 0:
        direction = "rising"
    else:
        direction = "falling"

    return {
        "days": len(window),
        "direction": direction,
        "change_pct": _round(change_pct, 6),
        "slope_pct_per_day": _round(slope_pct_per_day, 6),
    }


def _bandwidth_metrics(widths: list[Any], lookback: int) -> dict[str, Any]:
    cleaned = [_safe_float(value) for value in widths]
    cleaned = [value for value in cleaned if value is not None]
    if not cleaned:
        return {
            "days": 0,
            "state": "unknown",
            "start_pct": None,
            "end_pct": None,
            "change_points": None,
            "relative_change_pct": None,
        }

    window = cleaned[-min(max(2, lookback), len(cleaned)) :]
    start = window[0]
    end = window[-1]
    change_points = end - start
    relative_change = _pct_change(start, end)

    # 寬度相對改變 5% 以上才視為明確擴張／收縮，避免每日雜訊被誤判。
    if relative_change is None or abs(relative_change) < 5.0:
        state = "stable"
    elif relative_change > 0:
        state = "expanding"
    else:
        state = "contracting"

    return {
        "days": len(window),
        "state": state,
        "start_pct": _round(start, 6),
        "end_pct": _round(end, 6),
        "change_points": _round(change_points, 6),
        "relative_change_pct": _round(relative_change, 6),
    }


def _build_chart_30d(record: dict[str, Any]) -> list[dict[str, Any]]:
    opens = list(record.get("_ha_opens_last30") or record.get("_ha_opens_last20") or [])
    closes = list(record.get("_ha_closes_last30") or record.get("_ha_closes_last20") or [])
    times = list(record.get("_ha_times_last30") or record.get("_ha_times_last20") or [])
    midlines = list(record.get("_bb_basis_series") or [])
    uppers = list(record.get("_bb_upper_series") or [])
    lowers = list(record.get("_bb_lower_series") or [])
    percentages = list(record.get("_ha_pct_series") or [])
    raw_opens = list(record.get("_raw_opens_last30") or record.get("_raw_opens_last20") or [])
    raw_highs = list(record.get("_raw_highs_last30") or record.get("_raw_highs_last20") or [])
    raw_lows = list(record.get("_raw_lows_last30") or record.get("_raw_lows_last20") or [])
    raw_closes = list(record.get("_raw_closes_last30") or record.get("_raw_closes_last20") or [])

    count = min(
        30,
        len(opens),
        len(closes),
        len(times),
        len(midlines),
        len(uppers),
        len(lowers),
    )
    if count <= 0:
        return []

    opens = opens[-count:]
    closes = closes[-count:]
    times = times[-count:]
    midlines = midlines[-count:]
    uppers = uppers[-count:]
    lowers = lowers[-count:]
    percentages = percentages[-count:] if percentages else []
    raw_opens = raw_opens[-count:] if len(raw_opens) >= count else []
    raw_highs = raw_highs[-count:] if len(raw_highs) >= count else []
    raw_lows = raw_lows[-count:] if len(raw_lows) >= count else []
    raw_closes = raw_closes[-count:] if len(raw_closes) >= count else []

    output: list[dict[str, Any]] = []
    for index in range(count):
        ha_open = _safe_float(opens[index])
        ha_close = _safe_float(closes[index])
        midline = _safe_float(midlines[index])
        upper = _safe_float(uppers[index])
        lower = _safe_float(lowers[index])

        ha_vs_midline = (
            _safe_float(percentages[index])
            if index < len(percentages)
            else None
        )
        if ha_vs_midline is None and ha_close is not None and midline:
            ha_vs_midline = (ha_close - midline) / midline * 100.0

        bandwidth_pct = None
        band_position = None
        if (
            upper is not None
            and lower is not None
            and midline is not None
            and abs(midline) > 1e-18
        ):
            bandwidth_pct = (upper - lower) / abs(midline) * 100.0
        if (
            ha_close is not None
            and upper is not None
            and lower is not None
            and abs(upper - lower) > 1e-18
        ):
            # 0=下軌、0.5=通道中心附近、1=上軌；可小於0或大於1。
            band_position = (ha_close - lower) / (upper - lower)

        output.append(
            {
                "date": _format_date(times[index], index),
                "ha_open": _round(ha_open),
                "ha_close": _round(ha_close),
                "ha_color": _ha_step_color(ha_open, ha_close),
                "bb_upper": _round(upper),
                "bb_midline": _round(midline),
                "bb_lower": _round(lower),
                "ha_vs_midline_pct": _round(ha_vs_midline, 6),
                "band_width_pct": _round(bandwidth_pct, 6),
                "ha_band_position": _round(band_position, 6),
                "real_open": _round(raw_opens[index]) if raw_opens else None,
                "real_high": _round(raw_highs[index]) if raw_highs else None,
                "real_low": _round(raw_lows[index]) if raw_lows else None,
                "real_close": _round(raw_closes[index]) if raw_closes else None,
            }
        )
    return output


def _position_zone(point: dict[str, Any]) -> str:
    position = _safe_float(point.get("ha_band_position"))
    pct = _safe_float(point.get("ha_vs_midline_pct"))
    if position is None:
        return "unknown"
    if position > 1:
        return "above_upper"
    if position >= 0.75:
        return "upper_quarter"
    if pct is not None and pct >= 0:
        return "above_midline"
    if position <= 0:
        return "below_lower"
    if position <= 0.25:
        return "lower_quarter"
    return "below_midline"


def _visual_window_summary(chart: list[dict[str, Any]], days: int) -> dict[str, Any]:
    if not chart:
        return {"days": 0, "channel": {"state": "unknown", "direction": "unknown"}}

    window = chart[-min(days, len(chart)) :]
    midlines = [point.get("bb_midline") for point in window]
    uppers = [point.get("bb_upper") for point in window]
    lowers = [point.get("bb_lower") for point in window]
    ha_closes = [point.get("ha_close") for point in window]
    widths = [point.get("band_width_pct") for point in window]

    midline = _trend_metrics(midlines, len(window))
    upper = _trend_metrics(uppers, len(window))
    lower = _trend_metrics(lowers, len(window))
    ha = _trend_metrics(ha_closes, len(window))
    bandwidth = _bandwidth_metrics(widths, len(window))

    state = bandwidth.get("state", "unknown")
    if state == "expanding":
        if midline.get("direction") == "rising":
            expansion_direction = "upward"
        elif midline.get("direction") == "falling":
            expansion_direction = "downward"
        else:
            expansion_direction = "two_sided"
    elif state == "contracting":
        expansion_direction = "contracting"
    elif state == "stable":
        expansion_direction = "none"
    else:
        expansion_direction = "unknown"

    return {
        "days": len(window),
        "midline": midline,
        "upper_band": upper,
        "lower_band": lower,
        "ha_ladder": ha,
        "bandwidth": bandwidth,
        "channel": {
            "state": state,
            "direction": midline.get("direction", "unknown"),
            "expansion_direction": expansion_direction,
            "upper_change_pct": upper.get("change_pct"),
            "lower_change_pct": lower.get("change_pct"),
            "midline_change_pct": midline.get("change_pct"),
        },
    }


def _build_visual_summary(chart: list[dict[str, Any]]) -> dict[str, Any]:
    if not chart:
        return {
            "recent_5d": _visual_window_summary([], 5),
            "full_30d": _visual_window_summary([], 30),
            "latest": {},
        }

    latest = chart[-1]
    return {
        "recent_5d": _visual_window_summary(chart, 5),
        "full_30d": _visual_window_summary(chart, 30),
        "latest": {
            "date": latest.get("date"),
            "ha_color": latest.get("ha_color"),
            "ha_vs_midline_pct": latest.get("ha_vs_midline_pct"),
            "ha_band_position": latest.get("ha_band_position"),
            "position_zone": _position_zone(latest),
            "band_width_pct": latest.get("band_width_pct"),
        },
    }


def _four_h_pair(previous: str, current: str) -> str:
    return f"{_color_name(previous)}_{_color_name(current)}"



def _engine_purple2_passed(opportunity: dict[str, Any]) -> bool:
    """直接沿用 S 狀態引擎已經做出的 Purple-2 passed 結果。

    S 狀態引擎以 passed_by_actual_ha_price 作為 Purple-2 通過判定；
    AI Layer 只轉送這個結果，不再用 relative 欄位重算或做 AND。
    """
    p2 = opportunity.get("purple2_reference") or {}
    return bool(p2.get("passed_by_actual_ha_price"))


def _base_quality_from_opportunity(opportunity: dict[str, Any]) -> dict[str, Any]:
    structure = opportunity.get("purple_structure") or {}
    base = structure.get("base_quality") or structure.get("origin_base_quality") or {}
    return base if isinstance(base, dict) else {}


def _build_s05_quality(opportunity: dict[str, Any]) -> dict[str, Any] | None:
    """把 S0.5 最重要的人眼條件壓成一眼可讀的 Boolean 摘要。"""
    if str(opportunity.get("market_state_id") or "OTHER") != "S0.5":
        return None

    base = _base_quality_from_opportunity(opportunity)
    midline = opportunity.get("midline") or {}
    current = opportunity.get("current") or {}
    shape = str(base.get("shape") or "none")
    right_low_above_left = base.get("right_low_above_left")
    improvement = _safe_float(midline.get("slope_improvement_pct_per_day"), 0.0) or 0.0
    midline_state = str(midline.get("state") or "unknown")

    return {
        "qualified": bool(base.get("qualified") or midline_state in {"rising", "flat", "flattening"}),
        "shape": shape,
        "no_lower_low": bool(right_low_above_left) if right_low_above_left is not None else None,
        "higher_low": bool(right_low_above_left) if right_low_above_left is not None else None,
        "double_bottom": bool(shape == "double_bottom"),
        "second_leg_base": bool(base.get("qualified")),
        "midline_relaxing": bool(midline_state in {"rising", "flat", "flattening"} or improvement > 0),
        "purple2_passed": _engine_purple2_passed(opportunity),
        "near_midline": bool(current.get("near_midline")),
        "left_low": base.get("left_low"),
        "right_low": base.get("right_low"),
    }


def _build_s3_room(opportunity: dict[str, Any]) -> dict[str, Any] | None:
    """用 BB band position 表示 S3 還剩多少不追高空間。"""
    if str(opportunity.get("market_state_id") or "OTHER") != "S3":
        return None

    current = opportunity.get("current") or {}
    geometry = opportunity.get("geometry") or {}
    band_position = _safe_float(current.get("ha_band_position"))
    max_position = _safe_float(geometry.get("s3_active_bandpos_max"), 0.75)
    if max_position is None:
        max_position = 0.75

    if band_position is None:
        return {
            "band_position": None,
            "max_position": _round(max_position, 6),
            "remaining_room": None,
            "state": "UNKNOWN",
        }

    remaining = max_position - band_position
    active_span = max(max_position - 0.5, 1e-9)
    progress = (band_position - 0.5) / active_span
    if band_position > max_position:
        room_state = "EXPIRED"
    elif progress <= 1 / 3:
        room_state = "GOOD"
    elif progress <= 2 / 3:
        room_state = "OK"
    else:
        room_state = "TIGHT"

    return {
        "band_position": _round(band_position, 6),
        "max_position": _round(max_position, 6),
        "remaining_room": _round(remaining, 6),
        "state": room_state,
    }


def _snapshot_date(generated_time: str) -> str:
    value = str(generated_time or "").strip()
    if len(value) >= 10 and value[4:5] == "-" and value[7:8] == "-":
        return value[:10]
    return datetime.now(TW_TZ).strftime("%Y-%m-%d")


def _load_local_previous_snapshot(path: str | None) -> dict[str, Any] | None:
    filename = Path(str(path or "snapshot_ai.json")).name
    local_path = Path(__file__).resolve().parent / filename
    try:
        parsed = json.loads(local_path.read_text(encoding="utf-8"))
        return parsed if isinstance(parsed, dict) else None
    except Exception:
        return None


def _load_previous_snapshot(path: str | None) -> dict[str, Any] | None:
    # GitHub 是真正持續累積的來源；沒有 Token / 網路失敗才退回 repo 內舊 snapshot。
    remote = load_snapshot_from_github(path_override=path)
    if isinstance(remote, dict):
        return remote
    return _load_local_previous_snapshot(path)


def _normalized_history(history: Any) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    if not isinstance(history, list):
        return output
    for item in history:
        if not isinstance(item, dict):
            continue
        state = str(item.get("state") or "").strip()
        date = str(item.get("date") or "").strip()
        if not state or not date:
            continue
        output.append({
            "date": date,
            "state": state,
            "price": _round(item.get("price")),
        })
    return output[-STATE_HISTORY_LIMIT:]


def _attach_state_history(
    records: list[dict[str, Any]],
    previous_snapshot: dict[str, Any] | None,
    generated_time: str,
) -> None:
    """只在狀態改變時追加，避免每次重新分析都塞重複狀態。"""
    previous_records = {}
    previous_date = ""
    if isinstance(previous_snapshot, dict):
        previous_date = str((previous_snapshot.get("batch") or {}).get("generated_at_taiwan") or "")[:10]
        previous_records = {
            str(item.get("symbol") or ""): item
            for item in (previous_snapshot.get("records") or [])
            if isinstance(item, dict)
        }

    current_date = _snapshot_date(generated_time)
    for record in records:
        symbol = str(record.get("symbol") or "")
        current_state = str((record.get("opportunity_long") or {}).get("market_state_id") or "OTHER")
        current_price = _round(record.get("price"))
        previous = previous_records.get(symbol) or {}
        history = _normalized_history(previous.get("state_history"))

        # 舊 schema 尚未有 state_history 時，先把上一版狀態補成第一個歷史節點。
        if not history and previous:
            previous_state = str((previous.get("opportunity_long") or {}).get("market_state_id") or "").strip()
            if previous_state:
                history.append({
                    "date": previous_date or current_date,
                    "state": previous_state,
                    "price": _round(previous.get("price")),
                })

        if not history or history[-1].get("state") != current_state:
            history.append({
                "date": current_date,
                "state": current_state,
                "price": current_price,
            })

        record["state_history"] = history[-STATE_HISTORY_LIMIT:]


def _round_probability(value: Any, digits: int = 6):
    try:
        if value is None:
            return None
        return round(float(value), digits)
    except (TypeError, ValueError):
        return None


def _compact_probability_node(node: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(node, dict) or not node.get("available"):
        return {"available": False, "reason": (node or {}).get("reason", "unavailable")}
    late = node.get("late_success_4_7d") or {}
    return {
        "available": True,
        "success_probability": _round_probability(node.get("success_probability", node.get("probability"))),
        "alive_slow_probability": _round_probability(node.get("alive_slow_probability")),
        "true_fail_probability": _round_probability(node.get("true_fail_probability")),
        "other_probability": _round_probability(node.get("other_probability")),
        "structural_survival_probability": _round_probability(node.get("structural_survival_probability")),
        "matched_samples": int(node.get("samples", 0) or 0),
        "wins": int(node.get("wins", 0) or 0),
        "level": int(node.get("level", 0) or 0),
        "fields": list(node.get("fields") or []),
        "fallback": bool(node.get("fallback", False)),
        "late_success_4_7d": {
            "eligible_samples": int(late.get("eligible_samples", 0) or 0),
            "count": int(late.get("count", 0) or 0),
            "probability": _round_probability(late.get("probability")),
        } if late else None,
    }


def _attach_historical_probability(records: list[dict[str, Any]]) -> dict[str, Any]:
    """Write the trained probability decision into snapshot records.

    Streamlit and snapshot now consume the same probability_reader result.
    This keeps Cloudflare/HTML migration independent from Streamlit runtime.
    """
    model = load_probability_model()
    meta = {
        "available": bool(model.get("available")),
        "schema_version": model.get("schema_version"),
        "model_id": model.get("model_id"),
        "generated_at": model.get("generated_at"),
        "primary_horizon_hours": 72,
        "max_level": 5,
    }
    for record in records:
        result = predict_record(record, record.get("opportunity_long") or {})
        if not result.get("available"):
            record["historical_probability"] = {
                "available": False,
                "state": result.get("state"),
                "reason": result.get("reason", "not_modeled"),
                "model_id": model.get("model_id"),
            }
            continue
        predictions = result.get("predictions") or {}
        primary = result.get("primary") or {}
        record["historical_probability"] = {
            "available": True,
            "model_id": result.get("model_id"),
            "model_generated_at": result.get("generated_at"),
            "state": result.get("state"),
            "target": result.get("target"),
            "primary_horizon_hours": 72,
            "model_level": int(primary.get("level", 0) or 0),
            "matched_samples": int(primary.get("samples", 0) or 0),
            "features": dict(result.get("features") or {}),
            "24h": _compact_probability_node(predictions.get("6") or {}),
            "48h": _compact_probability_node(predictions.get("12") or {}),
            "72h": _compact_probability_node(predictions.get("18") or {}),
        }
    return meta


def _build_ai_state_dashboard(records: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    dashboard: dict[str, list[dict[str, Any]]] = {"S3": [], "S0.5": [], "S1": [], "S2": []}

    for record in records:
        opportunity = record.get("opportunity_long") or {}
        state = str(opportunity.get("market_state_id") or "OTHER")
        if state not in dashboard:
            continue

        midline = opportunity.get("midline") or {}
        current = opportunity.get("current") or {}
        freshness = opportunity.get("trigger_freshness") or {}
        probability = record.get("historical_probability") or {}
        p72 = probability.get("72h") or {}
        card: dict[str, Any] = {
            "symbol": record.get("symbol"),
            "sectors": record.get("sectors") or [],
            "midline": midline.get("state"),
            "midline_slope": _round(midline.get("recent_5d_slope_pct_per_day"), 6),
            "band_position": _round(current.get("ha_band_position"), 6),
            "trigger_age": freshness.get("days_ago"),
            "state_age_bars": record.get("state_age_bars"),
            "state_age_bin": record.get("state_age_bin"),
            "h4": _four_h_pair(record.get("h4_prev"), record.get("h4_curr")),
            "probability_72h": ({
                "model_level": probability.get("model_level"),
                "matched_samples": probability.get("matched_samples"),
                "success_probability": p72.get("success_probability"),
                "alive_slow_probability": p72.get("alive_slow_probability"),
                "true_fail_probability": p72.get("true_fail_probability"),
                "other_probability": p72.get("other_probability"),
                "structural_survival_probability": p72.get("structural_survival_probability"),
            } if probability.get("available") else None),
        }

        if state == "S3":
            room = record.get("s3_room") or {}
            card.update({
                "purple2_passed": str(opportunity.get("trigger_stage") or "") == "T2",
                "room_state": room.get("state"),
                "remaining_room": room.get("remaining_room"),
            })
        elif state == "S0.5":
            quality = record.get("s05_quality") or {}
            card.update({
                "bottom_structure": quality.get("shape"),
                "new_lower_low": (None if quality.get("no_lower_low") is None else not bool(quality.get("no_lower_low"))),
                "midline_slope_improving": bool(quality.get("midline_relaxing")),
                "purple2_passed": _engine_purple2_passed(opportunity),
            })
        elif state == "S1":
            card.update({
                "action": STATE_ACTION["S1"],
                "trigger_stage": opportunity.get("trigger_stage"),
            })
        elif state == "S2":
            wave2 = ((opportunity.get("purple_structure") or {}).get("wave2_pullback") or {})
            card.update({
                "ha_color": current.get("ha_color"),
                "wave2_qualified": bool(wave2.get("qualified")),
                "pullback_phase": wave2.get("pullback_phase"),
            })

        dashboard[state].append(card)

    # 固定 AI 閱讀順序；各狀態內以 trigger 新鮮度、band position 接近中軌優先。
    def sort_key(card: dict[str, Any]):
        age = card.get("trigger_age")
        age_key = 99 if age is None else int(age)
        bp = _safe_float(card.get("band_position"))
        bp_key = 9.0 if bp is None else bp
        return (age_key, abs(bp_key - 0.5), str(card.get("symbol") or ""))

    for state in dashboard:
        dashboard[state].sort(key=sort_key)
    return dashboard

def _compact_record(source: dict[str, Any]) -> dict[str, Any]:
    history = _build_ladder_history(source)
    chart_30d = _build_chart_30d(source)
    visual_summary = _build_visual_summary(chart_30d)
    flag_history = [
        {
            "date": item["date"],
            "pct_vs_midline": item["pct"],
            "color": item["color"],
        }
        for item in history
    ]
    flags = (
        source.get("_pattern_flags")
        or source.get("pattern_flags")
        or build_pattern_flags(source, flag_history)
    )
    pattern_type = (
        source.get("_pattern_type_hint")
        or source.get("pattern_type_hint")
        or classify_pattern(flags)
    )
    score = source.get("_machine_score_hint_0_100")
    if score is None:
        score = source.get("machine_score_hint_0_100")
    if score is None:
        score = score_hint(flags, {"abs_dev": source.get("_abs_dev")})

    opportunity = (
        source.get("_long_opportunity")
        or source.get("opportunity_long")
        or build_long_opportunity(source, flag_history)
    )

    symbol = str(source.get("幣種") or source.get("symbol") or "").upper()
    threshold = source.get("_ha_threshold") or source.get("ha_color_threshold") or {}
    h4_tail = [_color_name(value) for value in list(source.get("_ha4h_color_series") or [])[-4:]]
    h4_pair = _four_h_pair(source.get("4H前"), source.get("4H當"))

    sectors = (
        get_rwa_sector_tags(symbol)
        if is_rwa_symbol(symbol)
        else list(SECTOR_TAGS.get(symbol, ["未分類"]))
    )

    return {
        "symbol": symbol,
        "api_symbol": str(source.get("_api_symbol") or ""),
        "sectors": sectors,
        "price": _round(source.get("_price")),
        "bb_upper_1d": _round(source.get("_bb_upper_1d")),
        "bb_midline_1d": _round(source.get("_bb1d")),
        "bb_lower_1d": _round(source.get("_bb_lower_1d")),
        "bb_pct": _round(source.get("_bb_pct"), 6),
        "d1_prev": _color_name(source.get("1D前")),
        "d1_curr": _color_name(source.get("1D當")),
        "h4_prev": _color_name(source.get("4H前")),
        "h4_curr": _color_name(source.get("4H當")),
        "h4_tail": h4_tail,
        "threshold": {
            "state": str(threshold.get("state") or "unknown"),
            "price": _round(threshold.get("price")),
            "gap_pct": _round(threshold.get("signed_gap_pct"), 6),
        },
        # Level 5：與 HistoricalTraining 同義的 S-state 連續 4H 年齡。
        "state_age_bars": (int(source.get("_state_age_bars")) if source.get("_state_age_bars") is not None else None),
        "state_age_bin": (str(source.get("_state_age_bin")) if source.get("_state_age_bin") else None),
        # 新版主判斷：星級代表「做多進場機會」，不是趨勢強弱。
        "opportunity_long": opportunity,
        # AI 快速層：只有對應狀態才有內容；其他狀態為 null，避免噪音。
        "s05_quality": _build_s05_quality(opportunity),
        "s3_room": _build_s3_room(opportunity),
        # 最近8日階梯摘要保留，方便 AI 快速閱讀；權威資料仍是 chart_30d。
        "ladder_tail": history[-8:],
        # 30 日視覺等價資料：與 Streamlit 圖表使用完全相同的 HA + BB20 序列。
        "chart_30d": chart_30d,
        # 人眼會判斷的斜率、擴張/收縮、方向。
        "visual_summary": visual_summary,
    }


def _build_breadth(records: list[dict[str, Any]]) -> dict[str, Any]:
    total = len(records)
    latest_colors = Counter(
        (record.get("opportunity_long", {}).get("current", {}) or {}).get("ha_color", "unknown")
        for record in records
    )
    star_counts = Counter(
        int(record.get("opportunity_long", {}).get("stars", 1) or 1)
        for record in records
    )
    stage_counts = Counter(
        record.get("opportunity_long", {}).get("trigger_stage", "T0")
        for record in records
    )
    midline_counts = Counter(
        (record.get("opportunity_long", {}).get("midline", {}) or {}).get("state", "unknown")
        for record in records
    )
    market_state_counts = Counter(
        (record.get("opportunity_long", {}) or {}).get("market_state_id", "OTHER")
        for record in records
    )

    above = sum(1 for record in records if (record.get("bb_pct") or 0) > 0)
    below = sum(1 for record in records if (record.get("bb_pct") or 0) < 0)
    at_midline = total - above - below

    return {
        "long_opportunity": {
            "five_star": int(star_counts.get(5, 0)),
            "four_star": int(star_counts.get(4, 0)),
            "three_star": int(star_counts.get(3, 0)),
            "two_star": int(star_counts.get(2, 0)),
            "one_star": int(star_counts.get(1, 0)),
            "three_star_or_better": int(sum(star_counts.get(x, 0) for x in (3,4,5))),
        },
        "market_state": {
            "S3": int(market_state_counts.get("S3", 0)),
            "S0.5": int(market_state_counts.get("S0.5", 0)),
            "S1": int(market_state_counts.get("S1", 0)),
            "S2": int(market_state_counts.get("S2", 0)),
            "S0": int(market_state_counts.get("S0", 0)),
            "OTHER": int(market_state_counts.get("OTHER", 0)),
        },
        "trigger_stage": {
            "T0": int(stage_counts.get("T0", 0)),
            "T1": int(stage_counts.get("T1", 0)),
            "T2": int(stage_counts.get("T2", 0)),
        },
        "midline_regime": {
            "rising": int(midline_counts.get("rising", 0)),
            "flat": int(midline_counts.get("flat", 0)),
            "flattening": int(midline_counts.get("flattening", 0)),
            "falling": int(midline_counts.get("falling", 0)),
        },
        "daily_ha": {
            "purple": int(latest_colors.get("purple", 0)),
            "yellow": int(latest_colors.get("yellow", 0)),
            "flat_or_unknown": int(total-latest_colors.get("purple",0)-latest_colors.get("yellow",0)),
        },
        "midline_position": {
            "real_price_above": above,
            "real_price_below": below,
            "real_price_at": at_midline,
            "real_price_near_3pct": sum(1 for r in records if r.get("bb_pct") is not None and abs(r.get("bb_pct") or 0) <= 3),
            "ha_near_midline_adaptive": sum(
                1 for r in records
                if bool(((r.get("opportunity_long", {}) or {}).get("current", {}) or {}).get("near_midline"))
            ),
        },
    }

def _ranked_symbols(
    records: list[dict[str, Any]],
    predicate,
    *,
    limit: int = GROUP_LIMIT,
) -> list[str]:
    selected = [record for record in records if predicate(record)]
    def key(record):
        opp = record.get("opportunity_long", {}) or {}
        stars = int(opp.get("stars", 1) or 1)
        stage = str(opp.get("trigger_stage", "T0"))
        days = (opp.get("trigger_freshness", {}) or {}).get("days_ago")
        fresh = 9 if days is None else int(days)
        current_pct = abs(float((opp.get("current", {}) or {}).get("ha_vs_midline_pct") or 999))
        return (-stars, {"T2":0,"T1":1,"T0":2}.get(stage,3), fresh, current_pct, record.get("symbol") or "")
    selected.sort(key=key)
    return [str(record.get("symbol")) for record in selected[:limit]]


def _build_groups(records: list[dict[str, Any]]) -> dict[str, list[str]]:
    def state(wanted):
        return lambda r: str((r.get("opportunity_long", {}) or {}).get("market_state_id","OTHER")) == wanted
    return {
        "S3_wave3_trigger": _ranked_symbols(records, state("S3")),
        "S05_quality_reversal": _ranked_symbols(records, state("S0.5")),
        "S1_wave1_breakout": _ranked_symbols(records, state("S1")),
        "S2_wave2_pullback": _ranked_symbols(records, state("S2")),
        "S0_bounce": _ranked_symbols(records, state("S0")),
        "OTHER_skipped": _ranked_symbols(records, state("OTHER")),
        "midline_long_friendly": _ranked_symbols(records, lambda r: ((r.get("opportunity_long", {}) or {}).get("midline", {}) or {}).get("state") in {"rising","flat","flattening"}),
    }

def _snapshot_hash(selection: str, records: list[dict[str, Any]]) -> str:
    raw = json.dumps(
        {
            "schema_version": SCHEMA_VERSION,
            "selection": selection,
            "records": records,
        },
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def build_snapshot_payload(
    df,
    plot_results: Iterable[dict[str, Any]],
    selection: str = "—",
    sort_option: str = "—",
    title: str = "HA Crypto Terminal",
    generated_at: Optional[str] = None,
    github_path: Optional[str] = None,
):
    del df  # 保留舊函式介面，避免 main.py 呼叫方式改動。
    del title

    generated_time = generated_at or datetime.now(TW_TZ).strftime("%Y-%m-%d %H:%M:%S")
    previous_snapshot = _load_previous_snapshot(github_path)

    records = sorted(
        (_compact_record(record) for record in list(plot_results)),
        key=lambda record: record.get("symbol") or "",
    )
    _attach_state_history(records, previous_snapshot, generated_time)
    probability_model_meta = _attach_historical_probability(records)

    payload = {
        "batch": {
            "generated_at_taiwan": generated_time,
            "snapshot_hash": _snapshot_hash(selection, records),
            "schema_version": SCHEMA_VERSION,
            "ai_analysis_layer": AI_LAYER_REVISION,
            "engine_version": OPPORTUNITY_ENGINE_VERSION,
            "purple2_rule_version": PURPLE2_RULE_VERSION,
            "count": len(records),
            "selection": selection,
            "sort_option": sort_option,
            "probability_model": probability_model_meta,
        },
        "state_action": STATE_ACTION,
        "state_action_zh": STATE_ACTION_ZH,
        "ai_state_dashboard": _build_ai_state_dashboard(records),
        "chart_semantics": CHART_SEMANTICS,
        "breadth": _build_breadth(records),
        "groups": _build_groups(records),
        "records": records,
    }

    sync_snapshot_to_github(payload, path_override=github_path)
    return payload
