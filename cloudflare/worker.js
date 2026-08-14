
const PIONEX_RWA_CACHE_KEY = "pionex/cache/rwa_trade_rules.json";
const PIONEX_RWA_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

// Pionex web endpoints discovered from the live RWA page.
// Device/fingerprint identifiers are intentionally NOT stored in this public Worker.
const PIONEX_WEB_VERSION = "20260812.1589.6ae8809";
const PIONEX_WEB_COMMON_QUERY =
  `client_id=pionex_web_${PIONEX_WEB_VERSION}&app_ver=${PIONEX_WEB_VERSION}&os=web&tz_name=Asia%2FTaipei&tz_offset=28800&sys_lang=zh-TW&app_lang=zh-TW`;
const PIONEX_FUTURE_MARKETS_URL =
  `https://www.pionex.com/apis/papi/v1/future_markets/?${PIONEX_WEB_COMMON_QUERY}`;
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = env.ALLOWED_ORIGIN || "*";
    if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }), origin);

    try {
      if (request.method === "GET" && url.pathname === "/api/health") {
        return json({ ok: true, service: "SStateMarketTerminal", r2: true }, 200, origin);
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
      if (request.method === "POST" && url.pathname === "/api/research/us-stock/start") {
        return await startUsStockResearch(request, env, origin);
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
        const text = await request.text();
        const parsed = JSON.parse(text); // reject broken snapshots before replacing latest
        if (!parsed || !Array.isArray(parsed.records)) throw new Error("snapshot.records missing");
        const latestKey = MARKET[market].latest;
        const runKey = `runs/${runId}/${MARKET[market].filename}`;
        const metadata = { httpMetadata: { contentType: "application/json; charset=utf-8" } };
        await Promise.all([
          env.JSON_BUCKET.put(latestKey, text, metadata),
          env.JSON_BUCKET.put(runKey, text, metadata),
        ]);
        const status = {
          run_id: runId, market, status: "SUCCESS", percent: 100,
          records: parsed.records.length, snapshot_key: latestKey,
          generated_at_taiwan: parsed.batch?.generated_at_taiwan || null,
          updated_at: new Date().toISOString(),
        };
        await env.JSON_BUCKET.put(`runs/${runId}/status.json`, JSON.stringify(status, null, 2), metadata);
        return json({ ok: true, latest_key: latestKey, run_key: runKey, records: parsed.records.length }, 200, origin);
      }
      if (request.method === "PUT" && url.pathname === "/api/internal/model/active") {
        requireInternal(request, env);
        const text = await request.text();
        JSON.parse(text);
        await env.JSON_BUCKET.put("models/active/probability_model.json", text, { httpMetadata: { contentType: "application/json; charset=utf-8" } });
        return json({ ok: true, key: "models/active/probability_model.json" }, 200, origin);
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
    if (controller.cron === "1 */4 * * *") {
      ctx.waitUntil(dispatchAutoBatch(env, "pair", source));
      return;
    }
    if (controller.cron === "31 13 * * *") {
      ctx.waitUntil(dispatchAutoBatch(env, "us-stock-only", source));
      return;
    }
    if (controller.cron === "25 0 * * *") {
      ctx.waitUntil(dispatchDailyLearning(env, source));
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

async function startUsStockResearch(request, env, origin) {
  await request.json().catch(() => ({}));

  const auto = await readAutomationStatus(env);
  if (automationBusy(auto)) {
    throw httpError(409, `自動排程分析進行中（${automationPhaseLabel(auto)}），目前新聞分析已鎖定`);
  }

  const latestSnapshot = await env.JSON_BUCKET.head(MARKET["us-stock"].latest);
  if (!latestSnapshot) {
    throw httpError(409, "R2 尚無美股 snapshot；請先至少成功執行一次美股完整分析");
  }

  const runId = `research_${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0,14)}_${crypto.randomUUID().slice(0,8)}`;
  const initial = {
    run_id: runId,
    market: "us-stock",
    task: "NEWS_RESEARCH_ONLY",
    status: "QUEUED",
    percent: 0,
    message: "等待 GitHub Actions｜只執行新聞分析，不重跑市場引擎",
    created_at: new Date().toISOString(),
  };
  await env.JSON_BUCKET.put(`runs/${runId}/status.json`, JSON.stringify(initial, null, 2), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });

  if (!env.GITHUB_TOKEN || !env.GITHUB_REPOSITORY) {
    throw httpError(500, "Worker 缺少 GITHUB_TOKEN 或 GITHUB_REPOSITORY");
  }

  const endpoint = `https://api.github.com/repos/${env.GITHUB_REPOSITORY}/actions/workflows/us-stock-research.yml/dispatches`;
  const gh = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
      "X-GitHub-Api-Version": "2026-03-10",
      "User-Agent": "SStateMarketTerminal-NewsResearch-Worker",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ref: env.GITHUB_BRANCH || "main",
      inputs: { run_id: runId },
    }),
  });

  if (!gh.ok) {
    const text = await gh.text();
    const failed = {
      ...initial,
      status: "FAILED",
      message: `GitHub research dispatch ${gh.status}: ${text}`,
      updated_at: new Date().toISOString(),
    };
    await env.JSON_BUCKET.put(`runs/${runId}/status.json`, JSON.stringify(failed, null, 2), {
      httpMetadata: { contentType: "application/json; charset=utf-8" },
    });
    throw httpError(502, `新聞分析 workflow_dispatch 失敗：${gh.status}`);
  }

  let dispatch = null;
  try { dispatch = await gh.json(); } catch (_) {}
  return json({
    ok: true,
    run_id: runId,
    market: "us-stock",
    task: "NEWS_RESEARCH_ONLY",
    github_run_id: dispatch?.workflow_run_id || null,
    github_run_url: dispatch?.html_url || null,
  }, 200, origin);
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

