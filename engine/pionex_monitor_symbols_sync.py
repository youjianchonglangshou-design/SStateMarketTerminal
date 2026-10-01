from __future__ import annotations

import json
import os
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import requests

COMMON_API = "https://api.pionex.com/api/v1/common/symbols"
KLINES_API = "https://api.pionex.com/api/v1/market/klines"
INTERNAL_SYMBOLS_PATH = "/api/internal/monitor/symbols"
INTERNAL_KLINES_PATH = "/api/internal/monitor/klines/batch"
TW = timezone(timedelta(hours=8))

KLINE_LIMIT = int(os.environ.get("MONITOR_KLINE_LIMIT", "180"))
REQUEST_INTERVAL = float(os.environ.get("PIONEX_REQUEST_INTERVAL", "0.55"))
COOLDOWN_429 = int(os.environ.get("PIONEX_429_COOLDOWN", "70"))
BATCH_SIZE = int(os.environ.get("MONITOR_KLINE_BATCH", "20"))
MAX_KLINE_RETRY = 4


def worker_config() -> tuple[str, str]:
    worker = os.environ.get("WORKER_BASE_URL", "").rstrip("/")
    token = os.environ.get("WORKER_CALLBACK_TOKEN", "")
    if not worker or not token:
        raise RuntimeError("WORKER_BASE_URL / WORKER_CALLBACK_TOKEN missing")
    return worker, token


def fetch_symbols(session: requests.Session, market_type: str) -> list[dict[str, Any]]:
    params: dict[str, str] = {"type": market_type}
    if market_type == "PERP":
        params["status"] = "TRADING"
    last_error: Exception | None = None
    for attempt in range(1, 5):
        try:
            r = session.get(COMMON_API, params=params, timeout=(8, 30))
            if r.status_code == 429:
                wait = max(COOLDOWN_429, int(float(r.headers.get("Retry-After") or 0))) + (attempt - 1) * 10
                print(f"Pionex {market_type} symbols 429; wait {wait}s", flush=True)
                time.sleep(wait)
                continue
            r.raise_for_status()
            rows = (r.json().get("data") or {}).get("symbols") or []
            if not isinstance(rows, list):
                raise RuntimeError(f"Pionex {market_type} invalid symbols payload")
            return rows
        except Exception as exc:
            last_error = exc
            if attempt < 4:
                time.sleep(4 * attempt)
    raise RuntimeError(f"Pionex {market_type} fetch failed: {last_error}")


