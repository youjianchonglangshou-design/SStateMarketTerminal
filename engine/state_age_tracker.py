from __future__ import annotations

"""Live S-state age calculator matching HistoricalTraining Level-5 semantics.

HistoricalTraining defines ``state_age_bars`` as the number of consecutive 4H
replay cutoffs whose S-state equals the current S-state.  This module recreates
that definition for the live monitor without using trigger_age.

Important: if the replayed current state does not match the live engine state,
the caller should discard the age and fall back to Level 4.
"""

from typing import Any
import numpy as np

from ha_threshold import compute_threshold_from_daily_data
from scoring_rules import build_long_opportunity

BB_PERIOD = 20
STRUCTURE_WINDOW_DAYS = 30
MIN_DAILY_BARS = STRUCTURE_WINDOW_DAYS + BB_PERIOD - 1
MAX_REPLAY_AGE_BARS = 8  # enough to distinguish 1 / 2-3 / 4-6 / 7+
TW_OFFSET_MS = 8 * 3600 * 1000
DAY_MS = 24 * 60 * 60 * 1000


def _bin_age(value: int) -> str:
    if value <= 1:
        return "1"
    if value <= 3:
        return "2_3"
    if value <= 6:
        return "4_6"
    return "7_PLUS"


def _utc_day_start_ms(timestamp_ms: int) -> int:
    return (int(timestamp_ms) // DAY_MS) * DAY_MS


def _to_utc(rows_display: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [dict(row, time=int(row["time"]) - TW_OFFSET_MS) for row in rows_display]


def _aggregate_partial_day(rows: list[dict[str, Any]]) -> dict[str, float] | None:
    if not rows:
        return None
    rows = sorted(rows, key=lambda x: int(x["time"]))
    first = rows[0]
    return {
        "time": _utc_day_start_ms(int(first["time"])),
        "open": float(first["open"]),
        "high": max(float(x["high"]) for x in rows),
        "low": min(float(x["low"]) for x in rows),
        "close": float(rows[-1]["close"]),
        "volume": sum(float(x.get("volume", 0.0)) for x in rows),
    }


def _calculate_heikin_ashi(klines: list[dict[str, Any]]) -> list[dict[str, float]]:
    if not klines:
        return []
    out: list[dict[str, float]] = []
    prev_open = None
    prev_close = None
    for idx, candle in enumerate(klines):
        o = float(candle["open"])
        h = float(candle["high"])
        l = float(candle["low"])
        c = float(candle["close"])
        ha_close = (o + h + l + c) / 4.0
        ha_open = (o + c) / 2.0 if idx == 0 else (float(prev_open) + float(prev_close)) / 2.0
        out.append({
            "time": int(candle["time"]),
            "open": ha_open,
            "high": max(h, ha_open, ha_close),
            "low": min(l, ha_open, ha_close),
            "close": ha_close,
        })
        prev_open = ha_open
        prev_close = ha_close
    return out


def _ha_color(candle: dict[str, Any]) -> str:
    if float(candle["close"]) > float(candle["open"]):
        return "🟢"
    if float(candle["close"]) < float(candle["open"]):
        return "🔴"
    return "⚫"


def _rolling_bb_series(raw_daily: list[dict[str, Any]], start_index: int) -> tuple[list[float], list[float], list[float]]:
    closes = [float(x["close"]) for x in raw_daily]
    bases: list[float] = []
    uppers: list[float] = []
    lowers: list[float] = []
    for idx in range(start_index, len(raw_daily)):
        arr = np.asarray(closes[idx - BB_PERIOD + 1: idx + 1], dtype=float)
        basis = float(np.mean(arr))
        std = float(np.std(arr, ddof=0))
        bases.append(basis)
        uppers.append(basis + 2.0 * std)
        lowers.append(basis - 2.0 * std)
    return bases, uppers, lowers


def _build_record(symbol: str, daily_utc: list[dict[str, Any]], four_h_utc: list[dict[str, Any]]) -> dict[str, Any] | None:
    if len(daily_utc) < MIN_DAILY_BARS or len(four_h_utc) < 6:
        return None

    daily_utc = sorted(daily_utc[-150:], key=lambda x: int(x["time"]))
    four_h_utc = sorted(four_h_utc[-150:], key=lambda x: int(x["time"]))

    # Match HistoricalTraining/runtime_core: engine sees Taiwan-shifted timestamps.
    daily = [dict(x, time=int(x["time"]) + TW_OFFSET_MS) for x in daily_utc]
    four_h = [dict(x, time=int(x["time"]) + TW_OFFSET_MS) for x in four_h_utc]

    daily_ha = _calculate_heikin_ashi(daily)
    four_h_ha = _calculate_heikin_ashi(four_h)
    closes = np.asarray([float(x["close"]) for x in daily[-BB_PERIOD:]], dtype=float)
    basis = float(np.mean(closes))
    std = float(np.std(closes, ddof=0))
    upper_band = basis + 2.0 * std
    lower_band = basis - 2.0 * std
    price = float(four_h[-1]["close"])

    last_30 = daily_ha[-STRUCTURE_WINDOW_DAYS:]
    raw_last_30 = daily[-STRUCTURE_WINDOW_DAYS:]
    start_index = len(daily) - len(last_30)
    band_basis, band_upper, band_lower = _rolling_bb_series(daily, start_index)
    percentages = [
        ((float(candle["close"]) - float(sma)) / float(sma) * 100.0) if float(sma) else 0.0
        for candle, sma in zip(last_30, band_basis)
    ]

    four_h_colors = [_ha_color(x) for x in four_h_ha[-6:]]
    threshold = compute_threshold_from_daily_data(
        daily_raw_candle=daily[-1],
        daily_ha_open=daily_ha[-1]["open"],
        ordinary_close=price,
        precision=8,
    )

    return {
        "幣種": symbol,
        "_api_symbol": symbol,
        "4H前'''": four_h_colors[-5] if len(four_h_colors) >= 5 else "⚫",
        "4H前''": four_h_colors[-4] if len(four_h_colors) >= 4 else "⚫",
        "4H前'": four_h_colors[-3] if len(four_h_colors) >= 3 else "⚫",
        "4H前": four_h_colors[-2],
        "4H當": four_h_colors[-1],
        "_price": price,
        "_bb1d": basis,
        "_bb_upper_1d": upper_band,
        "_bb_lower_1d": lower_band,
        "_bb_pct": ((price - basis) / basis * 100.0) if basis else 0.0,
        "_abs_dev": abs(((price - basis) / basis * 100.0) if basis else 0.0),
        "_ha_pct_series": percentages,
        "_ha_curr_pct": percentages[-1],
        "_bb_basis_series": band_basis,
        "_bb_upper_series": band_upper,
        "_bb_lower_series": band_lower,
        "_ha_opens_last30": [float(x["open"]) for x in last_30],
        "_ha_closes_last30": [float(x["close"]) for x in last_30],
        "_ha_times_last30": [int(x["time"]) for x in last_30],
        "_raw_opens_last30": [float(x["open"]) for x in raw_last_30],
        "_raw_highs_last30": [float(x["high"]) for x in raw_last_30],
        "_raw_lows_last30": [float(x["low"]) for x in raw_last_30],
        "_raw_closes_last30": [float(x["close"]) for x in raw_last_30],
        "_ha4h_color_series": four_h_colors,
        "_ha_threshold": threshold,
    }


def _state_at_cutoff(symbol: str, daily_utc: list[dict[str, Any]], four_h_utc: list[dict[str, Any]], idx: int) -> str | None:
    cutoff_time = int(four_h_utc[idx]["time"])
    day_key = _utc_day_start_ms(cutoff_time)

    completed_days = [x for x in daily_utc if int(x["time"]) < day_key]
    day_rows = [
        x for x in four_h_utc[: idx + 1]
        if _utc_day_start_ms(int(x["time"])) == day_key
    ]
    partial = _aggregate_partial_day(day_rows)
    if partial is None:
        return None

    daily_window = (completed_days + [partial])[-150:]
    four_h_window = four_h_utc[max(0, idx - 149): idx + 1]
    record = _build_record(symbol, daily_window, four_h_window)
    if record is None:
        return None
    opportunity = build_long_opportunity(record, None)
    return str(opportunity.get("market_state_id") or "OTHER")


def compute_live_state_age(
    symbol: str,
    daily_rows_display: list[dict[str, Any]],
    four_h_rows_display: list[dict[str, Any]],
) -> dict[str, Any]:
    """Return Level-5-compatible state age from the last live 4H cutoffs.

    The current run is counted backward for at most eight cutoffs. Eight is
    sufficient because the historical model bins every value >=7 as 7_PLUS.
    """
    if len(daily_rows_display) < MIN_DAILY_BARS or len(four_h_rows_display) < 8:
        return {"available": False, "reason": "insufficient_history"}

    daily_utc = sorted(_to_utc(daily_rows_display), key=lambda x: int(x["time"]))
    four_h_utc = sorted(_to_utc(four_h_rows_display), key=lambda x: int(x["time"]))

    states_rev: list[str] = []
    start = len(four_h_utc) - 1
    stop = max(-1, start - MAX_REPLAY_AGE_BARS)
    for idx in range(start, stop, -1):
        state = _state_at_cutoff(symbol, daily_utc, four_h_utc, idx)
        if state is None:
            break
        states_rev.append(state)
        if len(states_rev) >= 2 and state != states_rev[0]:
            break

    if not states_rev:
        return {"available": False, "reason": "state_replay_failed"}

    current_state = states_rev[0]
    age = 0
    for state in states_rev:
        if state != current_state:
            break
        age += 1

    return {
        "available": True,
        "state": current_state,
        "state_age_bars": int(age),
        "state_age_bin": _bin_age(int(age)),
        "trace_newest_first": states_rev,
        "capped_at": MAX_REPLAY_AGE_BARS,
    }