async function dispatchAutoBatch(env, mode, source = "cron") {
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
      inputs: { mode, batch_id: batchId },
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

async function ensureChallenger(env, suppliedLatest = null) {
  const metadata = { httpMetadata: { contentType: "application/json; charset=utf-8" } };
  const currentObj = await env.JSON_BUCKET.get("models/challenger/current.json");
  if (currentObj) return JSON.parse(await currentObj.text());

  let latest = suppliedLatest;
  if (!latest) {
    const latestObj = await env.JSON_BUCKET.get("models/candidates/latest.json");
    if (!latestObj) return null;
    latest = JSON.parse(await latestObj.text());
  }
  const modelId = safeModelId(latest.model_id);
  const challenger = {
    model_id: modelId,
    candidate_key: latest.candidate_key || `models/candidates/${modelId}/probability_model.json`,
    generated_at: latest.generated_at || null,
    assigned_at: new Date().toISOString(),
    status: "SHADOW_EVALUATION",
    policy: "Evaluate only future settled OOS cases after challenger generated_at; active model remains unchanged until promotion gate passes."
  };
  await Promise.all([
    env.JSON_BUCKET.put("models/challenger/current.json", JSON.stringify(challenger, null, 2), metadata),
    env.JSON_BUCKET.put(`models/candidates/${modelId}/status.json`, JSON.stringify(challenger, null, 2), metadata),
  ]);
  return challenger;
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
function safeRunId(v){ const x=String(v||""); if(!/^[A-Za-z0-9_-]{8,100}$/.test(x)) throw httpError(400,"invalid run_id"); return x; }
function safeModelId(v){ const x=String(v||""); if(!/^[A-Za-z0-9_-]{8,100}$/.test(x)) throw httpError(400,"invalid model_id"); return x; }
function requireInternal(request, env){ const auth=request.headers.get("Authorization")||""; if(!env.CALLBACK_TOKEN || auth!==`Bearer ${env.CALLBACK_TOKEN}`) throw httpError(401,"unauthorized"); }
function httpError(status,message){ const e=new Error(message); e.status=status; return e; }
function json(value,status,origin){ const headers=new Headers({"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}); applyCors(headers,origin); return new Response(JSON.stringify(value,null,2),{status,headers}); }
function cors(response,origin){ const h=new Headers(response.headers); applyCors(h,origin); return new Response(response.body,{status:response.status,headers:h}); }
function applyCors(headers,origin){ headers.set("Access-Control-Allow-Origin",origin); headers.set("Access-Control-Allow-Methods","GET,POST,PUT,OPTIONS"); headers.set("Access-Control-Allow-Headers","Content-Type,Authorization"); headers.set("Vary","Origin"); }
