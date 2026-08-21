from __future__ import annotations

import threading
import time
from datetime import datetime, timezone
from typing import Any

import numpy as np
import pandas as pd
import requests

from ha_threshold import compute_threshold_from_daily_data
import scoring_rules as _scoring_engine
from state_age_tracker import compute_live_state_age
from symbols_config import resolve_api_symbol

EXPECTED_ENGINE_API_VERSION = "opportunity-state-v4.8-30d-structure"
ENGINE_API_VERSION = getattr(_scoring_engine, "ENGINE_API_VERSION", "legacy-or-missing")
OPPORTUNITY_ENGINE_VERSION = getattr(_scoring_engine, "OPPORTUNITY_ENGINE_VERSION", "ENGINE-MISMATCH")
PURPLE2_RULE_VERSION = getattr(_scoring_engine, "PURPLE2_RULE_VERSION", "P2-MISMATCH")
build_long_opportunity = getattr(_scoring_engine, "build_long_opportunity", None)
build_pattern_flags = getattr(_scoring_engine, "build_pattern_flags", None)
classify_pattern = getattr(_scoring_engine, "classify_pattern", None)
score_hint = getattr(_scoring_engine, "score_hint", None)

STRUCTURE_WINDOW_DAYS = 30
BB_PERIOD = 20
MIN_DAILY_BARS = 1  # 清單不設成熟度門檻；有 1 根日K就可進主頁，BB20 之後自然長出。
MIN_4H_BARS = 1
_PIONEX_RATE_LOCK = threading.Lock()
_PIONEX_NEXT_REQUEST_AT = 0.0
_PIONEX_MIN_INTERVAL_SECONDS = 0.25
_PIONEX_429_COOLDOWN_SECONDS = 65.0

def format_price(price: Any) -> str:
    try:
        value = float(price)
    except Exception:
        return "—"

    if value >= 10000:
        return f"{value:,.1f}"
    if value >= 1000:
        return f"{value:,.2f}"
    if value >= 100:
        return f"{value:.2f}"
    if value >= 10:
        return f"{value:.3f}"
    if value >= 1:
        return f"{value:.4f}"
    if value >= 0.01:
        return f"{value:.5f}"
    if value >= 0.0001:
        return f"{value:.6f}"
    return f"{value:.8f}"

def calculate_heikin_ashi(klines: list[dict]) -> list[dict]:
    if not klines:
        return []

    output = []
    previous_open = None
    previous_close = None

    for index, candle in enumerate(klines):
        open_price = candle["open"]
        high_price = candle["high"]
        low_price = candle["low"]
        close_price = candle["close"]

        ha_close = (
            open_price + high_price + low_price + close_price
        ) / 4.0
        ha_open = (
            (open_price + close_price) / 2.0
            if index == 0
            else (previous_open + previous_close) / 2.0
        )

        output.append(
            {
                "time": candle["time"],
                "open": ha_open,
                "high": max(high_price, ha_open, ha_close),
                "low": min(low_price, ha_open, ha_close),
                "close": ha_close,
            }
        )
        previous_open = ha_open
        previous_close = ha_close

    return output

def get_ha_color(candle: dict) -> str:
    if candle["close"] > candle["open"]:
        return "🟢"
    if candle["close"] < candle["open"]:
        return "🔴"
    return "⚫"

def calculate_bollinger_bands(
    klines: list[dict],
    period: int = 20,
    std_multiplier: float = 2.0,
):
    if len(klines) < period:
        return None, None, None

    closes = np.asarray(
        [item["close"] for item in klines[-period:]],
        dtype=float,
    )
    basis = float(np.mean(closes))
    std = float(np.std(closes, ddof=0))
    upper = basis + std_multiplier * std
    lower = basis - std_multiplier * std
    return basis, upper, lower

def calculate_bollinger_basis(klines: list[dict], period: int = 20):
    """保留舊介面；中軌仍採普通日 K close 的 SMA。"""
    basis, _, _ = calculate_bollinger_bands(klines, period=period)
    return basis

def get_bb_signal(ha_close, basis):
    if basis is None:
        return "—"
    if ha_close > basis:
        return "✅"
    if ha_close < basis:
        return "❌"
    return "—"

def _wait_for_pionex_request_slot() -> None:
    global _PIONEX_NEXT_REQUEST_AT

    with _PIONEX_RATE_LOCK:
        now = time.monotonic()
        if now < _PIONEX_NEXT_REQUEST_AT:
            time.sleep(_PIONEX_NEXT_REQUEST_AT - now)
            now = time.monotonic()
        _PIONEX_NEXT_REQUEST_AT = now + _PIONEX_MIN_INTERVAL_SECONDS

