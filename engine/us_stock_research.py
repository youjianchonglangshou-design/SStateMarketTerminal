#!/usr/bin/env python3
"""US-stock S-state Gemini research with a per-symbol 24-hour cache.

Targets only current S3 / S0.5 / S1 records. Existing research younger than 24h
is reused regardless of whether the prior trigger was AUTO or MANUAL.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

TW = timezone(timedelta(hours=8))
MODEL = "gemini-2.5-flash"
ELIGIBLE_STATES = {"S3", "S0.5", "S1"}
CACHE_TTL = timedelta(hours=24)
STALE_KEEP = timedelta(days=7)

# Non-company instruments inside the Pionex RWA screen. They remain visible in
# S-state, but are intentionally excluded from company/news/earnings research.
NON_COMPANY = {
    "BRENTOIL", "WTI", "COPPER", "NATGAS", "XAU", "XAG", "XPD", "XPT",
    "QQQX", "SPYX", "TQQQX", "SOXLX", "SOXSX", "SOXXX", "SLVX",
    "EWJX", "EWYX", "GSGX", "UNGX", "URAX", "URNMX", "USOX", "VGKX",
}

# Cases where simply removing the Pionex trailing X is not the real ticker/name.
UNDERLYING_OVERRIDES = {
    "AAOIX": "AAOI", "AAX": "AA", "AXTIX": "AXTI", "BEX": "BE",
    "CVXX": "CVX", "GMEX": "GME", "LRCXX": "LRCX", "MPX": "MP",
    "MUX": "MU", "NFLXX": "NFLX", "RGTIX": "RGTI", "RTXX": "RTX",
    "SITMX": "SITM", "SMCIX": "SMCI", "SNXXX": "SNX", "SOXXX": "SOXX",
    "TTEX": "TTE", "TXNX": "TXN", "XYZZ": "XYZ",
    "ANTHROPIC": "Anthropic", "OPENAI": "OpenAI", "HYUNDAI": "Hyundai Motor",
    "KIOXIA": "Kioxia", "SMSN": "Samsung Electronics", "SKHX": "SK hynix",
    "SKHY": "SK hynix",
}

VERDICT_SET = {"strong_positive", "positive", "neutral", "risk", "high_risk"}
CATEGORY_SET = {"earnings", "guidance", "company_catalyst", "analyst", "sec_capital", "regulatory_legal", "direct_industry"}


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def parse_dt(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        text = str(value).strip().replace("Z", "+00:00")
        dt = datetime.fromisoformat(text)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except Exception:
        return None


def read_json(path: Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def market_state(row: dict) -> str:
    return str((row.get("opportunity_long") or {}).get("market_state_id") or "OTHER")


def underlying_hint(symbol: str) -> str:
    symbol = symbol.upper().strip()
    if symbol in UNDERLYING_OVERRIDES:
        return UNDERLYING_OVERRIDES[symbol]
    if symbol.endswith("X") and len(symbol) > 1:
        return symbol[:-1]
    return symbol


def prompt_for(row: dict, current_time: datetime) -> str:
    symbol = str(row.get("symbol") or "").upper()
    hint = underlying_hint(symbol)
    state = market_state(row)
    taipei_now = current_time.astimezone(TW).strftime("%Y-%m-%d %H:%M")
    return f"""
你是美股事件風險研究員。現在台灣時間 {taipei_now}。

研究目標：Pionex RWA 代號 {symbol}，目前 S-state = {state}，推定標的/代號提示 = {hint}。
第一步必須先用 Google Search 核對 {symbol} 對應的真正公司或證券；不可因代號猜錯公司。

只搜尋能影響該公司/證券的下列範圍，禁止漫無目的蒐集新聞：
1. 最近 7 天：公司級重大 Catalyst，例如大型訂單、合約、新客戶、戰略合作、新產品、重大技術突破、政府標案、併購/資產交易。
2. 最近 14 天：分析師重大 Upgrade/Downgrade 或明顯調整目標價；只收具名主要機構。
3. 最近 14 天：SEC/官方申報與資本結構，包含 8-K/10-Q/10-K 重要新資訊、增資、ATM、可轉債、回購、重大稀釋。
4. 最近 14 天：法規、訴訟、政府調查、資安、CEO/CFO重大異動、交易暫停等直接風險。
5. 最近 90 天：最近一次財報，重點只看 EPS/Revenue beat/miss 與 guidance 上調/維持/下調。
6. 未來 30 天：下一次已知財報日期；不知道就寫 null，不得猜。
7. 產業事件只有「直接影響這家公司」才收。

來源優先順序：公司 Investor Relations / SEC / 政府監管機關 > Reuters / Bloomberg / CNBC / WSJ 等主要財經媒體 > Nasdaq / Yahoo Finance 等整理站。
排除 Reddit、X/Twitter 傳聞、YouTube、股價預測文章、技術分析、選擇權流量、一般大盤新聞與沒有直接提及該公司的產業新聞。
如果沒有重大近期事件，明確回傳 neutral，不要硬湊新聞。

