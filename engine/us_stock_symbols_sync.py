"""每次美股分析前同步 Pionex 最新 RWA/美股永續清單，實測 1D >= 49 根才寫入 R2。"""
from __future__ import annotations

import json
import os
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import requests

TW_TZ = timezone(timedelta(hours=8))
MIN_DAILY_BARS = 49
R2_PUBLIC_PATH = "/api/symbols/us-stock"
R2_INTERNAL_PATH = "/api/internal/symbols/us-stock"
KLINES_URL = "https://api.pionex.com/api/v1/market/klines"

# Pionex Web 版本只作為 internal market-list endpoint 的 query 參數；可由 Actions env 覆蓋。
DEFAULT_PIONEX_WEB_VERSION = "20260819.1657.89e6310"


def _web_common_query() -> dict[str, str]:
    version = os.environ.get("PIONEX_WEB_VERSION", DEFAULT_PIONEX_WEB_VERSION).strip()
    return {
        "client_id": f"pionex_web_{version}",
        "app_ver": version,
        "os": "web",
        "tz_name": "Asia/Taipei",
        "tz_offset": "28800",
        "sys_lang": "zh-TW",
        "app_lang": "zh-TW",
    }


def _headers() -> dict[str, str]:
    return {
        "Accept": "application/json",
        "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.7",
        "User-Agent": "Mozilla/5.0 SStateMarketTerminal/1.0",
    }


def _fetch_market_payload(session: requests.Session, endpoint: str) -> dict[str, Any]:
    url = f"https://www.pionex.com/apis/papi/v1/{endpoint}/"
    response = session.get(url, params=_web_common_query(), headers=_headers(), timeout=(8, 30))
    response.raise_for_status()
    payload = response.json()
    if NumberLike(payload.get("code")) not in (None, 0):
        raise RuntimeError(f"Pionex {endpoint} error: {payload.get('reason') or payload.get('message') or payload.get('code')}")
    if not isinstance(payload.get("data"), list):
        raise RuntimeError(f"Pionex {endpoint} returned invalid data")
    return payload


