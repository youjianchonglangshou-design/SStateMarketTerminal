"""每日同步 Pionex 最新 active RWA/美股永續清單到 R2。

預設由 Cloudflare Worker 每天台灣時間 08:25 與 AI Learning 共用 Cron 觸發 GitHub workflow_dispatch，
GitHub Actions 只作為 Python runner 執行一次。
清單層不使用日 K 根數門檻；只要 Pionex future_markets 仍為 active/TRADING
us_token_contract，就進 R2。完整分析只讀 R2，不再重複向 Pionex 抓市場清單。
"""
from __future__ import annotations

import argparse
import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import requests

from sector_config import pionex_sector_labels_from_tags, pionex_sector_tags_from_tags

TW_TZ = timezone(timedelta(hours=8))
R2_PUBLIC_PATH = "/api/symbols/us-stock"
R2_INTERNAL_PATH = "/api/internal/symbols/us-stock"

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
    if _number_like(payload.get("code")) not in (None, 0):
        raise RuntimeError(
            f"Pionex {endpoint} error: "
            f"{payload.get('reason') or payload.get('message') or payload.get('code')}"
        )
    if not isinstance(payload.get("data"), list):
        raise RuntimeError(f"Pionex {endpoint} returned invalid data")
    return payload


def _number_like(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def parse_spot_us_tokens(payload: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """解析 spot_markets；只保留 Pionex 標記為股票/RWA token 的 USDT 現貨 metadata。"""
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
    """解析 future_markets；active us_token_contract 就是本引擎的動態美股/RWA universe。"""
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

    # future us_token_contract 是真正可分析的 PERP 清單；spot 只補 ETF/new_listing 等 metadata。
    candidates: list[dict[str, Any]] = []
    for base in sorted(future):
        info = {"symbol": base, **future[base]}
        info.update(spot.get(base) or {})
        info["spot_confirmed"] = base in spot
        raw_sector_tags = pionex_sector_tags_from_tags(
            info.get("spot_tags"),
            info.get("future_tags"),
        )
        sectors = pionex_sector_labels_from_tags(
            info.get("spot_tags"),
            info.get("future_tags"),
        )
        # 只有 Pionex 本身真的沒有 us_stock_sec_* 時才標示「其他」；
        # 不再使用人工的「美股代幣」泛稱覆蓋 Pionex 已提供的分類。
        info["sector_tags"] = raw_sector_tags
        info["sectors"] = sectors or ["其他"]
        info["sector_source"] = "pionex-tags" if sectors else "pionex-no-sector-tag"
        candidates.append(info)
    return candidates


def _upload_to_r2(
    session: requests.Session,
    worker: str,
    token: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
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
    """抓 Pionex 最新 active 美股/RWA PERP 清單，直接寫入 R2；不做日 K 根數門禁。"""
    worker = os.environ.get("WORKER_BASE_URL", "").rstrip("/")
    token = os.environ.get("WORKER_CALLBACK_TOKEN", "")
    session = requests.Session()

    # 只有兩個市場清單請求；任何一個失敗都不覆蓋上一版 R2。
    spot_payload = _fetch_market_payload(session, "spot_markets")
    future_payload = _fetch_market_payload(session, "future_markets")
    candidates = build_candidate_universe(spot_payload, future_payload)

    symbol_map = {
        str(item["symbol"]).upper(): str(item["api_symbol"]).upper()
        for item in candidates
    }
    sector_map = {
        str(item["symbol"]).upper(): list(item.get("sectors") or ["其他"])
        for item in candidates
    }
    sector_tag_map = {
        str(item["symbol"]).upper(): list(item.get("sector_tags") or [])
        for item in candidates
    }
    if not symbol_map:
        raise RuntimeError("No active Pionex US-stock/RWA contracts found; previous R2 preserved")

    now = datetime.now(TW_TZ)
    active = [
        {**item, "qualified": True, "kline_gate": "disabled"}
        for item in candidates
    ]
    payload = {
        "schema_version": "pionex-us-stock-symbols-v4-live-active-sectors",
        "generated_at": now.isoformat(),
        "source": "Pionex spot_markets + future_markets",
        "kline_gate": "disabled",
        "min_daily_bars": 0,
        "candidate_count": len(candidates),
        "active_count": len(symbol_map),
        # 舊欄位保留相容性；現在 eligible 的意思就是 active contract，不再代表滿 49 根。
        "eligible_count": len(symbol_map),
        "rejected_count": 0,
        "check_error_count": 0,
        "symbols": sorted(symbol_map),
        "symbol_map": {key: symbol_map[key] for key in sorted(symbol_map)},
        # 主頁板塊的權威來源：直接來自 Pionex us_stock_sec_* tags。
        "sector_map": {key: sector_map[key] for key in sorted(sector_map)},
        "sector_tag_map": {key: sector_tag_map[key] for key in sorted(sector_tag_map)},
        "active": sorted(active, key=lambda item: str(item.get("symbol"))),
        "eligible": sorted(active, key=lambda item: str(item.get("symbol"))),
        "rejected": [],
        "check_errors": [],
    }

    if output_path:
        target = Path(output_path)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    upload = _upload_to_r2(session, worker, token, payload)
    payload["r2_upload"] = upload
    return payload

def main() -> int:
    parser = argparse.ArgumentParser(description="Daily Pionex US-stock/RWA symbol sync -> R2")
    parser.add_argument(
        "--output",
        default="",
        help="Optional local JSON copy for workflow artifact/debugging",
    )
    args = parser.parse_args()

    result = sync_us_stock_symbols_to_r2(output_path=args.output or None)
    summary = {
        "generated_at": result.get("generated_at"),
        "candidate_count": result.get("candidate_count"),
        "active_count": result.get("active_count"),
        "sector_count": len(result.get("sector_map") or {}),
        "r2_upload": result.get("r2_upload"),
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

