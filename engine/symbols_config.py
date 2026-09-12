"""市場清單設定：考試幣 + R2 動態 Pionex 7×24 美股/RWA 永續合約。"""
from __future__ import annotations

import os
import threading

import requests

from sector_config import RWA_SECTOR_TAGS, pionex_sector_labels_from_tags

R2_US_STOCK_SYMBOLS_PATH = "/api/symbols/us-stock"
EXAM_SYMBOLS = ['BTC',
 
 'SUI',
 'LTC',
 'BOME',
 'PENGU',
 'SHIB',
 'SOL',
 'XLM',
 'XRP',
 'LINK',
 'ETH',
 'PEPE',
 'TAO',
 'BNB',

 'ORDI',
 'ADA',
 'ARB',
 'UNI',
 'DOT',
 'FLOKI',
 'BCH',
 'FIL',
 'AAVE',
 'AVAX',
 'DOGE',
 'ONDO',
 'ATOM',
 'WLD',
 'ETC',
 'OP',
 'PAXG',
]

# 只作為 Worker / R2 暫時不可用時的 last-known-safe fallback。
# 正常美股分析不再使用人工 pending 日期或推算解鎖日。
RWA_FALLBACK_ACTIVE_SYMBOL_MAP = {'AAOIX': 'AAOIX_USDT_PERP',
 'AAPLX': 'AAPLX_USDT_PERP',
 'AAX': 'AAX_USDT_PERP',
 'AMATX': 'AMATX_USDT_PERP',
 'AMDX': 'AMDX_USDT_PERP',
 'AMZNX': 'AMZNX_USDT_PERP',
 'ANTHROPIC': 'ANTHROPIC_USDT_PERP',
 'APPX': 'APPX_USDT_PERP',
 'ARMX': 'ARMX_USDT_PERP',
 'ASMLX': 'ASMLX_USDT_PERP',
 'ASTSX': 'ASTSX_USDT_PERP',
 'AVGOX': 'AVGOX_USDT_PERP',
 'AXTIX': 'AXTIX_USDT_PERP',
 'BEX': 'BEX_USDT_PERP',
 'BMNRX': 'BMNRX_USDT_PERP',
 'BNOX': 'BNOX_USDT_PERP',
 'BRENTOIL': 'BRENTOIL_USDT_PERP',
 'CBRS': 'CBRS_USDT_PERP',
 'CEGX': 'CEGX_USDT_PERP',
 'CF': 'CF_USDT_PERP',
 'CIFRX': 'CIFRX_USDT_PERP',
 'WTI': 'WTI_USDT_PERP',
 'COHRX': 'COHRX_USDT_PERP',
 'COINX': 'COINX_USDT_PERP',
 'COPPER': 'COPPER_USDT_PERP',
 'CPERX': 'CPERX_USDT_PERP',
 'CRCLX': 'CRCLX_USDT_PERP',
 'CRDOX': 'CRDOX_USDT_PERP',
 'CRWVX': 'CRWVX_USDT_PERP',
 'CSCOX': 'CSCOX_USDT_PERP',
 'CVXX': 'CVXX_USDT_PERP',
 'DELLX': 'DELLX_USDT_PERP',
 'DRAMX': 'DRAMX_USDT_PERP',
 'EWJX': 'EWJX_USDT_PERP',
 'EWYX': 'EWYX_USDT_PERP',
 'FLNCX': 'FLNCX_USDT_PERP',
 'GEVX': 'GEVX_USDT_PERP',
 'GLWX': 'GLWX_USDT_PERP',
 'GMEX': 'GMEX_USDT_PERP',
 'GOOGLX': 'GOOGLX_USDT_PERP',
 'GSGX': 'GSGX_USDT_PERP',
 'HIMSX': 'HIMSX_USDT_PERP',
 'HOODX': 'HOODX_USDT_PERP',
 'HPEX': 'HPEX_USDT_PERP',
 'HYUNDAI': 'HYUNDAI_USDT_PERP',
 'IBMX': 'IBMX_USDT_PERP',
 'INTCX': 'INTCX_USDT_PERP',
 'IRENX': 'IRENX_USDT_PERP',
 'LITEX': 'LITEX_USDT_PERP',
 'LLYX': 'LLYX_USDT_PERP',
 'LMTX': 'LMTX_USDT_PERP',
 'LNGX': 'LNGX_USDT_PERP',
 'LRCXX': 'LRCXX_USDT_PERP',
 'METAX': 'METAX_USDT_PERP',
 'MOSX': 'MOSX_USDT_PERP',
 'MPX': 'MPX_USDT_PERP',
 'MRVLX': 'MRVLX_USDT_PERP',
 'MSFTX': 'MSFTX_USDT_PERP',
 'MSTRX': 'MSTRX_USDT_PERP',
 'MUX': 'MUX_USDT_PERP',
 'NATGAS': 'NATGAS_USDT_PERP',
 'NBISX': 'NBISX_USDT_PERP',
 'NFLXX': 'NFLXX_USDT_PERP',
 'NKEX': 'NKEX_USDT_PERP',
 'NOKX': 'NOKX_USDT_PERP',
 'NOWX': 'NOWX_USDT_PERP',
 'NTRX': 'NTRX_USDT_PERP',
 'NVDAX': 'NVDAX_USDT_PERP',
 'OKLOX': 'OKLOX_USDT_PERP',
 'ONDSX': 'ONDSX_USDT_PERP',
 'OPENAI': 'OPENAI_USDT_PERP',
 'ORCLX': 'ORCLX_USDT_PERP',
 'PAYPX': 'PAYPX_USDT_PERP',
 'PLTRX': 'PLTRX_USDT_PERP',
 'QCOMX': 'QCOMX_USDT_PERP',
 'QNTX': 'QNTX_USDT_PERP',
 'QQQX': 'QQQX_USDT_PERP',
 'RGTIX': 'RGTIX_USDT_PERP',
 'RKLBX': 'RKLBX_USDT_PERP',
 'RTXX': 'RTXX_USDT_PERP',
 'SITMX': 'SITMX_USDT_PERP',
 'SKHX': 'SKHX_USDT_PERP',
 'SLVX': 'SLVX_USDT_PERP',
 'SMHX': 'SMHX_USDT_PERP',
 'SMSN': 'SMSN_USDT_PERP',
 'SNDKX': 'SNDKX_USDT_PERP',
 'SOXLX': 'SOXLX_USDT_PERP',
 'SOXXX': 'SOXXX_USDT_PERP',
 'SPCX': 'SPCX_USDT_PERP',
 'SPYX': 'SPYX_USDT_PERP',
 'STXX': 'STXX_USDT_PERP',
 'TQQQX': 'TQQQX_USDT_PERP',
 'TSLAX': 'TSLAX_USDT_PERP',
 'TSMX': 'TSMX_USDT_PERP',
 'TTEX': 'TTEX_USDT_PERP',
 'TXNX': 'TXNX_USDT_PERP',
 'UNGX': 'UNGX_USDT_PERP',
 'UNHX': 'UNHX_USDT_PERP',
 'URAX': 'URAX_USDT_PERP',
 'URNMX': 'URNMX_USDT_PERP',
 'USARX': 'USARX_USDT_PERP',
 'USOX': 'USOX_USDT_PERP',
 'VGKX': 'VGKX_USDT_PERP',
 'WDCX': 'WDCX_USDT_PERP',
 'XAG': 'XAG_USDT_PERP',
 'XAU': 'XAU_USDT_PERP',
 'XPD': 'XPD_USDT_PERP',
 'XPT': 'XPT_USDT_PERP',
 'XYZX': 'XYZX_USDT_PERP'}