def _set_pionex_cooldown(seconds: float) -> None:
    global _PIONEX_NEXT_REQUEST_AT

    with _PIONEX_RATE_LOCK:
        _PIONEX_NEXT_REQUEST_AT = max(
            _PIONEX_NEXT_REQUEST_AT,
            time.monotonic() + max(0.0, seconds),
        )

def fetch_klines(symbol: str, interval: str, limit: int = 150):
    url = "https://api.pionex.com/api/v1/market/klines"
    params = {
        "symbol": resolve_api_symbol(symbol),
        "interval": interval,
        "limit": limit,
    }

    last_error = None
    for attempt in range(1, 4):
        _wait_for_pionex_request_slot()
        try:
            response = requests.get(
                url,
                params=params,
                timeout=(5, 20),
            )

            if response.status_code == 429:
                retry_after = response.headers.get("Retry-After")
                try:
                    cooldown = max(
                        _PIONEX_429_COOLDOWN_SECONDS,
                        float(retry_after) if retry_after else 0.0,
                    )
                except (TypeError, ValueError):
                    cooldown = _PIONEX_429_COOLDOWN_SECONDS

                _set_pionex_cooldown(cooldown)
                last_error = requests.HTTPError(
                    f"429 Too Many Requests; cooldown {cooldown:.0f}s",
                    response=response,
                )
                continue

            response.raise_for_status()
            rows = response.json()["data"]["klines"]
            data = [
                {
                    "time": int(row["time"]) + 8 * 3600 * 1000,
                    "open": float(row["open"]),
                    "high": float(row["high"]),
                    "low": float(row["low"]),
                    "close": float(row["close"]),
                    "volume": float(row["volume"]),
                }
                for row in rows
            ]
            data.sort(key=lambda item: item["time"])
            return data

        except requests.RequestException as exc:
            last_error = exc
            if attempt < 3:
                time.sleep(1.5 * attempt)

    if last_error is not None:
        raise last_error
    raise RuntimeError(f"Unable to fetch {symbol} {interval} klines")

