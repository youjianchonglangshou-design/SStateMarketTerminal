from __future__ import annotations

import argparse
import json
import os
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pandas as pd
import requests

from analysis_core import analyze_symbol, annotate
from get import build_snapshot_payload
from github_sync import serialize_snapshot_json
from symbols_config import get_rwa_symbol_source, get_symbols_config
from us_stock_symbols_sync import sync_us_stock_symbols_to_r2

TW_TZ = timezone(timedelta(hours=8))

MARKET_MAP = {
    "crypto": {
        "selection": "考試幣",
        "filename": "snapshot_ai.json",
    },
    "us-stock": {
        "selection": "美股代幣",
        "filename": "snapshot_us_stock_ai.json",
    },
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Headless S-state full analysis")
    parser.add_argument("--market", choices=sorted(MARKET_MAP), required=True)
    parser.add_argument("--output-dir", default="../output")
    parser.add_argument("--workers", type=int, default=2)
    parser.add_argument("--progress-file", default="")
    return parser.parse_args()


def write_progress(path: str, payload: dict) -> None:
    if path:
        target = Path(path)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    # GitHub Actions -> Cloudflare Worker -> R2 status. Failure here must never
    # stop the market engine itself.
    worker = os.environ.get("WORKER_BASE_URL", "").rstrip("/")
    token = os.environ.get("WORKER_CALLBACK_TOKEN", "")
    run_id = os.environ.get("RUN_ID", "")
    if worker and token and run_id:
        try:
            requests.post(
                f"{worker}/api/internal/status",
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                json={"run_id": run_id, **payload},
                timeout=8,
            )
        except Exception:
            pass


def main() -> int:
    args = parse_args()
    config = MARKET_MAP[args.market]
    selection = config["selection"]
    filename = config["filename"]

    output_dir = (Path(__file__).resolve().parent / args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    out_path = output_dir / filename

    started_at = datetime.now(TW_TZ).isoformat()
    symbol_sync = {"status": "NOT_APPLICABLE"}

    if args.market == "us-stock":
        write_progress(args.progress_file, {
            "status": "RUNNING",
            "market": args.market,
            "phase": "SYNC_US_STOCK_SYMBOLS",
            "message": "Pionex 最新 active 美股/RWA 清單 → R2（不設日K門檻）",
            "completed": 0,
            "total": 0,
            "percent": 0,
            "started_at_taiwan": started_at,
        })
        try:
            synced = sync_us_stock_symbols_to_r2(
                output_path=output_dir / "us_stock_symbols.json",
            )
            symbol_sync = {
                "status": "SUCCESS",
                "generated_at": synced.get("generated_at"),
                "candidate_count": synced.get("candidate_count"),
                "active_count": synced.get("active_count", synced.get("eligible_count")),
                "eligible_count": synced.get("eligible_count"),
                "rejected_count": synced.get("rejected_count"),
                "check_error_count": synced.get("check_error_count"),
            }
            print(
                "US-stock symbol sync -> "
                f"active={synced.get('active_count', synced.get('eligible_count'))} / candidates={synced.get('candidate_count')}"
            )
        except Exception as exc:
            # 不破壞 working baseline：同步失敗時保留上一版 R2；若 R2 也不可用，
            # symbols_config 會退回 repository fallback；不會因同步暫時失敗清空主頁。
            symbol_sync = {
                "status": "FAILED_USING_PREVIOUS_R2_OR_FALLBACK",
                "error": f"{type(exc).__name__}: {exc}",
            }
            print(f"WARNING: US-stock symbol sync failed: {symbol_sync['error']}", file=sys.stderr)

    groups = get_symbols_config(
        force_reload_rwa=args.market == "us-stock",
        load_remote_rwa=args.market == "us-stock",
    )
    symbols = list(groups.get(selection) or [])
    if not symbols:
        raise RuntimeError(f"No symbols configured for {selection}")

    if args.market == "us-stock":
        symbol_sync["config_source"] = get_rwa_symbol_source()
        symbol_sync["configured_symbols"] = len(symbols)

    write_progress(args.progress_file, {
        "status": "RUNNING",
        "market": args.market,
        "completed": 0,
        "total": len(symbols),
        "percent": 0,
        "started_at_taiwan": started_at,
    })

    results = []
    errors = []
    max_workers = max(1, min(int(args.workers), 2, len(symbols)))
    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        futures = {pool.submit(analyze_symbol, symbol): symbol for symbol in symbols}
        completed = 0
        for future in as_completed(futures):
            symbol = futures[future]
            try:
                result, error = future.result()
            except Exception as exc:
                result, error = None, f"{symbol}: {type(exc).__name__} - {exc}"
            completed += 1
            if result:
                results.append(result)
            if error:
                errors.append(error)
            write_progress(args.progress_file, {
                "status": "RUNNING",
                "market": args.market,
                "current_symbol": symbol,
                "completed": completed,
                "total": len(symbols),
                "percent": int(completed / len(symbols) * 100),
                "errors": len(errors),
                "started_at_taiwan": started_at,
                "updated_at_taiwan": datetime.now(TW_TZ).isoformat(),
            })

    if not results:
        raise RuntimeError("No market records were produced. " + " | ".join(errors[:8]))

    annotated = annotate(results)
    generated_at = datetime.now(TW_TZ).isoformat()
    snapshot = build_snapshot_payload(
        pd.DataFrame(),
        annotated,
        selection=selection,
        sort_option="完整快照｜不受UI篩選影響",
        title="SStateMarketTerminal",
        generated_at=generated_at,
        github_path=filename,
    )
    snapshot.setdefault("batch", {})["headless_terminal"] = {
        "app": "SStateMarketTerminal",
        "market": args.market,
        "runtime": "github-actions-python",
        "streamlit": False,
        "errors": errors,
        "symbol_sync": symbol_sync,
    }

    out_path.write_text(serialize_snapshot_json(snapshot), encoding="utf-8")
    write_progress(args.progress_file, {
        "status": "SUCCESS",
        "market": args.market,
        "completed": len(symbols),
        "total": len(symbols),
        "percent": 100,
        "records": len(snapshot.get("records") or []),
        "errors": len(errors),
        "output": str(out_path),
        "started_at_taiwan": started_at,
        "finished_at_taiwan": datetime.now(TW_TZ).isoformat(),
    })
    print(f"Wrote {out_path} | records={len(snapshot.get('records') or [])} | errors={len(errors)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