# 舊 pending 清單現在只保留為 fallback 對照；不再做日期門禁。
# 正常清單來自 R2；不再用日K根數或日期做放行門檻。
RWA_FALLBACK_EXTRA_SYMBOL_MAP = {'ALABX': 'ALABX_USDT_PERP',
 'KLACX': 'KLACX_USDT_PERP',
 'ONX': 'ONX_USDT_PERP',
 'SKHY': 'SKHY_USDT_PERP',
 'SMCIX': 'SMCIX_USDT_PERP',
 'SNXXX': 'SNXXX_USDT_PERP',
 'VSHX': 'VSHX_USDT_PERP',
 'KIOXIA': 'KIOXIA_USDT_PERP',
 'PANWX': 'PANWX_USDT_PERP',
 'SHAZX': 'SHAZX_USDT_PERP',
 'SOXSX': 'SOXSX_USDT_PERP',
 'XLPX': 'XLPX_USDT_PERP',
 'XLVX': 'XLVX_USDT_PERP'}
RWA_FALLBACK_SYMBOL_MAP = {**RWA_FALLBACK_ACTIVE_SYMBOL_MAP, **RWA_FALLBACK_EXTRA_SYMBOL_MAP}

# 美股完整分析只允許 Pionex 標記為真正 7×24 的合約。
# 這份 whitelist 只用於 R2 / Worker 暫時不可用時的 last-known-safe fallback；
# 正常執行仍以每次分析當下從 R2 讀到的 future_tags / trade_tag 為準。
RWA_FALLBACK_7X24_SYMBOLS = {
    "AAOIX",
    "AAPLX",
    "ALABX",
    "AMATX",
    "AMDX",
    "AMZNX",
    "ANTHROPIC",
    "ARMX",
    "ASMLX",
    "ASTSX",
    "AVGOX",
    "AXTIX",
    "BEX",
    "BMNRX",
    "BRENTOIL",
    "CBRS",
    "COHRX",
    "COINX",
    "COPPER",
    "CRCLX",
    "CRDOX",
    "CRWVX",
    "CSCOX",
    "DELLX",
    "DRAMX",
    "EWJX",
    "EWYX",
    "FLNCX",
    "GLWX",
    "GMEX",
    "GOOGLX",
    "HIMSX",
    "HOODX",
    "HPEX",
    "HYUNDAI",
    "IBMX",
    "INTCX",
    "IRENX",
    "KIOXIA",
    "KLACX",
    "LITEX",
    "LLYX",
    "LRCXX",
    "METAX",
    "MRVLX",
    "MSFTX",
    "MSTRX",
    "MUX",
    "NATGAS",
    "NBISX",
    "NFLXX",
    "NOKX",
    "NOWX",
    "NVDAX",
    "ONDSX",
    "OPENAI",
    "ORCLX",
    "PAYPX",
    "PLTRX",
    "QCOMX",
    "QNTX",
    "QQQX",
    "RKLBX",
    "SHAZX",
    "SKHX",
    "SKHY",
    "SMCIX",
    "SMSN",
    "SNDKX",
    "SNXXX",
    "SOXLX",
    "SOXSX",
    "SPCX",
    "SPYX",
    "STXX",
    "TSLAX",
    "TSMX",
    "URNMX",
    "USARX",
    "WDCX",
    "WTI",
    "XAG",
    "XAU",
    "XPD",
    "XPT",
}