def normalize(perp_rows: list[dict[str, Any]], spot_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: dict[tuple[str, str], dict[str, Any]] = {}
    for row in perp_rows:
        if str(row.get("status") or "").upper() != "TRADING" or str(row.get("quoteCurrency") or "").upper() != "USDT":
            continue
        symbol = str(row.get("symbol") or "").strip().upper()
        if not symbol.endswith("_USDT_PERP"):
            continue
        base = str(row.get("baseCurrency") or symbol[:-10]).strip().upper()
        out[("PERP", symbol)] = {"symbol": symbol, "type": "PERP", "base": base, "quote": "USDT", "status": "TRADING"}
    for row in spot_rows:
        if row.get("enable") is False or str(row.get("quoteCurrency") or "").upper() != "USDT":
            continue
        symbol = str(row.get("symbol") or "").strip().upper()
        if not symbol.endswith("_USDT") or symbol.endswith("_USDT_PERP"):
            continue
        base = str(row.get("baseCurrency") or symbol[:-5]).strip().upper()
        out[("SPOT", symbol)] = {"symbol": symbol, "type": "SPOT", "base": base, "quote": "USDT", "enable": True}
    return sorted(out.values(), key=lambda x: (x["base"], x["type"], x["symbol"]))


def upload_json(session: requests.Session, path: str, payload: dict[str, Any]) -> dict[str, Any]:
    worker, token = worker_config()
    last_error: Exception | None = None
    for attempt in range(1, 4):
        try:
            r = session.put(
                f"{worker}{path}",
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json", "Accept": "application/json"},
                data=json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
                timeout=(10, 90),
            )
            r.raise_for_status()
            return r.json()
        except Exception as exc:
            last_error = exc
            if attempt < 3:
                time.sleep(3 * attempt)
    raise RuntimeError(f"Worker upload failed {path}: {last_error}")


def normalize_klines(rows: Any) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    if not isinstance(rows, list):
        return out
    for row in rows:
        try:
            item = {
                "time": int(row.get("time")),
                "open": float(row.get("open")),
                "high": float(row.get("high")),
                "low": float(row.get("low")),
                "close": float(row.get("close")),
                "volume": float(row.get("volume") or 0),
            }
        except Exception:
            continue
        out.append(item)
    out.sort(key=lambda x: x["time"])
    return out


def fetch_kline(session: requests.Session, symbol: str) -> list[dict[str, Any]]:
    last_error: Exception | None = None
    for attempt in range(1, MAX_KLINE_RETRY + 1):
        started = time.monotonic()
        try:
            r = session.get(KLINES_API, params={"symbol": symbol, "interval": "1D", "limit": KLINE_LIMIT}, timeout=(8, 30))
            if r.status_code == 429:
                wait = max(COOLDOWN_429, int(float(r.headers.get("Retry-After") or 0))) + (attempt - 1) * 10
                print(f"  {symbol}: 429 -> wait {wait}s", flush=True)
                time.sleep(wait)
                continue
            r.raise_for_status()
            payload = r.json()
            rows = (payload.get("data") or {}).get("klines")
            if rows is None and isinstance(payload.get("data"), list):
                rows = payload.get("data")
            klines = normalize_klines(rows)
            if len(klines) < 30:
                raise RuntimeError(f"only {len(klines)} daily bars")
            return klines
        except Exception as exc:
            last_error = exc
            if attempt < MAX_KLINE_RETRY:
                time.sleep(2 * attempt)
        finally:
            elapsed = time.monotonic() - started
            if elapsed < REQUEST_INTERVAL:
                time.sleep(REQUEST_INTERVAL - elapsed)
    raise RuntimeError(str(last_error or "unknown kline error"))


def flush_batch(session: requests.Session, rows: list[dict[str, Any]], fetched_at: str) -> int:
    if not rows:
        return 0
    result = upload_json(session, INTERNAL_KLINES_PATH, {
        "fetched_at": fetched_at,
        "source": "GitHub Actions → Pionex 1D kline prewarm",
        "rows": rows,
    })
    stored = int(result.get("stored") or 0)
    print(f"  uploaded kline batch: {stored}/{len(rows)}", flush=True)
    return stored


def main() -> None:
    session = requests.Session()
    session.headers.update({"Accept": "application/json", "User-Agent": "Mozilla/5.0 SStateMarketTerminal-MonitorSync/0.3.02"})

    perp = fetch_symbols(session, "PERP")
    time.sleep(1.25)
    spot = fetch_symbols(session, "SPOT")
    symbols = normalize(perp, spot)
    if not symbols:
        raise RuntimeError("No current Pionex USDT symbols found; previous R2 preserved")

    now = datetime.now(TW).isoformat()
    universe_payload = {
        "schema_version": "pionex-monitor-universe-v3",
        "fetched_at": now,
        "source": "Pionex public common/symbols via GitHub Actions",
        "symbols": symbols,
        "counts": {
            "total": len(symbols),
            "PERP": sum(x["type"] == "PERP" for x in symbols),
            "SPOT": sum(x["type"] == "SPOT" for x in symbols),
        },
    }
    Path("output").mkdir(exist_ok=True)
    Path("output/pionex_monitor_universe.json").write_text(json.dumps(universe_payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"universe_upload": upload_json(session, INTERNAL_SYMBOLS_PATH, universe_payload), **universe_payload["counts"]}, ensure_ascii=False), flush=True)

    # Pre-warm every currently tradable USDT pair into R2. Browser warm-up then reads R2 only,
    # so Cloudflare egress never needs to hit Pionex for normal monitor use.
    batch: list[dict[str, Any]] = []
    success = 0
    failures: list[dict[str, str]] = []
    total = len(symbols)
    for idx, item in enumerate(symbols, 1):
        symbol = item["symbol"]
        try:
            klines = fetch_kline(session, symbol)
            batch.append({"symbol": symbol, "interval": "1D", "fetched_at": now, "klines": klines})
        except Exception as exc:
            failures.append({"symbol": symbol, "error": str(exc)[:180]})
            print(f"  SKIP {symbol}: {exc}", flush=True)
        if len(batch) >= BATCH_SIZE:
            success += flush_batch(session, batch, now)
            batch = []
        if idx % 25 == 0 or idx == total:
            print(f"PROGRESS {idx}/{total} cached={success + len(batch)} failed={len(failures)}", flush=True)
    success += flush_batch(session, batch, now)

    report = {
        "generated_at": now,
        "universe": universe_payload["counts"],
        "kline_cached": success,
        "kline_failed": len(failures),
        "failures": failures,
    }
    Path("output/pionex_monitor_kline_sync_report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False), flush=True)

    # Do not fail the whole job for isolated bad/new symbols; a partial cache is still useful.
    if success < max(1, int(total * 0.80)):
        raise RuntimeError(f"Kline prewarm coverage too low: {success}/{total}")


if __name__ == "__main__":
    main()