def analyze_symbol(symbol: str):
    try:
        daily_raw = fetch_klines(symbol, "1D")
        four_h_raw = fetch_klines(symbol, "4H")

        if len(daily_raw) < MIN_DAILY_BARS or len(four_h_raw) < MIN_4H_BARS:
            return None, f"{symbol}: 尚無可用K線"

        daily_ha = calculate_heikin_ashi(daily_raw)
        four_h_ha = calculate_heikin_ashi(four_h_raw)
        basis, upper_band, lower_band = calculate_bollinger_bands(
            daily_raw,
            period=20,
            std_multiplier=2.0,
        )
        price = four_h_raw[-1]["close"]

        previous_daily = get_ha_color(daily_ha[-2]) if len(daily_ha) >= 2 else "⚫"
        current_daily = get_ha_color(daily_ha[-1])
        four_h_colors = [get_ha_color(item) for item in four_h_ha[-6:]]
        current_four_h = four_h_colors[-1]
        previous_four_h = four_h_colors[-2] if len(four_h_colors) >= 2 else "⚫"
        previous_four_h_1 = four_h_colors[-3] if len(four_h_colors) >= 3 else "⚫"
        previous_four_h_2 = four_h_colors[-4] if len(four_h_colors) >= 4 else "⚫"
        previous_four_h_3 = four_h_colors[-5] if len(four_h_colors) >= 5 else "⚫"

        bb_pct = ((price - basis) / basis * 100.0) if basis else None
        dot = "🟢" if bb_pct is not None and bb_pct > 0 else "🔴" if bb_pct is not None and bb_pct < 0 else "⚫"
        abs_dev = abs(bb_pct) if bb_pct is not None else 0.0

        # 顯示／結構視窗改為 30 日，但技術指標仍維持 BB20。
        # 直接用 rolling 向量化整段 BB20，避免 30 日視窗逐日重複切 20 根重算。
        last_30 = daily_ha[-STRUCTURE_WINDOW_DAYS:]
        raw_last_30 = daily_raw[-STRUCTURE_WINDOW_DAYS:]
        raw_closes = pd.Series([item["close"] for item in daily_raw], dtype=float)
        rolling_basis = raw_closes.rolling(BB_PERIOD, min_periods=BB_PERIOD).mean()
        rolling_std = raw_closes.rolling(BB_PERIOD, min_periods=BB_PERIOD).std(ddof=0)
        rolling_upper = rolling_basis + 2.0 * rolling_std
        rolling_lower = rolling_basis - 2.0 * rolling_std

        start_index = len(raw_closes) - len(last_30)
        band_basis_series = rolling_basis.iloc[start_index:].to_numpy(dtype=float).tolist()
        band_upper_series = rolling_upper.iloc[start_index:].to_numpy(dtype=float).tolist()
        band_lower_series = rolling_lower.iloc[start_index:].to_numpy(dtype=float).tolist()
        percentages = [
            ((candle["close"] - sma) / sma * 100.0)
            if sma is not None and np.isfinite(sma) and sma > 0
            else None
            for candle, sma in zip(last_30, band_basis_series)
        ]

        threshold = compute_threshold_from_daily_data(
            daily_raw_candle=daily_raw[-1],
            daily_ha_open=daily_ha[-1]["open"],
            ordinary_close=price,
            precision=8,
        )
        threshold_display = (
            f"{threshold['state_emoji']} "
            f"{format_price(threshold['price'])}｜"
            f"{threshold['signed_gap_pct']:+.2f}%"
            if threshold.get("price") is not None
            else "—"
        )

        result = {
            "幣種": symbol,
            "_api_symbol": resolve_api_symbol(symbol),
            "現價": format_price(price),
            "差%": f"{dot} {bb_pct:+.2f}%" if bb_pct is not None else "⚫ —",
            "均K界": threshold_display,
            "BB日上軌": format_price(upper_band),
            "BB日中軌": format_price(basis),
            "BB日下軌": format_price(lower_band),
            "BB中軌": get_bb_signal(daily_ha[-1]["close"], basis),
            "1D前": previous_daily,
            "1D當": current_daily,
            "4H前'''": previous_four_h_3,
            "4H前''": previous_four_h_2,
            "4H前'": previous_four_h_1,
            "4H前": previous_four_h,
            "4H當": current_four_h,
            "距離中軌%": f"{abs_dev:.2f}%",
            "_price": price,
            "_bb1d": basis or 0.0,
            "_bb_upper_1d": upper_band or 0.0,
            "_bb_lower_1d": lower_band or 0.0,
            "_bb_pct": bb_pct,
            "_bb_ready": basis is not None,
            "_bb_valid_points": sum(1 for value in band_basis_series if value is not None and np.isfinite(value)),
            "_daily_bar_count": len(daily_raw),
            "_four_h_bar_count": len(four_h_raw),
            "_abs_dev": abs_dev,
            "_ha_pct_series": percentages,
            "_ha_curr_pct": percentages[-1] if percentages else None,
            "_bb_basis_series": band_basis_series,
            "_bb_upper_series": band_upper_series,
            "_bb_lower_series": band_lower_series,
            "_ha_opens_last30": [item["open"] for item in last_30],
            "_ha_closes_last30": [item["close"] for item in last_30],
            "_ha_times_last30": [item["time"] for item in last_30],
            # 結構世代判斷同時保留真實日K，讓 1.236 失效規則可看見 wick/body 的真實跌破。
            "_raw_opens_last30": [item["open"] for item in raw_last_30],
            "_raw_highs_last30": [item["high"] for item in raw_last_30],
            "_raw_lows_last30": [item["low"] for item in raw_last_30],
            "_raw_closes_last30": [item["close"] for item in raw_last_30],
            "_ha4h_color_series": four_h_colors,
            "_ha_threshold": threshold,
        }

        # Level 5：使用與 HistoricalTraining 完全同義的 state_age_bars。
        # 這不是 trigger_age；它是目前 S-state 連續維持了幾根 4H 決策 K。
        try:
            age_info = compute_live_state_age(symbol, daily_raw, four_h_raw)
        except Exception as age_exc:
            age_info = {"available": False, "reason": f"{type(age_exc).__name__}:{age_exc}"}
        if age_info.get("available"):
            result["_state_age_bars"] = int(age_info.get("state_age_bars", 1) or 1)
            result["_state_age_bin"] = str(age_info.get("state_age_bin") or "1")
            result["_state_age_state"] = str(age_info.get("state") or "OTHER")
            result["_state_age_trace"] = list(age_info.get("trace_newest_first") or [])
        else:
            result["_state_age_bars"] = None
            result["_state_age_bin"] = None
            result["_state_age_state"] = None
            result["_state_age_trace"] = []
        return result, None

    except Exception as exc:
        return None, f"{symbol}: {type(exc).__name__} - {exc}"

