"""Daily US sector ETF-flow collector for the HUD compass.

Source: ETF Central sector pages.  The raw absolute 1D flow is normalized by
segment AuM so large sectors do not win simply because they are large.

FLOW STRENGTH is intentionally learned only after 20 *prior distinct trading
sessions* for that sector:

    z = (today_flow_pct - mean(previous_20_flow_pct)) / stdev(previous_20_flow_pct)
    strength = clamp(50 + 20*z, 0, 100)

Repeated weekend/holiday runs replace the same data_as_of date instead of
inflating the sample count.
"""

from __future__ import annotations

import argparse
import html
import json
import math
import re
import statistics
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
from pathlib import Path
from typing import Any

import requests

TW = timezone(timedelta(hours=8))
BASE = "https://www.etfcentral.com/segments/"
MIN_HISTORY = 20
HISTORY_KEEP = 90

SECTORS: list[dict[str, str]] = [
    {"id": "TECH", "label": "科技", "name": "Information Technology", "slug": "stocks-us-information-technology-sector"},
    {"id": "FIN", "label": "金融", "name": "Financials", "slug": "stocks-us-financials-sector"},
    {"id": "HEALTH", "label": "醫療", "name": "Health Care", "slug": "stocks-us-health-care-sector"},
    {"id": "CD", "label": "非必需消費", "name": "Consumer Discretionary", "slug": "stocks-us-consumer-discretionary-sector"},
    {"id": "CS", "label": "必需消費", "name": "Consumer Staples", "slug": "stocks-us-consumer-staples-sector"},
    {"id": "COMM", "label": "通訊", "name": "Communication Services", "slug": "stocks-us-communication-services-sector"},
    {"id": "IND", "label": "工業", "name": "Industrials", "slug": "stocks-us-industrials-sector"},
    {"id": "ENERGY", "label": "能源", "name": "Energy", "slug": "stocks-us-energy-sector"},
    {"id": "UTIL", "label": "公用事業", "name": "Utilities", "slug": "stocks-us-utilities-sector"},
    {"id": "RE", "label": "房地產", "name": "Real Estate", "slug": "stocks-us-real-estate-sector"},
    {"id": "MAT", "label": "原物料", "name": "Materials", "slug": "stocks-us-materials-sector"},
]


def _visible_text(raw_html: str) -> str:
    text = re.sub(r"(?is)<(script|style).*?>.*?</\1>", " ", raw_html)
    text = re.sub(r"(?s)<[^>]+>", " ", text)
    text = html.unescape(text).replace("\xa0", " ")
    return re.sub(r"\s+", " ", text).strip()


def _match(text: str, pattern: str, field: str) -> str:
    m = re.search(pattern, text, flags=re.I)
    if not m:
        raise ValueError(f"ETF Central field missing: {field}")
    return m.group(1).strip()


def _money(value: str) -> float:
    s = value.strip().replace(",", "").replace("$", "").replace(" ", "")
    sign = -1.0 if s.startswith("-") else 1.0
    s = s.lstrip("+-")
    mult = 1.0
    if s and s[-1].upper() in {"K", "M", "B", "T"}:
        unit = s[-1].upper()
        s = s[:-1]
        mult = {"K": 1e3, "M": 1e6, "B": 1e9, "T": 1e12}[unit]
    return sign * float(s) * mult


def parse_sector_page(raw_html: str) -> dict[str, Any]:
    """Parse ETF Central headline metrics.

    ``Data as of`` is deliberately optional. ETF Central sometimes returns a
    server-rendered variant to GitHub-hosted runners where the three numeric
    headline metrics are present but the date label is omitted. Numeric fields
    remain mandatory; the collector resolves a missing date safely later.
    """
    text = _visible_text(raw_html)
    date_match = re.search(r"Data\s+as\s+of\s+(\d{2}/\d{2}/\d{4})", text, flags=re.I)
    perf_text = _match(text, r"1D\s+perf\s+([+-]?\d+(?:\.\d+)?)%", "1D perf")
    flow_text = _match(text, r"1D\s+flows?\s+([+-]?\$?[\d,.]+(?:\.\d+)?[KMBT]?)", "1D flows")
    aum_text = _match(text, r"Total\s+AuM\s+(\$?[\d,.]+(?:\.\d+)?[KMBT]?)", "Total AuM")

    flow_usd = _money(flow_text)
    aum_usd = _money(aum_text)
    if not math.isfinite(aum_usd) or aum_usd <= 0:
        raise ValueError("ETF Central Total AuM is invalid")
    flow_pct = flow_usd / aum_usd * 100.0
    dt = datetime.strptime(date_match.group(1), "%m/%d/%Y").date().isoformat() if date_match else None
    return {
        "data_as_of": dt,
        "perf_1d_pct": float(perf_text),
        "flow_1d_usd": flow_usd,
        "aum_usd": aum_usd,
        "flow_pct": flow_pct,
    }


