#!/usr/bin/env python3
"""US-stock S-state GPT-OSS research with a per-symbol 24-hour cache.

Model/provider swap only:
- OpenAI GPT-OSS 120B served by Groq
- Groq OpenAI-compatible Chat Completions + built-in Browser Search
- one request at a time
- 30~35 second cooldown between successful new searches
- same quota/error classification and early batch stop behavior
- only successful searched results are written into the 24H cache

Targets only current S3 / S0.5 / S1 records. Existing research younger than
24 hours is reused regardless of whether the prior trigger was AUTO or MANUAL.
"""
from __future__ import annotations

import argparse
import json
import os
import random
import re
import time
import groq
from groq import Groq
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

TW = timezone(timedelta(hours=8))
MODEL = "openai/gpt-oss-120b"
ELIGIBLE_STATES = {"S3", "S0.5", "S1"}
CACHE_TTL = timedelta(hours=24)
STALE_KEEP = timedelta(days=7)

SEARCH_DELAY_MIN_SECONDS = 30
SEARCH_DELAY_MAX_SECONDS = 35
MAX_ATTEMPTS = 2
RETRY_UNKNOWN_429_SECONDS = 90
RETRY_503_SECONDS = 30
RETRY_NETWORK_SECONDS = 20
REQUEST_TIMEOUT_SECONDS = 120
PIPELINE_VERSION = "gpt-oss-120b-groq-sdk-browser-search-v2"

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

VERDICT_SET = {"strong_positive", "positive", "mixed", "neutral", "risk", "high_risk"}
CATEGORY_SET = {
    "earnings", "guidance", "company_catalyst", "analyst", "sec_capital",
    "regulatory_legal", "direct_industry"
}


