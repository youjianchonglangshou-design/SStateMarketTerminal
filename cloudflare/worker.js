
const PIONEX_RWA_CACHE_KEY = "pionex/cache/rwa_trade_rules.json";
const PIONEX_RWA_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const PIONEX_US_STOCK_SYMBOLS_KEY = "pionex/symbols/us_stock_symbols.json";
const SECTOR_FLOW_KEY = "market/us-stock/sector_flow.json";
const MEMO_KEY = "terminal/memos.json";
const MEMO_MAX_ENTRIES = 500;
const MONITOR_WATCHLIST_KEY = "terminal/monitor_watchlist.json";
const MONITOR_UNIVERSE_KEY = "pionex/cache/monitor_universe.json";
const MONITOR_UNIVERSE_TTL_MS = 6 * 60 * 60 * 1000;
const MONITOR_KLINE_TTL_MS = 12 * 60 * 60 * 1000;
const MONITOR_MAX_ITEMS = 500;
const MONITOR_PRICE_ALERTS_KEY = "terminal/monitor_price_alerts.json";
const MONITOR_PRICE_ALERT_MAX = 200;
const MONITOR_FALLBACK_CRYPTO = [
  "BTC","ETH","SOL","BNB","XRP","DOGE","ADA","AVAX","LINK","SUI","TRX","TON","DOT","LTC","BCH","ETC","ATOM","NEAR","ICP","HBAR",
  "AAVE","UNI","INJ","FET","RENDER","TIA","EIGEN","JTO","PYTH","ONDO","WLD","FIL","ARB","OP","STRK","LDO","MKR","ENA","PENDLE","RUNE",
  "KAS","TAO","SEI","APT","IMX","GRT","SAND","MANA","STX","SHIB","PEPE","FLOKI","BONK","WIF","JUP","RAY","MANTA","DYDX","SAGA","REZ",
  "ETHFI","BLUR","TRB","SYRUP","MORPHO","BERA","GRASS","ZRO","IOTA","ALGO","VET","XLM","XMR","ZEC","YFI","SUSHI","YGG","CHZ"
];

// Pionex web endpoints discovered from the live RWA page.
// Device/fingerprint identifiers are intentionally NOT stored in this public Worker.
const PIONEX_WEB_VERSION = "20260819.1657.89e6310";
const PIONEX_WEB_COMMON_QUERY =
  `client_id=pionex_web_${PIONEX_WEB_VERSION}&app_ver=${PIONEX_WEB_VERSION}&os=web&tz_name=Asia%2FTaipei&tz_offset=28800&sys_lang=zh-TW&app_lang=zh-TW`;
const PIONEX_FUTURE_MARKETS_URL =
  `https://www.pionex.com/apis/papi/v1/future_markets/?${PIONEX_WEB_COMMON_QUERY}`;
const PIONEX_SPOT_MARKETS_URL =
  `https://www.pionex.com/apis/papi/v1/spot_markets/?${PIONEX_WEB_COMMON_QUERY}`;
const PIONEX_MARKET_CUSTOMIZED_URL =
  `https://www.pionex.com/apis/menu-api/v1/market_customized?${PIONEX_WEB_COMMON_QUERY}`;