def _same_snapshot(old: dict[str, Any] | None, parsed: dict[str, Any]) -> bool:
    if not isinstance(old, dict):
        return False
    keys = ("perf_1d_pct", "flow_1d_usd", "aum_usd")
    try:
        for key in keys:
            a = float(old.get(key))
            b = float(parsed.get(key))
            tol = max(1e-9, abs(b) * 1e-10)
            if not math.isfinite(a) or not math.isfinite(b) or abs(a - b) > tol:
                return False
        return True
    except Exception:
        return False


def _previous_sector(previous: dict[str, Any], sector_id: str) -> dict[str, Any] | None:
    for row in previous.get("sectors") or []:
        if isinstance(row, dict) and str(row.get("id")) == sector_id:
            return row
    return None


def _fallback_data_date() -> str:
    """Best-effort date only when ETF Central omits its own date label.

    At the 21:31 Taiwan run the latest completed US session is normally the
    previous New York weekday. Duplicate snapshots reuse the previous source
    date before this fallback is considered.
    """
    ny_date = datetime.now(timezone.utc).astimezone(ZoneInfo("America/New_York")).date()
    d = ny_date - timedelta(days=1)
    while d.weekday() >= 5:
        d -= timedelta(days=1)
    return d.isoformat()


def _response_debug(response: requests.Response) -> str:
    try:
        preview = _visible_text(response.text)[:180]
    except Exception:
        preview = ""
    return f"status={response.status_code}, bytes={len(response.content)}, final_url={response.url}, preview={preview!r}"


def _load_previous(path: str | Path | None) -> dict[str, Any]:
    if not path:
        return {}
    p = Path(path)
    if not p.exists() or p.stat().st_size == 0:
        return {}
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _prior_history(previous: dict[str, Any], sector_id: str, current_date: str) -> list[dict[str, Any]]:
    raw = (previous.get("history") or {}).get(sector_id) or []
    rows = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        d = str(item.get("date") or "")
        try:
            v = float(item.get("flow_pct"))
        except Exception:
            continue
        if not d or d == current_date or not math.isfinite(v):
            continue
        rows.append({"date": d, "flow_pct": v})
    # one observation per settlement date, newest wins
    dedup = {x["date"]: x for x in rows}
    return sorted(dedup.values(), key=lambda x: x["date"])[-HISTORY_KEEP:]


def _strength(today: float, prior: list[dict[str, Any]]) -> dict[str, Any]:
    window = prior[-MIN_HISTORY:]
    if len(window) < MIN_HISTORY:
        return {"available": False, "score": None, "z": None, "sample_prior": len(window), "sample_target": MIN_HISTORY}
    vals = [float(x["flow_pct"]) for x in window]
    mean = statistics.fmean(vals)
    stdev = statistics.stdev(vals)
    if stdev <= 1e-15:
        z = 0.0 if abs(today - mean) <= 1e-15 else (2.5 if today > mean else -2.5)
    else:
        z = (today - mean) / stdev
    score = max(0.0, min(100.0, 50.0 + 20.0 * z))
    return {
        "available": True,
        "score": round(score, 2),
        "z": round(z, 4),
        "sample_prior": len(window),
        "sample_target": MIN_HISTORY,
        "mean_20": round(mean, 8),
        "stdev_20": round(stdev, 8),
    }


