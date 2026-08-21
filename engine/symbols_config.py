"""市場清單設定：考試幣 + R2 動態 Pionex 美股/RWA 永續合約。"""
from __future__ import annotations

import os
import threading

import requests

R2_US_STOCK_SYMBOLS_PATH = "/api/symbols/us-stock"
RWA_MIN_DAILY_BARS = 49

EXAM_SYMBOLS = ['BTC',
 '1INCH',
 'RAY',
 'RSR',
 'SUI',
 'KAVA',
 'INJ',
 'LTC',
 'SNX',
 'SUSHI',
 'TRX',
 'ASTER',
 'BOME',
 'JTO',
 'KAS',
 'NEAR',
 'PENGU',
 'SHIB',
 'SOL',
 'XLM',
 'XRP',
 'GMX',
 'RPL',
 'RUNE',
 'LINK',
 'ETH',
 'PEPE',
 'JUP',
 'PENDLE',
 'TAO',
 'KAITO',
 'BNB',
 'CAKE',
 'COMP',
 'ORDI',
 'ADA',
 'ALGO',
 'ARB',
 'UNI',
 'CRV',
 'ENA',
 'MANA',
 'OKB',
 'APT',
 'DOT',
 'FLOKI',
 'HBAR',
 'SEI',
 'STRK',
 'TRUMP',
 'BCH',
 'FIL',
 'LPT',
 'AAVE',
 'AVAX',
 'DOGE',
 'ENJ',
 'ICP',
 'LRC',
 'SAND',
 'STX',
 'VET',
 'ONDO',
 'YFI',
 'ATOM',
 'DYDX',
 'IMX',
 'ROSE',
 'CHZ',
 'GALA',
 'GRT',
 'HYPE',
 'MEME',
 'TIA',
 'W',
 'WLD',
 'ETC',
 'FLR',
 'GLM',
 'POL',
 'PYTH',
 'WIF',
 'BONK',
 'OP',
 'S',
 'PAXG',
 'AXS',
 'EGLD',
 'LDO',
 'ZEC']

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
# 真正 49 根門禁由 us_stock_symbols_sync.py 每次分析前直接向 Pionex K 線 API 驗證。
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

_RUNTIME_RWA_SYMBOL_MAP: dict[str, str] = {}
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


def _load_r2_symbol_map() -> tuple[dict[str, str], str]:
    worker = os.environ.get("WORKER_BASE_URL", "").rstrip("/")
    if not worker:
        return dict(RWA_FALLBACK_SYMBOL_MAP), "fallback-static:no-worker-url"

    try:
        response = requests.get(
            f"{worker}{R2_US_STOCK_SYMBOLS_PATH}",
            timeout=(5, 15),
            headers={"Accept": "application/json"},
        )
        response.raise_for_status()
        payload = response.json()
        symbol_map = _normalize_symbol_map(payload.get("symbol_map"))
        min_bars = int(payload.get("min_daily_bars", 0) or 0)
        if not symbol_map:
            raise ValueError("R2 us-stock symbol_map is empty")
        if min_bars < RWA_MIN_DAILY_BARS:
            raise ValueError(f"R2 min_daily_bars={min_bars} < {RWA_MIN_DAILY_BARS}")
        generated_at = str(payload.get("generated_at") or payload.get("updated_at") or "unknown")
        return symbol_map, f"r2:{generated_at}"
    except Exception as exc:
        return dict(RWA_FALLBACK_SYMBOL_MAP), f"fallback-static:{type(exc).__name__}"


def refresh_rwa_symbol_map(force: bool = False) -> dict[str, str]:
    global _RUNTIME_RWA_SYMBOL_MAP, _RUNTIME_RWA_SOURCE
    with _RUNTIME_LOCK:
        if _RUNTIME_RWA_SYMBOL_MAP and not force:
            return dict(_RUNTIME_RWA_SYMBOL_MAP)
        loaded, source = _load_r2_symbol_map()
        _RUNTIME_RWA_SYMBOL_MAP = loaded
        _RUNTIME_RWA_SOURCE = source
        return dict(_RUNTIME_RWA_SYMBOL_MAP)


def get_rwa_symbol_source() -> str:
    if not _RUNTIME_RWA_SYMBOL_MAP:
        refresh_rwa_symbol_map(force=False)
    return _RUNTIME_RWA_SOURCE


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
    """主選單固定兩組；美股分析時清單正常情況直接來自 R2。"""
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
