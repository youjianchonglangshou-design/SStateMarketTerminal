from __future__ import annotations

import json
import os
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import requests

API = "https://api.pionex.com/api/v1/common/symbols"
INTERNAL_PATH = "/api/internal/monitor/symbols"
TW = timezone(timedelta(hours=8))


def fetch_symbols(session: requests.Session, market_type: str) -> list[dict[str, Any]]:
    params = {"type": market_type}
    if market_type == "PERP":
        params["status"] = "TRADING"
    last_error: Exception | None = None
    for attempt in range(1, 5):
        try:
            r = session.get(API, params=params, timeout=(8, 30))
            if r.status_code == 429:
                retry = int(float(r.headers.get("Retry-After") or 65))
                wait = max(65, retry) + (attempt - 1) * 10
                print(f"Pionex {market_type} 429; wait {wait}s")
                time.sleep(wait)
                continue
            r.raise_for_status()
            payload = r.json()
            rows = (payload.get("data") or {}).get("symbols") or []
            if not isinstance(rows, list):
                raise RuntimeError(f"Pionex {market_type} invalid symbols payload")
            return rows
        except Exception as exc:
            last_error = exc
            if attempt < 4:
                time.sleep(4 * attempt)
    raise RuntimeError(f"Pionex {market_type} fetch failed: {last_error}")


def normalize(perp_rows: list[dict[str, Any]], spot_rows: list[dict[str, Any]]) -> list[dict[str, str]]:
    out: dict[tuple[str, str], dict[str, str]] = {}
    for row in perp_rows:
        if str(row.get("status") or "").upper() != "TRADING":
            continue
        if str(row.get("quoteCurrency") or "").upper() != "USDT":
            continue
        symbol = str(row.get("symbol") or "").strip().upper()
        if not symbol.endswith("_USDT_PERP"):
            continue
        base = str(row.get("baseCurrency") or symbol[:-10]).strip().upper()
        out[("PERP", symbol)] = {"symbol": symbol, "type": "PERP", "base": base, "quote": "USDT", "status": "TRADING"}
    for row in spot_rows:
        if row.get("enable") is False:
            continue
        if str(row.get("quoteCurrency") or "").upper() != "USDT":
            continue
        symbol = str(row.get("symbol") or "").strip().upper()
        if not symbol.endswith("_USDT") or symbol.endswith("_USDT_PERP"):
            continue
        base = str(row.get("baseCurrency") or symbol[:-5]).strip().upper()
        out[("SPOT", symbol)] = {"symbol": symbol, "type": "SPOT", "base": base, "quote": "USDT", "enable": True}
    return sorted(out.values(), key=lambda x: (x["base"], x["type"], x["symbol"]))


def upload(session: requests.Session, payload: dict[str, Any]) -> dict[str, Any]:
    worker = os.environ.get("WORKER_BASE_URL", "").rstrip("/")
    token = os.environ.get("WORKER_CALLBACK_TOKEN", "")
    if not worker or not token:
        raise RuntimeError("WORKER_BASE_URL / WORKER_CALLBACK_TOKEN missing")
    r = session.put(
        f"{worker}{INTERNAL_PATH}",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json", "Accept": "application/json"},
        data=json.dumps(payload, ensure_ascii=False),
        timeout=(8, 30),
    )
    r.raise_for_status()
    return r.json()


def main() -> None:
    session = requests.Session()
    session.headers.update({"Accept": "application/json", "User-Agent": "Mozilla/5.0 SStateMarketTerminal-MonitorSync/0.3.01"})
    perp = fetch_symbols(session, "PERP")
    time.sleep(1.25)  # common/symbols has weight 5; do not burst the two full-universe calls.
    spot = fetch_symbols(session, "SPOT")
    symbols = normalize(perp, spot)
    if not symbols:
        raise RuntimeError("No current Pionex USDT symbols found; previous R2 preserved")
    payload = {
        "schema_version": "pionex-monitor-universe-v2",
        "fetched_at": datetime.now(TW).isoformat(),
        "source": "Pionex public common/symbols via GitHub Actions",
        "symbols": symbols,
        "counts": {
            "total": len(symbols),
            "PERP": sum(x["type"] == "PERP" for x in symbols),
            "SPOT": sum(x["type"] == "SPOT" for x in symbols),
        },
    }
    Path("output").mkdir(exist_ok=True)
    Path("output/pionex_monitor_universe.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    result = upload(session, payload)
    print(json.dumps({"uploaded": result, **payload["counts"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
