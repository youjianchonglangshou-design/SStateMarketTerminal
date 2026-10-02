from __future__ import annotations

import json
import os
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import requests

KLINES_API = "https://api.pionex.com/api/v1/market/klines"
INTERNAL_KLINES_PATH = "/api/internal/monitor/klines/batch"
TW = timezone(timedelta(hours=8))
LIMIT = int(os.environ.get("MONITOR_KLINE_LIMIT", "180"))
INTERVAL = float(os.environ.get("PIONEX_REQUEST_INTERVAL", "1.0"))
COOLDOWN = int(os.environ.get("PIONEX_429_COOLDOWN", "45"))


def cfg() -> tuple[str, str]:
    worker = os.environ.get("WORKER_BASE_URL", "").rstrip("/")
    token = os.environ.get("WORKER_CALLBACK_TOKEN", "")
    if not worker or not token:
        raise RuntimeError("WORKER_BASE_URL / WORKER_CALLBACK_TOKEN missing")
    return worker, token


def normalize(rows: Any) -> list[dict[str, Any]]:
    out = []
    for r in rows if isinstance(rows, list) else []:
        try:
            out.append({"time": int(r["time"]), "open": float(r["open"]), "high": float(r["high"]),
                        "low": float(r["low"]), "close": float(r["close"]), "volume": float(r.get("volume") or 0)})
        except Exception:
            pass
    out.sort(key=lambda x: x["time"])
    return out


def fetch_one(session: requests.Session, symbol: str) -> list[dict[str, Any]]:
    for attempt in range(3):
        started = time.monotonic()
        r = session.get(KLINES_API, params={"symbol": symbol, "interval": "1D", "limit": LIMIT}, timeout=(8, 30))
        if r.status_code == 429:
            wait = COOLDOWN + attempt * 15
            print(f"{symbol}: 429, wait {wait}s", flush=True)
            time.sleep(wait)
            continue
        r.raise_for_status()
        rows = normalize((r.json().get("data") or {}).get("klines") or [])
        if rows:
            return rows
        raise RuntimeError("no daily bars")
        elapsed = time.monotonic() - started
        if elapsed < INTERVAL:
            time.sleep(INTERVAL - elapsed)
    raise RuntimeError("rate limited after retries")


def main() -> None:
    worker, token = cfg()
    s = requests.Session()
    s.headers.update({"Accept": "application/json", "User-Agent": "Mozilla/5.0 SStateMarketTerminal-WatchlistRefresh/0.3.04"})
    wl = s.get(f"{worker}/api/monitor/watchlist", timeout=(8, 30))
    wl.raise_for_status()
    symbols = []
    for row in wl.json().get("items") or []:
        sym = str(row.get("symbol") or "").strip().upper()
        if sym and sym not in symbols:
            symbols.append(sym)
    now = datetime.now(TW).isoformat()
    rows, failed = [], []
    for i, sym in enumerate(symbols, 1):
        try:
            klines = fetch_one(s, sym)
            rows.append({"symbol": sym, "interval": "1D", "fetched_at": now, "source": "GitHub hourly watchlist refresh", "klines": klines})
        except Exception as e:
            failed.append({"symbol": sym, "error": str(e)[:160]})
        time.sleep(INTERVAL)
        if len(rows) >= 20 or (i == len(symbols) and rows):
            r = s.put(f"{worker}{INTERNAL_KLINES_PATH}", headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                      data=json.dumps({"fetched_at": now, "source": "GitHub hourly watchlist refresh", "rows": rows}, separators=(",", ":")), timeout=(10, 90))
            r.raise_for_status()
            print(f"uploaded {len(rows)} watchlist klines", flush=True)
            rows = []
    Path("output").mkdir(exist_ok=True)
    report = {"generated_at": now, "watchlist": len(symbols), "failed": failed}
    Path("output/pionex_monitor_watchlist_refresh.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