// Embedded fallback captured from Pionex. It is used only if the live Pionex
// internal endpoints are temporarily unavailable and no R2 cache exists.
const PIONEX_RWA_SEED_SYMBOLS = {"AAOIX_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"AAPLX_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"AAX_USDT_PERP":{"trade_tag":"trade_time_5_7","contract_status":"TRADING"},"ALABX_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"AMATX_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"AMDX_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"AMZNX_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"ANTHROPIC_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"APPX_USDT_PERP":{"trade_tag":"trade_time_5_7","contract_status":"TRADING"},"ARMX_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"ASMLX_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"ASTSX_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"AVGOX_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"AXTIX_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"BEX_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"BMNRX_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"BNOX_USDT_PERP":{"trade_tag":"trade_time_5_7","contract_status":"TRADING"},"BRENTOIL_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"CBRS_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"CEGX_USDT_PERP":{"trade_tag":"trade_time_5_7","contract_status":"TRADING"},"CF_USDT_PERP":{"trade_tag":"trade_time_5_7","contract_status":"TRADING"},"CIFRX_USDT_PERP":{"trade_tag":"trade_time_5_7","contract_status":"TRADING"},"WTI_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"COHRX_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"COINX_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"COPPER_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"CPERX_USDT_PERP":{"trade_tag":"trade_time_5_7","contract_status":"TRADING"},"CRCLX_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"CRDOX_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"CRWVX_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"CSCOX_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"CVXX_USDT_PERP":{"trade_tag":"trade_time_5_7","contract_status":"TRADING"},"DELLX_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"DRAMX_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"EWJX_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"EWYX_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"FLNCX_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"GEVX_USDT_PERP":{"trade_tag":"trade_time_5_7","contract_status":"TRADING"},"GLWX_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"GMEX_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"GOOGLX_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"GSGX_USDT_PERP":{"trade_tag":"trade_time_5_7","contract_status":"TRADING"},"HIMSX_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"HOODX_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"HPEX_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"HYUNDAI_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"IBMX_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"INFQX_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"INTCX_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"IRENX_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"KIOXIA_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"KLACX_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"LITEX_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"LLYX_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"LMTX_USDT_PERP":{"trade_tag":"trade_time_5_7","contract_status":"TRADING"},"LNGX_USDT_PERP":{"trade_tag":"trade_time_5_7","contract_status":"TRADING"},"LRCXX_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"METAX_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"MOSX_USDT_PERP":{"trade_tag":"trade_time_5_7","contract_status":"TRADING"},"MPX_USDT_PERP":{"trade_tag":"trade_time_5_7","contract_status":"TRADING"},"MRVLX_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"MSFTX_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"MSTRX_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"MUX_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"NATGAS_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"NBISX_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"NFLXX_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"NKEX_USDT_PERP":{"trade_tag":"trade_time_5_24","contract_status":"TRADING"},"NOKX_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"NOWX_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"NTRX_USDT_PERP":{"trade_tag":"trade_time_5_7","contract_status":"TRADING"},"NVDAX_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"OKLOX_USDT_PERP":{"trade_tag":"delayed_open_early_close","contract_status":"TRADING"},"ONDSX_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"ONX_USDT_PERP":{"trade_tag":"trade_time_5_7","contract_status":"TRADING"},"OPENAI_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"ORCLX_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"PANWX_USDT_PERP":{"trade_tag":"trade_time_5_7","contract_status":"TRADING"},"PAYPX_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"PLTRX_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"QCOMX_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"QNTX_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"QQQX_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"RGTIX_USDT_PERP":{"trade_tag":"delayed_open_early_close","contract_status":"TRADING"},"RKLBX_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"RTXX_USDT_PERP":{"trade_tag":"trade_time_5_7","contract_status":"TRADING"},"SHAZX_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"SITMX_USDT_PERP":{"trade_tag":"trade_time_5_7","contract_status":"TRADING"},"SKHX_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"SKHY_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"SLVX_USDT_PERP":{"trade_tag":"delayed_open_early_close","contract_status":"TRADING"},"SMCIX_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"SMHX_USDT_PERP":{"trade_tag":"trade_time_5_24","contract_status":"TRADING"},"SMSN_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"SNDKX_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"SNXXX_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"SOXLX_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"SOXSX_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"SOXXX_USDT_PERP":{"trade_tag":"delayed_open_early_close","contract_status":"TRADING"},"SPCX_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"SPYX_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"STXX_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"TQQQX_USDT_PERP":{"trade_tag":"trade_time_5_24","contract_status":"TRADING"},"TSLAX_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"TSMX_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"TTEX_USDT_PERP":{"trade_tag":"trade_time_5_7","contract_status":"TRADING"},"TXNX_USDT_PERP":{"trade_tag":"trade_time_5_7","contract_status":"TRADING"},"UNGX_USDT_PERP":{"trade_tag":"trade_time_5_7","contract_status":"TRADING"},"UNHX_USDT_PERP":{"trade_tag":"trade_time_5_7","contract_status":"TRADING"},"URAX_USDT_PERP":{"trade_tag":"trade_time_5_7","contract_status":"TRADING"},"URNMX_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"USARX_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"USDT_QQQX_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"USDT_SPYX_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"USOX_USDT_PERP":{"trade_tag":"trade_time_5_24","contract_status":"TRADING"},"VGKX_USDT_PERP":{"trade_tag":"trade_time_5_7","contract_status":"TRADING"},"VSHX_USDT_PERP":{"trade_tag":"trade_time_5_7","contract_status":"TRADING"},"WDCX_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"XAG_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"XAU_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"XLPX_USDT_PERP":{"trade_tag":"trade_time_5_7","contract_status":"TRADING"},"XLVX_USDT_PERP":{"trade_tag":"trade_time_5_7","contract_status":"TRADING"},"XPD_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"XPT_USDT_PERP":{"trade_tag":"trade_time_7_24","contract_status":"TRADING"},"XYZX_USDT_PERP":{"trade_tag":"trade_time_5_7","contract_status":"TRADING"}};
const PIONEX_RWA_SEED_RULES = {"trade_time_7_24":{"symbol_tag_i18n_key":"7x24"},"trade_time_5_24":{"closed_i18n_key":"trade_time_5_24_close_market","opening_soon_i18n_key":"trade_time_5_24_open_market_soon","trade_time_config":{"tz":"UTC-4","weeks":{"Fri":{"quotation":[{"end":"20:00","start":"00:00"}],"trade":[{"end":"20:00","start":"00:00"}]},"Mon":{"quotation":[{"end":"24:00","start":"00:00"}],"trade":[{"end":"24:00","start":"00:00"}]},"Sat":{"quotation":[],"trade":[]},"Sun":{"quotation":[{"end":"24:00","start":"20:00"}],"trade":[{"end":"24:00","start":"20:00"}]},"Thu":{"quotation":[{"end":"24:00","start":"00:00"}],"trade":[{"end":"24:00","start":"00:00"}]},"Tue":{"quotation":[{"end":"24:00","start":"00:00"}],"trade":[{"end":"24:00","start":"00:00"}]},"Wed":{"quotation":[{"end":"24:00","start":"00:00"}],"trade":[{"end":"24:00","start":"00:00"}]}}}},"trade_time_5_7":{"closed_i18n_key":"trade_time_5_7_close_market","opening_soon_i18n_key":"trade_time_5_7_open_market_soon","trade_time_config":{"tz":"UTC-4","weeks":{"Fri":{"quotation":[{"end":"16:00","start":"09:30"}],"trade":[{"end":"16:00","start":"09:30"}]},"Mon":{"quotation":[{"end":"16:00","start":"09:30"}],"trade":[{"end":"16:00","start":"09:30"}]},"Sat":{"quotation":[],"trade":[]},"Sun":{"quotation":[],"trade":[]},"Thu":{"quotation":[{"end":"16:00","start":"09:30"}],"trade":[{"end":"16:00","start":"09:30"}]},"Tue":{"quotation":[{"end":"16:00","start":"09:30"}],"trade":[{"end":"16:00","start":"09:30"}]},"Wed":{"quotation":[{"end":"16:00","start":"09:30"}],"trade":[{"end":"16:00","start":"09:30"}]}}}},"delayed_open_early_close":{"closed_i18n_key":"delayed_open_early_close_close_market","opening_soon_i18n_key":"delayed_open_early_close_open_market_soon","trade_time_config":{"tz":"UTC-4","weeks":{"Fri":{"quotation":[{"end":"16:00","start":"00:00"}],"trade":[{"end":"16:00","start":"00:00"}]},"Mon":{"quotation":[{"end":"24:00","start":"00:00"}],"trade":[{"end":"24:00","start":"00:00"}]},"Sat":{"quotation":[],"trade":[]},"Sun":{"quotation":[{"end":"24:00","start":"20:30"}],"trade":[{"end":"24:00","start":"20:30"}]},"Thu":{"quotation":[{"end":"24:00","start":"00:00"}],"trade":[{"end":"24:00","start":"00:00"}]},"Tue":{"quotation":[{"end":"24:00","start":"00:00"}],"trade":[{"end":"24:00","start":"00:00"}]},"Wed":{"quotation":[{"end":"24:00","start":"00:00"}],"trade":[{"end":"24:00","start":"00:00"}]}}}},"korea_trade_time_5_7":{"closed_i18n_key":"trade_time_5_7_close_market","opening_soon_i18n_key":"trade_time_5_7_open_market_soon","trade_time_config":{"tz":"UTC-4","weeks":{"Fri":{"quotation":[{"end":"02:20","start":"00:00"}],"trade":[{"end":"02:20","start":"00:00"}]},"Mon":{"quotation":[{"end":"02:20","start":"00:00"},{"end":"24:00","start":"20:00"}],"trade":[{"end":"02:20","start":"00:00"},{"end":"24:00","start":"20:00"}]},"Sat":{"quotation":[],"trade":[]},"Sun":{"quotation":[{"end":"24:00","start":"20:00"}],"trade":[{"end":"24:00","start":"20:00"}]},"Thu":{"quotation":[{"end":"02:20","start":"00:00"},{"end":"24:00","start":"20:00"}],"trade":[{"end":"02:20","start":"00:00"},{"end":"24:00","start":"20:00"}]},"Tue":{"quotation":[{"end":"02:20","start":"00:00"},{"end":"24:00","start":"20:00"}],"trade":[{"end":"02:20","start":"00:00"},{"end":"24:00","start":"20:00"}]},"Wed":{"quotation":[{"end":"02:20","start":"00:00"},{"end":"24:00","start":"20:00"}],"trade":[{"end":"02:20","start":"00:00"},{"end":"24:00","start":"20:00"}]}}}}};

const MARKET = {
  "crypto": { latest: "latest/crypto/snapshot_ai.json", filename: "snapshot_ai.json" },
  "us-stock": { latest: "latest/us-stock/snapshot_us_stock_ai.json", filename: "snapshot_us_stock_ai.json" },
};

const CHAMPION_CHECKPOINT_PREFIX = "runs/champion";
const FOUR_HOUR_MS = 4 * 60 * 60 * 1000;

function checkpointSnapshotKey(dateTw, market) {
  const info = MARKET[market];
  return `${CHAMPION_CHECKPOINT_PREFIX}/${dateTw}_0801/${info.filename}`;
}

// Backward compatibility: checkpoints created before v0.3.15 used the 08:25 suffix.
// Keep them readable so HistoricalTraining can still review the previous days during migration.
function legacyCheckpointSnapshotKey(dateTw, market) {
  const info = MARKET[market];
  return `${CHAMPION_CHECKPOINT_PREFIX}/${dateTw}_0825/${info.filename}`;
}

function taiwanChampionDateFromScheduledTime(scheduledTime) {
  const ms = Number(scheduledTime);
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const utc = new Date(ms);
  // 00:01 UTC = Taiwan 08:01. This is the one formal Champion exam each day.
  if (utc.getUTCHours() !== 0 || utc.getUTCMinutes() !== 1) return "";
  const tw = new Date(ms + 8 * 60 * 60 * 1000);
  const yyyy = tw.getUTCFullYear();
  const mm = String(tw.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(tw.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function isTaiwan0801Slot(scheduledTime) {
  const ms = Number(scheduledTime);
  if (!Number.isFinite(ms) || ms <= 0) return false;
  const utc = new Date(ms);
  return utc.getUTCHours() === 0 && utc.getUTCMinutes() === 1;
}

async function cleanupLegacyRunSnapshots(env) {
  // Normal 4H/manual snapshots are no longer historical storage. Only the
  // daily 08:01 formal Champion checkpoint remains under runs/champion/.
  const staleKeys = [];
  let cursor;
  do {
    const page = await env.JSON_BUCKET.list({ prefix: "runs/", cursor, limit: 1000 });
    for (const obj of page.objects || []) {
      const key = String(obj.key || "");
      if (key.startsWith(`${CHAMPION_CHECKPOINT_PREFIX}/`) && (key.includes("_0801/") || key.includes("_0825/"))) continue;
      if (key.endsWith("/snapshot_ai.json") || key.endsWith("/snapshot_us_stock_ai.json")) {
        staleKeys.push(key);
      }
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  for (let i = 0; i < staleKeys.length; i += 1000) {
    await env.JSON_BUCKET.delete(staleKeys.slice(i, i + 1000));
  }
  return staleKeys.length;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = env.ALLOWED_ORIGIN || "*";
    if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }), origin);

    try {
      if (request.method === "GET" && url.pathname === "/api/health") {
        return json({ ok: true, service: "SStateMarketTerminal", r2: true, tavily_secret: Boolean(env.TAVILY_API_KEY), news_pipeline: RESEARCH_PIPELINE_VERSION }, 200, origin);
      }
      if (request.method === "GET" && url.pathname === "/api/symbols/us-stock") {
        return await objectResponse(env, PIONEX_US_STOCK_SYMBOLS_KEY, origin, false, "us_stock_symbols.json");
      }
      if (request.method === "GET" && url.pathname === "/api/sector-flow") {
        return await objectResponse(env, SECTOR_FLOW_KEY, origin, false, "sector_flow.json");
      }
      if (request.method === "GET" && url.pathname === "/api/market/status") {
        const market = normalizeMarket(url.searchParams.get("market"));
        if (market !== "us-stock") {
          return json({ ok: true, market, source: "not-applicable", statuses: {}, checked_at: new Date().toISOString() }, 200, origin);
        }
        return await pionexRwaMarketStatus(env, origin);
      }
      if (request.method === "GET" && url.pathname === "/api/snapshot") {
        const market = normalizeMarket(url.searchParams.get("market"));
        return await objectResponse(env, MARKET[market].latest, origin, false, MARKET[market].filename);
      }
      if (request.method === "GET" && url.pathname === "/api/monitor/watchlist") {
        const payload = await readMonitorWatchlist(env);
        return json({ ok: true, ...payload }, 200, origin);
      }
      if (request.method === "PUT" && url.pathname === "/api/monitor/watchlist") {
        const body = await request.json().catch(() => ({}));
        const payload = await writeMonitorWatchlist(env, body);
        return json({ ok: true, ...payload }, 200, origin);
      }
      if (request.method === "GET" && url.pathname === "/api/monitor/alerts") {
        const payload = await readMonitorPriceAlerts(env);
        return json({ ok: true, ...payload, telegram_configured: hasTelegramConfig(env) }, 200, origin);
      }
      if (request.method === "POST" && url.pathname === "/api/monitor/alerts") {
        const body = await request.json().catch(() => ({}));
        const payload = await upsertMonitorPriceAlert(env, body);
        return json({ ok: true, ...payload, telegram_configured: hasTelegramConfig(env) }, 200, origin);
      }
      if (request.method === "DELETE" && url.pathname === "/api/monitor/alerts") {
        const body = await request.json().catch(() => ({}));
        const payload = await deleteMonitorPriceAlert(env, body);
        return json({ ok: true, ...payload }, 200, origin);
      }
      if (request.method === "POST" && url.pathname === "/api/monitor/alerts/check") {
        const payload = await checkMonitorPriceAlerts(env, "monitor-page");
        return json({ ok: true, ...payload }, 200, origin);
      }
      if (request.method === "GET" && url.pathname === "/api/monitor/symbols") {
        // IMPORTANT: UI requests never call Pionex common/symbols directly.
        // The full universe is synced to R2 by GitHub Actions; this avoids Cloudflare egress 403/429.
        const payload = await loadMonitorUniverse(env);
        return json({ ok: true, ...payload }, 200, origin);
      }
      if (request.method === "GET" && url.pathname === "/api/monitor/tickers") {
        const type = String(url.searchParams.get("type") || "PERP").toUpperCase();
        if (!['PERP','SPOT'].includes(type)) throw httpError(400,"monitor ticker type must be PERP or SPOT");
        const payload = await loadMonitorTickers(type);
        return json({ ok: true, ...payload }, 200, origin);
      }
      if (request.method === "GET" && url.pathname === "/api/monitor/ws") {
        return await proxyPionexPublicWebSocket(request);
      }
      if (request.method === "GET" && url.pathname === "/api/monitor/klines") {
        const symbol = safeMonitorSymbol(url.searchParams.get("symbol"));
        const interval = safeMonitorInterval(url.searchParams.get("interval") || "1D");
        const limit = safeMonitorLimit(url.searchParams.get("limit") || 180);
        const force = url.searchParams.get("refresh") === "1";
        const payload = await loadMonitorKlines(env, symbol, interval, limit, force);
        return json({ ok: true, ...payload }, 200, origin);
      }
      if (request.method === "GET" && url.pathname === "/api/memos") {
        const payload = await readMemoPayload(env);
        return json({ ok: true, ...payload }, 200, origin);
      }
      if (request.method === "POST" && url.pathname === "/api/memos") {
        const body = await request.json().catch(() => ({}));
        const datetimeTw = safeMemoDatetime(body.datetime_tw || body.datetime);
        const symbol = safeMemoText(body.symbol, 30).toUpperCase();
        const note = safeMemoText(body.note, 1000);
        if (!symbol) throw httpError(400, "memo symbol required");
        if (!note) throw httpError(400, "memo note required");
        const current = await readMemoPayload(env);
        const now = new Date().toISOString();
        const entry = {
          id: crypto.randomUUID(),
          datetime_tw: datetimeTw,
          symbol,
          note,
          created_at: now
        };
        const payload = {
          schema_version: "1.0",
          updated_at: now,
          entries: [entry, ...current.entries].slice(0, MEMO_MAX_ENTRIES)
        };
        await writeMemoPayload(env, payload);
        return json({ ok: true, ...payload, saved: entry }, 200, origin);
      }
      if (request.method === "PUT" && url.pathname === "/api/memos") {
        const body = await request.json().catch(() => ({}));
        const id = safeMemoText(body.id, 80);
        const datetimeTw = safeMemoDatetime(body.datetime_tw || body.datetime);
        const symbol = safeMemoText(body.symbol, 30).toUpperCase();
        const note = safeMemoText(body.note, 1000);
        if (!id) throw httpError(400, "memo id required");
        if (!symbol) throw httpError(400, "memo symbol required");
        if (!note) throw httpError(400, "memo note required");
        const current = await readMemoPayload(env);
        const index = current.entries.findIndex(row => String(row?.id || "") === id);
        if (index < 0) throw httpError(404, "memo not found");
        const now = new Date().toISOString();
        const previous = current.entries[index] || {};
        const updated = {
          ...previous,
          id,
          datetime_tw: datetimeTw,
          symbol,
          note,
          created_at: previous.created_at || now,
          updated_at: now
        };
        const entries = [...current.entries];
        entries[index] = updated;
        const payload = { schema_version: "1.1", updated_at: now, entries };
        await writeMemoPayload(env, payload);
        return json({ ok: true, ...payload, updated }, 200, origin);
      }
      if (request.method === "DELETE" && url.pathname === "/api/memos") {
        const body = await request.json().catch(() => ({}));
        const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).map(x => String(x || "").trim()).filter(Boolean))].slice(0, 100);
        if (!ids.length) throw httpError(400, "memo ids required");
        const remove = new Set(ids);
        const current = await readMemoPayload(env);
        const entries = current.entries.filter(row => !remove.has(String(row?.id || "")));
        const now = new Date().toISOString();
        const payload = { schema_version: "1.0", updated_at: now, entries };
        await writeMemoPayload(env, payload);
        return json({ ok: true, ...payload, deleted: current.entries.length - entries.length }, 200, origin);
      }

      if (request.method === "GET" && url.pathname === "/api/champion/checkpoint") {
        const market = normalizeMarket(url.searchParams.get("market"));
        const dateTw = safeCheckpointDate(url.searchParams.get("date"));
        const key = checkpointSnapshotKey(dateTw, market);
        const current = await env.JSON_BUCKET.get(key);
        if (current) return await objectResponse(env, key, origin, false, MARKET[market].filename);

        // During the 08:25 → 08:01 migration, allow old daily checkpoints to remain readable.
        const legacyKey = legacyCheckpointSnapshotKey(dateTw, market);
        return await objectResponse(env, legacyKey, origin, false, MARKET[market].filename);
      }
      if (request.method === "GET" && url.pathname === "/api/champion/performance") {
        return await objectResponse(env, "champion/performance/latest.json", origin, false, "champion_performance.json");
      }
      if (request.method === "GET" && url.pathname === "/api/champion/ledger/recent") {
        const generation = safeChampionGeneration(url.searchParams.get("generation"));
        const days = safeLedgerDays(url.searchParams.get("days"));
        const symbol = safeOptionalSymbol(url.searchParams.get("symbol"));
        const payload = await readChampionLedgerRows(env, generation, days, symbol);
        return json(payload, 200, origin);
      }
      if (request.method === "GET" && url.pathname === "/api/download") {
        const market = normalizeMarket(url.searchParams.get("market"));
        return await objectResponse(env, MARKET[market].latest, origin, true, MARKET[market].filename);
      }
      if (request.method === "GET" && url.pathname === "/api/model/active") {
        return await objectResponse(env, "models/active/probability_model.json", origin, false, "probability_model.json");
      }
      if (request.method === "GET" && url.pathname === "/api/analysis/status") {
        const runId = safeRunId(url.searchParams.get("run_id"));
        return await objectResponse(env, `runs/${runId}/status.json`, origin, false, "status.json");
      }
      if (request.method === "GET" && url.pathname === "/api/automation/status") {
        const status = await readAutomationStatus(env);
        return json({ ok: true, ...status }, 200, origin);
      }
      if (request.method === "GET" && url.pathname === "/api/research/us-stock/latest") {
        return await objectResponse(env, "research/us-stock/latest.json", origin, false, "us_stock_research_latest.json");
      }
      if (request.method === "GET" && url.pathname === "/api/research/us-stock/cache") {
        return await objectResponse(env, "research/us-stock/cache.json", origin, false, "us_stock_research_cache.json");
      }
      if (request.method === "POST" && url.pathname === "/api/analysis/start") {
        return await startAnalysis(request, env, origin);
      }
      if (request.method === "POST" && url.pathname === "/api/research/us-stock/symbol") {
        return await researchUsStockSymbol(request, env, origin);
      }
      if (request.method === "POST" && url.pathname === "/api/internal/status") {
        requireInternal(request, env);
        const body = await request.json();
        const runId = safeRunId(body.run_id);
        const payload = { ...body, run_id: runId, updated_at: new Date().toISOString() };
        await env.JSON_BUCKET.put(`runs/${runId}/status.json`, JSON.stringify(payload, null, 2), { httpMetadata: { contentType: "application/json; charset=utf-8" } });
        return json({ ok: true }, 200, origin);
      }
      if (request.method === "POST" && url.pathname === "/api/internal/automation/status") {
        requireInternal(request, env);
        const body = await request.json();
        const batchId = safeRunId(body.batch_id);
        const current = await readAutomationStatus(env, { allowStale: true });
        if (current.batch_id && current.batch_id !== batchId && automationBusy(current)) {
          return json({ ok: false, ignored: true, reason: "newer_auto_batch_active", current_batch_id: current.batch_id }, 409, origin);
        }
        const payload = { ...body, batch_id: batchId, source: "AUTO_CRON", updated_at: new Date().toISOString() };
        await writeAutomationStatus(env, payload);
        return json({ ok: true, busy: automationBusy(payload), batch_id: batchId }, 200, origin);
      }
      if (request.method === "PUT" && url.pathname === "/api/internal/symbols/us-stock") {
        requireInternal(request, env);
        const text = await request.text();
        const parsed = JSON.parse(text);
        const symbolMap = parsed?.symbol_map;
        const symbols = parsed?.symbols;
        const klineGate = String(parsed?.kline_gate || "disabled");
        if (!symbolMap || typeof symbolMap !== "object" || Array.isArray(symbolMap)) {
          throw httpError(400, "us-stock symbol_map missing");
        }
        if (!Array.isArray(symbols) || symbols.length === 0) {
          throw httpError(400, "us-stock symbols missing");
        }
        const cleanMap = {};
        for (const [rawKey, rawValue] of Object.entries(symbolMap)) {
          const key = String(rawKey || "").trim().toUpperCase();
          const apiSymbol = String(rawValue || "").trim().toUpperCase();
          if (!/^[A-Z0-9._-]{1,40}$/.test(key)) continue;
          if (!/^[A-Z0-9._-]+_USDT_PERP$/.test(apiSymbol)) continue;
          cleanMap[key] = apiSymbol;
        }
        const cleanSymbols = [...new Set(symbols.map(x => String(x || "").trim().toUpperCase()))]
          .filter(x => cleanMap[x])
          .sort();
        if (!cleanSymbols.length || cleanSymbols.length !== Object.keys(cleanMap).length) {
          throw httpError(400, "us-stock symbols/symbol_map mismatch");
        }
        const payload = {
          ...parsed,
          symbols: cleanSymbols,
          symbol_map: Object.fromEntries(cleanSymbols.map(symbol => [symbol, cleanMap[symbol]])),
          eligible_count: cleanSymbols.length,
          stored_at: new Date().toISOString(),
        };
        const normalized = JSON.stringify(payload, null, 2);
        await env.JSON_BUCKET.put(PIONEX_US_STOCK_SYMBOLS_KEY, normalized, {
          httpMetadata: { contentType: "application/json; charset=utf-8" },
        });
        return json({
          ok: true,
          key: PIONEX_US_STOCK_SYMBOLS_KEY,
          symbols: cleanSymbols.length,
          kline_gate: klineGate,
          generated_at: parsed?.generated_at || null,
        }, 200, origin);
      }
      if (request.method === "POST" && url.pathname === "/api/internal/monitor/klines/status") {
        requireInternal(request, env);
        const body = await request.json().catch(() => ({}));
        const rows = Array.isArray(body?.rows) ? body.rows : [];
        if (!rows.length || rows.length > 100) throw httpError(400, "monitor kline status requires 1-100 rows");
        const maxAgeMsRaw = Number(body?.max_age_ms);
        const maxAgeMs = Number.isFinite(maxAgeMsRaw) && maxAgeMsRaw > 0 ? Math.min(maxAgeMsRaw, 7 * 24 * 60 * 60 * 1000) : MONITOR_KLINE_TTL_MS;
        const now = Date.now();
        const fresh = [];
        const stale = [];
        const missing = [];
        for (const row of rows) {
          try {
            const symbol = safeMonitorSymbol(row?.symbol);
            const interval = safeMonitorInterval(row?.interval || "1D");
            const key = monitorKlineCacheKey(symbol, interval);
            const obj = await env.JSON_BUCKET.get(key);
            if (!obj) { missing.push(symbol); continue; }
            const cached = JSON.parse(await obj.text());
            const count = Array.isArray(cached?.klines) ? cached.klines.length : 0;
            const t = Date.parse(cached?.fetched_at || cached?.stored_at || "");
            const age = Number.isFinite(t) ? now - t : Infinity;
            if (count >= 30 && age >= 0 && age < maxAgeMs) fresh.push(symbol);
            else stale.push(symbol);
          } catch (_) {
            missing.push(String(row?.symbol || ""));
          }
        }
        return json({ok:true,fresh,stale,missing,max_age_ms:maxAgeMs},200,origin);
      }
      if (request.method === "PUT" && url.pathname === "/api/internal/monitor/klines/batch") {
        requireInternal(request, env);
        const body = await request.json().catch(() => ({}));
        const rows = Array.isArray(body?.rows) ? body.rows : [];
        if (!rows.length || rows.length > 50) throw httpError(400, "monitor kline batch must contain 1-50 rows");
        let stored = 0;
        const errors = [];
        for (const row of rows) {
          try {
            const symbol = safeMonitorSymbol(row?.symbol);
            const interval = safeMonitorInterval(row?.interval || "1D");
            const klines = normalizeMonitorKlines(row?.klines);
            if (klines.length < 30) throw new Error(`not enough klines: ${klines.length}`);
            const payload = {
              symbol,
              interval,
              fetched_at: row?.fetched_at || body?.fetched_at || new Date().toISOString(),
              stored_at: new Date().toISOString(),
              source: safeMemoText(row?.source || body?.source || "GitHub Actions → Pionex kline prewarm", 120),
              klines
            };
            await env.JSON_BUCKET.put(monitorKlineCacheKey(symbol, interval), JSON.stringify(payload), {httpMetadata:{contentType:"application/json; charset=utf-8"}});
            stored++;
          } catch (e) {
            errors.push(String(e?.message || e));
          }
        }
        return json({ok:true,stored,failed:errors.length,errors:errors.slice(0,10)},200,origin);
      }
      if (request.method === "PUT" && url.pathname === "/api/internal/monitor/symbols") {
        requireInternal(request, env);
        const body = await request.json().catch(() => ({}));
        const rows = Array.isArray(body?.symbols) ? body.symbols : [];
        const map = new Map();
        for (const row of rows) {
          const type = String(row?.type || "").toUpperCase() === "SPOT" ? "SPOT" : "PERP";
          const clean = monitorUniverseRow(row, type);
          if (!clean) continue;
          map.set(`${clean.type}:${clean.symbol}`, clean);
        }
        const symbols = [...map.values()].sort((a,b)=>a.base.localeCompare(b.base)||a.type.localeCompare(b.type));
        if (!symbols.length) throw httpError(400, "monitor symbols missing");
        const payload = {
          schema_version: "pionex-monitor-universe-v2",
          fetched_at: body?.fetched_at || new Date().toISOString(),
          stored_at: new Date().toISOString(),
          source: safeMemoText(body?.source || "GitHub Actions → Pionex public API", 120),
          symbols,
          errors: Array.isArray(body?.errors) ? body.errors.slice(0,20) : []
        };
        await env.JSON_BUCKET.put(MONITOR_UNIVERSE_KEY, JSON.stringify(payload), {httpMetadata:{contentType:"application/json; charset=utf-8"}});
        return json({ok:true,key:MONITOR_UNIVERSE_KEY,symbols:symbols.length,fetched_at:payload.fetched_at},200,origin);
      }
      if (request.method === "PUT" && url.pathname === "/api/internal/sector-flow") {
        requireInternal(request, env);
        const text = await request.text();
        const parsed = JSON.parse(text);
        if (!parsed || !Array.isArray(parsed.sectors) || parsed.sectors.length !== 11) {
          throw httpError(400, "sector-flow requires exactly 11 sectors");
        }
        const ids = new Set(parsed.sectors.map(x => String(x?.id || "")));
        if (ids.size !== 11 || !parsed.leader || !ids.has(String(parsed.leader))) {
          throw httpError(400, "sector-flow leader/sector ids invalid");
        }
        await env.JSON_BUCKET.put(SECTOR_FLOW_KEY, text, {
          httpMetadata: { contentType: "application/json; charset=utf-8" },
        });
        return json({ ok: true, key: SECTOR_FLOW_KEY, leader: parsed.leader, generated_at_taiwan: parsed.generated_at_taiwan || null }, 200, origin);
      }
      if (request.method === "PUT" && url.pathname === "/api/internal/research/us-stock/cache") {
        requireInternal(request, env);
        const text = await request.text();
        const parsed = JSON.parse(text);
        if (!parsed || typeof parsed !== "object" || typeof parsed.entries !== "object") throw httpError(400, "research cache entries missing");
        await env.JSON_BUCKET.put("research/us-stock/cache.json", text, { httpMetadata: { contentType: "application/json; charset=utf-8" } });
        return json({ ok: true, key: "research/us-stock/cache.json", entries: Object.keys(parsed.entries || {}).length }, 200, origin);
      }
      if (request.method === "PUT" && url.pathname === "/api/internal/research/us-stock/latest") {
        requireInternal(request, env);
        const text = await request.text();
        const parsed = JSON.parse(text);
        if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.items)) throw httpError(400, "research latest items missing");
        await env.JSON_BUCKET.put("research/us-stock/latest.json", text, { httpMetadata: { contentType: "application/json; charset=utf-8" } });
        return json({ ok: true, key: "research/us-stock/latest.json", items: parsed.items.length }, 200, origin);
      }
      if (request.method === "PUT" && url.pathname === "/api/internal/snapshot") {
        requireInternal(request, env);
        const market = normalizeMarket(url.searchParams.get("market"));
        const runId = safeRunId(url.searchParams.get("run_id"));
        const checkpointDateRaw = String(url.searchParams.get("checkpoint_date_tw") || "").trim();
        const checkpointDateTw = checkpointDateRaw ? safeCheckpointDate(checkpointDateRaw) : "";
        const text = await request.text();
        const parsed = JSON.parse(text); // reject broken snapshots before replacing latest
        if (!parsed || !Array.isArray(parsed.records)) throw new Error("snapshot.records missing");
        const latestKey = MARKET[market].latest;
        const metadata = { httpMetadata: { contentType: "application/json; charset=utf-8" } };

        // Every analysis updates latest. Ordinary 4H/manual runs do NOT leave a
        // full historical snapshot in runs/ anymore.
        await env.JSON_BUCKET.put(latestKey, text, metadata);

        let checkpointKey = null;
        let cleanedLegacyRunSnapshots = 0;
        if (checkpointDateTw) {
          checkpointKey = checkpointSnapshotKey(checkpointDateTw, market);
          await env.JSON_BUCKET.put(checkpointKey, text, metadata);
          // One-time/ongoing cleanup: remove the old large run snapshots while
          // preserving status JSON and runs/champion/08:01 formal checkpoints.
          cleanedLegacyRunSnapshots = await cleanupLegacyRunSnapshots(env);
        }

        const status = {
          run_id: runId, market, status: "SUCCESS", percent: 100,
          records: parsed.records.length, snapshot_key: latestKey,
          checkpoint_key: checkpointKey,
          checkpoint_date_tw: checkpointDateTw || null,
          generated_at_taiwan: parsed.batch?.generated_at_taiwan || null,
          updated_at: new Date().toISOString(),
        };
        await env.JSON_BUCKET.put(`runs/${runId}/status.json`, JSON.stringify(status, null, 2), metadata);
        return json({
          ok: true,
          latest_key: latestKey,
          checkpoint_key: checkpointKey,
          checkpoint_date_tw: checkpointDateTw || null,
          cleaned_legacy_run_snapshots: cleanedLegacyRunSnapshots,
          records: parsed.records.length,
        }, 200, origin);
      }
      if (request.method === "GET" && url.pathname === "/api/internal/champion/ledger/export") {
        requireInternal(request, env);
        const generation = safeChampionGeneration(url.searchParams.get("generation"));
        const days = safeLedgerDays(url.searchParams.get("days"));
        const payload = await readChampionLedgerRows(env, generation, days, "");
        return json(payload, 200, origin);
      }
      if (request.method === "PUT" && url.pathname === "/api/internal/champion/ledger/shard") {
        requireInternal(request, env);
        const generation = safeChampionGeneration(url.searchParams.get("generation"));
        const dateTw = safeCheckpointDate(url.searchParams.get("date"));
        const text = await request.text();
        const parsed = JSON.parse(text);
        if (!parsed || !Array.isArray(parsed.records)) throw httpError(400, "champion ledger shard records missing");
        if (Number(parsed.generation || generation) !== generation) throw httpError(400, "champion ledger generation mismatch");
        if (String(parsed.date_tw || dateTw) !== dateTw) throw httpError(400, "champion ledger date mismatch");
        const key = championLedgerShardKey(generation, dateTw);
        await env.JSON_BUCKET.put(key, JSON.stringify({ ...parsed, generation, date_tw:dateTw }, null, 2), {
          httpMetadata: { contentType: "application/json; charset=utf-8" },
        });
        return json({ ok:true, key, generation, date_tw:dateTw, records:parsed.records.length }, 200, origin);
      }
      if (request.method === "PUT" && url.pathname === "/api/internal/champion/performance") {
        requireInternal(request, env);
        const text = await request.text();
        const parsed = JSON.parse(text);
        if (!parsed || typeof parsed !== "object" || !parsed.champion) throw httpError(400, "champion performance payload invalid");
        await env.JSON_BUCKET.put("champion/performance/latest.json", text, {
          httpMetadata: { contentType: "application/json; charset=utf-8" },
        });
        return json({ ok:true, key:"champion/performance/latest.json", generation:parsed.champion?.generation || null }, 200, origin);
      }
      if (request.method === "PUT" && url.pathname === "/api/internal/champion/evolution") {
        requireInternal(request, env);
        const generation = safeChampionGeneration(url.searchParams.get("generation"));
        const kind = String(url.searchParams.get("kind") || "").trim().toLowerCase();
        if (!["review","policy"].includes(kind)) throw httpError(400, "kind must be review or policy");
        const text = await request.text(); JSON.parse(text);
        const key = `champion/evolution/${championGenerationName(generation)}/${kind}.json`;
        await env.JSON_BUCKET.put(key, text, { httpMetadata: { contentType:"application/json; charset=utf-8" } });
        await env.JSON_BUCKET.put(`champion/evolution/latest_${kind}.json`, text, { httpMetadata: { contentType:"application/json; charset=utf-8" } });
        return json({ ok:true, key, generation, kind }, 200, origin);
      }
      if (request.method === "PUT" && url.pathname === "/api/internal/model/active") {
        requireInternal(request, env);
        const text = await request.text();
        const result = await publishActiveModelDirect(env, text, "internal_model_active_put");
        return json({ ok: true, ...result }, 200, origin);
      }
      if (request.method === "GET" && url.pathname === "/api/model/candidate/latest") {
        return await objectResponse(env, "models/candidates/latest.json", origin, false, "candidate_latest.json");
      }
      if (request.method === "GET" && url.pathname === "/api/model/challenger/current") {
        return await objectResponse(env, "models/challenger/current.json", origin, false, "challenger_current.json");
      }
      if (request.method === "GET" && url.pathname === "/api/model/challenger/model") {
        const manifestObj = await env.JSON_BUCKET.get("models/challenger/current.json");
        if (!manifestObj) return json({ error: "challenger_not_assigned" }, 404, origin);
        const manifest = JSON.parse(await manifestObj.text());
        return await objectResponse(env, manifest.candidate_key, origin, false, "challenger_probability_model.json");
      }
      if (request.method === "GET" && url.pathname === "/api/model/evaluation/latest") {
        return await objectResponse(env, "models/evaluations/latest.json", origin, false, "champion_challenger_evaluation.json");
      }
      if (request.method === "GET" && url.pathname === "/api/learning/status") {
        return await objectResponse(env, "learning/latest/status.json", origin, false, "learning_status.json");
      }
      if (request.method === "POST" && url.pathname === "/api/internal/learning/start") {
        requireInternal(request, env);
        const result = await dispatchDailyLearning(env, "manual");
        return json(result, 200, origin);
      }
      if (request.method === "POST" && url.pathname === "/api/internal/learning/status") {
        requireInternal(request, env);
        const body = await request.json();
        const payload = { ...body, updated_at: new Date().toISOString() };
        const metadata = { httpMetadata: { contentType: "application/json; charset=utf-8" } };
        await env.JSON_BUCKET.put("learning/latest/status.json", JSON.stringify(payload, null, 2), metadata);
        if (body.run_id) {
          const runId = safeRunId(String(body.run_id));
          await env.JSON_BUCKET.put(`learning/runs/${runId}/status.json`, JSON.stringify(payload, null, 2), metadata);
        }
        return json({ ok: true }, 200, origin);
      }
      if (request.method === "PUT" && url.pathname === "/api/internal/model/candidate") {
        requireInternal(request, env);
        const text = await request.text();
        const parsed = JSON.parse(text);
        const modelId = safeModelId(parsed?.model_id);
        const metadata = { httpMetadata: { contentType: "application/json; charset=utf-8" } };
        const key = `models/candidates/${modelId}/probability_model.json`;
        await env.JSON_BUCKET.put(key, text, metadata);
        const manifest = {
          model_id: modelId,
          candidate_key: key,
          generated_at: parsed?.generated_at || null,
          schema_version: parsed?.schema_version || null,
          dmi_expert_version: parsed?.dmi_expert_contract?.version || null,
          training: parsed?.training || null,
          uploaded_at: new Date().toISOString(),
          status: "CANDIDATE",
          note: "Candidate only. Active model is not replaced until a later out-of-sample promotion gate approves it."
        };
        await env.JSON_BUCKET.put("models/candidates/latest.json", JSON.stringify(manifest, null, 2), metadata);
        const challenger = await ensureChallenger(env, manifest);
        return json({ ok: true, model_id: modelId, key, manifest_key: "models/candidates/latest.json", challenger }, 200, origin);
      }
      if (request.method === "PUT" && url.pathname === "/api/internal/learning/report") {
        requireInternal(request, env);
        const modelId = safeModelId(url.searchParams.get("model_id"));
        const text = await request.text(); JSON.parse(text);
        const key = `models/candidates/${modelId}/training_report.json`;
        await env.JSON_BUCKET.put(key, text, { httpMetadata: { contentType: "application/json; charset=utf-8" } });
        return json({ ok: true, key }, 200, origin);
      }
      if (request.method === "PUT" && url.pathname === "/api/internal/learning/meta") {
        requireInternal(request, env);
        const modelId = safeModelId(url.searchParams.get("model_id"));
        const text = await request.text(); JSON.parse(text);
        const key = `models/candidates/${modelId}/learning_meta.json`;
        await env.JSON_BUCKET.put(key, text, { httpMetadata: { contentType: "application/json; charset=utf-8" } });
        return json({ ok: true, key }, 200, origin);
      }
      if (request.method === "POST" && url.pathname === "/api/internal/model/challenger/ensure") {
        requireInternal(request, env);
        const result = await ensureChallenger(env, null);
        return json({ ok: true, challenger: result }, 200, origin);
      }
      if (request.method === "PUT" && url.pathname === "/api/internal/model/evaluation") {
        requireInternal(request, env);
        const modelId = safeModelId(url.searchParams.get("model_id"));
        const bodyText = await request.text();
        const evaluation = JSON.parse(bodyText);
        if (String(evaluation?.challenger_model_id || "") !== modelId) throw httpError(400, "evaluation challenger_model_id mismatch");
        const metadata = { httpMetadata: { contentType: "application/json; charset=utf-8" } };
        const key = `models/candidates/${modelId}/evaluation.json`;
        const latest = { ...evaluation, evaluation_key: key };
        await Promise.all([
          env.JSON_BUCKET.put(key, JSON.stringify(latest, null, 2), metadata),
          env.JSON_BUCKET.put("models/evaluations/latest.json", JSON.stringify(latest, null, 2), metadata),
        ]);
        const currentObj = await env.JSON_BUCKET.get("models/challenger/current.json");
        if (currentObj) {
          const current = JSON.parse(await currentObj.text());
          if (current.model_id === modelId) {
            current.latest_evaluation_key = key;
            current.latest_decision = evaluation.decision || null;
            current.latest_evaluated_at = evaluation.evaluated_at || new Date().toISOString();
            await env.JSON_BUCKET.put("models/challenger/current.json", JSON.stringify(current, null, 2), metadata);
          }
        }
        return json({ ok: true, key, decision: evaluation.decision || null }, 200, origin);
      }
      if (request.method === "POST" && url.pathname === "/api/internal/model/promote") {
        requireInternal(request, env);
        const body = await request.json();
        const modelId = safeModelId(body.model_id);
        const result = await promoteChallenger(env, modelId);
        return json({ ok: true, ...result }, 200, origin);
      }
      if (request.method === "POST" && url.pathname === "/api/internal/model/reject") {
        requireInternal(request, env);
        const body = await request.json();
        const modelId = safeModelId(body.model_id);
        const result = await rejectChallenger(env, modelId);
        return json({ ok: true, ...result }, 200, origin);
      }
      return json({ error: "not_found" }, 404, origin);
    } catch (error) {
      const status = error?.status || 500;
      return json({ error: error?.message || String(error) }, status, origin);
    }
  },

  async scheduled(controller, env, ctx) {
    const source = `cron:${controller.cron}`;
    // Price alerts: Cloudflare's minimum cron interval is one minute.
    // The monitor page also calls the same checker while it is open, so live pages react faster.
    if (controller.cron === "* * * * *") {
      ctx.waitUntil(checkMonitorPriceAlerts(env, source));
      return;
    }
    if (controller.cron === "1 */4 * * *") {
      // 台灣時間每 4 小時：00:01 / 04:01 / 08:01 / 12:01 / 16:01 / 20:01。
      // 其中 08:01 是每日正式 Champion 批次：Crypto + 美股完成後觸發 HistoricalTraining。
      if (isTaiwan0801Slot(controller.scheduledTime)) {
        const checkpointDateTw = taiwanChampionDateFromScheduledTime(controller.scheduledTime);
        ctx.waitUntil(dispatchAutoBatch(env, "pair", source, checkpointDateTw, true));
        // 原本掛在 08:25 的美股/RWA 清單同步一併搬到 08:01，避免額外 Cron。
        ctx.waitUntil(dispatchUsStockSymbolSync(env, source));
        return;
      }
      ctx.waitUntil(dispatchAutoBatch(env, "pair", source, "", false));
      return;
    }
    if (controller.cron === "31 13 * * *") {
      // 台灣 21:31：單純美股完整分析 + 板塊資金羅盤；不觸發 HistoricalTraining。
      ctx.waitUntil(dispatchAutoBatch(env, "us-stock-only", source, "", false));
      ctx.waitUntil(dispatchSectorFlow(env, source));
      return;
    }
    console.log(`Unhandled cron trigger: ${controller.cron}`);
  }
};