def collect(*, previous: dict[str, Any] | None = None, timeout: float = 20.0) -> dict[str, Any]:
    previous = previous or {}
    session = requests.Session()
    # Do not advertise the runner as a bot. ETF Central serves different HTML
    # variants depending on the user agent; use a normal browser profile.
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,zh-TW;q=0.7",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        "Upgrade-Insecure-Requests": "1",
    })

    # Warm the session once so consent / edge cookies, if any, are retained.
    try:
        warm = session.get(BASE + "?ac_cmd=accept", timeout=(8, timeout))
        if warm.ok:
            session.headers["Referer"] = warm.url
    except requests.RequestException:
        pass

    rows: list[dict[str, Any]] = []
    history_out: dict[str, list[dict[str, Any]]] = {}
    errors: list[dict[str, str]] = []

    for meta in SECTORS:
        base_url = BASE + meta["slug"]
        response: requests.Response | None = None
        parsed: dict[str, Any] | None = None
        attempt_errors: list[str] = []
        try:
            # First try the consent-accept URL used by the browser; retry the
            # clean canonical URL because ETF Central occasionally varies them.
            for url in (base_url + "?ac_cmd=accept", base_url):
                try:
                    response = session.get(url, timeout=(8, timeout))
                    response.raise_for_status()
                    parsed = parse_sector_page(response.text)
                    break
                except Exception as exc:
                    detail = _response_debug(response) if response is not None else "no response"
                    attempt_errors.append(f"{url}: {exc}; {detail}")
                    parsed = None
            if parsed is None:
                raise RuntimeError(" | ".join(attempt_errors))

            date_source = "etfcentral"
            if not parsed.get("data_as_of"):
                old_row = _previous_sector(previous, meta["id"])
                if _same_snapshot(old_row, parsed) and old_row and old_row.get("data_as_of"):
                    parsed["data_as_of"] = str(old_row["data_as_of"])
                    date_source = "reused_previous_same_snapshot"
                else:
                    parsed["data_as_of"] = _fallback_data_date()
                    date_source = "inferred_previous_us_weekday"

            prior = _prior_history(previous, meta["id"], str(parsed["data_as_of"]))
            strength = _strength(parsed["flow_pct"], prior)
            rows.append({
                **meta,
                "source_url": response.url if response is not None else base_url,
                **{k: (round(v, 8) if isinstance(v, float) else v) for k, v in parsed.items()},
                "data_as_of_source": date_source,
                "flow_strength": strength,
            })
            merged = prior + [{"date": str(parsed["data_as_of"]), "flow_pct": round(parsed["flow_pct"], 8)}]
            dedup = {x["date"]: x for x in merged}
            history_out[meta["id"]] = sorted(dedup.values(), key=lambda x: x["date"])[-HISTORY_KEEP:]
        except Exception as exc:
            errors.append({"sector": meta["id"], "error": str(exc)})
            old_history = (previous.get("history") or {}).get(meta["id"]) or []
            history_out[meta["id"]] = old_history[-HISTORY_KEEP:] if isinstance(old_history, list) else []

    if len(rows) != len(SECTORS):
        # A partial wheel can produce a false leader. Keep the last good R2 object instead.
        raise RuntimeError(f"sector flow incomplete: {len(rows)}/{len(SECTORS)}; errors={errors}")

    positive = [x for x in rows if float(x["flow_pct"]) > 0]
    pool = positive or rows
    all_strength_ready = all(bool(x.get("flow_strength", {}).get("available")) for x in rows)
    if all_strength_ready:
        leader = max(pool, key=lambda x: (float(x["flow_strength"]["score"]), float(x["flow_pct"])))
        leader_method = "flow_strength_20d"
    else:
        leader = max(pool, key=lambda x: float(x["flow_pct"]))
        leader_method = "flow_pct_until_20d_ready"

    data_dates = sorted({str(x["data_as_of"]) for x in rows})
    now = datetime.now(TW)
    return {
        "schema_version": "sector-flow-v1-etfcentral-aum-normalized",
        "generated_at_taiwan": now.strftime("%Y-%m-%d %H:%M:%S"),
        "source": "ETF Central",
        "schedule": "21:31 Asia/Taipei",
        "metric": "1D Flow / Total AuM",
        "strength_formula": "clamp(50 + 20*zscore(today_flow_pct vs previous 20 distinct sessions), 0, 100)",
        "data_dates": data_dates,
        "leader": leader["id"],
        "leader_method": leader_method,
        "flow_regime": "positive_inflow_exists" if positive else "all_non_positive",
        "sectors": rows,
        "history": history_out,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--output", required=True)
    ap.add_argument("--previous")
    ap.add_argument("--fixture", help="offline parser test: parse one saved ETF Central HTML page")
    args = ap.parse_args()

    if args.fixture:
        parsed = parse_sector_page(Path(args.fixture).read_text(encoding="utf-8"))
        print(json.dumps(parsed, ensure_ascii=False, indent=2))
        return 0

    previous = _load_previous(args.previous)
    result = collect(previous=previous)
    target = Path(args.output)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({
        "ok": True,
        "leader": result["leader"],
        "leader_method": result["leader_method"],
        "dates": result["data_dates"],
        "sectors": len(result["sectors"]),
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