_RUNTIME_RWA_SYMBOL_MAP: dict[str, str] = {}
_RUNTIME_RWA_SECTOR_MAP: dict[str, list[str]] = {}
_RUNTIME_RWA_SOURCE = "fallback-static"
_RUNTIME_LOCK = threading.Lock()


def _normalize_symbol_map(raw: object) -> dict[str, str]:
    if not isinstance(raw, dict):
        return {}
    output: dict[str, str] = {}
    for key, value in raw.items():
        symbol = str(key or "").strip().upper()
        api_symbol = str(value or "").strip().upper()
        if not symbol or not api_symbol.endswith("_USDT_PERP"):
            continue
        output[symbol] = api_symbol
    return output


def _normalize_sector_map(raw: object) -> dict[str, list[str]]:
    if not isinstance(raw, dict):
        return {}
    output: dict[str, list[str]] = {}
    for key, value in raw.items():
        symbol = str(key or "").strip().upper()
        if not symbol:
            continue
        values = value if isinstance(value, list) else [value]
        labels = []
        for item in values:
            label = str(item or "").strip()
            if label and label not in labels:
                labels.append(label)
        if labels:
            output[symbol] = labels
    return output


def _fallback_7x24_symbol_map() -> dict[str, str]:
    """R2 失敗時也只保留 last-known-safe 的 7×24 合約，避免休市標的混回圖表。"""
    return {
        symbol: api_symbol
        for symbol, api_symbol in RWA_FALLBACK_SYMBOL_MAP.items()
        if symbol in RWA_FALLBACK_7X24_SYMBOLS
    }


NON_7X24_TRADE_TAGS = {
    "trade_time_5_24",
    "trade_time_5_7",
    "delayed_open_early_close",
    "korea_trade_time_5_7",
}