function pionexEffectiveTradeTag(tags, rules) {
  const set = new Set(Array.isArray(tags) ? tags : []);
  const priority = [
    "trade_time_7_24",
    "trade_time_5_24",
    "trade_time_5_7",
    "delayed_open_early_close",
    "korea_trade_time_5_7",
  ];
  for (const tag of priority) {
    if (set.has(tag) && (tag === "trade_time_7_24" || rules?.[tag])) return tag;
  }
  return null;
}

function compactPionexRwaRules(futurePayload, menuPayload) {
  const rows = Array.isArray(futurePayload?.data) ? futurePayload.data : [];
  const rules = menuPayload?.data?.tag_rules || {};
  const symbols = {};

  for (const row of rows) {
    const tags = Array.isArray(row?.tags) ? row.tags : [];
    if (!tags.includes("us_token_contract")) continue;
    const displaySymbol = String(row?.display_symbol || "").trim();
    if (!displaySymbol) continue;

    symbols[displaySymbol] = {
      trade_tag: pionexEffectiveTradeTag(tags, rules),
      contract_status: String(row?.status || "").toUpperCase() || "UNKNOWN",
    };
  }

  const compactRules = {};
  for (const tag of [
    "trade_time_7_24",
    "trade_time_5_24",
    "trade_time_5_7",
    "delayed_open_early_close",
    "korea_trade_time_5_7",
  ]) {
    if (!rules?.[tag]) continue;
    const src = rules[tag];
    if (tag === "trade_time_7_24") {
      compactRules[tag] = { symbol_tag_i18n_key: src?.symbol_tag_i18n_key || "7x24" };
    } else if (src?.trade_time_config) {
      compactRules[tag] = {
        closed_i18n_key: src?.closed_i18n_key || "",
        opening_soon_i18n_key: src?.opening_soon_i18n_key || "",
        trade_time_config: src.trade_time_config,
      };
    }
  }

  if (!Object.keys(symbols).length) throw httpError(502, "Pionex future_markets returned no us_token_contract symbols");
  return { symbols, rules: compactRules };
}

async function fetchPionexWebJson(url) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Accept": "application/json",
      "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.7",
    },
  });
  if (!response.ok) throw httpError(502, `Pionex web API failed: ${response.status}`);
  const payload = await response.json();
  if (Number(payload?.code) !== 0) {
    throw httpError(502, `Pionex web API error: ${payload?.reason || payload?.message || payload?.code}`);
  }
  return payload;
}

async function refreshPionexRwaRules(env) {
  // Deliberately sequential: this data changes slowly and there is no reason
  // to burst two requests at Pionex at the same instant.
  const futurePayload = await fetchPionexWebJson(PIONEX_FUTURE_MARKETS_URL);
  const menuPayload = await fetchPionexWebJson(PIONEX_MARKET_CUSTOMIZED_URL);
  const compact = compactPionexRwaRules(futurePayload, menuPayload);

  const cache = {
    fetched_at: new Date().toISOString(),
    source: "Pionex future_markets + market_customized",
    ...compact,
  };

  await env.JSON_BUCKET.put(
    PIONEX_RWA_CACHE_KEY,
    JSON.stringify(cache),
    { httpMetadata: { contentType: "application/json; charset=utf-8" } }
  );
  return { ...cache, cache_state: "REFRESHED" };
}

async function loadPionexRwaRules(env) {
  let cached = null;
  try {
    const obj = await env.JSON_BUCKET.get(PIONEX_RWA_CACHE_KEY);
    if (obj) cached = JSON.parse(await obj.text());
  } catch (_) {}

  if (cached?.fetched_at) {
    const age = Date.now() - new Date(cached.fetched_at).getTime();
    if (Number.isFinite(age) && age >= 0 && age < PIONEX_RWA_CACHE_TTL_MS) {
      return { ...cached, cache_state: "R2_FRESH" };
    }
  }

  try {
    return await refreshPionexRwaRules(env);
  } catch (error) {
    if (cached?.symbols && cached?.rules) {
      return {
        ...cached,
        cache_state: "R2_STALE",
        refresh_error: error?.message || String(error),
      };
    }

    return {
      fetched_at: null,
      source: "embedded Pionex fallback",
      cache_state: "EMBEDDED_FALLBACK",
      refresh_error: error?.message || String(error),
      symbols: PIONEX_RWA_SEED_SYMBOLS,
      rules: PIONEX_RWA_SEED_RULES,
    };
  }
}

function parseUtcOffsetMinutes(tz) {
  const match = /^UTC([+-])(\d{1,2})(?::(\d{2}))?$/.exec(String(tz || "").trim());
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2] || 0);
  const minutes = Number(match[3] || 0);
  return sign * (hours * 60 + minutes);
}

function hhmmToMinute(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || ""));
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h === 24 && m === 0) return 1440;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

function evaluatePionexTradeRule(rule, now = new Date()) {
  const config = rule?.trade_time_config;
  if (!config?.weeks) return false;

  const offsetMinutes = parseUtcOffsetMinutes(config.tz);
  const shifted = new Date(now.getTime() + offsetMinutes * 60_000);
  const weekday = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][shifted.getUTCDay()];
  const minute = shifted.getUTCHours() * 60 + shifted.getUTCMinutes();

  const day = config.weeks?.[weekday];
  const intervals = Array.isArray(day?.trade) ? day.trade : [];

  for (const interval of intervals) {
    const start = hhmmToMinute(interval?.start);
    const end = hhmmToMinute(interval?.end);
    if (start == null || end == null) continue;
    if (minute >= start && minute < end) return true;
  }
  return false;
}

function evaluatePionexSymbol(symbolInfo, rules, now = new Date()) {
  const contractStatus = String(symbolInfo?.contract_status || "").toUpperCase();
  const tradeTag = String(symbolInfo?.trade_tag || "");

  if (contractStatus && contractStatus !== "TRADING") {
    return { status: "OFFLINE", label: "停用", trade_tag: tradeTag, contract_status: contractStatus };
  }

  if (tradeTag === "trade_time_7_24") {
    return { status: "ALWAYS_OPEN", label: "7×24", trade_tag: tradeTag, contract_status: contractStatus || "TRADING" };
  }

  const rule = rules?.[tradeTag];
  if (rule?.trade_time_config) {
    const open = evaluatePionexTradeRule(rule, now);
    return {
      status: open ? "OPEN" : "CLOSED",
      label: open ? "交易中" : "休市",
      trade_tag: tradeTag,
      contract_status: contractStatus || "TRADING",
      rule_tz: rule.trade_time_config.tz || null,
    };
  }

  return {
    status: "UNKNOWN",
    label: "狀態未知",
    trade_tag: tradeTag || null,
    contract_status: contractStatus || "UNKNOWN",
  };
}

async function pionexRwaMarketStatus(env, origin) {
  const data = await loadPionexRwaRules(env);
  const now = new Date();
  const statuses = {};
  const counts = { always_open: 0, open: 0, closed: 0, offline: 0, unknown: 0 };

  for (const [displaySymbol, info] of Object.entries(data.symbols || {})) {
    const result = evaluatePionexSymbol(info, data.rules || {}, now);
    statuses[displaySymbol] = result;

    if (result.status === "ALWAYS_OPEN") counts.always_open += 1;
    else if (result.status === "OPEN") counts.open += 1;
    else if (result.status === "CLOSED") counts.closed += 1;
    else if (result.status === "OFFLINE") counts.offline += 1;
    else counts.unknown += 1;
  }

  return json({
    ok: true,
    market: "us-stock",
    source: data.source,
    cache_state: data.cache_state,
    upstream_fetched_at: data.fetched_at || null,
    refresh_error: data.refresh_error || null,
    checked_at: now.toISOString(),
    counts,
    statuses,
  }, 200, origin);
}

async function startAnalysis(request, env, origin) {
  const body = await request.json().catch(() => ({}));
  const market = normalizeMarket(body.market);
  const auto = await readAutomationStatus(env);
  if (automationBusy(auto)) {
    throw httpError(409, `自動排程分析進行中（${automationPhaseLabel(auto)}），目前完整分析已鎖定`);
  }
  const runId = `${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0,14)}_${market}_${crypto.randomUUID().slice(0,8)}`;
  const initial = { run_id: runId, market, status: "QUEUED", percent: 0, message: "等待 GitHub Actions", created_at: new Date().toISOString() };
  await env.JSON_BUCKET.put(`runs/${runId}/status.json`, JSON.stringify(initial, null, 2), { httpMetadata: { contentType: "application/json; charset=utf-8" } });

  if (!env.GITHUB_TOKEN || !env.GITHUB_REPOSITORY) throw httpError(500, "Worker 缺少 GITHUB_TOKEN 或 GITHUB_REPOSITORY");
  const endpoint = `https://api.github.com/repos/${env.GITHUB_REPOSITORY}/actions/workflows/full-analysis.yml/dispatches`;
  const gh = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
      "X-GitHub-Api-Version": "2026-03-10",
      "User-Agent": "SStateMarketTerminal-Worker",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref: env.GITHUB_BRANCH || "main", inputs: { market, run_id: runId } }),
  });
  if (!gh.ok) {
    const text = await gh.text();
    await env.JSON_BUCKET.put(`runs/${runId}/status.json`, JSON.stringify({ ...initial, status: "FAILED", message: `GitHub dispatch ${gh.status}: ${text}` }, null, 2));
    throw httpError(502, `GitHub workflow_dispatch 失敗：${gh.status}`);
  }
  let dispatch = null;
  try { dispatch = await gh.json(); } catch (_) {}
  return json({ ok: true, run_id: runId, market, github_run_id: dispatch?.workflow_run_id || null, github_run_url: dispatch?.html_url || null }, 200, origin);
}

const RESEARCH_PROVIDER = "Tavily Search + Answer";
const RESEARCH_PIPELINE_VERSION = "tavily-answer-direct-zhtw-v9-asset-identity";
const RESEARCH_CACHE_KEY = "research/us-stock/cache.json";
const RESEARCH_LATEST_KEY = "research/us-stock/latest.json";
const RESEARCH_TTL_MS = 24 * 60 * 60 * 1000;
const RESEARCH_ELIGIBLE_STATES = new Set(["S3", "S0.5", "S1"]);