def NumberLike(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def parse_spot_us_tokens(payload: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """解析 spot_markets；只保留 Pionex 標記為股票/RWA token 的 USDT 現貨。"""
    output: dict[str, dict[str, Any]] = {}
    for row in payload.get("data") or []:
        if not isinstance(row, dict):
            continue
        if row.get("active") is False:
            continue
        if str(row.get("quote") or "").upper() != "USDT":
            continue
        tags = {str(tag) for tag in (row.get("tags") or [])}
        if not (
            "us_token_spot" in tags
            or "sys_spot_us_token_spot" in tags
            or "us_stocks" in tags
        ):
            continue
        base = str(row.get("base") or row.get("base_id") or "").strip().upper()
        if not base:
            continue
        output[base] = {
            "spot_symbol": str(row.get("id") or f"{base}_USDT").upper(),
            "spot_tags": sorted(tags),
            "new_listing": "new_listing" in tags,
            "is_etf": "us_stock_sec_etf" in tags or "sys_spot_us_stock_sec_etf" in tags,
        }
    return output


def parse_future_us_token_contracts(payload: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """解析 future_markets；us_token_contract 是可供本引擎分析的 RWA 永續來源。"""
    output: dict[str, dict[str, Any]] = {}
    for row in payload.get("data") or []:
        if not isinstance(row, dict):
            continue
        tags = {str(tag) for tag in (row.get("tags") or [])}
        if "us_token_contract" not in tags:
            continue
        status = str(row.get("status") or row.get("contract_status") or "TRADING").upper()
        if status not in {"", "TRADING"}:
            continue
        api_symbol = str(
            row.get("display_symbol")
            or row.get("symbol")
            or row.get("id")
            or ""
        ).strip().upper().replace("/", "_")
        if not api_symbol.endswith("_USDT_PERP"):
            continue
        base = api_symbol[: -len("_USDT_PERP")]
        if not base or base.startswith("USDT_"):
            continue
        output[base] = {
            "api_symbol": api_symbol,
            "contract_status": status or "TRADING",
            "future_tags": sorted(tags),
        }
    return output


def build_candidate_universe(
    spot_payload: dict[str, Any],
    future_payload: dict[str, Any],
) -> list[dict[str, Any]]:
    spot = parse_spot_us_tokens(spot_payload)
    future = parse_future_us_token_contracts(future_payload)
    if not future:
        raise RuntimeError("Pionex future_markets returned no active us_token_contract *_USDT_PERP symbols")

    # future us_token_contract 是真正可分析的 PERP 清單；spot 只補上 ETF/new_listing 等 metadata。
    candidates: list[dict[str, Any]] = []
    for base in sorted(future):
        info = {"symbol": base, **future[base]}
        info.update(spot.get(base) or {})
        info["spot_confirmed"] = base in spot
        candidates.append(info)
    return candidates


def _fetch_daily_bar_count(session: requests.Session, api_symbol: str) -> int:
    delay = max(0.0, float(os.environ.get("PIONEX_SYMBOL_SYNC_DELAY", "0.60") or 0.60))
    last_error: Exception | None = None
    for attempt in range(1, 4):
        try:
            response = session.get(
                KLINES_URL,
                params={"symbol": api_symbol, "interval": "1D", "limit": MIN_DAILY_BARS},
                headers={"Accept": "application/json"},
                timeout=(6, 25),
            )
            if response.status_code == 429:
                retry_after = response.headers.get("Retry-After")
                try:
                    wait = max(5.0, float(retry_after) if retry_after else 0.0)
                except (TypeError, ValueError):
                    wait = 5.0
                time.sleep(wait)
                last_error = RuntimeError(f"429 Too Many Requests ({api_symbol})")
                continue
            response.raise_for_status()
            payload = response.json()
            rows = (payload.get("data") or {}).get("klines") or []
            if not isinstance(rows, list):
                raise RuntimeError(f"invalid kline payload for {api_symbol}")
            return len(rows)
        except Exception as exc:  # keep previous R2 list safe on transient upstream errors
            last_error = exc
            if attempt < 3:
                time.sleep(1.5 * attempt)
        finally:
            if delay:
                time.sleep(delay)
    if last_error:
        raise last_error
    raise RuntimeError(f"unable to check daily bars for {api_symbol}")


def _load_previous_r2(session: requests.Session, worker: str) -> dict[str, Any]:
    if not worker:
        return {}
    try:
        response = session.get(f"{worker}{R2_PUBLIC_PATH}", headers={"Accept": "application/json"}, timeout=(5, 15))
        if response.status_code == 404:
            return {}
        response.raise_for_status()
        payload = response.json()
        return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}


def qualify_candidates(
    candidates: list[dict[str, Any]],
    *,
    session: requests.Session,
    previous_symbol_map: dict[str, str] | None = None,
) -> tuple[dict[str, str], list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    previous_symbol_map = previous_symbol_map or {}
    qualified: dict[str, str] = {}
    passed: list[dict[str, Any]] = []
    rejected: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []

    for candidate in candidates:
        symbol = str(candidate["symbol"]).upper()
        api_symbol = str(candidate["api_symbol"]).upper()
        try:
            bars = _fetch_daily_bar_count(session, api_symbol)
            if bars >= MIN_DAILY_BARS:
                qualified[symbol] = api_symbol
                passed.append({**candidate, "daily_bars_checked": bars, "qualified": True})
            else:
                rejected.append({
                    **candidate,
                    "daily_bars_checked": bars,
                    "qualified": False,
                    "reason": f"daily_bars<{MIN_DAILY_BARS}",
                })
        except Exception as exc:
            error = {
                **candidate,
                "qualified": False,
                "reason": "kline_check_error",
                "error": f"{type(exc).__name__}: {exc}",
            }
            errors.append(error)
            # 已經在上一版 R2 通過 49 根，而且目前 future market 仍為 TRADING：
            # 單次 K 線網路錯誤時保留，避免暫時性 API 失敗讓主頁標的誤消失。
            previous_api = str(previous_symbol_map.get(symbol) or "").upper()
            if previous_api == api_symbol:
                qualified[symbol] = api_symbol
                passed.append({**error, "qualified": True, "preserved_from_previous_r2": True})

    return qualified, passed, rejected, errors


def _upload_to_r2(session: requests.Session, worker: str, token: str, payload: dict[str, Any]) -> dict[str, Any]:
    if not worker or not token:
        raise RuntimeError("WORKER_BASE_URL / WORKER_CALLBACK_TOKEN missing; cannot update R2 symbol list")
    response = session.put(
        f"{worker}{R2_INTERNAL_PATH}",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        data=json.dumps(payload, ensure_ascii=False),
        timeout=(8, 30),
    )
    response.raise_for_status()
    result = response.json()
    return result if isinstance(result, dict) else {"ok": True}


def sync_us_stock_symbols_to_r2(*, output_path: str | Path | None = None) -> dict[str, Any]:
    """抓最新市場清單 -> 實測每個 PERP 的 1D 49 根 -> 合格清單寫入 R2。"""
    worker = os.environ.get("WORKER_BASE_URL", "").rstrip("/")
    token = os.environ.get("WORKER_CALLBACK_TOKEN", "")
    session = requests.Session()

    previous = _load_previous_r2(session, worker)
    previous_symbol_map = previous.get("symbol_map") if isinstance(previous.get("symbol_map"), dict) else {}

    spot_payload = _fetch_market_payload(session, "spot_markets")
    future_payload = _fetch_market_payload(session, "future_markets")
    candidates = build_candidate_universe(spot_payload, future_payload)

    symbol_map, passed, rejected, errors = qualify_candidates(
        candidates,
        session=session,
        previous_symbol_map={str(k).upper(): str(v).upper() for k, v in previous_symbol_map.items()},
    )

    # 不讓大面積 API 錯誤覆蓋掉上一版正常 R2 清單。
    error_limit = max(5, int(len(candidates) * 0.20))
    if len(errors) > error_limit:
        raise RuntimeError(
            f"Pionex K-line check errors too many: {len(errors)}/{len(candidates)}; previous R2 preserved"
        )
    if not symbol_map:
        raise RuntimeError("No US-stock/RWA symbols passed the real 49-daily-bar gate; previous R2 preserved")

    now = datetime.now(TW_TZ)
    payload = {
        "schema_version": "pionex-us-stock-symbols-v2-real-49-bars",
        "generated_at": now.isoformat(),
        "source": "Pionex spot_markets + future_markets + /api/v1/market/klines",
        "min_daily_bars": MIN_DAILY_BARS,
        "candidate_count": len(candidates),
        "eligible_count": len(symbol_map),
        "rejected_count": len(rejected),
        "check_error_count": len(errors),
        "symbols": sorted(symbol_map),
        "symbol_map": {key: symbol_map[key] for key in sorted(symbol_map)},
        "eligible": sorted(passed, key=lambda item: str(item.get("symbol"))),
        "rejected": sorted(rejected, key=lambda item: str(item.get("symbol"))),
        "check_errors": sorted(errors, key=lambda item: str(item.get("symbol"))),
    }

    if output_path:
        target = Path(output_path)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    upload = _upload_to_r2(session, worker, token, payload)
    payload["r2_upload"] = upload
    return payload
