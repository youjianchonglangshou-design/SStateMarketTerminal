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
PRIMARY_MODEL = "gemini-2.5-flash"
FALLBACK_MODEL = "gemini-3.6-flash"
MODEL = PRIMARY_MODEL
SEARCH_DELAY_SECONDS = 15
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
6. 未來 30 天：下一次已知財報日期；不知道就留空字串，不得猜。
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
  "last_earnings": {{"date": "", "eps": "beat|miss|inline|unknown|not_applicable", "revenue": "beat|miss|inline|unknown|not_applicable", "guidance": "raised|maintained|lowered|unknown|not_applicable"}},
  "next_earnings_date": "",
  "events": [
    {{"category":"earnings|guidance|company_catalyst|analyst|sec_capital|regulatory_legal|direct_industry", "date":"YYYY-MM-DD或空字串", "impact":"positive|negative|mixed|neutral", "title":"事件標題", "detail":"繁體中文，最多90字"}}
  ]
}}
events 最多 5 條，只留真正重要的事件。
""".strip()


def extract_interaction_text_sources(response: dict) -> tuple[str, list[dict], list[str]]:
    """Extract Interactions API model text, inline citations and search queries."""
    text_parts: list[str] = []
    sources: list[dict] = []
    queries: list[str] = []
    seen_urls: set[str] = set()

    for step in response.get("steps") or []:
        if not isinstance(step, dict):
            continue
        step_type = str(step.get("type") or "")
        if step_type == "google_search_call":
            args = step.get("arguments") or {}
            for q in args.get("queries") or []:
                q = str(q or "").strip()
                if q and q not in queries:
                    queries.append(q)
        if step_type != "model_output":
            continue
        for block in step.get("content") or []:
            if not isinstance(block, dict) or str(block.get("type") or "") != "text":
                continue
            text = str(block.get("text") or "")
            if text.strip():
                text_parts.append(text.strip())
            for anno in block.get("annotations") or []:
                if not isinstance(anno, dict):
                    continue
                url = str(anno.get("url") or anno.get("uri") or anno.get("source") or "").strip()
                title = str(anno.get("title") or url or "Google Search 來源").strip()
                if not url or url in seen_urls:
                    continue
                seen_urls.add(url)
                sources.append({"title": title or url, "url": url})

    return "\n".join(text_parts).strip(), sources[:10], queries[:10]


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
    raise ValueError("Gemini interaction did not contain a JSON object")


def research_schema() -> dict:
    # Used only by the Gemini 3.x fallback, where structured output can be
    # combined with built-in Google Search. Gemini 2.5 uses prompt JSON.
    return {
        "type": "object",
        "properties": {
            "underlying_ticker": {"type": "string"},
            "company_name": {"type": "string"},
            "asset_type": {"type": "string"},
            "verdict": {"type": "string"},
            "summary": {"type": "string"},
            "last_earnings": {
                "type": "object",
                "properties": {
                    "date": {"type": "string"},
                    "eps": {"type": "string"},
                    "revenue": {"type": "string"},
                    "guidance": {"type": "string"},
                },
                "required": ["date", "eps", "revenue", "guidance"],
            },
            "next_earnings_date": {"type": "string"},
            "events": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "category": {"type": "string"},
                        "date": {"type": "string"},
                        "impact": {"type": "string"},
                        "title": {"type": "string"},
                        "detail": {"type": "string"},
                    },
                    "required": ["category", "date", "impact", "title", "detail"],
                },
            },
        },
        "required": [
            "underlying_ticker", "company_name", "asset_type", "verdict",
            "summary", "last_earnings", "next_earnings_date", "events"
        ],
    }


def normalize_result(raw: dict, row: dict, sources: list[dict], searched_at: datetime,
                     model: str, queries: list[str] | None = None) -> dict:
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
        "sources": sources[:10],
        "web_search_queries": (queries or [])[:10],
        "model": model,
        "api": "interactions-v1beta",
    }


def interaction_request(api_key: str, row: dict, current_time: datetime, model: str) -> dict:
    """Call the current Interactions API.

    Gemini 2.5 can use Google Search and can use structured outputs separately,
    but Google currently documents *structured outputs + built-in tools* as a
    Gemini 3-series feature. Therefore 2.5 uses prompt-enforced JSON (same safe
    pattern as TennisRatio); the 3.6 fallback may use response_format.
    """
    url = "https://generativelanguage.googleapis.com/v1beta/interactions"
    payload: dict[str, Any] = {
        "model": model,
        "input": prompt_for(row, current_time),
        "tools": [{"type": "google_search"}],
        "store": False,
    }
    if model.startswith("gemini-3"):
        payload["response_format"] = {
            "type": "text",
            "mime_type": "application/json",
            "schema": research_schema(),
        }
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="POST", headers={
        "Content-Type": "application/json",
        "x-goog-api-key": api_key,
    })
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _explicit_model_unavailable(code: int, detail: str) -> bool:
    if code != 404:
        return False
    lower = detail.lower()
    return (
        "no longer available" in lower
        or "model not found" in lower
        or "model is not found" in lower
        or ("not_found" in lower and "model" in lower)
    )


def _research_from_body(body: dict, row: dict, current_time: datetime, requested_model: str) -> dict:
    status = str(body.get("status") or "completed").lower()
    if status not in {"completed", "success"}:
        raise RuntimeError(f"Gemini interaction status={status}")
    text, sources, queries = extract_interaction_text_sources(body)
    if not text:
        raise RuntimeError("Gemini interaction returned no model_output text")
    raw = parse_json_text(text)
    actual_model = str(body.get("model") or requested_model)
    result = normalize_result(raw, row, sources, current_time, actual_model, queries)
    # Like TennisRatio: do not call a source-less answer 'verified clear'.
    # Search grounding should leave either citations or explicit search queries.
    if not sources and not queries:
        raise RuntimeError("Gemini returned text but no Google Search grounding/citations")
    return result


def gemini_search(api_key: str, row: dict, current_time: datetime) -> dict:
    """Gemini 2.5 Flash on Interactions is primary.

    Only an explicit 2.5 model-unavailable 404 switches to Gemini 3.6 Flash.
    Transient 429/5xx/network errors are retried on the same model, so an API
    outage cannot silently change the configured research model.
    """
    model = PRIMARY_MODEL
    last_error: Exception | None = None

    for attempt in range(3):
        try:
            body = interaction_request(api_key, row, current_time, model)
            return _research_from_body(body, row, current_time, model)
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "replace")[:1600]
            last_error = RuntimeError(f"Gemini HTTP {exc.code}: {detail}")
            if _explicit_model_unavailable(exc.code, detail):
                print(f"::warning::{PRIMARY_MODEL} unavailable on Interactions; fallback to {FALLBACK_MODEL}")
                model = FALLBACK_MODEL
                break
            if exc.code not in {429, 500, 502, 503, 504}:
                raise last_error
            if attempt < 2:
                time.sleep(15 * (attempt + 1))
        except Exception as exc:
            last_error = exc
            # Parsing/grounding problems are not transport failures; retrying the
            # same grounded search wastes quota and may create duplicate news calls.
            if isinstance(exc, (ValueError, json.JSONDecodeError)) or "grounding" in str(exc).lower():
                raise RuntimeError(str(exc))
            if attempt < 2:
                time.sleep(8 * (attempt + 1))

    if model == FALLBACK_MODEL:
        for attempt in range(3):
            try:
                body = interaction_request(api_key, row, current_time, model)
                return _research_from_body(body, row, current_time, model)
            except urllib.error.HTTPError as exc:
                detail = exc.read().decode("utf-8", "replace")[:1600]
                last_error = RuntimeError(f"Gemini HTTP {exc.code}: {detail}")
                if exc.code not in {429, 500, 502, 503, 504}:
                    raise last_error
                if attempt < 2:
                    time.sleep(15 * (attempt + 1))
            except Exception as exc:
                last_error = exc
                if isinstance(exc, (ValueError, json.JSONDecodeError)) or "grounding" in str(exc).lower():
                    raise RuntimeError(str(exc))
                if attempt < 2:
                    time.sleep(8 * (attempt + 1))

    raise RuntimeError(str(last_error or "Gemini Interactions request failed"))

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

        # Mirror the proven TennisRatio pattern: do not burst many grounded searches.
        # With the 24H cache this normally affects only newly eligible symbols.
        if row is not rows[-1]:
            time.sleep(SEARCH_DELAY_SECONDS)

    cache_out = {
        "schema_version": "1.0",
        "ttl_hours": 24,
        "updated_at": iso(current),
        "entries": entries,
    }
    items_by_symbol = {str(i.get("symbol") or "").upper(): i for i in items if i.get("symbol")}
    latest = {
        "schema_version": "1.0",
        "model": PRIMARY_MODEL,
        "fallback_model": FALLBACK_MODEL,
        "api": "interactions-v1beta",
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