請只輸出一個 JSON object，不要 Markdown，不要 code fence，不要額外解說。格式：
{{
  "underlying_ticker": "核對後代號或名稱",
  "company_name": "公司/證券名稱",
  "asset_type": "public_company|private_company|foreign_company|other",
  "verdict": "strong_positive|positive|neutral|risk|high_risk",
  "summary": "繁體中文，最多80字",
  "last_earnings": {{"date": null, "eps": "beat|miss|inline|unknown|not_applicable", "revenue": "beat|miss|inline|unknown|not_applicable", "guidance": "raised|maintained|lowered|unknown|not_applicable"}},
  "next_earnings_date": null,
  "events": [
    {{"category":"earnings|guidance|company_catalyst|analyst|sec_capital|regulatory_legal|direct_industry", "date":"YYYY-MM-DD或null", "impact":"positive|negative|mixed|neutral", "title":"事件標題", "detail":"繁體中文，最多90字"}}
  ]
}}
events 最多 5 條，只留真正重要的事件。
""".strip()


def extract_text_and_sources(response: dict) -> tuple[str, list[dict]]:
    candidates = response.get("candidates") or []
    if not candidates:
        return "", []
    cand = candidates[0] or {}
    parts = ((cand.get("content") or {}).get("parts") or [])
    text = "".join(str(p.get("text") or "") for p in parts if isinstance(p, dict))
    gm = cand.get("groundingMetadata") or {}
    out = []
    seen = set()
    for chunk in gm.get("groundingChunks") or []:
        web = (chunk or {}).get("web") or {}
        uri = str(web.get("uri") or "").strip()
        title = str(web.get("title") or "").strip()
        if not uri or uri in seen:
            continue
        seen.add(uri)
        out.append({"title": title or uri, "url": uri})
        if len(out) >= 8:
            break
    return text, out


def parse_json_text(text: str) -> dict:
    t = text.strip()
    t = re.sub(r"^```(?:json)?\s*", "", t, flags=re.I)
    t = re.sub(r"\s*```$", "", t)
    try:
        obj = json.loads(t)
        if isinstance(obj, dict):
            return obj
    except Exception:
        pass
    start, end = t.find("{"), t.rfind("}")
    if start >= 0 and end > start:
        obj = json.loads(t[start:end+1])
        if isinstance(obj, dict):
            return obj
    raise ValueError("Gemini response did not contain a JSON object")


def normalize_result(raw: dict, row: dict, sources: list[dict], searched_at: datetime) -> dict:
    symbol = str(row.get("symbol") or "").upper()
    verdict = str(raw.get("verdict") or "neutral").lower()
    if verdict not in VERDICT_SET:
        verdict = "neutral"
    events = []
    for event in (raw.get("events") or [])[:5]:
        if not isinstance(event, dict):
            continue
        cat = str(event.get("category") or "company_catalyst")
        if cat not in CATEGORY_SET:
            cat = "company_catalyst"
        impact = str(event.get("impact") or "neutral").lower()
        if impact not in {"positive", "negative", "mixed", "neutral"}:
            impact = "neutral"
        events.append({
            "category": cat,
            "date": event.get("date") or None,
            "impact": impact,
            "title": str(event.get("title") or "")[:180],
            "detail": str(event.get("detail") or "")[:320],
        })
    last = raw.get("last_earnings") if isinstance(raw.get("last_earnings"), dict) else {}
    return {
        "symbol": symbol,
        "api_symbol": row.get("api_symbol"),
        "state_at_search": market_state(row),
        "searched_at": iso(searched_at),
        "expires_at": iso(searched_at + CACHE_TTL),
        "underlying_ticker": str(raw.get("underlying_ticker") or underlying_hint(symbol))[:80],
        "company_name": str(raw.get("company_name") or "")[:160],
        "asset_type": str(raw.get("asset_type") or "other")[:40],
        "verdict": verdict,
        "summary": str(raw.get("summary") or "無重大近期事件")[:300],
        "last_earnings": {
            "date": last.get("date") or None,
            "eps": str(last.get("eps") or "unknown"),
            "revenue": str(last.get("revenue") or "unknown"),
            "guidance": str(last.get("guidance") or "unknown"),
        },
        "next_earnings_date": raw.get("next_earnings_date") or None,
        "events": events,
        "sources": sources[:8],
        "model": MODEL,
    }


def gemini_search(api_key: str, row: dict, current_time: datetime) -> dict:
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent"
    payload = {
        "contents": [{"parts": [{"text": prompt_for(row, current_time)}]}],
        "tools": [{"google_search": {}}],
        "generationConfig": {"temperature": 0.15, "maxOutputTokens": 2200},
    }
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    last_error = None
    for attempt in range(3):
        req = urllib.request.Request(url, data=data, method="POST", headers={
            "Content-Type": "application/json",
            "x-goog-api-key": api_key,
        })
        try:
            with urllib.request.urlopen(req, timeout=90) as resp:
                body = json.loads(resp.read().decode("utf-8"))
            text, sources = extract_text_and_sources(body)
            raw = parse_json_text(text)
            return normalize_result(raw, row, sources, current_time)
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "replace")[:800]
            last_error = RuntimeError(f"Gemini HTTP {exc.code}: {detail}")
            if exc.code not in {429, 500, 502, 503, 504}:
                break
        except Exception as exc:
            last_error = exc
        if attempt < 2:
            time.sleep(2.5 * (attempt + 1))
    raise RuntimeError(str(last_error or "Gemini request failed"))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--snapshot", required=True)
    ap.add_argument("--cache", required=True)
    ap.add_argument("--out-cache", required=True)
    ap.add_argument("--out-latest", required=True)
    args = ap.parse_args()

    snapshot = read_json(Path(args.snapshot), {})
    cache = read_json(Path(args.cache), {"schema_version": "1.0", "ttl_hours": 24, "entries": {}})
    entries = cache.get("entries") if isinstance(cache.get("entries"), dict) else {}
    current = now_utc()

    # Keep a small stale window for fallback only; normal reuse is strictly <24h.
    pruned = {}
    for symbol, entry in entries.items():
        stamp = parse_dt((entry or {}).get("searched_at"))
        if stamp and current - stamp <= STALE_KEEP:
            pruned[str(symbol).upper()] = entry
    entries = pruned

    rows = [r for r in (snapshot.get("records") or []) if market_state(r) in ELIGIBLE_STATES]
    rows.sort(key=lambda r: ({"S3": 0, "S0.5": 1, "S1": 2}.get(market_state(r), 9), str(r.get("symbol") or "")))

    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    items = []
    counts = {"new_search": 0, "cache_24h": 0, "stale_cache": 0, "error": 0, "skipped_non_company": 0}

    for row in rows:
        symbol = str(row.get("symbol") or "").upper()
        state = market_state(row)
        base = {"symbol": symbol, "api_symbol": row.get("api_symbol"), "state": state, "price": row.get("price")}

        if symbol in NON_COMPANY:
            items.append({**base, "research_status": "SKIPPED_NON_COMPANY", "verdict": "neutral", "summary": "非公司型商品/ETF，依設定不執行公司新聞與財報搜尋。", "events": [], "sources": []})
            counts["skipped_non_company"] += 1
            continue

        old = entries.get(symbol)
        old_stamp = parse_dt((old or {}).get("searched_at"))
        if old and old_stamp and current - old_stamp < CACHE_TTL:
            reused = dict(old)
            reused.update(base)
            reused["research_status"] = "CACHE_24H"
            items.append(reused)
            counts["cache_24h"] += 1
            continue

        if not api_key:
            if old:
                reused = dict(old)
                reused.update(base)
                reused["research_status"] = "STALE_CACHE"
                reused["research_error"] = "GEMINI_API_KEY missing"
                items.append(reused)
                counts["stale_cache"] += 1
            else:
                items.append({**base, "research_status": "ERROR", "verdict": "neutral", "summary": "尚未設定 GEMINI_API_KEY，未執行新聞搜尋。", "events": [], "sources": [], "research_error": "GEMINI_API_KEY missing"})
                counts["error"] += 1
            continue

        try:
            result = gemini_search(api_key, row, current)
            entries[symbol] = result
            item = dict(result)
            item.update(base)
            item["research_status"] = "NEW_SEARCH"
            items.append(item)
            counts["new_search"] += 1
            print(f"[Gemini] {symbol} {state} -> {result.get('verdict')} ({len(result.get('sources') or [])} sources)")
        except Exception as exc:
            if old:
                reused = dict(old)
                reused.update(base)
                reused["research_status"] = "STALE_CACHE"
                reused["research_error"] = str(exc)[:500]
                items.append(reused)
                counts["stale_cache"] += 1
            else:
                items.append({**base, "research_status": "ERROR", "verdict": "neutral", "summary": "Gemini 搜尋失敗，本次不建立臆測內容。", "events": [], "sources": [], "research_error": str(exc)[:500]})
                counts["error"] += 1
            print(f"::warning::{symbol} Gemini research failed: {exc}")

    cache_out = {
        "schema_version": "1.0",
        "ttl_hours": 24,
        "updated_at": iso(current),
        "entries": entries,
    }
    items_by_symbol = {str(i.get("symbol") or "").upper(): i for i in items if i.get("symbol")}
    latest = {
        "schema_version": "1.0",
        "model": MODEL,
        "generated_at": iso(current),
        "snapshot_generated_at": (snapshot.get("batch") or {}).get("generated_at_taiwan"),
        "eligible_states": ["S3", "S0.5", "S1"],
        "cache_ttl_hours": 24,
        "eligible_count": len(rows),
        "new_search_count": counts["new_search"],
        "cache_hit_count": counts["cache_24h"],
        "stale_cache_count": counts["stale_cache"],
        "error_count": counts["error"],
        "skipped_non_company_count": counts["skipped_non_company"],
        "items": items,
        "items_by_symbol": items_by_symbol,
    }
    write_json(Path(args.out_cache), cache_out)
    write_json(Path(args.out_latest), latest)
    print(json.dumps({k: latest[k] for k in ["eligible_count", "new_search_count", "cache_hit_count", "stale_cache_count", "error_count", "skipped_non_company_count"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