// Generated from engine/us_stock_aliases.py.
// Exact Pionex-symbol identity wins over suffix-X guessing and legacy overrides.
// This is the live Cloudflare Worker copy used by Tavily news research.
const RESEARCH_ASSET_IDENTITIES = {
  "AAOIX": {
    "ticker": "AAOI",
    "exchange": "NASDAQ",
    "qualified_ticker": "NASDAQ:AAOI",
    "name_en": "Applied Optoelectronics, Inc.",
    "name_zh": "應用光電",
    "asset_type": "public_company",
    "aliases": [
      "Applied Optoelectronics",
      "應用光電",
      "NASDAQ:AAOI"
    ]
  },
  "AAPLX": {
    "ticker": "AAPL",
    "exchange": "NASDAQ",
    "qualified_ticker": "NASDAQ:AAPL",
    "name_en": "Apple Inc.",
    "name_zh": "蘋果",
    "asset_type": "public_company",
    "aliases": [
      "Apple",
      "蘋果公司",
      "NASDAQ:AAPL"
    ]
  },
  "AAX": {
    "ticker": "AA",
    "exchange": "NYSE",
    "qualified_ticker": "NYSE:AA",
    "name_en": "Alcoa Corporation",
    "name_zh": "美國鋁業",
    "asset_type": "public_company",
    "aliases": [
      "Alcoa",
      "美國鋁業",
      "NYSE:AA"
    ]
  },
  "AMATX": {
    "ticker": "AMAT",
    "exchange": "NASDAQ",
    "qualified_ticker": "NASDAQ:AMAT",
    "name_en": "Applied Materials, Inc.",
    "name_zh": "應用材料",
    "asset_type": "public_company",
    "aliases": [
      "Applied Materials",
      "應用材料",
      "NASDAQ:AMAT"
    ]
  },
  "AMDX": {
    "ticker": "AMD",
    "exchange": "NASDAQ",
    "qualified_ticker": "NASDAQ:AMD",
    "name_en": "Advanced Micro Devices, Inc.",
    "name_zh": "超微半導體",
    "asset_type": "public_company",
    "aliases": [
      "AMD",
      "Advanced Micro Devices",
      "超微",
      "超微半導體",
      "NASDAQ:AMD"
    ]
  },
  "AMZNX": {
    "ticker": "AMZN",
    "exchange": "NASDAQ",
    "qualified_ticker": "NASDAQ:AMZN",
    "name_en": "Amazon.com, Inc.",
    "name_zh": "亞馬遜",
    "asset_type": "public_company",
    "aliases": [
      "Amazon",
      "Amazon.com",
      "亞馬遜",
      "NASDAQ:AMZN"
    ]
  },
  "ANTHROPIC": {
    "ticker": "ANTHROPIC",
    "exchange": "PRIVATE",
    "qualified_ticker": "PRIVATE:ANTHROPIC",
    "name_en": "Anthropic PBC",
    "name_zh": "Anthropic（Claude 開發商）",
    "asset_type": "private_company",
    "aliases": [
      "Anthropic",
      "Claude",
      "Anthropic PBC"
    ]
  },
  "APPX": {
    "ticker": "APP",
    "exchange": "NASDAQ",
    "qualified_ticker": "NASDAQ:APP",
    "name_en": "AppLovin Corporation",
    "name_zh": "AppLovin",
    "asset_type": "public_company",
    "aliases": [
      "AppLovin",
      "NASDAQ:APP"
    ]
  },
  "ARMX": {
    "ticker": "ARM",
    "exchange": "NASDAQ",
    "qualified_ticker": "NASDAQ:ARM",
    "name_en": "Arm Holdings plc",
    "name_zh": "安謀控股",
    "asset_type": "public_company",
    "aliases": [
      "Arm",
      "Arm Holdings",
      "安謀",
      "NASDAQ:ARM"
    ]
  },
  "ASMLX": {
    "ticker": "ASML",
    "exchange": "NASDAQ",
    "qualified_ticker": "NASDAQ:ASML",
    "name_en": "ASML Holding N.V.",
    "name_zh": "艾司摩爾",
    "asset_type": "public_company",
    "aliases": [
      "ASML",
      "ASML Holding",
      "艾司摩爾",
      "NASDAQ:ASML"
    ]
  },
  "ASTSX": {
    "ticker": "ASTS",
    "exchange": "NASDAQ",
    "qualified_ticker": "NASDAQ:ASTS",
    "name_en": "AST SpaceMobile, Inc.",
    "name_zh": "AST SpaceMobile",
    "asset_type": "public_company",
    "aliases": [
      "AST SpaceMobile",
      "NASDAQ:ASTS"
    ]
  },
  "AVGOX": {
    "ticker": "AVGO",
    "exchange": "NASDAQ",
    "qualified_ticker": "NASDAQ:AVGO",
    "name_en": "Broadcom Inc.",
    "name_zh": "博通",
    "asset_type": "public_company",
    "aliases": [
      "Broadcom",
      "博通",
      "NASDAQ:AVGO"
    ]
  },
  "AXTIX": {
    "ticker": "AXTI",
    "exchange": "NASDAQ",
    "qualified_ticker": "NASDAQ:AXTI",
    "name_en": "AXT, Inc.",
    "name_zh": "AXT",
    "asset_type": "public_company",
    "aliases": [
      "AXT Inc",
      "NASDAQ:AXTI"
    ]
  },
  "BEX": {
    "ticker": "BE",
    "exchange": "NYSE",
    "qualified_ticker": "NYSE:BE",
    "name_en": "Bloom Energy Corporation",
    "name_zh": "Bloom Energy",
    "asset_type": "public_company",
    "aliases": [
      "Bloom Energy",
      "NYSE:BE"
    ]
  },
  "BMNRX": {
    "ticker": "BMNR",
    "exchange": "NYSEAMERICAN",
    "qualified_ticker": "NYSEAMERICAN:BMNR",
    "name_en": "BitMine Immersion Technologies, Inc.",
    "name_zh": "BitMine Immersion Technologies",
    "asset_type": "public_company",
    "aliases": [
      "BitMine",
      "BitMine Immersion Technologies",
      "BMNR"
    ]
  },
  "BNOX": {
    "ticker": "BNO",
    "exchange": "NYSEARCA",
    "qualified_ticker": "NYSEARCA:BNO",
    "name_en": "United States Brent Oil Fund, LP",
    "name_zh": "美國布蘭特原油基金",
    "asset_type": "etf",
    "aliases": [
      "United States Brent Oil Fund",
      "Brent Oil ETF",
      "布蘭特原油 ETF",
      "NYSEARCA:BNO"
    ]
  },
  "BRENTOIL": {
    "ticker": "BRENT",
    "exchange": "COMMODITY",
    "qualified_ticker": "COMMODITY:BRENT",
    "name_en": "Brent Crude Oil",
    "name_zh": "布蘭特原油",
    "asset_type": "commodity",
    "aliases": [
      "Brent crude",
      "Brent oil",
      "布蘭特原油"
    ]
  },
  "CBRS": {
    "ticker": "CBRS",
    "exchange": "NASDAQ",
    "qualified_ticker": "NASDAQ:CBRS",
    "name_en": "Cerebras Systems, Inc.",
    "name_zh": "Cerebras Systems",
    "asset_type": "public_company",
    "aliases": [
      "Cerebras",
      "Cerebras Systems",
      "NASDAQ:CBRS"
    ]
  },
  "CEGX": {
    "ticker": "CEG",
    "exchange": "NASDAQ",
    "qualified_ticker": "NASDAQ:CEG",
    "name_en": "Constellation Energy Corporation",
    "name_zh": "Constellation Energy／星座能源",
    "asset_type": "public_company",
    "aliases": [
      "Constellation Energy",
      "星座能源",
      "NASDAQ:CEG"
    ]
  },
  "CF": {
    "ticker": "CF",
    "exchange": "NYSE",
    "qualified_ticker": "NYSE:CF",
    "name_en": "CF Industries Holdings, Inc.",
    "name_zh": "CF Industries",
    "asset_type": "public_company",
    "aliases": [
      "CF Industries",
      "NYSE:CF"
    ]
  },
  "CIFRX": {
    "ticker": "CIFR",
    "exchange": "NASDAQ",
    "qualified_ticker": "NASDAQ:CIFR",
    "name_en": "Cipher Mining Inc.",
    "name_zh": "Cipher Mining",
    "asset_type": "public_company",
    "aliases": [
      "Cipher Mining",
      "NASDAQ:CIFR"
    ]
  },
  "WTI": {
    "ticker": "WTI",
    "exchange": "COMMODITY",
    "qualified_ticker": "COMMODITY:WTI",
    "name_en": "West Texas Intermediate Crude Oil",
    "name_zh": "西德州中質原油",
    "asset_type": "commodity",
    "aliases": [
      "WTI crude oil",
      "West Texas Intermediate",
      "西德州原油"
    ]
  },
  "COHRX": {
    "ticker": "COHR",
    "exchange": "NYSE",
    "qualified_ticker": "NYSE:COHR",
    "name_en": "Coherent Corp.",
    "name_zh": "Coherent／高意",
    "asset_type": "public_company",
    "aliases": [
      "Coherent Corp",
      "Coherent",
      "高意",
      "NYSE:COHR"
    ]
  },
  "COINX": {
    "ticker": "COIN",
    "exchange": "NASDAQ",
    "qualified_ticker": "NASDAQ:COIN",
    "name_en": "Coinbase Global, Inc.",
    "name_zh": "Coinbase",
    "asset_type": "public_company",
    "aliases": [
      "Coinbase",
      "Coinbase Global",
      "NASDAQ:COIN"
    ]
  },
  "COPPER": {
    "ticker": "COPPER",
    "exchange": "COMMODITY",
    "qualified_ticker": "COMMODITY:COPPER",
    "name_en": "Copper",
    "name_zh": "銅",
    "asset_type": "commodity",
    "aliases": [
      "Copper futures",
      "COMEX copper",
      "銅"
    ]
  },
  "CPERX": {
    "ticker": "CPER",
    "exchange": "NYSEARCA",
    "qualified_ticker": "NYSEARCA:CPER",
    "name_en": "United States Copper Index Fund",
    "name_zh": "美國銅指數基金",
    "asset_type": "etf",
    "aliases": [
      "United States Copper Index Fund",
      "Copper ETF",
      "銅 ETF",
      "NYSEARCA:CPER"
    ]
  },
  "CRCLX": {
    "ticker": "CRCL",
    "exchange": "NYSE",
    "qualified_ticker": "NYSE:CRCL",
    "name_en": "Circle Internet Group, Inc.",
    "name_zh": "Circle",
    "asset_type": "public_company",
    "aliases": [
      "Circle",
      "Circle Internet Group",
      "NYSE:CRCL"
    ]
  },
  "CRDOX": {
    "ticker": "CRDO",
    "exchange": "NASDAQ",
    "qualified_ticker": "NASDAQ:CRDO",
    "name_en": "Credo Technology Group Holding Ltd",
    "name_zh": "Credo Technology",
    "asset_type": "public_company",
    "aliases": [
      "Credo",
      "Credo Technology",
      "NASDAQ:CRDO"
    ]
  },
  "CRWVX": {
    "ticker": "CRWV",
    "exchange": "NASDAQ",
    "qualified_ticker": "NASDAQ:CRWV",
    "name_en": "CoreWeave, Inc.",
    "name_zh": "CoreWeave",
    "asset_type": "public_company",
    "aliases": [
      "CoreWeave",
      "NASDAQ:CRWV"
    ]
  },
  "CSCOX": {
    "ticker": "CSCO",
    "exchange": "NASDAQ",
    "qualified_ticker": "NASDAQ:CSCO",
    "name_en": "Cisco Systems, Inc.",
    "name_zh": "思科",
    "asset_type": "public_company",
    "aliases": [
      "Cisco",
      "Cisco Systems",
      "思科",
      "NASDAQ:CSCO"
    ]
  },
  "CVXX": {
    "ticker": "CVX",
    "exchange": "NYSE",
    "qualified_ticker": "NYSE:CVX",
    "name_en": "Chevron Corporation",
    "name_zh": "雪佛龍",
    "asset_type": "public_company",
    "aliases": [
      "Chevron",
      "雪佛龍",
      "NYSE:CVX"
    ]
  },
  "DELLX": {
    "ticker": "DELL",
    "exchange": "NYSE",
    "qualified_ticker": "NYSE:DELL",
    "name_en": "Dell Technologies Inc.",
    "name_zh": "戴爾科技",
    "asset_type": "public_company",
    "aliases": [
      "Dell",
      "Dell Technologies",
      "戴爾",
      "NYSE:DELL"
    ]
  },
  "DRAMX": {
    "ticker": "DRAM",
    "exchange": "CBOE",
    "qualified_ticker": "CBOE:DRAM",
    "name_en": "Roundhill Memory ETF",
    "name_zh": "Roundhill 記憶體 ETF",
    "asset_type": "etf",
    "aliases": [
      "Roundhill Memory ETF",
      "Memory ETF",
      "記憶體 ETF",
      "CBOE:DRAM"
    ]
  },
  "EWJX": {
    "ticker": "EWJ",
    "exchange": "NYSEARCA",
    "qualified_ticker": "NYSEARCA:EWJ",
    "name_en": "iShares MSCI Japan ETF",
    "name_zh": "iShares MSCI 日本 ETF",
    "asset_type": "etf",
    "aliases": [
      "iShares MSCI Japan ETF",
      "日本 ETF",
      "NYSEARCA:EWJ"
    ]
  },
  "EWYX": {
    "ticker": "EWY",
    "exchange": "NYSEARCA",
    "qualified_ticker": "NYSEARCA:EWY",
    "name_en": "iShares MSCI South Korea ETF",
    "name_zh": "iShares MSCI 韓國 ETF",
    "asset_type": "etf",
    "aliases": [
      "iShares MSCI South Korea ETF",
      "韓國 ETF",
      "NYSEARCA:EWY"
    ]
  },
  "FLNCX": {
    "ticker": "FLNC",
    "exchange": "NASDAQ",
    "qualified_ticker": "NASDAQ:FLNC",
    "name_en": "Fluence Energy, Inc.",
    "name_zh": "Fluence Energy",
    "asset_type": "public_company",
    "aliases": [
      "Fluence Energy",
      "NASDAQ:FLNC"
    ]
  },
  "GEVX": {
    "ticker": "GEV",
    "exchange": "NYSE",
    "qualified_ticker": "NYSE:GEV",
    "name_en": "GE Vernova Inc.",
    "name_zh": "GE Vernova",
    "asset_type": "public_company",
    "aliases": [
      "GE Vernova",
      "NYSE:GEV"
    ]
  },
  "GLWX": {
    "ticker": "GLW",
    "exchange": "NYSE",
    "qualified_ticker": "NYSE:GLW",
    "name_en": "Corning Incorporated",
    "name_zh": "康寧",
    "asset_type": "public_company",
    "aliases": [
      "Corning",
      "康寧",
      "NYSE:GLW"
    ]
  },
  "GMEX": {
    "ticker": "GME",
    "exchange": "NYSE",
    "qualified_ticker": "NYSE:GME",
    "name_en": "GameStop Corp.",
    "name_zh": "GameStop",
    "asset_type": "public_company",
    "aliases": [
      "GameStop",
      "NYSE:GME"
    ]
  },
  "GOOGLX": {
    "ticker": "GOOGL",
    "exchange": "NASDAQ",
    "qualified_ticker": "NASDAQ:GOOGL",
    "name_en": "Alphabet Inc.",
    "name_zh": "Alphabet／Google",
    "asset_type": "public_company",
    "aliases": [
      "Alphabet",
      "Google",
      "谷歌",
      "NASDAQ:GOOGL"
    ]
  },
  "GSGX": {
    "ticker": "GSG",
    "exchange": "NYSEARCA",
    "qualified_ticker": "NYSEARCA:GSG",
    "name_en": "iShares S&P GSCI Commodity-Indexed Trust",
    "name_zh": "iShares S&P GSCI 商品指數信託",
    "asset_type": "etf",
    "aliases": [
      "GSG",
      "commodity ETF",
      "商品 ETF",
      "NYSEARCA:GSG"
    ]
  },
  "HIMSX": {
    "ticker": "HIMS",
    "exchange": "NYSE",
    "qualified_ticker": "NYSE:HIMS",
    "name_en": "Hims & Hers Health, Inc.",
    "name_zh": "Hims & Hers Health",
    "asset_type": "public_company",
    "aliases": [
      "Hims & Hers",
      "Hims",
      "NYSE:HIMS"
    ]
  },
  "HOODX": {
    "ticker": "HOOD",
    "exchange": "NASDAQ",
    "qualified_ticker": "NASDAQ:HOOD",
    "name_en": "Robinhood Markets, Inc.",
    "name_zh": "Robinhood",
    "asset_type": "public_company",
    "aliases": [
      "Robinhood",
      "NASDAQ:HOOD"
    ]
  },
  "HPEX": {
    "ticker": "HPE",
    "exchange": "NYSE",
    "qualified_ticker": "NYSE:HPE",
    "name_en": "Hewlett Packard Enterprise Company",
    "name_zh": "慧與科技",
    "asset_type": "public_company",
    "aliases": [
      "Hewlett Packard Enterprise",
      "HPE",
      "慧與",
      "NYSE:HPE"
    ]
  },
  "HYUNDAI": {
    "ticker": "005380",
    "exchange": "KRX",
    "qualified_ticker": "KRX:005380",
    "name_en": "Hyundai Motor Company",
    "name_zh": "現代汽車",
    "asset_type": "foreign_company",
    "aliases": [
      "Hyundai Motor",
      "Hyundai",
      "現代汽車",
      "KRX:005380"
    ]
  },
  "IBMX": {
    "ticker": "IBM",
    "exchange": "NYSE",
    "qualified_ticker": "NYSE:IBM",
    "name_en": "International Business Machines Corporation",
    "name_zh": "IBM／國際商業機器",
    "asset_type": "public_company",
    "aliases": [
      "IBM",
      "International Business Machines",
      "NYSE:IBM"
    ]
  },
  "INTCX": {
    "ticker": "INTC",
    "exchange": "NASDAQ",
    "qualified_ticker": "NASDAQ:INTC",
    "name_en": "Intel Corporation",
    "name_zh": "英特爾",
    "asset_type": "public_company",
    "aliases": [
      "Intel",
      "英特爾",
      "NASDAQ:INTC"
    ]
  },
  "IRENX": {
    "ticker": "IREN",
    "exchange": "NASDAQ",
    "qualified_ticker": "NASDAQ:IREN",
    "name_en": "IREN Limited",
    "name_zh": "IREN",
    "asset_type": "public_company",
    "aliases": [
      "IREN",
      "IREN Limited",
      "NASDAQ:IREN"
    ]
  },
  "LITEX": {
    "ticker": "LITE",
    "exchange": "NASDAQ",
    "qualified_ticker": "NASDAQ:LITE",
    "name_en": "Lumentum Holdings Inc.",
    "name_zh": "Lumentum",
    "asset_type": "public_company",
    "aliases": [
      "Lumentum",
      "NASDAQ:LITE"
    ]
  },
  "LLYX": {
    "ticker": "LLY",
    "exchange": "NYSE",
    "qualified_ticker": "NYSE:LLY",
    "name_en": "Eli Lilly and Company",
    "name_zh": "禮來",
    "asset_type": "public_company",
    "aliases": [
      "Eli Lilly",
      "Lilly",
      "禮來",
      "NYSE:LLY"
    ]
  },
  "LMTX": {
    "ticker": "LMT",
    "exchange": "NYSE",
    "qualified_ticker": "NYSE:LMT",
    "name_en": "Lockheed Martin Corporation",
    "name_zh": "洛克希德馬丁",
    "asset_type": "public_company",
    "aliases": [
      "Lockheed Martin",
      "洛克希德馬丁",
      "NYSE:LMT"
    ]
  },
  "LNGX": {
    "ticker": "LNG",
    "exchange": "NYSEAMERICAN",
    "qualified_ticker": "NYSEAMERICAN:LNG",
    "name_en": "Cheniere Energy, Inc.",
    "name_zh": "Cheniere Energy",
    "asset_type": "public_company",
    "aliases": [
      "Cheniere Energy",
      "LNG",
      "NYSEAMERICAN:LNG"
    ]
  },
  "LRCXX": {
    "ticker": "LRCX",
    "exchange": "NASDAQ",
    "qualified_ticker": "NASDAQ:LRCX",
    "name_en": "Lam Research Corporation",
    "name_zh": "科林研發",
    "asset_type": "public_company",
    "aliases": [
      "Lam Research",
      "科林研發",
      "NASDAQ:LRCX"
    ]
  },
  "METAX": {
    "ticker": "META",
    "exchange": "NASDAQ",
    "qualified_ticker": "NASDAQ:META",
    "name_en": "Meta Platforms, Inc.",
    "name_zh": "Meta",
    "asset_type": "public_company",
    "aliases": [
      "Meta",
      "Meta Platforms",
      "Facebook",
      "NASDAQ:META"
    ]
  },
  "MOSX": {
    "ticker": "MOS",
    "exchange": "NYSE",
    "qualified_ticker": "NYSE:MOS",
    "name_en": "The Mosaic Company",
    "name_zh": "美盛",
    "asset_type": "public_company",
    "aliases": [
      "Mosaic",
      "The Mosaic Company",
      "美盛",
      "NYSE:MOS"
    ]
  },
  "MPX": {
    "ticker": "MP",
    "exchange": "NYSE",
    "qualified_ticker": "NYSE:MP",
    "name_en": "MP Materials Corp.",
    "name_zh": "MP Materials",
    "asset_type": "public_company",
    "aliases": [
      "MP Materials",
      "NYSE:MP"
    ]
  },
  "MRVLX": {
    "ticker": "MRVL",
    "exchange": "NASDAQ",
    "qualified_ticker": "NASDAQ:MRVL",
    "name_en": "Marvell Technology, Inc.",
    "name_zh": "Marvell／邁威爾科技",
    "asset_type": "public_company",
    "aliases": [
      "Marvell",
      "邁威爾科技",
      "NASDAQ:MRVL"
    ]
  },
  "MSFTX": {
    "ticker": "MSFT",
    "exchange": "NASDAQ",
    "qualified_ticker": "NASDAQ:MSFT",
    "name_en": "Microsoft Corporation",
    "name_zh": "微軟",
    "asset_type": "public_company",
    "aliases": [
      "Microsoft",
      "微軟",
      "NASDAQ:MSFT"
    ]
  },
  "MSTRX": {
    "ticker": "MSTR",
    "exchange": "NASDAQ",
    "qualified_ticker": "NASDAQ:MSTR",
    "name_en": "Strategy Inc.",
    "name_zh": "Strategy（原 MicroStrategy）",
    "asset_type": "public_company",
    "aliases": [
      "Strategy",
      "MicroStrategy",
      "微策略",
      "NASDAQ:MSTR"
    ]
  },
  "MUX": {
    "ticker": "MU",
    "exchange": "NASDAQ",
    "qualified_ticker": "NASDAQ:MU",
    "name_en": "Micron Technology, Inc.",
    "name_zh": "美光科技",
    "asset_type": "public_company",
    "aliases": [
      "Micron",
      "Micron Technology",
      "美光",
      "NASDAQ:MU"
    ]
  },
  "NATGAS": {
    "ticker": "NATGAS",
    "exchange": "COMMODITY",
    "qualified_ticker": "COMMODITY:NATGAS",
    "name_en": "Natural Gas",
    "name_zh": "天然氣",
    "asset_type": "commodity",
    "aliases": [
      "Natural gas",
      "Henry Hub natural gas",
      "天然氣"
    ]
  },
  "NBISX": {
    "ticker": "NBIS",
    "exchange": "NASDAQ",
    "qualified_ticker": "NASDAQ:NBIS",
    "name_en": "Nebius Group N.V.",
    "name_zh": "Nebius Group",
    "asset_type": "public_company",
    "aliases": [
      "Nebius",
      "Nebius Group",
      "NASDAQ:NBIS"
    ]
  },
  "NFLXX": {
    "ticker": "NFLX",
    "exchange": "NASDAQ",
    "qualified_ticker": "NASDAQ:NFLX",
    "name_en": "Netflix, Inc.",
    "name_zh": "Netflix／網飛",
    "asset_type": "public_company",
    "aliases": [
      "Netflix",
      "網飛",
      "NASDAQ:NFLX"
    ]
  },
  "NKEX": {
    "ticker": "NKE",
    "exchange": "NYSE",
    "qualified_ticker": "NYSE:NKE",
    "name_en": "NIKE, Inc.",
    "name_zh": "Nike／耐吉",
    "asset_type": "public_company",
    "aliases": [
      "Nike",
      "耐吉",
      "NYSE:NKE"
    ]
  },
  "NOKX": {
    "ticker": "NOK",
    "exchange": "NYSE",
    "qualified_ticker": "NYSE:NOK",
    "name_en": "Nokia Corporation",
    "name_zh": "諾基亞",
    "asset_type": "public_company",
    "aliases": [
      "Nokia",
      "諾基亞",
      "NYSE:NOK"
    ]
  },
  "NOWX": {
    "ticker": "NOW",
    "exchange": "NYSE",
    "qualified_ticker": "NYSE:NOW",
    "name_en": "ServiceNow, Inc.",
    "name_zh": "ServiceNow",
    "asset_type": "public_company",
    "aliases": [
      "ServiceNow",
      "NYSE:NOW"
    ]
  },
  "NTRX": {
    "ticker": "NTR",
    "exchange": "NYSE",
    "qualified_ticker": "NYSE:NTR",
    "name_en": "Nutrien Ltd.",
    "name_zh": "Nutrien",
    "asset_type": "public_company",
    "aliases": [
      "Nutrien",
      "NYSE:NTR"
    ]
  },
  "NVDAX": {
    "ticker": "NVDA",
    "exchange": "NASDAQ",
    "qualified_ticker": "NASDAQ:NVDA",
    "name_en": "NVIDIA Corporation",
    "name_zh": "輝達",
    "asset_type": "public_company",
    "aliases": [
      "NVIDIA",
      "Nvidia",
      "輝達",
      "NASDAQ:NVDA"
    ]
  },
  "OKLOX": {
    "ticker": "OKLO",
    "exchange": "NYSE",
    "qualified_ticker": "NYSE:OKLO",
    "name_en": "Oklo Inc.",
    "name_zh": "Oklo",
    "asset_type": "public_company",
    "aliases": [
      "Oklo",
      "NYSE:OKLO"
    ]
  },
  "ONDSX": {
    "ticker": "ONDS",
    "exchange": "NASDAQ",
    "qualified_ticker": "NASDAQ:ONDS",
    "name_en": "Ondas Holdings Inc.",
    "name_zh": "Ondas Holdings",
    "asset_type": "public_company",
    "aliases": [
      "Ondas",
      "Ondas Holdings",
      "NASDAQ:ONDS"
    ]
  },
  "OPENAI": {
    "ticker": "OPENAI",
    "exchange": "PRIVATE",
    "qualified_ticker": "PRIVATE:OPENAI",
    "name_en": "OpenAI",
    "name_zh": "OpenAI",
    "asset_type": "private_company",
    "aliases": [
      "OpenAI",
      "ChatGPT"
    ]
  },
  "ORCLX": {
    "ticker": "ORCL",
    "exchange": "NYSE",
    "qualified_ticker": "NYSE:ORCL",
    "name_en": "Oracle Corporation",
    "name_zh": "甲骨文",
    "asset_type": "public_company",
    "aliases": [
      "Oracle",
      "甲骨文",
      "NYSE:ORCL"
    ]
  },
  "PAYPX": {
    "ticker": "PAYP",
    "exchange": "NASDAQ",
    "qualified_ticker": "NASDAQ:PAYP",
    "name_en": "PayPay Corporation",
    "name_zh": "PayPay（行動支付）",
    "asset_type": "foreign_company",
    "aliases": [
      "PayPay",
      "PayPay Corporation",
      "NASDAQ:PAYP"
    ]
  },
  "PLTRX": {
    "ticker": "PLTR",
    "exchange": "NASDAQ",
    "qualified_ticker": "NASDAQ:PLTR",
    "name_en": "Palantir Technologies Inc.",
    "name_zh": "Palantir",
    "asset_type": "public_company",
    "aliases": [
      "Palantir",
      "NASDAQ:PLTR"
    ]
  },
  "QCOMX": {
    "ticker": "QCOM",
    "exchange": "NASDAQ",
    "qualified_ticker": "NASDAQ:QCOM",
    "name_en": "QUALCOMM Incorporated",
    "name_zh": "高通",
    "asset_type": "public_company",
    "aliases": [
      "Qualcomm",
      "高通",
      "NASDAQ:QCOM"
    ]
  },
  "QNTX": {
    "ticker": "QNT",
    "exchange": "NASDAQ",
    "qualified_ticker": "NASDAQ:QNT",
    "name_en": "Quantinuum Inc.",
    "name_zh": "Quantinuum",
    "asset_type": "public_company",
    "aliases": [
      "Quantinuum",
      "量子運算 Quantinuum",
      "NASDAQ:QNT"
    ]
  },
  "QQQX": {
    "ticker": "QQQ",
    "exchange": "NASDAQ",
    "qualified_ticker": "NASDAQ:QQQ",
    "name_en": "Invesco QQQ Trust",
    "name_zh": "Invesco QQQ ETF",
    "asset_type": "etf",
    "aliases": [
      "Invesco QQQ",
      "QQQ ETF",
      "NASDAQ:QQQ"
    ]
  },
  "RGTIX": {
    "ticker": "RGTI",
    "exchange": "NASDAQ",
    "qualified_ticker": "NASDAQ:RGTI",
    "name_en": "Rigetti Computing, Inc.",
    "name_zh": "Rigetti Computing",
    "asset_type": "public_company",
    "aliases": [
      "Rigetti",
      "Rigetti Computing",
      "NASDAQ:RGTI"
    ]
  },
  "RKLBX": {
    "ticker": "RKLB",
    "exchange": "NASDAQ",
    "qualified_ticker": "NASDAQ:RKLB",
    "name_en": "Rocket Lab Corporation",
    "name_zh": "Rocket Lab",
    "asset_type": "public_company",
    "aliases": [
      "Rocket Lab",
      "NASDAQ:RKLB"
    ]
  },
  "RTXX": {
    "ticker": "RTX",
    "exchange": "NYSE",
    "qualified_ticker": "NYSE:RTX",
    "name_en": "RTX Corporation",
    "name_zh": "RTX／雷神技術",
    "asset_type": "public_company",
    "aliases": [
      "RTX",
      "Raytheon Technologies",
      "雷神技術",
      "NYSE:RTX"
    ]
  },
  "SITMX": {
    "ticker": "SITM",
    "exchange": "NASDAQ",
    "qualified_ticker": "NASDAQ:SITM",
    "name_en": "SiTime Corporation",
    "name_zh": "SiTime",
    "asset_type": "public_company",
    "aliases": [
      "SiTime",
      "NASDAQ:SITM"
    ]
  },
  "SKHX": {
    "ticker": "000660",
    "exchange": "KRX",
    "qualified_ticker": "KRX:000660",
    "name_en": "SK hynix Inc.",
    "name_zh": "SK 海力士",
    "asset_type": "foreign_company",
    "aliases": [
      "SK hynix",
      "SK Hynix",
      "SK 海力士",
      "海力士",
      "KRX:000660"
    ]
  },
  "SLVX": {
    "ticker": "SLV",
    "exchange": "NYSEARCA",
    "qualified_ticker": "NYSEARCA:SLV",
    "name_en": "iShares Silver Trust",
    "name_zh": "iShares 白銀信託",
    "asset_type": "etf",
    "aliases": [
      "iShares Silver Trust",
      "Silver ETF",
      "白銀 ETF",
      "NYSEARCA:SLV"
    ]
  },
  "SMHX": {
    "ticker": "SMH",
    "exchange": "NASDAQ",
    "qualified_ticker": "NASDAQ:SMH",
    "name_en": "VanEck Semiconductor ETF",
    "name_zh": "VanEck 半導體 ETF",
    "asset_type": "etf",
    "aliases": [
      "VanEck Semiconductor ETF",
      "Semiconductor ETF",
      "半導體 ETF",
      "NASDAQ:SMH"
    ]
  },
  "SMSN": {
    "ticker": "SMSN",
    "exchange": "LSE",
    "qualified_ticker": "LSE:SMSN",
    "name_en": "Samsung Electronics Co., Ltd. GDR",
    "name_zh": "三星電子",
    "asset_type": "foreign_company",
    "aliases": [
      "Samsung Electronics",
      "Samsung",
      "三星電子",
      "LSE:SMSN",
      "KRX:005930"
    ]
  },
  "SNDKX": {
    "ticker": "SNDK",
    "exchange": "NASDAQ",
    "qualified_ticker": "NASDAQ:SNDK",
    "name_en": "Sandisk Corporation",
    "name_zh": "SanDisk／閃迪",
    "asset_type": "public_company",
    "aliases": [
      "Sandisk",
      "SanDisk",
      "閃迪",
      "NASDAQ:SNDK"
    ]
  },
  "SOXLX": {
    "ticker": "SOXL",
    "exchange": "NYSEARCA",
    "qualified_ticker": "NYSEARCA:SOXL",
    "name_en": "Direxion Daily Semiconductor Bull 3X Shares",
    "name_zh": "Direxion 半導體三倍做多 ETF",
    "asset_type": "etf",
    "aliases": [
      "SOXL",
      "Semiconductor Bull 3X",
      "半導體三倍做多",
      "NYSEARCA:SOXL"
    ]
  },
  "SOXXX": {
    "ticker": "SOXX",
    "exchange": "NASDAQ",
    "qualified_ticker": "NASDAQ:SOXX",
    "name_en": "iShares Semiconductor ETF",
    "name_zh": "iShares 半導體 ETF",
    "asset_type": "etf",
    "aliases": [
      "iShares Semiconductor ETF",
      "SOXX",
      "半導體 ETF",
      "NASDAQ:SOXX"
    ]
  },
  "SPCX": {
    "ticker": "SPCX",
    "exchange": "NASDAQ",
    "qualified_ticker": "NASDAQ:SPCX",
    "name_en": "SpaceX",
    "name_zh": "SpaceX／太空探索科技",
    "asset_type": "public_company",
    "aliases": [
      "SpaceX",
      "Space Exploration Technologies",
      "太空探索科技",
      "NASDAQ:SPCX"
    ]
  },
  "SPYX": {
    "ticker": "SPY",
    "exchange": "NYSEARCA",
    "qualified_ticker": "NYSEARCA:SPY",
    "name_en": "SPDR S&P 500 ETF Trust",
    "name_zh": "SPDR S&P 500 ETF",
    "asset_type": "etf",
    "aliases": [
      "SPDR S&P 500 ETF Trust",
      "S&P 500 ETF",
      "標普500 ETF",
      "NYSEARCA:SPY"
    ]
  },
  "STXX": {
    "ticker": "STX",
    "exchange": "NASDAQ",
    "qualified_ticker": "NASDAQ:STX",
    "name_en": "Seagate Technology Holdings plc",
    "name_zh": "希捷科技",
    "asset_type": "public_company",
    "aliases": [
      "Seagate",
      "Seagate Technology",
      "希捷科技",
      "NASDAQ:STX"
    ]
  },
  "TQQQX": {
    "ticker": "TQQQ",
    "exchange": "NASDAQ",
    "qualified_ticker": "NASDAQ:TQQQ",
    "name_en": "ProShares UltraPro QQQ",
    "name_zh": "ProShares 三倍做多納指 ETF",
    "asset_type": "etf",
    "aliases": [
      "TQQQ",
      "UltraPro QQQ",
      "三倍做多納指",
      "NASDAQ:TQQQ"
    ]
  },
  "TSLAX": {
    "ticker": "TSLA",
    "exchange": "NASDAQ",
    "qualified_ticker": "NASDAQ:TSLA",
    "name_en": "Tesla, Inc.",
    "name_zh": "特斯拉",
    "asset_type": "public_company",
    "aliases": [
      "Tesla",
      "特斯拉",
      "NASDAQ:TSLA"
    ]
  },
  "TSMX": {
    "ticker": "TSM",
    "exchange": "NYSE",
    "qualified_ticker": "NYSE:TSM",
    "name_en": "Taiwan Semiconductor Manufacturing Company Limited ADR",
    "name_zh": "台積電 ADR",
    "asset_type": "public_company",
    "aliases": [
      "TSMC",
      "Taiwan Semiconductor",
      "台積電",
      "NYSE:TSM"
    ]
  },
  "TTEX": {
    "ticker": "TTE",
    "exchange": "NYSE",
    "qualified_ticker": "NYSE:TTE",
    "name_en": "TotalEnergies SE ADR",
    "name_zh": "道達爾能源 ADR",
    "asset_type": "public_company",
    "aliases": [
      "TotalEnergies",
      "道達爾能源",
      "NYSE:TTE"
    ]
  },
  "TXNX": {
    "ticker": "TXN",
    "exchange": "NASDAQ",
    "qualified_ticker": "NASDAQ:TXN",
    "name_en": "Texas Instruments Incorporated",
    "name_zh": "德州儀器",
    "asset_type": "public_company",
    "aliases": [
      "Texas Instruments",
      "德州儀器",
      "NASDAQ:TXN"
    ]
  },
  "UNGX": {
    "ticker": "UNG",
    "exchange": "NYSEARCA",
    "qualified_ticker": "NYSEARCA:UNG",
    "name_en": "United States Natural Gas Fund, LP",
    "name_zh": "美國天然氣基金",
    "asset_type": "etf",
    "aliases": [
      "United States Natural Gas Fund",
      "Natural Gas ETF",
      "天然氣 ETF",
      "NYSEARCA:UNG"
    ]
  },
  "UNHX": {
    "ticker": "UNH",
    "exchange": "NYSE",
    "qualified_ticker": "NYSE:UNH",
    "name_en": "UnitedHealth Group Incorporated",
    "name_zh": "聯合健康",
    "asset_type": "public_company",
    "aliases": [
      "UnitedHealth",
      "UnitedHealth Group",
      "聯合健康",
      "NYSE:UNH"
    ]
  },
  "URAX": {
    "ticker": "URA",
    "exchange": "NYSEARCA",
    "qualified_ticker": "NYSEARCA:URA",
    "name_en": "Global X Uranium ETF",
    "name_zh": "Global X 鈾礦 ETF",
    "asset_type": "etf",
    "aliases": [
      "Global X Uranium ETF",
      "Uranium ETF",
      "鈾礦 ETF",
      "NYSEARCA:URA"
    ]
  },
  "URNMX": {
    "ticker": "URNM",
    "exchange": "NYSEARCA",
    "qualified_ticker": "NYSEARCA:URNM",
    "name_en": "Sprott Uranium Miners ETF",
    "name_zh": "Sprott 鈾礦商 ETF",
    "asset_type": "etf",
    "aliases": [
      "Sprott Uranium Miners ETF",
      "Uranium Miners ETF",
      "鈾礦商 ETF",
      "NYSEARCA:URNM"
    ]
  },
  "USARX": {
    "ticker": "USAR",
    "exchange": "NASDAQ",
    "qualified_ticker": "NASDAQ:USAR",
    "name_en": "USA Rare Earth, Inc.",
    "name_zh": "USA Rare Earth／美國稀土",
    "asset_type": "public_company",
    "aliases": [
      "USA Rare Earth",
      "美國稀土",
      "NASDAQ:USAR"
    ]
  },
  "USOX": {
    "ticker": "USO",
    "exchange": "NYSEARCA",
    "qualified_ticker": "NYSEARCA:USO",
    "name_en": "United States Oil Fund, LP",
    "name_zh": "美國原油基金",
    "asset_type": "etf",
    "aliases": [
      "United States Oil Fund",
      "US Oil ETF",
      "原油 ETF",
      "NYSEARCA:USO"
    ]
  },
  "VGKX": {
    "ticker": "VGK",
    "exchange": "NYSEARCA",
    "qualified_ticker": "NYSEARCA:VGK",
    "name_en": "Vanguard FTSE Europe ETF",
    "name_zh": "Vanguard 歐洲 ETF",
    "asset_type": "etf",
    "aliases": [
      "Vanguard FTSE Europe ETF",
      "Europe ETF",
      "歐洲 ETF",
      "NYSEARCA:VGK"
    ]
  },
  "WDCX": {
    "ticker": "WDC",
    "exchange": "NASDAQ",
    "qualified_ticker": "NASDAQ:WDC",
    "name_en": "Western Digital Corporation",
    "name_zh": "威騰電子",
    "asset_type": "public_company",
    "aliases": [
      "Western Digital",
      "WD",
      "威騰",
      "NASDAQ:WDC"
    ]
  },
  "XAG": {
    "ticker": "XAG",
    "exchange": "COMMODITY",
    "qualified_ticker": "COMMODITY:XAG",
    "name_en": "Silver",
    "name_zh": "白銀",
    "asset_type": "commodity",
    "aliases": [
      "Silver",
      "spot silver",
      "白銀"
    ]
  },
  "XAU": {
    "ticker": "XAU",
    "exchange": "COMMODITY",
    "qualified_ticker": "COMMODITY:XAU",
    "name_en": "Gold",
    "name_zh": "黃金",
    "asset_type": "commodity",
    "aliases": [
      "Gold",
      "spot gold",
      "黃金"
    ]
  },
  "XPD": {
    "ticker": "XPD",
    "exchange": "COMMODITY",
    "qualified_ticker": "COMMODITY:XPD",
    "name_en": "Palladium",
    "name_zh": "鈀金",
    "asset_type": "commodity",
    "aliases": [
      "Palladium",
      "鈀金"
    ]
  },
  "XPT": {
    "ticker": "XPT",
    "exchange": "COMMODITY",
    "qualified_ticker": "COMMODITY:XPT",
    "name_en": "Platinum",
    "name_zh": "鉑金",
    "asset_type": "commodity",
    "aliases": [
      "Platinum",
      "鉑金"
    ]
  },
  "XYZX": {
    "ticker": "XYZ",
    "exchange": "NYSE",
    "qualified_ticker": "NYSE:XYZ",
    "name_en": "Block, Inc.",
    "name_zh": "Block（原 Square）",
    "asset_type": "public_company",
    "aliases": [
      "Block Inc",
      "Square",
      "Cash App",
      "Block",
      "NYSE:XYZ"
    ]
  },
  "ALABX": {
    "ticker": "ALAB",
    "exchange": "NASDAQ",
    "qualified_ticker": "NASDAQ:ALAB",
    "name_en": "Astera Labs, Inc.",
    "name_zh": "Astera Labs",
    "asset_type": "public_company",
    "aliases": [
      "Astera Labs",
      "NASDAQ:ALAB"
    ]
  },
  "KLACX": {
    "ticker": "KLAC",
    "exchange": "NASDAQ",
    "qualified_ticker": "NASDAQ:KLAC",
    "name_en": "KLA Corporation",
    "name_zh": "科磊",
    "asset_type": "public_company",
    "aliases": [
      "KLA",
      "KLA Corporation",
      "科磊",
      "NASDAQ:KLAC"
    ]
  },
  "ONX": {
    "ticker": "ON",
    "exchange": "NASDAQ",
    "qualified_ticker": "NASDAQ:ON",
    "name_en": "onsemi",
    "name_zh": "安森美半導體",
    "asset_type": "public_company",
    "aliases": [
      "onsemi",
      "ON Semiconductor",
      "安森美",
      "安森美半導體",
      "NASDAQ:ON"
    ]
  },
  "SKHY": {
    "ticker": "SKHY",
    "exchange": "NASDAQ",
    "qualified_ticker": "NASDAQ:SKHY",
    "name_en": "SK hynix Inc. ADR",
    "name_zh": "SK 海力士 ADR",
    "asset_type": "foreign_company",
    "aliases": [
      "SK hynix",
      "SK Hynix",
      "SK 海力士",
      "海力士",
      "NASDAQ:SKHY",
      "KRX:000660"
    ]
  },
  "SMCIX": {
    "ticker": "SMCI",
    "exchange": "NASDAQ",
    "qualified_ticker": "NASDAQ:SMCI",
    "name_en": "Super Micro Computer, Inc.",
    "name_zh": "美超微電腦",
    "asset_type": "public_company",
    "aliases": [
      "Super Micro Computer",
      "Supermicro",
      "美超微",
      "NASDAQ:SMCI"
    ]
  },
  "SNXXX": {
    "ticker": "SNX",
    "exchange": "NYSE",
    "qualified_ticker": "NYSE:SNX",
    "name_en": "TD SYNNEX Corporation",
    "name_zh": "TD SYNNEX",
    "asset_type": "public_company",
    "aliases": [
      "TD SYNNEX",
      "Synnex",
      "NYSE:SNX"
    ]
  },
  "VSHX": {
    "ticker": "VSH",
    "exchange": "NYSE",
    "qualified_ticker": "NYSE:VSH",
    "name_en": "Vishay Intertechnology, Inc.",
    "name_zh": "Vishay／威世科技",
    "asset_type": "public_company",
    "aliases": [
      "Vishay",
      "Vishay Intertechnology",
      "威世",
      "NYSE:VSH"
    ]
  },
  "KIOXIA": {
    "ticker": "285A",
    "exchange": "TSE",
    "qualified_ticker": "TSE:285A",
    "name_en": "Kioxia Holdings Corporation",
    "name_zh": "鎧俠控股",
    "asset_type": "foreign_company",
    "aliases": [
      "Kioxia",
      "Kioxia Holdings",
      "鎧俠",
      "TSE:285A"
    ]
  },
  "PANWX": {
    "ticker": "PANW",
    "exchange": "NASDAQ",
    "qualified_ticker": "NASDAQ:PANW",
    "name_en": "Palo Alto Networks, Inc.",
    "name_zh": "Palo Alto Networks",
    "asset_type": "public_company",
    "aliases": [
      "Palo Alto Networks",
      "PANW",
      "NASDAQ:PANW"
    ]
  },
  "SHAZX": {
    "ticker": "SHAZ",
    "exchange": "NASDAQ",
    "qualified_ticker": "NASDAQ:SHAZ",
    "name_en": "SharonAI Holdings Inc.",
    "name_zh": "SharonAI Holdings",
    "asset_type": "public_company",
    "aliases": [
      "SharonAI",
      "Sharon AI",
      "NASDAQ:SHAZ"
    ]
  },
  "SOXSX": {
    "ticker": "SOXS",
    "exchange": "NYSEARCA",
    "qualified_ticker": "NYSEARCA:SOXS",
    "name_en": "Direxion Daily Semiconductor Bear 3X Shares",
    "name_zh": "Direxion 半導體三倍做空 ETF",
    "asset_type": "etf",
    "aliases": [
      "SOXS",
      "Semiconductor Bear 3X",
      "半導體三倍做空",
      "NYSEARCA:SOXS"
    ]
  },
  "XLPX": {
    "ticker": "XLP",
    "exchange": "NYSEARCA",
    "qualified_ticker": "NYSEARCA:XLP",
    "name_en": "Consumer Staples Select Sector SPDR Fund",
    "name_zh": "SPDR 必需消費類股 ETF",
    "asset_type": "etf",
    "aliases": [
      "XLP",
      "Consumer Staples Select Sector SPDR",
      "必需消費 ETF",
      "NYSEARCA:XLP"
    ]
  },
  "XLVX": {
    "ticker": "XLV",
    "exchange": "NYSEARCA",
    "qualified_ticker": "NYSEARCA:XLV",
    "name_en": "Health Care Select Sector SPDR Fund",
    "name_zh": "SPDR 醫療保健類股 ETF",
    "asset_type": "etf",
    "aliases": [
      "XLV",
      "Health Care Select Sector SPDR",
      "醫療保健 ETF",
      "NYSEARCA:XLV"
    ]
  }
};