def _extract_r2_7x24_symbols(payload: dict) -> set[str]:
    """只保留「純 7×24」標的；任何會休市的交易時段標籤都優先排除。

    Pionex 同一個商品的 raw future_tags 可能同時出現多個交易時段 tag。
    v0.2.02 只要看到 trade_time_7_24 就放行，會讓同時帶 5x7 / 5x24 / delayed
    的商品誤混進分析。這裡改成 exclusion-first：只要存在任何會休市 tag 就拒絕。
    若 R2 已有 trade_tag / trade_tag_map，則以明確的 effective tag 為準。
    """
    allowed: set[str] = set()
    explicit_tags: dict[str, str] = {}

    trade_tag_map = payload.get("trade_tag_map")
    if isinstance(trade_tag_map, dict):
        for raw_symbol, raw_tag in trade_tag_map.items():
            symbol = str(raw_symbol or "").strip().upper()
            tag = str(raw_tag or "").strip()
            if symbol:
                explicit_tags[symbol] = tag
                if tag == "trade_time_7_24":
                    allowed.add(symbol)

    rows = payload.get("active") or payload.get("eligible") or []
    if isinstance(rows, list):
        for row in rows:
            if not isinstance(row, dict):
                continue
            symbol = str(row.get("symbol") or "").strip().upper()
            if not symbol:
                continue

            contract_status = str(row.get("contract_status") or "TRADING").strip().upper()
            if contract_status not in {"", "TRADING"}:
                allowed.discard(symbol)
                continue

            # 明確 effective tag 一旦存在，就不能再被 raw future_tags 重新放行。
            explicit = explicit_tags.get(symbol)
            row_trade_tag = str(row.get("trade_tag") or "").strip()
            if explicit:
                if explicit != "trade_time_7_24":
                    allowed.discard(symbol)
                continue
            if row_trade_tag:
                if row_trade_tag == "trade_time_7_24":
                    allowed.add(symbol)
                else:
                    allowed.discard(symbol)
                continue

            future_tags = {str(tag or "").strip() for tag in (row.get("future_tags") or [])}
            if future_tags & NON_7X24_TRADE_TAGS:
                allowed.discard(symbol)
                continue
            if "trade_time_7_24" in future_tags:
                allowed.add(symbol)

    return allowed


def _derive_sector_map_from_active(payload: dict) -> dict[str, list[str]]:
    """相容舊 R2 JSON：若還沒有 sector_map，從 active 裡保存的 Pionex tags 即時計算。"""
    output: dict[str, list[str]] = {}
    rows = payload.get("active") or payload.get("eligible") or []
    if not isinstance(rows, list):
        return output
    for row in rows:
        if not isinstance(row, dict):
            continue
        symbol = str(row.get("symbol") or "").strip().upper()
        if not symbol:
            continue
        labels = pionex_sector_labels_from_tags(row.get("spot_tags"), row.get("future_tags"))
        if labels:
            output[symbol] = labels
    return output


def _load_r2_symbol_data() -> tuple[dict[str, str], dict[str, list[str]], str]:
    worker = os.environ.get("WORKER_BASE_URL", "").rstrip("/")
    fallback_map = _fallback_7x24_symbol_map()
    if not worker:
        return (
            fallback_map,
            {key: list(value) for key, value in RWA_SECTOR_TAGS.items() if key in fallback_map},
            "fallback-static-7x24:no-worker-url",
        )

    try:
        response = requests.get(
            f"{worker}{R2_US_STOCK_SYMBOLS_PATH}",
            timeout=(5, 15),
            headers={"Accept": "application/json"},
        )
        response.raise_for_status()
        payload = response.json()
        full_symbol_map = _normalize_symbol_map(payload.get("symbol_map"))
        if not full_symbol_map:
            raise ValueError("R2 us-stock symbol_map is empty")

        allowed_7x24 = _extract_r2_7x24_symbols(payload)
        if not allowed_7x24:
            raise ValueError("R2 us-stock list has no trade_time_7_24 metadata")

        # 每次美股分析都在讀取 R2 後重新套用交易時段門禁。
        # 只讓 Pionex trade_time_7_24 進入分析，5x7 / 5x24 / delayed 等會休市標的一律排除。
        symbol_map = {
            symbol: api_symbol
            for symbol, api_symbol in full_symbol_map.items()
            if symbol in allowed_7x24
        }
        if not symbol_map:
            raise ValueError("R2 us-stock 7x24 filter produced an empty symbol_map")

        # v4 直接讀 sector_map；若 R2 還是前一版，active 裡原本就有 spot_tags，
        # 可先動態還原分類，不必等下一次 08:25 才有板塊。
        sector_map = _normalize_sector_map(payload.get("sector_map"))
        if not sector_map:
            sector_map = _derive_sector_map_from_active(payload)
        sector_map = {symbol: labels for symbol, labels in sector_map.items() if symbol in symbol_map}

        generated_at = str(payload.get("generated_at") or payload.get("updated_at") or "unknown")
        source = f"r2:{generated_at}:strict7x24={len(symbol_map)}/{len(full_symbol_map)}"
        return symbol_map, sector_map, source
    except Exception as exc:
        return (
            fallback_map,
            {key: list(value) for key, value in RWA_SECTOR_TAGS.items() if key in fallback_map},
            f"fallback-static-7x24:{type(exc).__name__}",
        )