def preview_ladder_history(record: dict[str, Any]) -> list[dict[str, Any]]:
    output = []
    for index, (percentage, open_price, close_price, timestamp) in enumerate(
        zip(
            record["_ha_pct_series"],
            record["_ha_opens_last30"],
            record["_ha_closes_last30"],
            record["_ha_times_last30"],
        )
    ):
        color = (
            "yellow"
            if close_price > open_price
            else "purple"
            if close_price < open_price
            else "flat"
        )
        output.append(
            {
                "index": index,
                "pct_vs_midline": percentage,
                "color": color,
                "date": datetime.fromtimestamp(
                    timestamp / 1000,
                    tz=timezone.utc,
                ).strftime("%m/%d"),
            }
        )
    return output

def _bb_ready_scoring_record(record: dict[str, Any]) -> dict[str, Any]:
    """
    給 S-state 引擎的幾何只保留 BB20 已真正存在的日期。
    主頁 chart 仍保留全部可用日K，因此新上架標的會先長價格階梯，
    等 BB20 自然形成後才開始累積可判斷的 S0/S0.5/S1/S2/S3 幾何。
    """
    mids = list(record.get("_bb_basis_series") or [])
    uppers = list(record.get("_bb_upper_series") or [])
    lowers = list(record.get("_bb_lower_series") or [])

    valid_indexes = []
    for index in range(min(len(mids), len(uppers), len(lowers))):
        try:
            values = (float(mids[index]), float(uppers[index]), float(lowers[index]))
        except (TypeError, ValueError):
            continue
        if all(np.isfinite(value) for value in values):
            valid_indexes.append(index)

    scoring = dict(record)
    aligned_keys = (
        "_ha_pct_series",
        "_bb_basis_series",
        "_bb_upper_series",
        "_bb_lower_series",
        "_ha_opens_last30",
        "_ha_closes_last30",
        "_ha_times_last30",
        "_raw_opens_last30",
        "_raw_highs_last30",
        "_raw_lows_last30",
        "_raw_closes_last30",
    )
    for key in aligned_keys:
        values = list(record.get(key) or [])
        scoring[key] = [values[index] for index in valid_indexes if index < len(values)]

    scoring["_bb_valid_points"] = len(valid_indexes)
    return scoring


def annotate(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    output = []
    for base in items:
        record = dict(base)
        scoring_record = _bb_ready_scoring_record(record)
        scoring_history = preview_ladder_history(scoring_record)
        if scoring_history:
            flags = build_pattern_flags(
                scoring_record,
                scoring_history,
            )
            pattern_hint = classify_pattern(flags)
            machine_score = score_hint(
                flags,
                {"abs_dev": record["_abs_dev"]},
            )
        else:
            # 上架初期 BB20 尚未形成：保留在主頁，但不製造假的中軌/型態訊號。
            flags = {
                "analysis_ready": False,
                "latest_color": "unknown",
                "latest_color_emoji": "—",
                "latest_pct_vs_midline": None,
                "ladder_trigger_state": "red",
                "ladder_trigger_label": "等待BB20",
                "ladder_trigger_light": "red",
                "ladder_trigger_active": False,
                "yellow_run_length": 0,
            }
            pattern_hint = "BB20尚未形成"
            machine_score = 0
        record["_pattern_flags"] = flags
        record["_pattern_type_hint"] = pattern_hint
        record["_machine_score_hint_0_100"] = machine_score
        record["_ladder_trigger_state"] = flags.get(
            "ladder_trigger_state",
            "red",
        )
        record["_ladder_trigger_label"] = flags.get(
            "ladder_trigger_label",
            "Reset",
        )
        # 新版主判斷：只評估做多「機會位置」，不把趨勢強弱等同進場價值。
        record["_long_opportunity"] = build_long_opportunity(
            scoring_record,
            scoring_history,
        )
        opp = record["_long_opportunity"]
        live_state = str(opp.get("market_state_id") or "OTHER")
        replay_state = str(record.get("_state_age_state") or "")
        if replay_state and replay_state != live_state:
            # 只要即時引擎與回放最後狀態不一致，就不冒用 Level 5；自動退回 Level 4。
            record["_state_age_bars"] = None
            record["_state_age_bin"] = None
        mid = opp.get("midline") or {}
        p2 = opp.get("purple2_reference") or {}
        record["_long_stars"] = int(opp.get("stars", 1) or 1)
        record["做多星級"] = opp.get("stars_text", "★☆☆☆☆")
        record["做多結構"] = opp.get("setup_name", "一般等待")
        record["狀態"] = opp.get("market_state_id", "OTHER")
        record["中軌狀態"] = f"{mid.get('symbol','?')} {mid.get('label','未知')}"
        p2_gap = p2.get("current_gap_price_pct")
        record["紫2差距"] = "—" if p2_gap is None else f"{float(p2_gap):+.2f}%"
        output.append(record)
    return output