function researchState(row) {
  return String(row?.opportunity_long?.market_state_id || "OTHER");
}

function researchTickerHint(symbol) {
  const s = String(symbol || "").trim().toUpperCase();
  const identity = RESEARCH_ASSET_IDENTITIES[s] || null;
  if (identity?.ticker) return String(identity.ticker).trim();
  if (s.endsWith("X") && s.length > 1) return s.slice(0, -1);
  return s;
}

function researchCompanyProfile(symbol) {
  const s = String(symbol || "").trim().toUpperCase();
  const identity = RESEARCH_ASSET_IDENTITIES[s] || null;
  const hint = researchTickerHint(s);
  const aliases = [];
  const add = (value) => {
    const v = String(value || "").trim();
    if (!v || aliases.some(x => x.toLowerCase() === v.toLowerCase())) return;
    aliases.push(v);
  };

  if (identity) {
    add(identity.ticker);
    add(identity.qualified_ticker);
    add(identity.name_en);
    add(identity.name_zh);
    for (const alias of identity.aliases || []) add(alias);

    const matchAliases = aliases.filter(value => {
      const v = String(value || "").trim();
      return !/^[A-Za-z]{1,2}$/.test(v);
    });

    return {
      symbol: s,
      underlying_ticker: String(identity.ticker || hint).trim(),
      exchange: String(identity.exchange || "").trim(),
      qualified_ticker: String(identity.qualified_ticker || identity.ticker || hint).trim(),
      company_name: String(identity.name_en || identity.ticker || hint).trim(),
      company_name_zh: String(identity.name_zh || "").trim(),
      asset_type: String(identity.asset_type || "other").trim(),
      focus: String(identity.name_zh || identity.name_en || identity.ticker || hint).trim(),
      aliases,
      match_aliases: matchAliases.length ? matchAliases : aliases,
    };
  }

  // Unknown future Pionex symbols: generic fallback only. Do not guess a company name.
  add(hint);
  if (!s.endsWith("X")) add(s);
  return {
    symbol: s,
    underlying_ticker: hint,
    exchange: "",
    qualified_ticker: hint,
    company_name: hint,
    company_name_zh: "",
    asset_type: "other",
    focus: hint,
    aliases,
    match_aliases: aliases,
  };
}

function researchFresh(item, nowMs = Date.now()) {
  if (!item || typeof item !== "object") return false;
  // Only current Tavily pipeline entries are eligible for the 24H cache.
  if (item.api !== "tavily-search-api") return false;
  if (item.pipeline_version !== RESEARCH_PIPELINE_VERSION) return false;
  const direct = Date.parse(item.expires_at || "");
  if (Number.isFinite(direct)) return direct > nowMs;
  const searched = Date.parse(item.searched_at || "");
  return Number.isFinite(searched) && searched + RESEARCH_TTL_MS > nowMs;
}