def refresh_rwa_symbol_map(force: bool = False) -> dict[str, str]:
    global _RUNTIME_RWA_SYMBOL_MAP, _RUNTIME_RWA_SECTOR_MAP, _RUNTIME_RWA_SOURCE
    with _RUNTIME_LOCK:
        if _RUNTIME_RWA_SYMBOL_MAP and not force:
            return dict(_RUNTIME_RWA_SYMBOL_MAP)
        loaded, sectors, source = _load_r2_symbol_data()
        _RUNTIME_RWA_SYMBOL_MAP = loaded
        _RUNTIME_RWA_SECTOR_MAP = sectors
        _RUNTIME_RWA_SOURCE = source
        return dict(_RUNTIME_RWA_SYMBOL_MAP)


def get_rwa_symbol_source() -> str:
    if not _RUNTIME_RWA_SYMBOL_MAP:
        refresh_rwa_symbol_map(force=False)
    return _RUNTIME_RWA_SOURCE


def get_rwa_sector_tags(symbol: str) -> list[str]:
    """美股/RWA 主頁分類：正常情況直接使用每日 R2 的 Pionex 分類。"""
    key = str(symbol or "").strip().upper()
    if not _RUNTIME_RWA_SYMBOL_MAP:
        refresh_rwa_symbol_map(force=False)
    labels = list(_RUNTIME_RWA_SECTOR_MAP.get(key) or [])
    if labels:
        return labels
    # Pionex 本身沒有 sector tag 時顯示「其他」；只有整個 R2 失敗時才會走舊 fallback。
    if _RUNTIME_RWA_SOURCE.startswith("r2:") and key in _RUNTIME_RWA_SYMBOL_MAP:
        return ["其他"]
    return list(RWA_SECTOR_TAGS.get(key, ["未分類"]))


def resolve_api_symbol(symbol: str) -> str:
    """把畫面代碼轉成 Pionex API 真實 symbol。"""
    key = str(symbol).upper()
    runtime = _RUNTIME_RWA_SYMBOL_MAP
    if key in runtime:
        return runtime[key]
    if key in RWA_FALLBACK_SYMBOL_MAP:
        return RWA_FALLBACK_SYMBOL_MAP[key]
    return f"{key}_USDT"


def is_rwa_symbol(symbol: str) -> bool:
    key = str(symbol).upper()
    if key in _RUNTIME_RWA_SYMBOL_MAP:
        return True
    return key in RWA_FALLBACK_SYMBOL_MAP


def get_symbols_config(*, force_reload_rwa: bool = False, load_remote_rwa: bool = True) -> dict[str, list[str]]:
    """主選單固定兩組；美股分析時每次從 R2 讀清單後只保留 trade_time_7_24。"""
    if load_remote_rwa:
        rwa_map = refresh_rwa_symbol_map(force=force_reload_rwa)
    else:
        rwa_map = dict(_RUNTIME_RWA_SYMBOL_MAP or RWA_FALLBACK_SYMBOL_MAP)
    return {
        "考試幣": list(EXAM_SYMBOLS),
        "美股代幣": sorted(rwa_map),
    }


# 相容舊程式的變數名稱，但匯入模組時不做網路請求。
SYMBOLS_CONFIG = {
    "考試幣": list(EXAM_SYMBOLS),
    "美股代幣": sorted(RWA_FALLBACK_SYMBOL_MAP),
}