class GroqHTTPError(RuntimeError):
    def __init__(self, status: int, detail: str, payload: Any = None, retry_after: int | None = None):
        super().__init__(f"Groq HTTP {status}: {detail}")
        self.status = int(status)
        self.detail = str(detail)
        self.payload = payload
        self.retry_after = retry_after


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
第一步必須先用 Browser Search 核對 {symbol} 對應的真正公司或證券；不可因代號猜錯公司。

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
  "verdict": "strong_positive|positive|mixed|neutral|risk|high_risk",
  "summary": "繁體中文，最多80字",
  "last_earnings": {{"date": "", "eps": "beat|miss|inline|unknown|not_applicable", "revenue": "beat|miss|inline|unknown|not_applicable", "guidance": "raised|maintained|lowered|unknown|not_applicable"}},
  "next_earnings_date": "",
  "events": [
    {{"category":"earnings|guidance|company_catalyst|analyst|sec_capital|regulatory_legal|direct_industry", "date":"YYYY-MM-DD或空字串", "impact":"positive|negative|mixed|neutral", "title":"事件標題", "detail":"繁體中文，最多90字"}}
  ]
}}
events 最多 5 條，只留真正重要的事件。
""".strip()


def parse_json_text(text: str) -> dict:
    t = str(text or "").strip()
    t = re.sub(r"^```(?:json)?\s*", "", t, flags=re.I)
    t = re.sub(r"\s*```$", "", t)

    try:
        obj = json.loads(t)
        if isinstance(obj, dict):
            return obj
    except Exception:
        pass

    # Browser Search may prepend browsing snippets. Scan every opening brace and
    # keep the last complete JSON object that looks like the requested research payload.
    decoder = json.JSONDecoder()
    candidates: list[dict] = []
    for idx, char in enumerate(t):
        if char != "{":
            continue
        try:
            obj, _ = decoder.raw_decode(t[idx:])
        except Exception:
            continue
        if isinstance(obj, dict):
            candidates.append(obj)
    for obj in reversed(candidates):
        if any(k in obj for k in ("verdict", "summary", "events", "underlying_ticker")):
            return obj
    if candidates:
        return candidates[-1]
    raise ValueError("GPT-OSS response did not contain a JSON object")


def _append_unique_source(sources: list[dict], seen_urls: set[str], title: Any, url: Any) -> None:
    clean_url = str(url or "").strip()
    if not clean_url or clean_url in seen_urls:
        return
    seen_urls.add(clean_url)
    sources.append({
        "title": str(title or clean_url or "Browser Search 來源").strip(),
        "url": clean_url,
    })


def _collect_query_values(value: Any, queries: list[str]) -> None:
    if isinstance(value, dict):
        for key, item in value.items():
            if str(key).lower() in {"query", "q", "search_query", "searchquery"}:
                if isinstance(item, str):
                    q = item.strip()
                    if q and q not in queries:
                        queries.append(q)
                elif isinstance(item, list):
                    for part in item:
                        q = str(part or "").strip()
                        if q and q not in queries:
                            queries.append(q)
            _collect_query_values(item, queries)
    elif isinstance(value, list):
        for item in value:
            _collect_query_values(item, queries)


def extract_groq_response(response: dict) -> tuple[str, list[dict], list[str]]:
    """Extract final text plus Browser Search evidence from Groq Chat Completions."""
    choices = response.get("choices") or []
    if not choices or not isinstance(choices[0], dict):
        raise RuntimeError("GPT-OSS 回應中沒有 choices")

    message = choices[0].get("message") or {}
    text = str(message.get("content") or "").strip()
    if not text:
        finish_reason = choices[0].get("finish_reason")
        if finish_reason:
            raise RuntimeError(f"GPT-OSS 回應中沒有可顯示文字：{finish_reason}")
        raise RuntimeError("GPT-OSS 回應中沒有可顯示文字")

    sources: list[dict] = []
    queries: list[str] = []
    seen_urls: set[str] = set()

    executed_tools = message.get("executed_tools") or []
    for tool in executed_tools:
        if not isinstance(tool, dict):
            continue
        search_results = tool.get("search_results") or {}
        if isinstance(search_results, dict):
            for result in search_results.get("results") or []:
                if not isinstance(result, dict):
                    continue
                _append_unique_source(
                    sources,
                    seen_urls,
                    result.get("title"),
                    result.get("url"),
                )
        arguments = tool.get("arguments")
        if isinstance(arguments, str):
            try:
                arguments = json.loads(arguments)
            except Exception:
                arguments = {"query": arguments}
        _collect_query_values(arguments, queries)

    # Some Groq responses expose the browser query only in reasoning text.
    reasoning = str(message.get("reasoning") or "")
    for match in re.finditer(r"<tool>\s*(?:browser_)?search\((.*?)\)</tool>", reasoning, re.I | re.S):
        q = re.sub(r"\s+", " ", match.group(1)).strip(" \t\r\n\"'")
        if q and q not in queries:
            queries.append(q)

    # Last-resort: preserve direct URLs if the provider embeds them in content.
    for url in re.findall(r"https?://[^\s\]>)\"']+", text):
        _append_unique_source(sources, seen_urls, url, url)

    return text, sources[:10], queries[:10]


def normalize_result(
    raw: dict,
    row: dict,
    sources: list[dict],
    searched_at: datetime,
    queries: list[str] | None = None,
    *,
    raw_model_text: str = "",
    format_warning: bool = False,
    usage: dict | None = None,
) -> dict:
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
    summary = str(raw.get("summary") or "").strip()
    if not summary and format_warning:
        summary = "GPT-OSS 已完成 Browser Search，但輸出格式不完整；保留原始摘要供人工判讀。"
    if not summary:
        summary = "無重大近期事件"

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
        "summary": summary[:300],
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
        "model": MODEL,
        "api": "groq-chat-completions-v1",
        "search_mode": "gpt_oss_120b_browser_search",
        "pipeline_version": PIPELINE_VERSION,
        "format_warning": bool(format_warning),
        "raw_model_text": str(raw_model_text or "")[:12000] if format_warning else "",
        "usage": usage or {},
    }


def _retry_after_seconds(headers: Any) -> int | None:
    try:
        raw = str(headers.get("Retry-After") or "").strip()
    except Exception:
        raw = ""
    if not raw:
        return None
    try:
        return max(0, int(float(raw)))
    except Exception:
        return None


def groq_browser_search_request(api_key: str, row: dict, current_time: datetime) -> dict:
    """Call GPT-OSS 120B through Groq's official Python SDK with Browser Search.

    Important: use Groq's supported SDK/httpx transport instead of urllib. The
    prior urllib transport could be rejected by Cloudflare with Error 1010
    (client/browser signature), even when the API key itself was valid.
    """
    try:
        client = Groq(
            api_key=api_key,
            timeout=REQUEST_TIMEOUT_SECONDS,
            max_retries=0,  # keep the existing SState retry/pacing policy in this file
        )
        completion = client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": prompt_for(row, current_time)},
                {
                    "role": "user",
                    "content": "請立即使用 Browser Search 核對這個標的，依系統規則完成新聞、財報、公司事件與風險搜尋，最後只輸出指定 JSON。",
                },
            ],
            tools=[{"type": "browser_search"}],
            tool_choice="required",
            max_completion_tokens=2600,
            stream=False,
        )
        return completion.to_dict()

    except groq.APIStatusError as exc:
        status = int(getattr(exc, "status_code", 0) or 0)
        response = getattr(exc, "response", None)
        payload: Any = None
        detail = str(exc)
        retry_after = None

        if response is not None:
            try:
                payload = response.json()
            except Exception:
                try:
                    body = response.text
                except Exception:
                    body = str(exc)
                payload = {"error": {"message": body}}
            try:
                retry_after = _retry_after_seconds(response.headers)
            except Exception:
                retry_after = None

        if isinstance(payload, dict):
            err = payload.get("error")
            if isinstance(err, dict):
                detail = str(err.get("message") or err.get("error") or detail)
            elif err:
                detail = str(err)

        raise GroqHTTPError(
            status or 500,
            detail[:2000],
            payload,
            retry_after,
        ) from exc

    except groq.APITimeoutError as exc:
        raise TimeoutError(f"Groq request timeout: {exc}") from exc
    except groq.APIConnectionError as exc:
        raise ConnectionError(f"Groq connection error: {exc}") from exc


def _flatten_strings(value: Any, output: list[str] | None = None, depth: int = 0) -> list[str]:
    if output is None:
        output = []
    if depth > 8 or value is None:
        return output
    if isinstance(value, (str, int, float, bool)):
        output.append(str(value))
        return output
    if isinstance(value, list):
        for item in value:
            _flatten_strings(item, output, depth + 1)
        return output
    if isinstance(value, dict):
        for key, item in value.items():
            output.append(str(key))
            _flatten_strings(item, output, depth + 1)
    return output


def classify_failure(exc: Exception) -> dict:
    """Port the TennisRatio failure buckets that matter for batch safety."""
    status = exc.status if isinstance(exc, GroqHTTPError) else None
    payload = exc.payload if isinstance(exc, GroqHTTPError) else None
    retry_after = exc.retry_after if isinstance(exc, GroqHTTPError) else None
    text = " ".join(_flatten_strings(payload)) + " " + str(exc)
    lower = text.lower()

    category = "unknown_error"
    retryable = False
    wait_seconds = 0
    stop_batch = True

    if status == 429:
        if re.search(r"browser.?search|search.?tool", lower) and re.search(r"per.?day|daily|rpd|quota.?exceeded|exceeded.{0,24}quota|quota.{0,24}exceeded", lower):
            category = "quota_search_rpd"
        elif re.search(r"token|input.?token|output.?token", lower) and re.search(r"per.?minute|tpm", lower):
            category = "rate_limit_tpm"
            retryable = True
            wait_seconds = retry_after or RETRY_UNKNOWN_429_SECONDS
            stop_batch = False
        elif re.search(r"request|generate.?request", lower) and re.search(r"per.?minute|rpm", lower):
            category = "rate_limit_rpm"
            retryable = True
            wait_seconds = retry_after or RETRY_UNKNOWN_429_SECONDS
            stop_batch = False
        elif re.search(r"per.?day|daily|rpd|quota.?exceeded|exceeded.{0,24}quota|quota.{0,24}exceeded", lower):
            category = "quota_model_rpd"
        else:
            category = "rate_limit_unknown_429"
            retryable = True
            wait_seconds = retry_after or RETRY_UNKNOWN_429_SECONDS
            stop_batch = False

    elif status in {500, 502, 503, 504}:
        category = "service_unavailable_503" if status == 503 else "service_unavailable_5xx"
        retryable = True
        wait_seconds = retry_after or RETRY_503_SECONDS
        stop_batch = False

    elif status == 403 and re.search(r"(?:error\s*code[:\s-]*1010|\b1010\b|browser.?signature)", lower):
        category = "edge_signature_1010"

    elif status == 401:
        category = "auth_401"

    elif status == 403:
        category = "permission_403"

    elif status == 404:
        category = "model_unavailable_404"

    elif status == 413:
        category = "request_too_large_413"

    elif isinstance(exc, (TimeoutError, ConnectionError)):
        category = "network_timeout"
        retryable = True
        wait_seconds = RETRY_NETWORK_SECONDS
        stop_batch = False

    elif isinstance(exc, ValueError):
        category = "format_error"
        retryable = False
        stop_batch = False

    messages = {
        "quota_search_rpd": "Groq Browser Search 今日額度已達上限",
        "quota_model_rpd": "GPT-OSS 今日模型請求額度已達上限",
        "rate_limit_tpm": "Groq GPT-OSS 每分鐘 Token 限制（TPM）",
        "rate_limit_rpm": "Groq GPT-OSS 每分鐘請求限制（RPM）",
        "rate_limit_unknown_429": "Groq GPT-OSS 暫時受到使用限制（HTTP 429）",
        "service_unavailable_503": "Groq 服務暫時壅塞（HTTP 503）",
        "service_unavailable_5xx": "Groq 上游服務暫時異常",
        "edge_signature_1010": "Groq/Cloudflare 阻擋舊 HTTP 客戶端簽章（Error 1010）",
        "auth_401": "Groq API Key 驗證失敗（HTTP 401）",
        "permission_403": "Groq 模型或專案權限不足（HTTP 403）",
        "model_unavailable_404": "目前 Groq API Key 無法使用 openai/gpt-oss-120b",
        "request_too_large_413": "GPT-OSS 請求內容過大",
        "network_timeout": "Groq 連線逾時或網路失敗",
        "format_error": "GPT-OSS 已回覆但 JSON 格式不完整",
        "unknown_error": "GPT-OSS 未知錯誤",
    }

    return {
        "category": category,
        "summary": messages.get(category, messages["unknown_error"]),
        "retryable": retryable,
        "wait_seconds": int(wait_seconds or 0),
        "stop_batch": stop_batch,
        "http_status": status,
        "technical_error": str(exc)[:1200],
    }


def _loose_json_string(text: str, key: str) -> str:
    """Recover a quoted top-level-ish value from a truncated GPT-OSS JSON reply."""
    pattern = re.compile(rf'["\']{re.escape(key)}["\']\s*:\s*["\']((?:\\.|[^"\'\\])*)["\']', re.I | re.S)
    match = pattern.search(str(text or ""))
    if not match:
        return ""
    value = match.group(1)
    try:
        # Decode common JSON escapes without forcing the entire malformed object to parse.
        return json.loads('"' + value.replace('"', '\\"') + '"')
    except Exception:
        return value.replace('\\n', ' ').replace('\\"', '"').strip()


def recover_loose_research_json(text: str, row: dict) -> dict:
    """Best-effort human fields when GPT-OSS searched successfully but JSON was truncated.

    This deliberately does not invent data. It only recovers fields that are visibly
    present in the model text so the UI can show readable content instead of raw JSON.
    """
    symbol = str(row.get("symbol") or "")
    raw = {
        "underlying_ticker": _loose_json_string(text, "underlying_ticker") or underlying_hint(symbol),
        "company_name": _loose_json_string(text, "company_name"),
        "asset_type": _loose_json_string(text, "asset_type") or "other",
        "verdict": (_loose_json_string(text, "verdict") or "neutral").lower(),
        "summary": _loose_json_string(text, "summary"),
        "last_earnings": {
            "date": "",
            "eps": "unknown",
            "revenue": "unknown",
            "guidance": "unknown",
        },
        "next_earnings_date": _loose_json_string(text, "next_earnings_date"),
        "events": [],
    }

    earnings_match = re.search(r'["\']last_earnings["\']\s*:\s*\{(?P<body>[^{}]{0,1200})', str(text or ""), re.I | re.S)
    if earnings_match:
        body = earnings_match.group("body")
        for key in ("date", "eps", "revenue", "guidance"):
            value = _loose_json_string(body, key)
            if value:
                raw["last_earnings"][key] = value

    # Recover any complete event objects even when the outer response is truncated.
    event_pattern = re.compile(r'\{[^{}]{0,1800}["\']category["\']\s*:\s*["\'][^"\']+["\'][^{}]{0,1800}\}', re.I | re.S)
    for match in event_pattern.finditer(str(text or "")):
        candidate = match.group(0)
        try:
            event = json.loads(candidate)
        except Exception:
            event = {
                "category": _loose_json_string(candidate, "category") or "company_catalyst",
                "date": _loose_json_string(candidate, "date"),
                "impact": _loose_json_string(candidate, "impact") or "neutral",
                "title": _loose_json_string(candidate, "title"),
                "detail": _loose_json_string(candidate, "detail"),
            }
        if event.get("title") or event.get("detail"):
            raw["events"].append(event)
        if len(raw["events"]) >= 5:
            break

    if not raw["summary"]:
        raw["summary"] = "GPT-OSS 已完成 Browser Search，但回傳格式不完整；已整理可辨識欄位供人工判讀。"
    return raw


def response_to_result(body: dict, row: dict, current_time: datetime) -> dict:
    text, sources, queries = extract_groq_response(body)

    # Exactly like TennisRatio's safe pattern: a formatting miss after a real
    # grounded search does not trigger a second search request and waste quota.
    format_warning = False
    try:
        raw = parse_json_text(text)
    except Exception:
        raw = recover_loose_research_json(text, row)
        format_warning = True

    # A result is only eligible for 24H success cache if Browser Search actually
    # left evidence (source URLs or explicit search queries).
    if not sources and not queries:
        raise RuntimeError("GPT-OSS returned text but no Browser Search evidence/citations")

    result = normalize_result(
        raw,
        row,
        sources,
        current_time,
        queries,
        raw_model_text=text,
        format_warning=format_warning,
        usage=body.get("usage") if isinstance(body.get("usage"), dict) else {},
    )

    if format_warning:
        result["verification_status"] = "MANUAL_REVIEW"
    else:
        result["verification_status"] = "GROUNDED"
    return result


def gpt_oss_search(api_key: str, row: dict, current_time: datetime) -> tuple[dict | None, dict | None]:
    """Return (result, failure). At most two attempts, TennisRatio-style."""
    previous_failure: dict | None = None

    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            body = groq_browser_search_request(api_key, row, current_time)
            result = response_to_result(body, row, current_time)
            result["attempt_count"] = attempt
            result["retry_count"] = attempt - 1
            return result, None
        except Exception as exc:
            failure = classify_failure(exc)
            failure["attempt_count"] = attempt
            failure["retry_count"] = attempt - 1

            if not failure["retryable"]:
                return None, failure

            if attempt >= MAX_ATTEMPTS:
                # TennisRatio rule: if the second transient attempt still fails,
                # stop the whole batch rather than hammering every remaining symbol.
                failure["stop_batch"] = True
                failure["summary"] = f"{failure['summary']}；第二次仍失敗，本輪停止"
                return None, failure

            wait_seconds = max(1, int(failure.get("wait_seconds") or RETRY_UNKNOWN_429_SECONDS))
            print(
                f"::warning::{row.get('symbol')} {failure['category']} - "
                f"等待 {wait_seconds}s 後只重試目前標的一次"
            )
            time.sleep(wait_seconds)
            previous_failure = failure

    return None, previous_failure or {
        "category": "unknown_error",
        "summary": "GPT-OSS 未知錯誤",
        "retryable": False,
        "wait_seconds": 0,
        "stop_batch": True,
        "http_status": None,
        "technical_error": "unknown",
        "attempt_count": MAX_ATTEMPTS,
        "retry_count": MAX_ATTEMPTS - 1,
    }


def base_item(row: dict) -> dict:
    return {
        "symbol": str(row.get("symbol") or "").upper(),
        "api_symbol": row.get("api_symbol"),
        "state": market_state(row),
        "price": row.get("price"),
    }


def error_item(row: dict, failure: dict) -> dict:
    base = base_item(row)
    return {
        **base,
        "research_status": "ERROR",
        "verdict": "neutral",
        "summary": str(failure.get("summary") or "GPT-OSS 搜尋失敗，本次不建立臆測內容。"),
        "events": [],
        "sources": [],
        "research_error": str(failure.get("technical_error") or failure.get("summary") or "")[:800],
        "failure_type": failure.get("category"),
        "http_status": failure.get("http_status"),
        "attempt_count": failure.get("attempt_count"),
        "retry_count": failure.get("retry_count"),
        "model": MODEL,
        "api": "groq-chat-completions-v1",
        "search_mode": "gpt_oss_120b_browser_search",
        "pipeline_version": PIPELINE_VERSION,
    }


def deferred_item(row: dict, stop_failure: dict) -> dict:
    base = base_item(row)
    cause = str(stop_failure.get("summary") or stop_failure.get("category") or "前一筆 GPT-OSS 錯誤")
    return {
        **base,
        "research_status": "DEFERRED",
        "verdict": "neutral",
        "summary": "本輪 GPT-OSS 批次已停止；此標的尚未送出搜尋，保留到下一輪。",
        "events": [],
        "sources": [],
        "research_error": f"未呼叫 GPT-OSS。停止原因：{cause}"[:800],
        "failure_type": "batch_stopped_before_request",
        "model": MODEL,
        "api": "groq-chat-completions-v1",
        "search_mode": "gpt_oss_120b_browser_search",
        "pipeline_version": PIPELINE_VERSION,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--snapshot", required=True)
    ap.add_argument("--cache", required=True)
    ap.add_argument("--out-cache", required=True)
    ap.add_argument("--out-latest", required=True)
    args = ap.parse_args()

    snapshot = read_json(Path(args.snapshot), {})
    cache = read_json(
        Path(args.cache),
        {"schema_version": "1.0", "ttl_hours": 24, "entries": {}},
    )
    entries = cache.get("entries") if isinstance(cache.get("entries"), dict) else {}
    current = now_utc()

    # Keep a small stale window for fallback display only; normal reuse is <24h.
    pruned = {}
    for symbol, entry in entries.items():
        stamp = parse_dt((entry or {}).get("searched_at"))
        if stamp and current - stamp <= STALE_KEEP:
            pruned[str(symbol).upper()] = entry
    entries = pruned

    rows = [
        r for r in (snapshot.get("records") or [])
        if market_state(r) in ELIGIBLE_STATES
    ]
    rows.sort(
        key=lambda r: (
            {"S3": 0, "S0.5": 1, "S1": 2}.get(market_state(r), 9),
            str(r.get("symbol") or ""),
        )
    )

    api_key = os.environ.get("GROQ_API_KEY", "").strip()
    items: list[dict] = []
    counts = {
        "new_search": 0,
        "cache_24h": 0,
        "stale_cache": 0,
        "error": 0,
        "deferred": 0,
        "skipped_non_company": 0,
    }

    stop_batch = False
    stop_failure: dict | None = None

    def next_needs_api(start_index: int) -> bool:
        for later in rows[start_index:]:
            symbol = str(later.get("symbol") or "").upper()
            if symbol in NON_COMPANY:
                continue
            old = entries.get(symbol)
            stamp = parse_dt((old or {}).get("searched_at"))
            if old and stamp and current - stamp < CACHE_TTL:
                continue
            return True
        return False

    for row_index, row in enumerate(rows):
        symbol = str(row.get("symbol") or "").upper()
        state = market_state(row)
        base = base_item(row)

        if symbol in NON_COMPANY:
            items.append({
                **base,
                "research_status": "SKIPPED_NON_COMPANY",
                "verdict": "neutral",
                "summary": "非公司型商品/ETF，依設定不執行公司新聞與財報搜尋。",
                "events": [],
                "sources": [],
            })
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

        if stop_batch:
            # Do NOT keep hitting the API once TennisRatio-style batch-stop is active.
            if old:
                reused = dict(old)
                reused.update(base)
                reused["research_status"] = "STALE_CACHE"
                reused["research_error"] = (
                    "本輪批次已停止，沿用超過24H的舊結果；"
                    + str((stop_failure or {}).get("summary") or "")
                )[:800]
                items.append(reused)
                counts["stale_cache"] += 1
            else:
                items.append(deferred_item(row, stop_failure or {}))
                counts["deferred"] += 1
            continue

        if not api_key:
            failure = {
                "category": "configuration_error",
                "summary": "尚未設定 GROQ_API_KEY，未執行新聞搜尋。",
                "technical_error": "GROQ_API_KEY missing",
                "http_status": None,
                "attempt_count": 0,
                "retry_count": 0,
                "stop_batch": True,
            }
            if old:
                reused = dict(old)
                reused.update(base)
                reused["research_status"] = "STALE_CACHE"
                reused["research_error"] = "GROQ_API_KEY missing"
                items.append(reused)
                counts["stale_cache"] += 1
            else:
                items.append(error_item(row, failure))
                counts["error"] += 1
            stop_batch = True
            stop_failure = failure
            continue

        result, failure = gpt_oss_search(api_key, row, current)

        if result:
            # Only grounded success enters the 24H cache.
            entries[symbol] = result
            item = dict(result)
            item.update(base)
            item["research_status"] = "NEW_SEARCH"
            items.append(item)
            counts["new_search"] += 1
            print(
                f"[GPT-OSS] {symbol} {state} -> {result.get('verdict')} "
                f"({len(result.get('sources') or [])} sources, "
                f"{len(result.get('web_search_queries') or [])} queries)"
            )

            # TennisRatio proven pacing: cooldown only when another uncached
            # symbol still needs a real API request.
            if next_needs_api(row_index + 1):
                cooldown = random.randint(
                    SEARCH_DELAY_MIN_SECONDS,
                    SEARCH_DELAY_MAX_SECONDS,
                )
                print(f"[GPT-OSS] cooldown {cooldown}s before next NEW search")
                time.sleep(cooldown)
            continue

        failure = failure or {
            "category": "unknown_error",
            "summary": "GPT-OSS 搜尋失敗",
            "technical_error": "unknown",
            "http_status": None,
            "attempt_count": 1,
            "retry_count": 0,
            "stop_batch": True,
        }

        if old:
            reused = dict(old)
            reused.update(base)
            reused["research_status"] = "STALE_CACHE"
            reused["research_error"] = str(failure.get("technical_error") or failure.get("summary") or "")[:800]
            reused["failure_type"] = failure.get("category")
            items.append(reused)
            counts["stale_cache"] += 1
        else:
            items.append(error_item(row, failure))
            counts["error"] += 1

        print(
            f"::warning::{symbol} GPT-OSS research failed "
            f"[{failure.get('category')}]: {failure.get('technical_error')}"
        )

        if failure.get("stop_batch"):
            stop_batch = True
            stop_failure = failure
            print(
                f"::warning::GPT-OSS batch stopped after {symbol}; "
                "remaining uncached symbols will NOT call the API this round."
            )

    cache_out = {
        "schema_version": "1.1",
        "ttl_hours": 24,
        "updated_at": iso(current),
        "model": MODEL,
        "api": "groq-chat-completions-v1",
        "pipeline_version": PIPELINE_VERSION,
        "entries": entries,
    }

    items_by_symbol = {
        str(i.get("symbol") or "").upper(): i
        for i in items if i.get("symbol")
    }
    latest = {
        "schema_version": "1.1",
        "model": MODEL,
        "api": "groq-chat-completions-v1",
        "search_mode": "gpt_oss_120b_browser_search",
        "pipeline_version": PIPELINE_VERSION,
        "generated_at": iso(current),
        "snapshot_generated_at": (snapshot.get("batch") or {}).get("generated_at_taiwan"),
        "eligible_states": ["S3", "S0.5", "S1"],
        "cache_ttl_hours": 24,
        "search_delay_seconds": [SEARCH_DELAY_MIN_SECONDS, SEARCH_DELAY_MAX_SECONDS],
        "eligible_count": len(rows),
        "new_search_count": counts["new_search"],
        "cache_hit_count": counts["cache_24h"],
        "stale_cache_count": counts["stale_cache"],
        "error_count": counts["error"],
        "deferred_count": counts["deferred"],
        "skipped_non_company_count": counts["skipped_non_company"],
        "batch_stopped": stop_batch,
        "batch_stop_failure": stop_failure,
        "items": items,
        "items_by_symbol": items_by_symbol,
    }

    write_json(Path(args.out_cache), cache_out)
    write_json(Path(args.out_latest), latest)

    print(json.dumps({
        key: latest[key] for key in [
            "eligible_count",
            "new_search_count",
            "cache_hit_count",
            "stale_cache_count",
            "error_count",
            "deferred_count",
            "skipped_non_company_count",
            "batch_stopped",
        ]
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