async function readR2Json(env, key, fallback) {
  try {
    const obj = await env.JSON_BUCKET.get(key);
    if (!obj) return fallback;
    const parsed = JSON.parse(await obj.text());
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch (_) {
    return fallback;
  }
}

async function tavilySearch(env, body) {
  const apiKey = String(env.TAVILY_API_KEY || "").trim();
  if (!apiKey) throw httpError(500, "Worker 缺少 TAVILY_API_KEY secret");
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let payload = null;
  try { payload = JSON.parse(text); } catch (_) {}
  if (!response.ok) {
    const detail = payload?.detail?.error || payload?.detail || payload?.error || payload?.message || text || response.statusText;
    throw httpError(response.status, `Tavily Search 失敗：${String(detail).slice(0, 1200)}`);
  }
  if (!payload || typeof payload !== "object") throw httpError(502, "Tavily 回傳不是有效 JSON");
  return payload;
}

function researchEscapeRx(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function researchTextHasAlias(text, alias) {
  const hay = String(text || "");
  const needle = String(alias || "").trim();
  if (!needle) return false;
  if (/^[A-Za-z0-9._-]{1,7}$/.test(needle)) {
    return new RegExp(`(^|[^A-Za-z0-9])${researchEscapeRx(needle)}([^A-Za-z0-9]|$)`, "i").test(hay);
  }
  return hay.toLowerCase().includes(needle.toLowerCase());
}

function researchContainsAny(text, words) {
  const hay = String(text || "").toLowerCase();
  return (words || []).some(word => hay.includes(String(word || "").toLowerCase()));
}

function researchParseExplicitEventDate(text) {
  const s = String(text || "");
  let m = s.match(/\b(20\d{2})[\/\-.](\d{1,2})[\/\-.](\d{1,2})\b/);
  if (m) {
    const d = new Date(Date.UTC(+m[1], +m[2]-1, +m[3]));
    if (!Number.isNaN(d.getTime())) return d;
  }
  m = s.match(/(\d{1,2})月(\d{1,2})日/);
  if (m) {
    const now = new Date();
    const d = new Date(Date.UTC(now.getUTCFullYear(), +m[1]-1, +m[2]));
    if (!Number.isNaN(d.getTime())) return d;
  }
  const months = {jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};
  m = s.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,\s*(20\d{2}))?/i);
  if (m) {
    const month = months[m[1].slice(0,3).toLowerCase()];
    const year = +(m[3] || new Date().getUTCFullYear());
    const d = new Date(Date.UTC(year, month, +m[2]));
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}


function researchToTraditionalChinese(value) {
  // Lightweight normalization for the common Simplified-Chinese characters Tavily occasionally returns.
  // It is intentionally small and deterministic; original source text is preserved separately.
  const map = {
    "发":"發","财":"財","报":"報","预":"預","测":"測","会":"會","营":"營","获":"獲","优":"優","于":"於","产":"產","业":"業","数":"數","据":"據","关":"關","闭":"閉","监":"監","诉":"訴","讼":"訟","评":"評","级":"級","标":"標","价":"價","调":"調","资":"資","议":"議","并":"並","购":"購","联":"聯","动":"動","风":"風","险":"險","势":"勢","涨":"漲","亿":"億","万":"萬","与":"與","为":"為","将":"將","这":"這","过":"過","个":"個","时":"時","间":"間","内":"內","进":"進","术":"術","电":"電","网":"網","软":"軟","务":"務","国":"國","华":"華","台":"臺","额":"額","经":"經","济":"濟","证":"證","券":"券","现":"現","实":"實","应":"應","对":"對","从":"從","长":"長","广":"廣","东":"東","门":"門","点":"點","体":"體","复":"復","规":"規","则":"則","权":"權","处":"處","么":"麼","还":"還","仅":"僅","约":"約","换":"換","后":"後","压":"壓","线":"線","机":"機","构":"構","类":"類","创":"創","强":"強","较":"較","显":"顯","际":"際","开":"開","扩":"擴","达":"達","远":"遠","维":"維","续":"續","减":"減","增":"增","转":"轉","陆":"陸","离":"離","储":"儲","销":"銷","损":"損","础":"礎","协":"協","终":"終","选":"選","择":"擇","独":"獨","涨":"漲","跌":"跌","总":"總","值":"值"
  };
  return String(value || "").replace(/[\u3400-\u9fff]/g, ch => map[ch] || ch);
}

function researchHasCjk(value) {
  return /[\u3400-\u9fff]/.test(String(value || ""));
}

function researchCleanAnswerText(value) {
  return researchToTraditionalChinese(value)
    .replace(/```(?:json)?/gi, "")
    .replace(/```/g, "")
    .replace(/\*\*/g, "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function researchCategoryLabelZh(category) {
  return ({
    earnings:"財報／營收", guidance:"財測／展望", company_catalyst:"公司催化",
    analyst:"分析師異動", sec_capital:"SEC／資本", regulatory_legal:"法規／訴訟",
    fund_event:"ETF／基金事件", commodity_supply:"供需／庫存", policy_macro:"政策／產業事件",
    direct_industry:"產業事件"
  })[String(category || "")] || "重大事件";
}

function researchAnswerSegments(answer) {
  const text = researchCleanAnswerText(answer);
  if (!text) return [];
  const out = [];
  const push = (raw) => {
    let s = String(raw || "").replace(/^\s*[\-•]+\s*/, "").trim();
    s = s.replace(/^標題[:：]\s*/i, "").trim();
    if (s.length < 12 || !researchHasCjk(s)) return;
    if (/^(根據|依據|以下是|最近7天|最近 7 天).{0,24}(重大|新聞|事件)/.test(s) && s.length < 80) return;
    if (!out.some(x => x === s)) out.push(s.slice(0, 520));
  };

  // Preferred strict format: 【事件1】標題：...｜摘要：...
  const strict = [...text.matchAll(/【事件\s*\d+】\s*([\s\S]*?)(?=【事件\s*\d+】|$)/g)];
  if (strict.length) {
    for (const m of strict) push(m[1]);
    return out.slice(0, 6);
  }

  // Numbered answer.
  const numbered = text.split(/(?:^|\n)\s*\d+[\.、\)]\s+/).slice(1);
  if (numbered.length) {
    numbered.forEach(push);
    if (out.length) return out.slice(0, 6);
  }

  // Paragraph answer: split common Chinese sequencing words and punctuation.
  text.split(/(?:首先|其次|最後|最后|此外|另外|同時|同时|；|。|！|？|\n+)/).forEach(push);
  return out.slice(0, 8);
}

function researchSegmentScoreForItem(segment, item, profile, category) {
  const seg = String(segment || "");
  const src = `${item?.title || ""} ${String(item?.content || "").slice(0, 900)}`;
  let score = 0;
  if ((profile?.match_aliases || profile?.aliases || []).some(a => researchTextHasAlias(seg, a))) score += 4;
  const segNums = new Set((seg.match(/\b\d+(?:\.\d+)?\b/g) || []).filter(x => x.length >= 2));
  for (const n of (src.match(/\b\d+(?:\.\d+)?\b/g) || [])) if (segNums.has(n)) score += 3;
  const tokens = (src.match(/[A-Za-z][A-Za-z0-9-]{2,}/g) || []).filter(x => !/^(the|and|for|with|from|this|that|stock|news|company)$/i.test(x));
  for (const t of tokens.slice(0, 30)) if (seg.toLowerCase().includes(t.toLowerCase())) score += 1;
  if (researchCategoryLabelZh(category) && researchContainsAny(seg, [researchCategoryLabelZh(category)])) score += 2;
  return score;
}

function researchDisplayFields(payloadAnswer, kept, profile) {
  const answer = researchCleanAnswerText(payloadAnswer);
  const segments = researchAnswerSegments(answer);
  const used = new Set();
  const displays = [];

  for (const item of kept || []) {
    const category = researchEventCategory(item, profile);
    let bestIndex = -1;
    let bestScore = -1;
    segments.forEach((seg, idx) => {
      if (used.has(idx)) return;
      const score = researchSegmentScoreForItem(seg, item, profile, category);
      if (score > bestScore) { bestScore = score; bestIndex = idx; }
    });
    if (bestIndex < 0 && segments.length) bestIndex = segments.findIndex((_, idx) => !used.has(idx));
    if (bestIndex >= 0) used.add(bestIndex);
    const segment = bestIndex >= 0 ? segments[bestIndex] : "";
    let displayTitle = `${profile.underlying_ticker || "標的"}｜${researchCategoryLabelZh(category)}`;
    let displayDetail = segment;
    const titleMatch = segment.match(/(?:^|[｜|])\s*標題[:：]\s*([^｜|]+)(?:[｜|]|$)/i);
    const detailMatch = segment.match(/(?:^|[｜|])\s*摘要[:：]\s*([\s\S]+)/i);
    const compactParts = segment.split(/[｜|]/).map(x => x.trim()).filter(Boolean);
    if (titleMatch && researchHasCjk(titleMatch[1])) displayTitle = titleMatch[1].trim().slice(0, 120);
    else if (compactParts.length >= 2 && researchHasCjk(compactParts[0])) displayTitle = compactParts[0].replace(/^標題[:：]\s*/i, "").slice(0,120);
    if (detailMatch && researchHasCjk(detailMatch[1])) displayDetail = detailMatch[1].trim().slice(0, 420);
    else if (compactParts.length >= 2 && researchHasCjk(compactParts.slice(1).join(" "))) displayDetail = compactParts.slice(1).join(" ").replace(/^摘要[:：]\s*/i, "").slice(0,420);
    if (!displayDetail || !researchHasCjk(displayDetail)) {
      displayDetail = `已找到與 ${profile.company_name} 直接相關的近期${researchCategoryLabelZh(category)}；原始英文內容與網址保留於下方查證來源。`;
    }
    displays.push({ display_title_zh_tw:researchToTraditionalChinese(displayTitle), display_detail_zh_tw:researchToTraditionalChinese(displayDetail) });
  }

  let summary = kept?.length ? answer : "";
  if (!summary || !researchHasCjk(summary)) {
    summary = kept?.length
      ? `最近 7 天 Tavily 找到 ${kept.length} 則相關新聞；繁體中文重點顯示於下方。`
      : `最近 7 天未找到符合條件的 ${profile.company_name} 重大事件；不硬湊。`;
  }
  return { summary_zh_tw:researchToTraditionalChinese(summary).slice(0, 1100), displays };
}

function researchEventCategory(item, profile=null) {
  const text = `${item?.title || ""}\n${String(item?.content || "").slice(0, 700)}`.toLowerCase();
  const type = String(profile?.asset_type || "");
  if (type === "commodity") {
    if (/inventory|stockpile|production|output|supply|demand|opec|eia|庫存|產量|供給|供應|需求/.test(text)) return "commodity_supply";
    return "policy_macro";
  }
  if (type === "etf") {
    if (/rebalance|reconstitution|holdings|constituent|inflow|outflow|fund flow|distribution|split|成分|再平衡|資金流|配息|拆分/.test(text)) return "fund_event";
    return "policy_macro";
  }
  if (/earnings|revenue|quarter|results|財報|營收|法說/.test(text)) return "earnings";
  if (/guidance|forecast|財測|展望/.test(text)) return "guidance";
  if (/upgrade|downgrade|price target|升評|降評|目標價/.test(text)) return "analyst";
  if (/sec filing|8-k|10-q|10-k|buyback|convertible|offering|增資|回購|可轉債/.test(text)) return "sec_capital";
  if (/lawsuit|regulat|antitrust|investigation|probe|訴訟|監管|反壟斷|調查/.test(text)) return "regulatory_legal";
  if (/partnership|contract|agreement|launch|product|acquisition|merger|investment|合作|合約|協議|發布|產品|收購|併購|投資|關閉據點|裁員/.test(text)) return "company_catalyst";
  return "direct_industry";
}

function researchEventImpact(item) {
  const text = `${item?.title || ""}\n${String(item?.content || "").slice(0, 650)}`.toLowerCase();
  const positive = /beat|growth|surge|win|partnership|contract|launch|upgrade|raised target|record|outperform|成長|優於|合作|合約|發布|升評|上調|創高/.test(text);
  const negative = /miss|downgrade|cut target|lawsuit|investigation|probe|closure|layoff|risk|decline|下滑|低於|降評|下調|訴訟|調查|關閉|裁員|風險/.test(text);
  if (positive && negative) return "mixed";
  if (positive) return "positive";
  if (negative) return "negative";
  return "neutral";
}

function researchEventDate(item) {
  const explicit = researchParseExplicitEventDate(`${item?.title || ""} ${String(item?.content || "").slice(0, 450)}`);
  if (explicit) return explicit.toISOString().slice(0,10);
  const ms = Date.parse(item?.published_date || item?.publishedDate || "");
  return Number.isFinite(ms) ? new Date(ms).toISOString().slice(0,10) : "";
}

function researchCompactSnippet(item, maxLen=260) {
  return String(item?.content || "").replace(/\s+/g," ").trim().slice(0,maxLen);
}

function researchImpactCounts(events) {
  const counts = { positive:0, negative:0, neutral:0, mixed:0, total:0 };
  for (const event of Array.isArray(events) ? events : []) {
    const impact = String(event?.impact || "neutral");
    if (impact === "positive") counts.positive += 1;
    else if (impact === "negative") counts.negative += 1;
    else if (impact === "mixed") counts.mixed += 1;
    else counts.neutral += 1;
    counts.total += 1;
  }
  return counts;
}

function researchVerdictFromEvents(events) {
  const counts = researchImpactCounts(events);
  // Majority rule requested by the UI: more positive articles => bullish;
  // more negative articles => bearish. Mixed/neutral never erase the result.
  if (counts.positive > counts.negative) {
    return counts.positive >= 3 && counts.negative === 0 ? "strong_positive" : "positive";
  }
  if (counts.negative > counts.positive) {
    return counts.negative >= 3 && counts.positive === 0 ? "high_risk" : "risk";
  }
  if (counts.positive > 0 || counts.negative > 0 || counts.mixed > 0) return "mixed";
  return "neutral";
}

function researchIdentityBlock(profile) {
  const marketId = profile?.qualified_ticker || profile?.underlying_ticker || profile?.symbol || "";
  const lines = [
    `Pionex RWA 代號：${profile?.symbol || ""}`,
    `正式市場代號：${marketId}`,
    `英文名稱：${profile?.company_name || ""}`,
  ];
  if (profile?.company_name_zh) lines.push(`中文名稱：${profile.company_name_zh}`);
  lines.push(`資產類型：${profile?.asset_type || "other"}`);
  return lines.join("\n");
}

function researchBuildQuery(profile) {
  const aliases = (profile?.aliases || []).slice(0, 20).join(" / ");
  const type = String(profile?.asset_type || "other");
  const focus = String(profile?.focus || profile?.company_name || profile?.underlying_ticker || "").trim();
  const identity = researchIdentityBlock(profile);

  if (["public_company","foreign_company"].includes(type)) {
    return `搜尋 ${profile.company_name} (${profile.qualified_ticker || profile.underlying_ticker}) 最近 7 天「直接與 ${profile.company_name} 本身有關、而且事件本身也發生在最近 7 天」的重大公司新聞。\n\n標的身分（必須以此為準，不要只用短 ticker 猜公司）：\n${identity}\n\n公司也可能以這些名稱出現：${aliases}\n\n- 財報 / 財測 / 法說會更新\n- ${profile.company_name} 官方公告\n- 新產品或重大業務正式發布\n- 重大合作 / 收購 / 投資\n- SEC / 監管 / 訴訟\n- 分析師重大升降評或目標價異動（必須是最近 7 天的新動作）\n- 直接影響 ${profile.company_name} 營運的重大產業事件\n\n且用繁體中文顯示`;
  }

  if (type === "private_company") {
    return `搜尋 ${profile.company_name} 最近 7 天直接相關的重大公司事件。\n\n標的身分（必須以此為準）：\n${identity}\n\n可能名稱：${aliases}\n\n- 官方產品 / 技術 / 商業發布\n- 大型客戶、訂單、合作或合約\n- 融資、併購、重大投資、IPO / 上市進度\n- 監管、訴訟、政府合約或重大政策影響\n- 直接影響 ${profile.company_name} 營運的重大產業事件\n\n且用繁體中文顯示`;
  }

  if (type === "etf") {
    return `搜尋 ${profile.company_name} (${profile.qualified_ticker || profile.underlying_ticker}) 最近 7 天重大 ETF / 基金事件，以及直接影響其核心曝險「${focus}」的重大事件。\n\n標的身分（必須以此為準，不得當成公司股票）：\n${identity}\n\n可能名稱或主題：${aliases}\n\n- 發行商正式公告、基金結構、拆分、配息、成分或指數再平衡\n- 有可靠來源的重大資金流 / 持倉結構變化\n- 直接影響「${focus}」的重大政策、供需、產業或大型成分股事件\n- 對 ETF 核心曝險有明確因果關係的重大市場事件\n\n且用繁體中文顯示`;
  }

  if (type === "commodity") {
    return `搜尋 ${profile.company_name} (${profile.qualified_ticker || profile.underlying_ticker}) 最近 7 天直接影響「${focus}」的重大市場事件。\n\n標的身分（必須以此為準，不得當成公司股票）：\n${identity}\n\n可能名稱：${aliases}\n\n- 供給 / 需求 / 庫存 / 產量 / 礦山或油氣設施中斷\n- OPEC、EIA、政府政策、制裁、關稅、地緣事件且必須直接影響該商品\n- 央行、實質利率或工業需求等對該商品有明確直接影響的重大事件\n- 其他可驗證、會改變該商品供需結構的事件\n\n且用繁體中文顯示`;
  }

  return `搜尋 ${profile.company_name} (${profile.qualified_ticker || profile.underlying_ticker}) 最近 7 天直接相關的重大市場事件。\n\n標的身分（必須以此為準）：\n${identity}\n\n可能名稱：${aliases}\n\n只保留可驗證且直接相關的重大事件，且用繁體中文顯示`;
}


function researchBuildItem(row, profile, payload, searchedAt) {
  const symbol = String(row?.symbol || "").trim().toUpperCase();
  const searchedMs = Date.parse(searchedAt);
  const results = Array.isArray(payload?.results) ? payload.results : [];

  // Tavily remains the only search/answer layer. We DO NOT filter out results.
  // For display language, reuse Tavily's own Traditional-Chinese Answer and map
  // its Chinese segments back onto the raw result list. If a one-to-one segment
  // is unavailable, show a deterministic Chinese fallback instead of raw English.
  const display = researchDisplayFields(payload?.answer || "", results, profile);

  const events = results.map((item, index) => {
    const zh = display.displays?.[index] || {};
    return {
      category: researchEventCategory(item, profile),
      date: researchEventDate(item),
      impact: researchEventImpact(item),
      title: String(item?.title || "近期資訊").slice(0, 300),
      detail: researchCompactSnippet(item, 520),
      display_title_zh_tw: researchToTraditionalChinese(
        String(zh.display_title_zh_tw || `${profile.underlying_ticker || "標的"}｜${researchCategoryLabelZh(researchEventCategory(item, profile))}`)
      ).slice(0, 180),
      display_detail_zh_tw: researchToTraditionalChinese(
        String(zh.display_detail_zh_tw || `Tavily 已找到第 ${index + 1} 則相關資訊；點擊下方查證來源可查看原始文章。`)
      ).slice(0, 520),
      source_index: index + 1,
    };
  });

  const counts = researchImpactCounts(events);
  const verdict = researchVerdictFromEvents(events);

  const sources = results.map((item, index) => ({
    source_index: index + 1,
    title: String(item?.title || item?.url || "來源").slice(0, 300), // raw source title preserved
    display_title_zh_tw: String(events[index]?.display_title_zh_tw || `查證來源 ${index + 1}`).slice(0, 180),
    url: String(item?.url || ""),
    published_date: String(item?.published_date || item?.publishedDate || "").slice(0, 90),
    tavily_score: Number.isFinite(Number(item?.score)) ? Number(item.score) : null,
  }));

  const answer = researchCleanAnswerText(payload?.answer || "");
  const summary = answer || (results.length
    ? `Tavily 最近 7 天找到 ${results.length} 則相關新聞；以下直接顯示搜尋結果，不經第二層 AI 淘汰。`
    : `Tavily 最近 7 天沒有回傳搜尋結果。`);

  return {
    symbol,
    api_symbol: row?.api_symbol || null,
    state_at_search: researchState(row),
    searched_at: searchedAt,
    expires_at: new Date((Number.isFinite(searchedMs) ? searchedMs : Date.now()) + RESEARCH_TTL_MS).toISOString(),
    underlying_ticker: profile.underlying_ticker,
    exchange: profile.exchange || "",
    qualified_ticker: profile.qualified_ticker || profile.underlying_ticker,
    company_name: profile.company_name,
    company_name_zh: profile.company_name_zh || "",
    company_aliases: profile.aliases,
    asset_type: profile.asset_type,
    asset_focus: profile.focus || "",
    verdict,
    impact_counts: counts,
    summary,
    summary_zh_tw: researchToTraditionalChinese(summary),
    last_earnings: { date: "", eps: "not_applicable", revenue: "not_applicable", guidance: "not_applicable" },
    next_earnings_date: "",
    events,
    sources,
    rejected: [],
    model: RESEARCH_PROVIDER,
    api: "tavily-search-api",
    search_mode: "on_demand_tavily20_answer_direct_zhtw",
    research_status: "ON_DEMAND",
    pipeline_version: RESEARCH_PIPELINE_VERSION,
    query: String(payload?.query || ""),
    candidate_count: results.length,
    selected_count: results.length,
    tavily_answer_raw: String(payload?.answer || ""),
    provider_usage: payload?.usage || null,
    request_id: payload?.request_id || null,
    response_time: payload?.response_time ?? null,
  };
}

async function browserSearchResearch(env, row) {
  const symbol = String(row?.symbol || "").trim().toUpperCase();
  const profile = researchCompanyProfile(symbol);
  const query = researchBuildQuery(profile);

  const payload = await tavilySearch(env, {
    query,
    search_depth: "basic",
    topic: "news",
    time_range: "week",
    max_results: 20,
    include_answer: "advanced",
    include_raw_content: false,
    include_images: false,
    include_usage: true,
  });
  payload.query = payload.query || query;

  const item = researchBuildItem(row, profile, payload, new Date().toISOString());
  return { item };
}

async function writeResearchStore(env, cache) {
  const rawEntries = cache?.entries && typeof cache.entries === "object" ? cache.entries : {};
  const entries = {};
  for (const [symbol, item] of Object.entries(rawEntries)) {
    if (researchFresh(item)) entries[String(symbol || "").trim().toUpperCase()] = item;
  }
  const items = Object.values(entries).filter(x => x && typeof x === "object");
  items.sort((a, b) => Date.parse(b.searched_at || "") - Date.parse(a.searched_at || ""));
  const itemsBySymbol = {};
  for (const item of items) {
    const symbol = String(item.symbol || "").trim().toUpperCase();
    if (symbol) itemsBySymbol[symbol] = item;
  }
  const now = new Date().toISOString();
  const latest = {
    schema_version: "3.0",
    generated_at: now,
    ttl_hours: 24,
    model: RESEARCH_PROVIDER,
    provider: "tavily",
    mode: "ON_DEMAND_ONLY",
    items,
    items_by_symbol: itemsBySymbol,
  };
  const normalizedCache = {
    schema_version: "3.0",
    ttl_hours: 24,
    updated_at: now,
    entries,
  };
  const metadata = { httpMetadata: { contentType: "application/json; charset=utf-8" } };
  await Promise.all([
    env.JSON_BUCKET.put(RESEARCH_CACHE_KEY, JSON.stringify(normalizedCache, null, 2), metadata),
    env.JSON_BUCKET.put(RESEARCH_LATEST_KEY, JSON.stringify(latest, null, 2), metadata),
  ]);
  return latest;
}

async function researchUsStockSymbol(request, env, origin) {
  const body = await request.json().catch(() => ({}));
  const symbol = String(body?.symbol || "").trim().toUpperCase();
  if (!/^[A-Z0-9._-]{1,40}$/.test(symbol)) throw httpError(400, "invalid symbol");

  const snapshotObj = await env.JSON_BUCKET.get(MARKET["us-stock"].latest);
  if (!snapshotObj) throw httpError(409, "R2 尚無美股 snapshot；請先至少成功執行一次美股完整分析");
  const snapshot = JSON.parse(await snapshotObj.text());
  const row = (Array.isArray(snapshot?.records) ? snapshot.records : []).find(x => String(x?.symbol || "").trim().toUpperCase() === symbol);
  if (!row) throw httpError(404, `${symbol} 不在目前美股 snapshot`);
  const state = researchState(row);
  if (!RESEARCH_ELIGIBLE_STATES.has(state)) throw httpError(409, `${symbol} 目前是 ${state}，只有 S3 / S0.5 / S1 提供新聞查詢`);

  const cache = await readR2Json(env, RESEARCH_CACHE_KEY, { schema_version:"3.0", ttl_hours:24, entries:{} });
  if (!cache.entries || typeof cache.entries !== "object") cache.entries = {};
  const existing = cache.entries[symbol];
  if (researchFresh(existing)) {
    return json({ ok:true, cached:true, item:existing, generated_at:new Date().toISOString() }, 200, origin);
  }

  const { item } = await browserSearchResearch(env, row);

  // Re-read immediately before write so concurrent on-demand searches are merged.
  const newestCache = await readR2Json(env, RESEARCH_CACHE_KEY, { schema_version:"3.0", ttl_hours:24, entries:{} });
  if (!newestCache.entries || typeof newestCache.entries !== "object") newestCache.entries = {};
  if (researchFresh(newestCache.entries[symbol])) {
    return json({ ok:true, cached:true, item:newestCache.entries[symbol], generated_at:new Date().toISOString() }, 200, origin);
  }
  newestCache.entries[symbol] = item;
  const latest = await writeResearchStore(env, newestCache);
  return json({ ok:true, cached:false, item, generated_at:latest.generated_at, r2_keys:[RESEARCH_CACHE_KEY, RESEARCH_LATEST_KEY] }, 200, origin);
}

const AUTO_STATUS_KEY = "automation/latest/status.json";
const AUTO_BATCH_STALE_MS = 3.5 * 60 * 60 * 1000;

function automationBusy(status) {
  return ["QUEUED", "RUNNING"].includes(String(status?.status || "").toUpperCase()) && !status?.stale;
}

function automationPhaseLabel(status) {
  const phase = String(status?.phase || "QUEUED").toUpperCase();
  if (phase === "CRYPTO") return "加密貨幣分析";
  if (phase === "US_STOCK") return "美股代幣分析";
  if (String(status?.mode || "") === "us-stock-only") return "等待美股代幣分析";
  return "等待加密貨幣分析";
}

async function readAutomationStatus(env, options = {}) {
  const obj = await env.JSON_BUCKET.get(AUTO_STATUS_KEY);
  if (!obj) return { status: "IDLE", phase: "IDLE", busy: false, stale: false };
  let payload;
  try { payload = JSON.parse(await obj.text()); }
  catch (_) { return { status: "IDLE", phase: "IDLE", busy: false, stale: false }; }

  const active = ["QUEUED", "RUNNING"].includes(String(payload?.status || "").toUpperCase());
  const stamp = Date.parse(payload?.updated_at || payload?.created_at || "");
  const stale = active && Number.isFinite(stamp) && (Date.now() - stamp > AUTO_BATCH_STALE_MS);
  if (stale && !options.allowStale) {
    return { ...payload, status: "STALE", busy: false, stale: true, stale_after_minutes: 210 };
  }
  return { ...payload, busy: active && !stale, stale };
}

async function writeAutomationStatus(env, payload) {
  const normalized = {
    ...payload,
    busy: ["QUEUED", "RUNNING"].includes(String(payload?.status || "").toUpperCase()),
    updated_at: payload?.updated_at || new Date().toISOString(),
  };
  await env.JSON_BUCKET.put(AUTO_STATUS_KEY, JSON.stringify(normalized, null, 2), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });
  return normalized;
}

async function dispatchSectorFlow(env, source = "cron") {
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPOSITORY) {
    throw httpError(500, "Worker 缺少 GITHUB_TOKEN 或 GITHUB_REPOSITORY");
  }
  const endpoint = `https://api.github.com/repos/${env.GITHUB_REPOSITORY}/actions/workflows/sector-flow.yml/dispatches`;
  const gh = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
      "X-GitHub-Api-Version": "2026-03-10",
      "User-Agent": "SStateMarketTerminal-SectorFlow-Worker",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref: env.GITHUB_BRANCH || "main" }),
  });
  if (!gh.ok) {
    const text = await gh.text();
    throw httpError(502, `Sector flow workflow_dispatch 失敗：${gh.status} ${text}`);
  }
  console.log(`Sector flow dispatched by ${source}`);
  return { ok: true, source };
}


async function dispatchUsStockSymbolSync(env, source = "cron") {
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPOSITORY) {
    throw httpError(500, "Worker 缺少 GITHUB_TOKEN 或 GITHUB_REPOSITORY");
  }

  const endpoint = `https://api.github.com/repos/${env.GITHUB_REPOSITORY}/actions/workflows/us-stock-symbol-sync.yml/dispatches`;
  const gh = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
      "X-GitHub-Api-Version": "2026-03-10",
      "User-Agent": "SStateMarketTerminal-SymbolSync-Worker",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ref: env.GITHUB_BRANCH || "main",
    }),
  });

  if (!gh.ok) {
    const text = await gh.text();
    throw httpError(502, `US-stock symbol sync workflow_dispatch 失敗：${gh.status} ${text}`);
  }

  console.log(`US-stock symbol sync dispatched by ${source}`);
  return { ok: true, source };
}


async function dispatchAutoBatch(env, mode, source = "cron", checkpointDateTw = "", runLearningAfter = false) {
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPOSITORY) {
    throw httpError(500, "Worker 缺少 GITHUB_TOKEN 或 GITHUB_REPOSITORY");
  }
  if (!['pair','us-stock-only'].includes(mode)) throw httpError(400, 'invalid auto batch mode');

  const current = await readAutomationStatus(env);
  if (automationBusy(current)) {
    console.log(`Auto batch skipped because ${current.batch_id || 'current batch'} is still active.`);
    return { ok: true, skipped: true, reason: "auto_batch_already_active", current };
  }

  const batchId = `auto_${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0,14)}_${mode === 'pair' ? 'pair' : 'stock'}_${crypto.randomUUID().slice(0,8)}`;
  const initial = await writeAutomationStatus(env, {
    batch_id: batchId,
    mode,
    source: "AUTO_CRON",
    cron: source,
    checkpoint_date_tw: checkpointDateTw || null,
    run_learning_after: Boolean(runLearningAfter),
    status: "QUEUED",
    phase: mode === "pair" ? "CRYPTO" : "US_STOCK",
    message: mode === "pair"
      ? "自動排程已啟動：等待加密貨幣分析，完成後自動分析美股代幣"
      : "自動排程已啟動：等待美股代幣分析",
    created_at: new Date().toISOString(),
  });

  const endpoint = `https://api.github.com/repos/${env.GITHUB_REPOSITORY}/actions/workflows/auto-batch.yml/dispatches`;
  const gh = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
      "X-GitHub-Api-Version": "2026-03-10",
      "User-Agent": "SStateMarketTerminal-AutoBatch-Worker",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ref: env.GITHUB_BRANCH || "main",
      inputs: { mode, batch_id: batchId, checkpoint_date_tw: checkpointDateTw || "", run_learning_after: runLearningAfter ? "true" : "false" },
    }),
  });
  if (!gh.ok) {
    const text = await gh.text();
    const failed = await writeAutomationStatus(env, {
      ...initial,
      status: "FAILED",
      phase: "FAILED",
      busy: false,
      message: `GitHub auto-batch dispatch ${gh.status}: ${text}`,
      updated_at: new Date().toISOString(),
    });
    throw httpError(502, `Auto Batch workflow_dispatch 失敗：${gh.status}`);
  }
  return { ok: true, ...initial };
}

async function dispatchDailyLearning(env, source = "cron") {
  if (!env.LEARNING_GITHUB_TOKEN || !env.LEARNING_GITHUB_REPOSITORY) {
    throw httpError(500, "Worker 缺少 LEARNING_GITHUB_TOKEN 或 LEARNING_GITHUB_REPOSITORY");
  }
  const runId = `learn_${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0,14)}_${crypto.randomUUID().slice(0,8)}`;
  const initial = {
    run_id: runId,
    status: "QUEUED",
    source,
    message: "等待 HistoricalTraining Daily S-state Learning",
    created_at: new Date().toISOString(),
  };
  const metadata = { httpMetadata: { contentType: "application/json; charset=utf-8" } };
  await Promise.all([
    env.JSON_BUCKET.put("learning/latest/status.json", JSON.stringify(initial, null, 2), metadata),
    env.JSON_BUCKET.put(`learning/runs/${runId}/status.json`, JSON.stringify(initial, null, 2), metadata),
  ]);

  const endpoint = `https://api.github.com/repos/${env.LEARNING_GITHUB_REPOSITORY}/actions/workflows/daily-learning.yml/dispatches`;
  const gh = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${env.LEARNING_GITHUB_TOKEN}`,
      "X-GitHub-Api-Version": "2026-03-10",
      "User-Agent": "SStateMarketTerminal-Learning-Worker",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ref: env.LEARNING_GITHUB_BRANCH || "main",
      inputs: { run_id: runId },
    }),
  });
  if (!gh.ok) {
    const text = await gh.text();
    const failed = { ...initial, status: "FAILED", message: `GitHub learning dispatch ${gh.status}: ${text}`, updated_at: new Date().toISOString() };
    await Promise.all([
      env.JSON_BUCKET.put("learning/latest/status.json", JSON.stringify(failed, null, 2), metadata),
      env.JSON_BUCKET.put(`learning/runs/${runId}/status.json`, JSON.stringify(failed, null, 2), metadata),
    ]);
    throw httpError(502, `Daily learning workflow_dispatch 失敗：${gh.status}`);
  }
  let dispatch = null;
  try { dispatch = await gh.json(); } catch (_) {}
  const queued = {
    ...initial,
    github_run_id: dispatch?.workflow_run_id || null,
    github_run_url: dispatch?.html_url || null,
    updated_at: new Date().toISOString(),
  };
  await Promise.all([
    env.JSON_BUCKET.put("learning/latest/status.json", JSON.stringify(queued, null, 2), metadata),
    env.JSON_BUCKET.put(`learning/runs/${runId}/status.json`, JSON.stringify(queued, null, 2), metadata),
  ]);
  return { ok: true, ...queued };
}

async function challengerSchemaVersion(env, manifest) {
  const direct = Number(manifest?.schema_version);
  if (Number.isFinite(direct) && direct > 0) return direct;

  const key = String(manifest?.candidate_key || "");
  if (!key) return null;
  try {
    const obj = await env.JSON_BUCKET.get(key);
    if (!obj) return null;
    const model = JSON.parse(await obj.text());
    const schema = Number(model?.schema_version);
    return Number.isFinite(schema) && schema > 0 ? schema : null;
  } catch (_) {
    return null;
  }
}

async function ensureChallenger(env, suppliedLatest = null) {
  const metadata = { httpMetadata: { contentType: "application/json; charset=utf-8" } };

  let latest = suppliedLatest;
  if (!latest) {
    const latestObj = await env.JSON_BUCKET.get("models/candidates/latest.json");
    if (latestObj) latest = JSON.parse(await latestObj.text());
  }

  const currentObj = await env.JSON_BUCKET.get("models/challenger/current.json");
  const current = currentObj ? JSON.parse(await currentObj.text()) : null;
  if (!latest) return current;

  const modelId = safeModelId(latest.model_id);
  const latestSchema = Number(latest?.schema_version);
  const normalizedLatestSchema = Number.isFinite(latestSchema) && latestSchema > 0 ? latestSchema : null;

  if (current?.model_id === modelId) {
    // Backfill schema metadata for challengers created by the pre-v0.1.57 Worker.
    if (!current.schema_version) {
      const resolved = normalizedLatestSchema || await challengerSchemaVersion(env, current);
      if (resolved) {
        current.schema_version = resolved;
        current.dmi_expert_version = latest?.dmi_expert_version || current?.dmi_expert_version || null;
        await env.JSON_BUCKET.put("models/challenger/current.json", JSON.stringify(current, null, 2), metadata);
      }
    }
    return current;
  }

  let replacedModelId = null;
  if (current) {
    const currentSchema = await challengerSchemaVersion(env, current);
    // A schema upgrade is allowed to replace an older-schema shadow model so the
    // evaluator can test the new feature contract. Same-schema daily candidates
    // DO NOT reset the challenger/OOS window.
    const schemaUpgrade = normalizedLatestSchema != null && (
      currentSchema == null ? normalizedLatestSchema >= 3 : normalizedLatestSchema > currentSchema
    );
    if (!schemaUpgrade) return current;

    replacedModelId = current.model_id;
    const supersededAt = new Date().toISOString();
    const superseded = {
      ...current,
      schema_version: currentSchema || current.schema_version || null,
      status: "SUPERSEDED_SCHEMA_UPGRADE",
      superseded_at: supersededAt,
      superseded_by_model_id: modelId,
      superseded_by_schema_version: normalizedLatestSchema,
      note: "Shadow evaluation stopped because a newer model schema became available. Champion remains unchanged."
    };
    await env.JSON_BUCKET.put(`models/candidates/${current.model_id}/status.json`, JSON.stringify(superseded, null, 2), metadata);
  }

  const challenger = {
    model_id: modelId,
    candidate_key: latest.candidate_key || `models/candidates/${modelId}/probability_model.json`,
    generated_at: latest.generated_at || null,
    schema_version: normalizedLatestSchema,
    dmi_expert_version: latest?.dmi_expert_version || null,
    assigned_at: new Date().toISOString(),
    status: "SHADOW_EVALUATION",
    replaced_challenger_model_id: replacedModelId,
    policy: "Evaluate only future settled OOS cases after challenger generated_at; active model remains unchanged until promotion gate passes. A strictly newer schema may replace an older-schema challenger; same-schema daily candidates never reset the OOS window."
  };
  await Promise.all([
    env.JSON_BUCKET.put("models/challenger/current.json", JSON.stringify(challenger, null, 2), metadata),
    env.JSON_BUCKET.put(`models/candidates/${modelId}/status.json`, JSON.stringify(challenger, null, 2), metadata),
  ]);
  return challenger;
}

async function publishActiveModelDirect(env, modelText, source = "manual_publish") {
  const parsed = JSON.parse(modelText);
  const modelId = safeModelId(parsed?.model_id);
  const schemaVersion = Number(parsed?.schema_version || 0) || null;
  const dmiExpertVersion = parsed?.dmi_expert_contract?.version || null;
  const metadata = { httpMetadata: { contentType: "application/json; charset=utf-8" } };

  let previousModelId = null;
  const activeObj = await env.JSON_BUCKET.get("models/active/probability_model.json");
  if (activeObj) {
    const oldText = await activeObj.text();
    const oldModel = JSON.parse(oldText);
    if (oldModel?.model_id) {
      previousModelId = safeModelId(oldModel.model_id);
      if (previousModelId !== modelId) {
        await env.JSON_BUCKET.put(`models/archive/${previousModelId}/probability_model.json`, oldText, metadata);
      }
    }
  }

  const publishedAt = new Date().toISOString();
  const activeManifest = {
    model_id: modelId,
    previous_model_id: previousModelId,
    schema_version: schemaVersion,
    dmi_expert_version: dmiExpertVersion,
    published_at: publishedAt,
    source,
    status: "ACTIVE_CHAMPION"
  };

  await Promise.all([
    env.JSON_BUCKET.put("models/active/probability_model.json", modelText, metadata),
    env.JSON_BUCKET.put("models/active/manifest.json", JSON.stringify(activeManifest, null, 2), metadata),
  ]);

  // If the exact same model was previously occupying the Challenger slot,
  // it is no longer a shadow model after direct publication. Clear only that
  // duplicate challenger; never disturb a different challenger.
  let clearedDuplicateChallenger = false;
  const currentObj = await env.JSON_BUCKET.get("models/challenger/current.json");
  if (currentObj) {
    const current = JSON.parse(await currentObj.text());
    if (current?.model_id === modelId) {
      const candidateStatus = {
        ...current,
        status: "PUBLISHED_ACTIVE",
        published_active_at: publishedAt,
        previous_model_id: previousModelId,
      };
      await env.JSON_BUCKET.put(`models/candidates/${modelId}/status.json`, JSON.stringify(candidateStatus, null, 2), metadata);
      await env.JSON_BUCKET.delete("models/challenger/current.json");
      clearedDuplicateChallenger = true;
    }
  }

  return {
    model_id: modelId,
    previous_model_id: previousModelId,
    schema_version: schemaVersion,
    dmi_expert_version: dmiExpertVersion,
    key: "models/active/probability_model.json",
    manifest_key: "models/active/manifest.json",
    cleared_duplicate_challenger: clearedDuplicateChallenger,
    active_manifest: activeManifest,
  };
}

async function promoteChallenger(env, modelId) {
  const metadata = { httpMetadata: { contentType: "application/json; charset=utf-8" } };
  const currentObj = await env.JSON_BUCKET.get("models/challenger/current.json");
  if (!currentObj) throw httpError(409, "no current challenger");
  const current = JSON.parse(await currentObj.text());
  if (current.model_id !== modelId) throw httpError(409, "requested model is not current challenger");

  const evalObj = await env.JSON_BUCKET.get(`models/candidates/${modelId}/evaluation.json`);
  if (!evalObj) throw httpError(409, "challenger evaluation missing");
  const evaluation = JSON.parse(await evalObj.text());
  if (evaluation.decision !== "PROMOTE") throw httpError(409, `evaluation decision is ${evaluation.decision}, not PROMOTE`);

  const candidateObj = await env.JSON_BUCKET.get(current.candidate_key);
  if (!candidateObj) throw httpError(404, "challenger model object missing");
  const candidateText = await candidateObj.text();
  const candidate = JSON.parse(candidateText);

  const activeObj = await env.JSON_BUCKET.get("models/active/probability_model.json");
  let oldModelId = null;
  if (activeObj) {
    const activeText = await activeObj.text();
    const active = JSON.parse(activeText);
    oldModelId = safeModelId(active.model_id);
    await env.JSON_BUCKET.put(`models/archive/${oldModelId}/probability_model.json`, activeText, metadata);
  }

  const promotedAt = new Date().toISOString();
  const activeManifest = {
    model_id: modelId,
    previous_model_id: oldModelId,
    promoted_at: promotedAt,
    source_candidate_key: current.candidate_key,
    evaluation_key: `models/candidates/${modelId}/evaluation.json`,
    status: "ACTIVE_CHAMPION"
  };
  const candidateStatus = { ...current, status: "PROMOTED", promoted_at: promotedAt, previous_model_id: oldModelId };
  await Promise.all([
    env.JSON_BUCKET.put("models/active/probability_model.json", candidateText, metadata),
    env.JSON_BUCKET.put("models/active/manifest.json", JSON.stringify(activeManifest, null, 2), metadata),
    env.JSON_BUCKET.put(`models/candidates/${modelId}/status.json`, JSON.stringify(candidateStatus, null, 2), metadata),
  ]);
  await env.JSON_BUCKET.delete("models/challenger/current.json");
  await assignLatestIfDifferent(env, modelId);
  return { promoted_model_id: modelId, previous_model_id: oldModelId, active_manifest: activeManifest };
}

async function rejectChallenger(env, modelId) {
  const metadata = { httpMetadata: { contentType: "application/json; charset=utf-8" } };
  const currentObj = await env.JSON_BUCKET.get("models/challenger/current.json");
  if (!currentObj) throw httpError(409, "no current challenger");
  const current = JSON.parse(await currentObj.text());
  if (current.model_id !== modelId) throw httpError(409, "requested model is not current challenger");
  const evalObj = await env.JSON_BUCKET.get(`models/candidates/${modelId}/evaluation.json`);
  if (!evalObj) throw httpError(409, "challenger evaluation missing");
  const evaluation = JSON.parse(await evalObj.text());
  if (evaluation.decision !== "REJECT") throw httpError(409, `evaluation decision is ${evaluation.decision}, not REJECT`);
  const rejectedAt = new Date().toISOString();
  const status = { ...current, status: "REJECTED", rejected_at: rejectedAt, evaluation_key: `models/candidates/${modelId}/evaluation.json` };
  await env.JSON_BUCKET.put(`models/candidates/${modelId}/status.json`, JSON.stringify(status, null, 2), metadata);
  await env.JSON_BUCKET.delete("models/challenger/current.json");
  await assignLatestIfDifferent(env, modelId);
  return { rejected_model_id: modelId };
}

async function assignLatestIfDifferent(env, excludedModelId) {
  const latestObj = await env.JSON_BUCKET.get("models/candidates/latest.json");
  if (!latestObj) return null;
  const latest = JSON.parse(await latestObj.text());
  if (!latest?.model_id || latest.model_id === excludedModelId) return null;
  return await ensureChallenger(env, latest);
}

async function objectResponse(env, key, origin, download, filename) {
  const obj = await env.JSON_BUCKET.get(key);
  if (!obj) return json({ error: "object_not_found", key }, 404, origin);
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  headers.set("ETag", obj.httpEtag);
  if (download) headers.set("Content-Disposition", `attachment; filename="${filename}"`);
  applyCors(headers, origin);
  return new Response(obj.body, { status: 200, headers });
}
function normalizeMarket(v){ const x=String(v||"crypto"); if(!MARKET[x]) throw httpError(400,"market 必須是 crypto 或 us-stock"); return x; }
function safeCheckpointDate(v){ const x=String(v||"").trim(); if(!/^\d{4}-\d{2}-\d{2}$/.test(x)) throw httpError(400,"invalid checkpoint date"); return x; }
function safeChampionGeneration(v){ const n=Number(v); if(!Number.isInteger(n)||n<1||n>999999) throw httpError(400,"invalid champion generation"); return n; }
function championGenerationName(generation){ return `GEN${String(generation).padStart(3,"0")}`; }
function championLedgerShardKey(generation,dateTw){ return `champion/ledger/${championGenerationName(generation)}/${safeCheckpointDate(dateTw)}.json`; }
function safeLedgerDays(v){ const n=Number(v||90); if(!Number.isFinite(n)) throw httpError(400,"invalid ledger days"); return Math.max(1,Math.min(3650,Math.floor(n))); }
function safeOptionalSymbol(v){ const x=String(v||"").trim().toUpperCase(); if(!x) return ""; if(!/^[A-Z0-9._-]{1,40}$/.test(x)) throw httpError(400,"invalid symbol"); return x; }
async function listAllR2ObjectsByPrefix(env,prefix){
  const objects=[]; let cursor=undefined;
  for(let guard=0; guard<100; guard++){
    const page=await env.JSON_BUCKET.list({prefix,cursor,limit:1000});
    objects.push(...(page.objects||[]));
    if(!page.truncated||!page.cursor) break;
    cursor=page.cursor;
  }
  return objects;
}
async function readChampionLedgerRows(env,generation,days,symbol=""){
  const prefix=`champion/ledger/${championGenerationName(generation)}/`;
  const objects=await listAllR2ObjectsByPrefix(env,prefix);
  const cutoffMs=Date.now()-days*86400000;
  const rows=[]; const keys=[];
  const selected=objects.filter(o=>{
    const m=/\/(\d{4}-\d{2}-\d{2})\.json$/.exec(o.key||"");
    if(!m) return false;
    const t=Date.parse(`${m[1]}T00:00:00Z`);
    return Number.isFinite(t) && t>=cutoffMs-86400000;
  }).sort((a,b)=>String(a.key).localeCompare(String(b.key)));
  for(const item of selected){
    const obj=await env.JSON_BUCKET.get(item.key);
    if(!obj) continue;
    let payload=null;
    try{ payload=JSON.parse(await obj.text()); }catch(_){ continue; }
    keys.push(item.key);
    for(const row of (Array.isArray(payload?.records)?payload.records:[])){
      if(symbol && String(row?.symbol||"").toUpperCase()!==symbol) continue;
      rows.push(row);
    }
  }
  rows.sort((a,b)=>(Number(a?.decision_time||0)-Number(b?.decision_time||0))||String(a?.symbol||"").localeCompare(String(b?.symbol||"")));
  return {ok:true,generation,days,symbol:symbol||null,shards:keys.length,keys,rows};
}
function monitorDefaultWatchlist(){
  return { schema_version:"1.0", version:0, updated_at:null, updated_by:null, items:[], sort:{key:"order",dir:"asc"} };
}
function safeMonitorSymbol(v){
  const x=String(v||"").trim().toUpperCase();
  if(!x || x.length>80 || !x.includes("_USDT") || /[\s/?#&\\]/u.test(x)) throw httpError(400,"invalid monitor symbol");
  return x;
}
function safeMonitorInterval(v){
  const x=String(v||"1D").trim();
  if(!["1D","4H"].includes(x)) throw httpError(400,"monitor interval must be 1D or 4H");
  return x;
}
function safeMonitorLimit(v){
  const n=Number(v||180);
  if(!Number.isFinite(n)) throw httpError(400,"invalid monitor kline limit");
  return Math.max(30,Math.min(300,Math.floor(n)));
}
function safeMonitorSort(v){
  const allowed=new Set(["order","note","symbol","day_change_pct","s_state","midline","average_k","cci_sma"]);
  const key=allowed.has(String(v?.key||""))?String(v.key):"order";
  const dir=String(v?.dir||"").toLowerCase()==="desc"?"desc":"asc";
  return {key,dir};
}
function cleanMonitorItem(row,index){
  const symbol=safeMonitorSymbol(row?.symbol);
  const type=String(row?.type||"").toUpperCase()==="SPOT"?"SPOT":"PERP";
  const note=safeMemoText(row?.note,120);
  const orderRaw=Number(row?.order);
  const order=Number.isFinite(orderRaw)?orderRaw:index+1;
  return {symbol,type,note,order};
}
async function readMonitorWatchlist(env){
  const obj=await env.JSON_BUCKET.get(MONITOR_WATCHLIST_KEY);
  if(!obj) return monitorDefaultWatchlist();
  try{
    const p=JSON.parse(await obj.text());
    const items=[];
    for(const [i,row] of (Array.isArray(p?.items)?p.items:[]).slice(0,MONITOR_MAX_ITEMS).entries()){
      try{ items.push(cleanMonitorItem(row,i)); }catch(_){}
    }
    return {schema_version:"1.0",version:Number(p?.version||0),updated_at:p?.updated_at||null,updated_by:p?.updated_by||null,items,sort:safeMonitorSort(p?.sort)};
  }catch(_){ return monitorDefaultWatchlist(); }
}
async function writeMonitorWatchlist(env,body){
  const rows=Array.isArray(body?.items)?body.items:[];
  if(rows.length>MONITOR_MAX_ITEMS) throw httpError(400,`monitor watchlist max ${MONITOR_MAX_ITEMS}`);
  const seen=new Set(); const items=[];
  for(const [i,row] of rows.entries()){
    const item=cleanMonitorItem(row,i);
    if(seen.has(item.symbol)) continue;
    seen.add(item.symbol); items.push(item);
  }
  const current=await readMonitorWatchlist(env);
  const now=new Date().toISOString();
  const payload={schema_version:"1.0",version:Number(current.version||0)+1,updated_at:now,updated_by:safeMemoText(body?.client_id,80)||null,items,sort:safeMonitorSort(body?.sort)};
  await env.JSON_BUCKET.put(MONITOR_WATCHLIST_KEY,JSON.stringify(payload,null,2),{httpMetadata:{contentType:"application/json; charset=utf-8"}});
  return payload;
}
function cleanMonitorPriceAlert(row){
  if(!row || typeof row!=="object") return null;
  let symbol;
  try{ symbol=safeMonitorSymbol(row.symbol); }catch(_){ return null; }
  const type=String(row.type||"").toUpperCase()==="SPOT"?"SPOT":"PERP";
  const target=Number(row.target_price);
  const createdPrice=Number(row.created_price);
  if(!Number.isFinite(target)||target<=0) return null;
  const direction=String(row.direction||"").toUpperCase()==="BELOW"?"BELOW":"ABOVE";
  return {
    id:safeMemoText(row.id,80)||crypto.randomUUID(),
    symbol,type,target_price:target,direction,
    created_price:Number.isFinite(createdPrice)&&createdPrice>0?createdPrice:null,
    created_at:safeMemoText(row.created_at,40)||new Date().toISOString()
  };
}
async function readMonitorPriceAlerts(env){
  const obj=await env.JSON_BUCKET.get(MONITOR_PRICE_ALERTS_KEY);
  if(!obj) return {schema_version:"1.0",updated_at:null,alerts:[]};
  try{
    const p=JSON.parse(await obj.text());
    const alerts=(Array.isArray(p?.alerts)?p.alerts:[]).map(cleanMonitorPriceAlert).filter(Boolean).slice(0,MONITOR_PRICE_ALERT_MAX);
    return {schema_version:"1.0",updated_at:p?.updated_at||null,alerts};
  }catch(_){ return {schema_version:"1.0",updated_at:null,alerts:[]}; }
}
async function writeMonitorPriceAlerts(env,alerts){
  const payload={schema_version:"1.0",updated_at:new Date().toISOString(),alerts:alerts.slice(0,MONITOR_PRICE_ALERT_MAX)};
  await env.JSON_BUCKET.put(MONITOR_PRICE_ALERTS_KEY,JSON.stringify(payload,null,2),{httpMetadata:{contentType:"application/json; charset=utf-8"}});
  return payload;
}
async function upsertMonitorPriceAlert(env,body){
  const symbol=safeMonitorSymbol(body?.symbol);
  const type=String(body?.type||"").toUpperCase()==="SPOT"?"SPOT":"PERP";
  const target=Number(body?.target_price);
  const current=Number(body?.current_price);
  if(!Number.isFinite(target)||target<=0) throw httpError(400,"target_price must be > 0");
  if(!Number.isFinite(current)||current<=0) throw httpError(400,"current_price must be > 0");
  const direction=target>=current?"ABOVE":"BELOW";
  const alert={id:crypto.randomUUID(),symbol,type,target_price:target,direction,created_price:current,created_at:new Date().toISOString()};
  const existing=await readMonitorPriceAlerts(env);
  const alerts=[alert,...existing.alerts.filter(x=>x.symbol!==symbol)];
  const payload=await writeMonitorPriceAlerts(env,alerts);
  return {...payload,alert};
}
async function deleteMonitorPriceAlert(env,body){
  const id=safeMemoText(body?.id,80);
  const symbol=safeMemoText(body?.symbol,80).toUpperCase();
  if(!id&&!symbol) throw httpError(400,"alert id or symbol required");
  const existing=await readMonitorPriceAlerts(env);
  const alerts=existing.alerts.filter(x=>!(id&&x.id===id)&&!(symbol&&x.symbol===symbol));
  const payload=await writeMonitorPriceAlerts(env,alerts);
  return {...payload,deleted:existing.alerts.length-alerts.length};
}
function hasTelegramConfig(env){
  return Boolean(telegramBotToken(env)&&telegramChatId(env));
}
function telegramBotToken(env){
  return String(env.TELEGRAM_BOT_TOKEN||env.TELEGRAM_API||env.TELEGRAM_TOKEN||env.TG_BOT_TOKEN||"").trim();
}
function telegramChatId(env){
  return String(env.TELEGRAM_CHAT_ID||env.TELEGRAM_ID||env.TG_CHAT_ID||"").trim();
}
function alertBaseSymbol(symbol){
  return String(symbol||"").toUpperCase().replace(/_USDT_PERP$/,"").replace(/_USDT$/,"");
}
function alertTradingViewTicker(symbol){
  const base=alertBaseSymbol(symbol);
  return base?`PIONEX:${base}USDT.P`:"";
}
async function loadTradingViewAlertPrices(alerts){
  const rows=alerts.filter(x=>x.type!=="SPOT").map(x=>({alert:x,ticker:alertTradingViewTicker(x.symbol)})).filter(x=>x.ticker);
  const out=new Map();
  for(let i=0;i<rows.length;i+=200){
    const chunk=rows.slice(i,i+200);
    const body={filter:[],options:{lang:"en"},symbols:{query:{types:[]},tickers:chunk.map(x=>x.ticker)},columns:["name","close"],range:[0,Math.max(50,chunk.length+10)]};
    const r=await fetch("https://scanner.tradingview.com/crypto/scan",{method:"POST",headers:{"Accept":"application/json","Content-Type":"text/plain"},body:JSON.stringify(body)});
    if(!r.ok) throw httpError(502,`TradingView alert scan failed: ${r.status}`);
    const p=await r.json();
    const byTv=new Map(chunk.map(x=>[x.ticker,x.alert.symbol]));
    for(const row of (p?.data||[])){
      const symbol=byTv.get(String(row?.s||"").toUpperCase());
      const price=Number(row?.d?.[1]);
      if(symbol&&Number.isFinite(price)&&price>0) out.set(symbol,price);
    }
  }
  return out;
}
async function loadSpotAlertPrices(alerts){
  const spot=alerts.filter(x=>x.type==="SPOT");
  const out=new Map();
  if(!spot.length) return out;
  const p=await loadMonitorTickers("SPOT");
  const wanted=new Set(spot.map(x=>x.symbol));
  for(const row of (p?.tickers||[])){
    const symbol=String(row?.symbol||"").toUpperCase();
    const price=Number(row?.price);
    if(wanted.has(symbol)&&Number.isFinite(price)&&price>0) out.set(symbol,price);
  }
  return out;
}
function monitorAlertReached(alert,price){
  const p=Number(price), target=Number(alert?.target_price);
  if(!Number.isFinite(p)||!Number.isFinite(target)) return false;
  return alert.direction==="BELOW"?p<=target:p>=target;
}
function formatAlertTarget(value){
  const n=Number(value);
  if(!Number.isFinite(n)) return String(value??"");
  if(Number.isInteger(n)) return String(n);
  return n.toFixed(10).replace(/0+$/,"").replace(/\.$/,"");
}
function formatTaiwanDateTime(value=Date.now()){
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}).formatToParts(new Date(value));
  const get=t=>parts.find(x=>x.type===t)?.value||"";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}
async function sendTelegramPriceAlert(env,alert,triggeredAt=Date.now()){
  const token=telegramBotToken(env), chatId=telegramChatId(env);
  if(!token||!chatId) throw httpError(500,"Telegram Worker secrets not configured");
  const text=`${alertBaseSymbol(alert.symbol)}   觸發${formatAlertTarget(alert.target_price)}\n時間：${formatTaiwanDateTime(triggeredAt)}`;
  const r=await fetch(`https://api.telegram.org/bot${token}/sendMessage`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({chat_id:chatId,text,disable_web_page_preview:true})});
  let payload=null; try{payload=await r.json();}catch(_){}
  if(!r.ok||payload?.ok===false) throw httpError(502,`Telegram send failed: ${payload?.description||r.status}`);
  return {text,message_id:payload?.result?.message_id||null};
}
async function checkMonitorPriceAlerts(env,source="manual"){
  const existing=await readMonitorPriceAlerts(env);
  if(!existing.alerts.length) return {source,checked_at:new Date().toISOString(),checked:0,triggered:[],remaining:0,alerts:[]};
  if(!hasTelegramConfig(env)) throw httpError(500,"Telegram Worker secrets not configured");
  const prices=new Map(); const errors=[];
  const [perpResult,spotResult]=await Promise.allSettled([loadTradingViewAlertPrices(existing.alerts),loadSpotAlertPrices(existing.alerts)]);
  if(perpResult.status==="fulfilled") for(const [k,v] of perpResult.value) prices.set(k,v); else errors.push(perpResult.reason?.message||String(perpResult.reason));
  if(spotResult.status==="fulfilled") for(const [k,v] of spotResult.value) prices.set(k,v); else errors.push(spotResult.reason?.message||String(spotResult.reason));
  const remaining=[]; const triggered=[]; const now=Date.now();
  for(const alert of existing.alerts){
    const price=prices.get(alert.symbol);
    if(!Number.isFinite(price)||!monitorAlertReached(alert,price)){remaining.push(alert);continue;}
    try{
      const sent=await sendTelegramPriceAlert(env,alert,now);
      triggered.push({id:alert.id,symbol:alert.symbol,target_price:alert.target_price,price,telegram_message_id:sent.message_id});
    }catch(err){
      remaining.push(alert); errors.push(`${alert.symbol}: ${err?.message||String(err)}`);
    }
  }
  if(triggered.length) await writeMonitorPriceAlerts(env,remaining);
  return {source,checked_at:new Date(now).toISOString(),checked:existing.alerts.length,triggered,remaining:remaining.length,alerts:remaining,errors};
}

function monitorUniverseRow(row,type){
  if(!row||typeof row!=="object") return null;
  if(row.active===false || row.enable===false) return null;
  const status=String(row.status||row.contract_status||"").toUpperCase();
  if(status && !["TRADING","ACTIVE","ONLINE"].includes(status)) return null;
  let symbol=String(row.display_symbol||row.symbol||row.id||"").trim().toUpperCase().replaceAll("/","_");
  if(!symbol) return null;
  if(type==="PERP" && !symbol.endsWith("_PERP") && symbol.endsWith("_USDT")) symbol += "_PERP";
  const quote=String(row.quote||row.quoteCurrency||row.quote_currency||"").trim().toUpperCase() || (symbol.includes("_USDT")?"USDT":"");
  if(quote!=="USDT" || !symbol.includes("_USDT")) return null;
  const base=String(row.base||row.baseCurrency||row.base_currency||"").trim().toUpperCase() || symbol.replace(/_USDT(?:_PERP)?$/,"");
  return {symbol,type,base,quote:"USDT"};
}
function parseMonitorInternal(payload,type){
  const rows=Array.isArray(payload?.data)?payload.data:[];
  return rows.map(row=>monitorUniverseRow(row,type)).filter(Boolean);
}
async function fetchMonitorPublicSymbols(type){
  const u=`https://api.pionex.com/api/v1/common/symbols?type=${encodeURIComponent(type)}`;
  const r=await fetch(u,{headers:{"Accept":"application/json","User-Agent":"Mozilla/5.0 SStateMarketTerminal/0.3"}});
  if(!r.ok) throw httpError(502,`Pionex common/symbols ${type} failed: ${r.status}`);
  const p=await r.json(); const rows=Array.isArray(p?.data?.symbols)?p.data.symbols:[];
  return rows.map(row=>monitorUniverseRow(row,type)).filter(Boolean);
}
function monitorFallbackUniverse(){
  const map=new Map();
  const add=(symbol,type)=>{
    const clean=monitorUniverseRow({symbol,quoteCurrency:"USDT",status:"TRADING",enable:true},type);
    if(clean) map.set(`${clean.type}:${clean.symbol}`,clean);
  };
  for(const base of MONITOR_FALLBACK_CRYPTO){ add(`${base}_USDT_PERP`,"PERP"); add(`${base}_USDT`,"SPOT"); }
  for(const symbol of Object.keys(PIONEX_RWA_SEED_SYMBOLS||{})) add(symbol,"PERP");
  return [...map.values()].sort((a,b)=>a.base.localeCompare(b.base)||a.type.localeCompare(b.type));
}
async function loadMonitorUniverse(env){
  let cached=null;
  try{const obj=await env.JSON_BUCKET.get(MONITOR_UNIVERSE_KEY);if(obj)cached=JSON.parse(await obj.text());}catch(_){}
  if(cached?.symbols?.length){
    return {...cached,cache_state:"R2",partial:false};
  }
  // Never fail the add-symbol dialog. The fallback is intentionally partial;
  // the scheduled GitHub sync will replace it with the complete current Pionex list in R2.
  return {
    schema_version:"pionex-monitor-universe-fallback-v1",
    fetched_at:null,
    source:"embedded fallback (waiting for R2 full-universe sync)",
    symbols:monitorFallbackUniverse(),
    errors:["R2 full Pionex universe not seeded yet"],
    cache_state:"FALLBACK",
    partial:true
  };
}
const MONITOR_RATE_LIMIT_KEY = "pionex/cache/monitor_rate_limit.json";
function monitorKlineCacheKey(symbol,interval){return `pionex/cache/monitor_klines/${interval}/${encodeURIComponent(symbol)}.json`;}
function normalizeMonitorKlines(rows){
  return (Array.isArray(rows)?rows:[]).map(r=>({time:Number(r?.time),open:Number(r?.open),high:Number(r?.high),low:Number(r?.low),close:Number(r?.close),volume:Number(r?.volume||0)})).filter(r=>Number.isFinite(r.time)&&[r.open,r.high,r.low,r.close].every(Number.isFinite)).sort((a,b)=>a.time-b.time);
}
async function fetchMonitorKlines(symbol,interval,limit){
  const u=new URL("https://api.pionex.com/api/v1/market/klines"); u.searchParams.set("symbol",symbol);u.searchParams.set("interval",interval);u.searchParams.set("limit",String(limit));
  const r=await fetch(u.toString(),{headers:{"Accept":"application/json","User-Agent":"Mozilla/5.0 SStateMarketTerminal/0.3.04"}});
  if(r.status===429){
    const e=httpError(429,"Pionex klines temporarily rate-limited; retry later");
    const retry=Number(r.headers.get("Retry-After")||65); e.retryAfter=Number.isFinite(retry)?Math.max(65,retry):65; throw e;
  }
  if(!r.ok) throw httpError(502,`Pionex klines failed: ${r.status}`);
  const p=await r.json(); const rows=p?.data?.klines ?? p?.data; const klines=normalizeMonitorKlines(rows);
  if(!klines.length) throw httpError(502,"Pionex klines returned no data");
  return klines;
}
async function loadMonitorKlines(env,symbol,interval,limit,force=false){
  const key=monitorKlineCacheKey(symbol,interval); let cached=null;
  try{const obj=await env.JSON_BUCKET.get(key);if(obj)cached=JSON.parse(await obj.text());}catch(_){}
  if(!force && cached?.fetched_at && Array.isArray(cached?.klines) && cached.klines.length>=Math.min(limit,30)){
    const age=Date.now()-Date.parse(cached.fetched_at); if(Number.isFinite(age)&&age>=0&&age<MONITOR_KLINE_TTL_MS) return {...cached,klines:cached.klines.slice(-limit),source:"R2_FRESH"};
  }
  try{
    const klines=await fetchMonitorKlines(symbol,interval,limit); const payload={symbol,interval,fetched_at:new Date().toISOString(),klines};
    await env.JSON_BUCKET.put(key,JSON.stringify(payload),{httpMetadata:{contentType:"application/json; charset=utf-8"}});
    return {...payload,source:"PIONEX_LIVE"};
  }catch(e){
    if(e?.status===429){
      const retryAfter=Number(e?.retryAfter||65);
      try{await env.JSON_BUCKET.put(MONITOR_RATE_LIMIT_KEY,JSON.stringify({until:Date.now()+retryAfter*1000,updated_at:new Date().toISOString()}),{httpMetadata:{contentType:"application/json; charset=utf-8"}});}catch(_){}
    }
    if(cached?.klines?.length) return {...cached,klines:cached.klines.slice(-limit),source:"R2_STALE",refresh_error:e?.message||String(e)};
    throw e;
  }
}

async function loadMonitorTickers(type){
  const market=String(type||"PERP").toUpperCase()==="SPOT"?"SPOT":"PERP";
  const cache=typeof caches!=="undefined"?caches.default:null;
  const cacheKey=new Request(`https://sstate-monitor-cache.local/tickers?type=${market}`,{method:"GET"});
  if(cache){
    try{
      const hit=await cache.match(cacheKey);
      if(hit){
        const p=await hit.json();
        if(Array.isArray(p?.tickers)&&p.tickers.length) return {...p,source:"WORKER_CACHE"};
      }
    }catch(_){}
  }
  const u=new URL("https://api.pionex.com/api/v1/market/tickers");
  u.searchParams.set("type",market);
  const r=await fetch(u.toString(),{headers:{"Accept":"application/json","User-Agent":"Mozilla/5.0 SStateMarketTerminal/0.3.05"}});
  if(r.status===429) throw httpError(429,"Pionex tickers temporarily rate-limited; retry later");
  if(!r.ok) throw httpError(502,`Pionex tickers failed: ${r.status}`);
  const p=await r.json();
  const rows=Array.isArray(p?.data?.tickers)?p.data.tickers:[];
  const tickers=rows.map(x=>({
    symbol:String(x?.symbol||"").toUpperCase(),
    time:Number(x?.time||Date.now()),
    price:Number(x?.close)
  })).filter(x=>x.symbol.includes("_USDT")&&Number.isFinite(x.price)&&x.price>0);
  if(!tickers.length) throw httpError(502,"Pionex tickers returned no usable USDT prices");
  const payload={type:market,fetched_at:new Date().toISOString(),source:"PIONEX_TICKERS",tickers};
  if(cache){
    try{
      const resp=new Response(JSON.stringify(payload),{headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"public, max-age=8"}});
      await cache.put(cacheKey,resp);
    }catch(_){}
  }
  return payload;
}

async function proxyPionexPublicWebSocket(request){
  const upgrade=String(request.headers.get("Upgrade")||"").toLowerCase();
  if(upgrade!=="websocket") throw httpError(426,"WebSocket upgrade required");

  // A normal browser connection to wss://ws.pionex.com/wsPub carries an Origin header and
  // Pionex currently rejects that handshake with HTTP 403. An outbound Worker WebSocket
  // upgrade does not inherit the browser Origin, so it can act as a transparent relay.
  const upstreamResponse=await fetch("https://ws.pionex.com/wsPub",{headers:{Upgrade:"websocket"}});
  const upstream=upstreamResponse.webSocket;
  if(upstreamResponse.status!==101||!upstream){
    throw httpError(502,`Pionex WebSocket upstream failed: ${upstreamResponse.status}`);
  }
  upstream.accept();

  const pair=new WebSocketPair();
  const client=pair[0], browser=pair[1];
  browser.accept();
  let closed=false;
  const closeBoth=(code=1000,reason="closed")=>{
    if(closed)return; closed=true;
    try{browser.close(code,reason);}catch(_){}
    try{upstream.close(code,reason);}catch(_){}
  };

  browser.addEventListener("message",event=>{
    try{
      // Heartbeat is handled inside the relay; swallowing browser PONG avoids double replies
      // counting against Pionex's 5 client-messages/sec connection limit.
      if(typeof event.data==="string"){
        try{const m=JSON.parse(event.data);if(String(m?.op||"").toUpperCase()==="PONG")return;}catch(_){}
      }
      upstream.send(event.data);
    }catch(_){closeBoth(1011,"upstream send failed");}
  });
  browser.addEventListener("close",()=>closeBoth(1000,"browser closed"));
  browser.addEventListener("error",()=>closeBoth(1011,"browser socket error"));

  upstream.addEventListener("message",event=>{
    (async()=>{
      try{
        let data=event.data;
        let text=null;
        if(typeof data==="string") text=data;
        else if(data instanceof ArrayBuffer) text=new TextDecoder().decode(data);
        else if(typeof Blob!=="undefined" && data instanceof Blob) text=await data.text();
        if(text!==null){
          try{
            const m=JSON.parse(text);
            if(String(m?.op||"").toUpperCase()==="PING"){
              const pong={op:"PONG"};
              if(Number.isFinite(Number(m?.timestamp)))pong.timestamp=Number(m.timestamp);
              upstream.send(JSON.stringify(pong));
            }
          }catch(_){}
          browser.send(text);
        }else{
          browser.send(data);
        }
      }catch(_){closeBoth(1011,"browser send failed");}
    })();
  });
  upstream.addEventListener("close",()=>closeBoth(1012,"Pionex upstream closed"));
  upstream.addEventListener("error",()=>closeBoth(1011,"Pionex upstream error"));

  return new Response(null,{status:101,webSocket:client});
}

async function readMemoPayload(env){
  const obj = await env.JSON_BUCKET.get(MEMO_KEY);
  if (!obj) return { schema_version:"1.0", updated_at:null, entries:[] };
  try {
    const parsed = JSON.parse(await obj.text());
    const entries = Array.isArray(parsed?.entries) ? parsed.entries.filter(row => row && typeof row === "object").slice(0, MEMO_MAX_ENTRIES) : [];
    return { schema_version:"1.0", updated_at:parsed?.updated_at || null, entries };
  } catch (_) {
    return { schema_version:"1.0", updated_at:null, entries:[] };
  }
}
async function writeMemoPayload(env,payload){
  await env.JSON_BUCKET.put(MEMO_KEY, JSON.stringify(payload,null,2), { httpMetadata:{ contentType:"application/json; charset=utf-8" } });
}
function safeMemoText(v,maxLen){
  return String(v ?? "").replace(/\u0000/g, "").trim().slice(0, maxLen);
}
function safeMemoDatetime(v){
  const x = safeMemoText(v, 32);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(x)) throw httpError(400,"invalid memo datetime");
  return x;
}
function safeRunId(v){ const x=String(v||""); if(!/^[A-Za-z0-9_-]{8,100}$/.test(x)) throw httpError(400,"invalid run_id"); return x; }
function safeModelId(v){ const x=String(v||""); if(!/^[A-Za-z0-9_-]{8,100}$/.test(x)) throw httpError(400,"invalid model_id"); return x; }
function requireInternal(request, env){ const auth=request.headers.get("Authorization")||""; if(!env.CALLBACK_TOKEN || auth!==`Bearer ${env.CALLBACK_TOKEN}`) throw httpError(401,"unauthorized"); }
function httpError(status,message){ const e=new Error(message); e.status=status; return e; }
function json(value,status,origin){ const headers=new Headers({"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}); applyCors(headers,origin); return new Response(JSON.stringify(value,null,2),{status,headers}); }
function cors(response,origin){ const h=new Headers(response.headers); applyCors(h,origin); return new Response(response.body,{status:response.status,headers:h}); }
function applyCors(headers,origin){ headers.set("Access-Control-Allow-Origin",origin); headers.set("Access-Control-Allow-Methods","GET,POST,PUT,DELETE,OPTIONS"); headers.set("Access-Control-Allow-Headers","Content-Type,Authorization"); headers.set("Vary","Origin"); }
