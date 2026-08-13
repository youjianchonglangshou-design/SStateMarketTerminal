(() => {
  "use strict";
  const cfg = window.SSTATE_CONFIG || {};
  const workerUrl = String(cfg.workerUrl || "").replace(/\/$/, "");
  const pollInterval = Number(cfg.pollIntervalMs || 4000);
  const state = { market: localStorage.getItem("sstate-market") || cfg.defaultMarket || "crypto", snapshot: null, filter: "ALL", runId: "", pollTimer: null, champion: null, challenger: null, evaluation: null, battleExpanded: false, battleSignature: "", analysisBusy: false, marketStatuses: {}, marketStatusCheckedAt: "", marketStatusTimer: null, marketSockets: [], marketActivity: {}, marketStatusStartedAt: 0, marketStatusReconnectTimer: null, marketStatusRenderTimer: null, marketStatusSource: "" };

  const $ = (id) => document.getElementById(id);
  const els = {
    version: $("version-chip"), systemCaption: $("system-caption"), market: $("market-select"), run: $("run-button"), download: $("download-button"),
    runPanel: $("run-panel"), runTitle: $("run-title"), runPercent: $("run-percent"), runBar: $("run-bar"), runDetail: $("run-detail"),
    snapshotMeta: $("snapshot-meta"), filters: $("state-filters"), summary: $("summary-strip"), cards: $("cards"), empty: $("empty-state"), toast: $("toast"),
    battleCaption: $("battle-caption"), battleDecision: $("battle-decision"), championId: $("champion-id"), championMeta: $("champion-meta"),
    challengerId: $("challenger-id"), challengerMeta: $("challenger-meta"), battleMetrics: $("battle-metrics"), battleProgress: $("battle-progress"),
    battle: $("model-battle"), battleToggle: $("battle-toggle"), battleBody: $("battle-body")
  };
  els.version.textContent = cfg.appVersion || "TERMINAL v0.1.0";
  els.market.value = state.market;

  const marketFilename = (market) => market === "us-stock" ? "snapshot_us_stock_ai.json" : "snapshot_ai.json";
  const marketLabel = (market) => market === "us-stock" ? "美股代幣" : "加密貨幣";
  const marketJsonButtonLabel = (market) => market === "us-stock" ? "⬇ 美股 JSON" : "⬇ 加密 JSON";
  const marketJsonButtonBusyLabel = (market) => market === "us-stock" ? "⏳ 美股 JSON" : "⏳ 加密 JSON";
  const escapeHtml = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  const pct = (v, digits=1) => Number.isFinite(Number(v)) ? `${(Number(v)*100).toFixed(digits)}%` : "—";
  const num = (v, digits=2) => Number.isFinite(Number(v)) ? Number(v).toFixed(digits) : "—";
  const fmtPrice = (v) => {
    const n = Number(v); if (!Number.isFinite(n)) return "—";
    if (n >= 10000) return n.toLocaleString("en-US", {maximumFractionDigits:1});
    if (n >= 1000) return n.toLocaleString("en-US", {maximumFractionDigits:2});
    if (n >= 100) return n.toFixed(2); if (n >= 10) return n.toFixed(3); if (n >= 1) return n.toFixed(4); if (n >= .01) return n.toFixed(5); if (n >= .0001) return n.toFixed(6); return n.toFixed(8);
  };
  const showToast = (message, timeout=5000) => { els.toast.textContent = message; els.toast.classList.remove("hidden"); clearTimeout(showToast.t); showToast.t=setTimeout(()=>els.toast.classList.add("hidden"), timeout); };


  function updateDownloadButton() {
    const busy = Boolean(state.analysisBusy);
    els.download.disabled = busy;
    els.download.textContent = busy ? marketJsonButtonBusyLabel(state.market) : marketJsonButtonLabel(state.market);
    els.download.title = busy
      ? "完整分析進行中，完成後才能下載最新 JSON"
      : `下載 ${marketLabel(state.market)}｜${marketFilename(state.market)}`;
  }

  function setAnalysisBusy(busy) {
    state.analysisBusy = Boolean(busy);
    els.run.disabled = state.analysisBusy;
    els.market.disabled = state.analysisBusy;
    updateDownloadButton();
  }

  function setBattleExpanded(expanded, markSeen=true) {
    state.battleExpanded = Boolean(expanded);
    els.battle.classList.toggle("collapsed", !state.battleExpanded);
    els.battleBody.classList.toggle("hidden", !state.battleExpanded);
    els.battleToggle.setAttribute("aria-expanded", state.battleExpanded ? "true" : "false");
    els.battleToggle.title = state.battleExpanded ? "收合模型競爭資訊" : "展開模型競爭資訊";
    const arrow = els.battleToggle.querySelector(".battle-arrow");
    if (arrow) arrow.textContent = state.battleExpanded ? "▼" : "▶";
    if (state.battleExpanded && markSeen && state.battleSignature) {
      localStorage.setItem("sstate-battle-seen-signature", state.battleSignature);
      els.battleToggle.classList.remove("has-update");
    }
  }

  function modelBattleSignature(champion, challenger, evaluation) {
    const ageGate = shadowAgeHours(challenger?.assigned_at || challenger?.generated_at) >= 72 ? 1 : 0;
    return JSON.stringify({
      champion: champion?.model_id || "",
      challenger: challenger?.model_id || "",
      challenger_status: challenger?.status || "",
      latest_decision: evaluation?.decision || challenger?.latest_decision || "",
      evaluated_at: evaluation?.evaluated_at || challenger?.latest_evaluated_at || "",
      cases: Number(evaluation?.paired_oos_cases || 0),
      symbols: Number(evaluation?.paired_oos_symbols || 0),
      age_gate: ageGate,
    });
  }

  function updateBattleAttention() {
    const signature = modelBattleSignature(state.champion, state.challenger, state.evaluation);
    state.battleSignature = signature;
    let seen = localStorage.getItem("sstate-battle-seen-signature");
    if (!seen) {
      localStorage.setItem("sstate-battle-seen-signature", signature);
      seen = signature;
    }
    const changed = seen !== signature;
    els.battleToggle.classList.toggle("has-update", changed && !state.battleExpanded);
    if (state.battleExpanded && changed) {
      localStorage.setItem("sstate-battle-seen-signature", signature);
      els.battleToggle.classList.remove("has-update");
    }
  }

  async function fetchJson(url, options={}) {
    const res = await fetch(url, { cache: "no-store", ...options });
    if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(()=>res.statusText)}`);
    return res.json();
  }


  async function fetchOptionalJson(url) {
    try { return await fetchJson(url); } catch (_) { return null; }
  }

  function stopMarketStatusSockets(clearStatuses=true) {
    clearTimeout(state.marketStatusTimer);
    clearTimeout(state.marketStatusReconnectTimer);
    clearTimeout(state.marketStatusRenderTimer);

    for (const ws of state.marketSockets || []) {
      try {
        ws._sstateIntentionalClose = true;
        ws.close();
      } catch (_) {}
    }
    state.marketSockets = [];
    state.marketActivity = {};
    state.marketStatusStartedAt = 0;

    if (clearStatuses) {
      state.marketStatuses = {};
      state.marketStatusCheckedAt = "";
    }
  }

  function scheduleMarketStatusRender() {
    if (state.marketStatusRenderTimer) return;
    state.marketStatusRenderTimer = setTimeout(() => {
      state.marketStatusRenderTimer = null;
      if (state.market === "us-stock") renderCards();
    }, 180);
  }

  function marketDepthSignature(data) {
    const bids = Array.isArray(data?.bids) ? data.bids.slice(0, 3) : [];
    const asks = Array.isArray(data?.asks) ? data.asks.slice(0, 3) : [];
    return JSON.stringify([bids, asks]);
  }

  function markMarketStatus(symbol, status) {
    if (!symbol) return;
    const prev = state.marketStatuses[symbol];
    if (prev === status) return;
    state.marketStatuses[symbol] = status;
    state.marketStatusCheckedAt = new Date().toISOString();
    scheduleMarketStatusRender();
  }

  function sweepMarketActivity() {
    clearTimeout(state.marketStatusTimer);
    if (state.market !== "us-stock") return;

    const now = Date.now();
    const startedAt = Number(state.marketStatusStartedAt || now);

    for (const [symbol, meta] of Object.entries(state.marketActivity || {})) {
      const current = String(state.marketStatuses[symbol] || "WATCHING");
      const firstAt = Number(meta.firstMessageAt || 0);
      const lastChangeAt = Number(meta.lastChangeAt || 0);

      if (current === "TRADING") {
        if (lastChangeAt && now - lastChangeAt > 120_000) {
          markMarketStatus(symbol, "OFFLINE");
        }
      } else if (current === "WATCHING") {
        const basis = firstAt || startedAt;
        if (now - basis > 60_000) {
          markMarketStatus(symbol, "OFFLINE");
        }
      } else if (current === "OFFLINE") {
        if (lastChangeAt && now - lastChangeAt <= 120_000) {
          markMarketStatus(symbol, "TRADING");
        }
      }
    }

    state.marketStatusTimer = setTimeout(sweepMarketActivity, 5_000);
  }

  function scheduleMarketStatusReconnect() {
    if (state.market !== "us-stock" || state.marketStatusReconnectTimer) return;
    state.marketStatusReconnectTimer = setTimeout(() => {
      state.marketStatusReconnectTimer = null;
      if (state.market === "us-stock") loadMarketStatuses();
    }, 4_000);
  }

  function openPionexActivitySocket(symbols) {
    const ws = new WebSocket("wss://ws.pionex.com/wsPub");
    state.marketSockets.push(ws);

    ws.addEventListener("open", () => {
      symbols.forEach((symbol, index) => {
        setTimeout(() => {
          if (ws.readyState !== WebSocket.OPEN || state.market !== "us-stock") return;
          try {
            ws.send(JSON.stringify({
              op: "SUBSCRIBE",
              topic: "DEPTH",
              symbol,
              limit: 5
            }));
          } catch (_) {}
        }, index * 280);
      });
    });

    ws.addEventListener("message", (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch (_) { return; }

      if (String(msg?.op || "").toUpperCase() === "PING") {
        try {
          ws.send(JSON.stringify({ op: "PONG", timestamp: Date.now() }));
        } catch (_) {}
        return;
      }

      if (String(msg?.topic || "").toUpperCase() !== "DEPTH") return;

      const symbol = String(msg?.symbol || "").trim();
      if (!symbol || !state.marketActivity[symbol]) return;

      const signature = marketDepthSignature(msg?.data || {});
      const now = Date.now();
      const meta = state.marketActivity[symbol];

      if (!meta.firstMessageAt) {
        meta.firstMessageAt = now;
        meta.lastSignature = signature;
        markMarketStatus(symbol, "WATCHING");
        return;
      }

      if (signature !== meta.lastSignature) {
        meta.lastSignature = signature;
        meta.lastChangeAt = now;
        meta.changeCount = Number(meta.changeCount || 0) + 1;
        markMarketStatus(symbol, "TRADING");
      }
    });

    ws.addEventListener("close", () => {
      if (!ws._sstateIntentionalClose) scheduleMarketStatusReconnect();
    });

    ws.addEventListener("error", () => {});
  }



  async function loadMarketStatuses() {
    stopMarketStatusSockets(true);
    const requestedMarket = state.market;

    if (requestedMarket !== "us-stock") {
      state.marketStatusSource = "";
      renderCards();
      return;
    }

    const rows = Array.isArray(state.snapshot?.records) ? state.snapshot.records : [];
    const symbols = [...new Set(
      rows.map(r => String(r?.api_symbol || "").trim()).filter(Boolean)
    )];

    if (!symbols.length) {
      renderCards();
      return;
    }

    // First choice: Pionex's own current contract status.
    // Official endpoint returns each PERP with status=TRADING/OFFLINE.
    try {
      const response = await fetch(
        "https://api.pionex.com/api/v1/common/symbols?type=PERP&status=ALL",
        { method:"GET", cache:"no-store", headers:{ "Accept":"application/json" } }
      );

      if (!response.ok) throw new Error(`Pionex symbols ${response.status}`);

      const payload = await response.json();
      const list = Array.isArray(payload?.data?.symbols) ? payload.data.symbols : [];
      const wanted = new Set(symbols);
      let matched = 0;

      state.marketStatuses = {};
      for (const row of list) {
        const symbol = String(row?.symbol || "").trim();
        if (!wanted.has(symbol)) continue;

        const status = String(row?.status || "").toUpperCase();
        if (status === "TRADING" || status === "OFFLINE") {
          state.marketStatuses[symbol] = status;
          matched += 1;
        }
      }

      if (matched > 0) {
        state.marketStatusSource = "PIONEX_REST";
        state.marketStatusCheckedAt = new Date().toISOString();
        renderCards();

        // One public request per minute, from the user's browser IP.
        state.marketStatusTimer = setTimeout(() => {
          if (state.market === "us-stock") loadMarketStatuses();
        }, 60_000);
        return;
      }

      throw new Error("Pionex symbols returned no matching RWA statuses");
    } catch (_) {
      // Browser CORS / temporary rate limit fallback:
      // use Pionex public WebSocket and infer actual order-book activity.
    }

    state.marketStatusSource = "PIONEX_WS";
    state.marketStatusStartedAt = Date.now();
    state.marketStatusCheckedAt = new Date().toISOString();

    for (const symbol of symbols) {
      state.marketStatuses[symbol] = "WATCHING";
      state.marketActivity[symbol] = {
        firstMessageAt: 0,
        lastChangeAt: 0,
        lastSignature: "",
        changeCount: 0,
      };
    }
    renderCards();

    const chunkSize = 20;
    for (let i = 0; i < symbols.length; i += chunkSize) {
      openPionexActivitySocket(symbols.slice(i, i + chunkSize));
    }

    sweepMarketActivity();
  }

  function shortId(v) {
    const s = String(v || "");
    return s ? (s.length > 20 ? `${s.slice(0,20)}…` : s) : "—";
  }

  function ageText(iso) {
    if (!iso) return "—";
    const ms = Date.now() - new Date(iso).getTime();
    if (!Number.isFinite(ms) || ms < 0) return "—";
    const hours = ms / 3600000;
    if (hours < 1) return `${Math.max(0, Math.floor(hours * 60))} 分鐘`;
    if (hours < 48) return `${hours.toFixed(1)} 小時`;
    return `${(hours / 24).toFixed(1)} 天`;
  }

  function decisionZh(decision) {
    return ({
      WAITING_EVIDENCE: "等待證據",
      HOLD: "繼續觀察",
      PROMOTE: "可晉級",
      REJECT: "淘汰",
      SHADOW_EVALUATION: "影子評估中"
    })[decision] || decision || "等待評估";
  }

  function fmtMetric(v, digits=4) {
    return Number.isFinite(Number(v)) ? Number(v).toFixed(digits) : "—";
  }

  async function loadModelBattle() {
    if (!workerUrl) return renderModelBattle();
    const [champion, challenger, evaluation] = await Promise.all([
      fetchOptionalJson(`${workerUrl}/api/model/active?t=${Date.now()}`),
      fetchOptionalJson(`${workerUrl}/api/model/challenger/current?t=${Date.now()}`),
      fetchOptionalJson(`${workerUrl}/api/model/evaluation/latest?t=${Date.now()}`)
    ]);
    state.champion = champion;
    state.challenger = challenger;
    state.evaluation = evaluation;
    renderModelBattle();
    updateBattleAttention();
  }


  function progressPct(value, target) {
    const v = Math.max(0, Number(value) || 0);
    const t = Math.max(1, Number(target) || 1);
    return Math.max(0, Math.min(100, (v / t) * 100));
  }

  function shadowAgeHours(iso) {
    if (!iso) return 0;
    const ts = new Date(iso).getTime();
    if (!Number.isFinite(ts)) return 0;
    return Math.max(0, (Date.now() - ts) / 3600000);
  }

  function countdown72Text(iso) {
    const age = shadowAgeHours(iso);
    const remain = Math.max(0, 72 - age);
    if (remain <= 0) return "72H 年齡門檻已達成";
    const d = Math.floor(remain / 24);
    const h = Math.floor(remain % 24);
    const m = Math.floor((remain * 60) % 60);
    if (d > 0) return `還差 ${d}天 ${h}小時 ${m}分`;
    if (h > 0) return `還差 ${h}小時 ${m}分`;
    return `還差 ${m}分`;
  }

  function progressRow(label, valueText, pctValue, tone="cyan") {
    const pctSafe = Math.max(0, Math.min(100, Number(pctValue) || 0));
    return `
      <div class="shadow-progress-row">
        <div class="shadow-progress-head">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(valueText)}</strong>
        </div>
        <div class="shadow-progress-track">
          <div class="shadow-progress-fill ${tone}" style="width:${pctSafe.toFixed(1)}%"></div>
        </div>
      </div>`;
  }

  function renderModelBattle() {
    const c = state.champion || {};
    const h = state.challenger || {};
    const e = state.evaluation || null;

    els.championId.textContent = shortId(c.model_id);
    els.championMeta.textContent = c.model_id
      ? `目前完整分析使用中｜訓練案例 ${Number(c.training?.cases_count || c.training?.case_count || 0).toLocaleString() || "—"}`
      : "尚未讀到 Active 模型";

    els.challengerId.textContent = shortId(h.model_id);
    els.challengerMeta.textContent = h.model_id
      ? `${decisionZh(h.status)}｜已進場 ${ageText(h.assigned_at || h.generated_at)}｜至少 72H 後才可通過年齡門檻`
      : "目前沒有 Challenger";

    let decision = h.status || "WAITING_EVIDENCE";
    if (e?.challenger_model_id === h.model_id && e?.decision) decision = e.decision;
    els.battleDecision.textContent = decisionZh(decision);
    els.battleDecision.className = `battle-decision ${String(decision).toLowerCase().replace(/_/g,"-")}`;

    if (!h.model_id) {
      els.battleCaption.textContent = "Active 模型正常；目前尚未指派 Challenger。";
      els.battleMetrics.innerHTML = "";
      els.battleProgress.innerHTML = "";
      return;
    }

    const generated = h.assigned_at || h.generated_at;
    els.battleCaption.textContent =
      `Active ${shortId(c.model_id)}｜Challenger ${shortId(h.model_id)}｜Shadow 起點 ${generated ? new Date(generated).toLocaleString("zh-TW",{hour12:false}) : "—"}`;

    if (!e || e.challenger_model_id !== h.model_id) {
      const assigned = h.assigned_at || h.generated_at;
      const ageH = shadowAgeHours(assigned);
      els.battleMetrics.innerHTML = [
        ["OOS 已結算案例","等待第一批 72H settlement"],
        ["最低證據","180 cases / 50 symbols"],
        ["最早可判定","Challenger 年齡 ≥ 72H"],
        ["目前動作","Active 不變，Challenger 只做 Shadow"]
      ].map(([k,v])=>`<div class="battle-metric"><span>${escapeHtml(k)}</span><strong>${escapeHtml(v)}</strong></div>`).join("");
      els.battleProgress.innerHTML =
        progressRow("72H Shadow 年齡", `${ageH.toFixed(1)}H / 72H｜${countdown72Text(assigned)}`, progressPct(ageH,72), "cyan") +
        progressRow("OOS settled cases", "0 / 180", 0, "yellow") +
        progressRow("OOS symbols", "0 / 50", 0, "purple");
      return;
    }

    const active = e.active || {};
    const challenger = e.challenger || {};
    const pBetter = Number(e.bootstrap_probability_challenger_brier_better);
    const oosCases = Number(e.paired_oos_cases || 0);
    const oosSymbols = Number(e.paired_oos_symbols || 0);
    const assigned = h.assigned_at || h.generated_at;
    const ageH = shadowAgeHours(assigned);

    els.battleMetrics.innerHTML = [
      ["OOS cases", oosCases.toLocaleString()],
      ["OOS symbols", oosSymbols.toLocaleString()],
      ["Champion Brier", fmtMetric(active.multiclass_brier)],
      ["Challenger Brier", fmtMetric(challenger.multiclass_brier)],
      ["Challenger 較佳信心", Number.isFinite(pBetter) ? pct(pBetter,1) : "—"],
      ["Decision", decisionZh(e.decision)]
    ].map(([k,v])=>`<div class="battle-metric"><span>${escapeHtml(k)}</span><strong>${escapeHtml(v)}</strong></div>`).join("");

    els.battleProgress.innerHTML =
      progressRow("72H Shadow 年齡", `${ageH.toFixed(1)}H / 72H｜${countdown72Text(assigned)}`, progressPct(ageH,72), "cyan") +
      progressRow("OOS settled cases", `${oosCases.toLocaleString()} / 180`, progressPct(oosCases,180), "yellow") +
      progressRow("OOS symbols", `${oosSymbols.toLocaleString()} / 50`, progressPct(oosSymbols,50), "purple");
  }

  async function loadSnapshot() {
    const market = state.market;
    let source = "R2";
    try {
      if (!workerUrl) throw new Error("Worker 尚未設定");
      state.snapshot = await fetchJson(`${workerUrl}/api/snapshot?market=${encodeURIComponent(market)}&t=${Date.now()}`);
    } catch (err) {
      source = "GitHub bootstrap";
      try {
        state.snapshot = await fetchJson(`data/bootstrap/${marketFilename(market)}?t=${Date.now()}`);
      } catch (_) {
        state.snapshot = null;
      }
    }
    renderAll(source);
    loadMarketStatuses();
  }

  function renderAll(source) {
    const snap = state.snapshot;
    if (!snap || !Array.isArray(snap.records)) {
      els.cards.innerHTML=""; els.summary.innerHTML=""; els.empty.classList.remove("hidden");
      els.systemCaption.textContent = `${marketLabel(state.market)}｜尚無最後一次分析資料`;
      return;
    }
    els.empty.classList.add("hidden");
    const b = snap.batch || {};
    const pm = b.probability_model || {};
    els.systemCaption.textContent = `${marketLabel(state.market)}｜UPDATED ${b.generated_at_taiwan || "—"}｜ENGINE ${b.engine_version || "—"}｜AI ${b.ai_analysis_layer || "—"}`;
    els.snapshotMeta.textContent = `資料源：${source}｜${b.count ?? snap.records.length} 標的｜Probability ${pm.available ? `${pm.model_id || "active"} / max L${pm.max_level || "?"}` : "未載入"}｜主判定 72H（3日）`;
    renderFilters(); renderSummary(); renderCards();
  }

  function renderFilters() {
    const counts = (state.snapshot?.breadth?.market_state) || {};
    const order = ["ALL","S3","S0.5","S1","S2","S0","OTHER"];
    els.filters.innerHTML = order.map(k => `<button class="filter ${filterStateClass(k)} ${state.filter===k?'active':''}" data-filter="${k}">${k==='ALL'?'全部':k} ${k==='ALL'?(state.snapshot?.records?.length||0):(counts[k]||0)}</button>`).join("");
    els.filters.querySelectorAll("button").forEach(btn => btn.addEventListener("click", () => { state.filter=btn.dataset.filter; renderFilters(); renderCards(); }));
  }

  function renderSummary() {
    // v0.1.7: secondary summary pills removed; the top-right S-state filter row remains.
    els.summary.innerHTML = "";
    els.summary.classList.add("hidden");
  }

  function recordState(r) { return r?.opportunity_long?.market_state_id || "OTHER"; }
  function stateRank(s){ return ({"S3":0,"S0.5":1,"S1":2,"S2":3,"S0":4,"OTHER":5})[s] ?? 9; }

  function renderCards() {
    let rows = [...(state.snapshot?.records || [])];
    if (state.filter !== "ALL") rows = rows.filter(r => recordState(r) === state.filter);
    rows.sort((a,b) => stateRank(recordState(a))-stateRank(recordState(b)) || Number(b.historical_probability?.["72h"]?.success_probability||0)-Number(a.historical_probability?.["72h"]?.success_probability||0));
    els.cards.innerHTML = rows.map(renderCard).join("");
    bindChartCrosshairs();
  }

  function stateClass(s){ if(s==='S3')return 'state-s3'; if(s==='S2')return 'state-s2'; if(s==='S1')return 'state-s1'; if(s==='S0.5')return 'state-s05'; if(s==='S0')return 'state-s0'; return 'state-other'; }
  function filterStateClass(s){ return s==='ALL'?'filter-all':stateClass(s); }
  function targetLabel(s){ return s==='S0.5'?'3日內轉強':s==='S2'?'3日內轉S3':s==='S1'?'3日內上攻':'3日內續強'; }

  function renderProbability(r) {
    const hp = r.historical_probability || {}; const h72 = hp["72h"] || {};
    if (!hp.available || !h72.available) return "";
    const f=hp.features||{};
    const featureLine = `${midHuman(f.midline_state)}｜位置${bandHuman(f.bandpos_bin)}｜${f.trigger_stage||'T0'}｜${bwHuman(f.bandwidth_trend)}｜狀態年齡 ${ageHuman(f.state_age_bin)}`;
    return `<div class="prob-wrap"><span class="pill prob-pill">📊 ${targetLabel(recordState(r))} <strong>${pct(h72.success_probability,0)}</strong></span><div class="prob-card">
      <div class="prob-title">${escapeHtml(r.symbol)}｜${escapeHtml(recordState(r))}</div>
      <div class="prob-row success"><span>● 3日成功</span><span>${pct(h72.success_probability)}</span></div>
      <div class="prob-row alive"><span>● 還活著</span><span>${pct(h72.alive_slow_probability)}</span></div>
      <div class="prob-row fail"><span>● 真失敗</span><span>${pct(h72.true_fail_probability)}</span></div>
      <div class="prob-row other"><span>● 其他</span><span>${pct(h72.other_probability)}</span></div>
      <div class="prob-row"><span>結構存活率</span><span>${pct(h72.structural_survival_probability)}</span></div>
      <div class="prob-row"><span>匹配樣本</span><span>${Number(h72.matched_samples||hp.matched_samples||0).toLocaleString()}</span></div>
      <div class="prob-row"><span>模型層級</span><span>Level ${h72.level||hp.model_level||'—'}</span></div>
      <div class="prob-meta">24H ${pct(hp['24h']?.success_probability,0)}｜48H ${pct(hp['48h']?.success_probability,0)}<br>${escapeHtml(featureLine)}</div>
    </div></div>`;
  }
  function renderChartQuickStats(r) {
    const hp = r.historical_probability || {};
    const h72 = hp["72h"] || {};
    if (!hp.available || !h72.available) return "";
    const fail = pct(h72.true_fail_probability);
    const survival = pct(h72.structural_survival_probability);
    const samples = Number(h72.matched_samples || hp.matched_samples || 0).toLocaleString();
    const level = h72.level || hp.model_level || "—";
    return `<div class="chart-quick-stats" aria-label="72H historical quick stats">
      <span class="chart-stat fail"><i></i><b>失敗</b> ${fail}</span>
      <span class="chart-stat survival"><i></i><b>存活</b> ${survival}</span>
      <span class="chart-stat samples"><i></i><b>樣本</b> ${samples}</span>
      <span class="chart-stat level">L${escapeHtml(level)}</span>
    </div>`;
  }

  function midHuman(v){return ({rising:'中軌上斜',flat:'中軌平緩',flattening:'中軌走平',falling:'中軌下斜'})[v]||'中軌未知'}
  function bandHuman(v){return ({LT_025:'<0.25','025_050':'0.25-0.50','050_060':'0.50-0.60','060_075':'0.60-0.75',GE_075:'>0.75'})[v]||'?'}
  function bwHuman(v){return ({EXPANDING:'布林擴張',CONTRACTING:'布林收縮',FLAT:'布林平穩'})[v]||'布林未知'}
  function ageHuman(v){return ({'1':'1根4H','2_3':'2-3根4H','4_6':'4-6根4H','7_PLUS':'7+根4H'})[v]||'—'}

  function renderMarketStatusBadge(r) {
    if (state.market !== "us-stock") return "";
    const apiSymbol = String(r?.api_symbol || "").trim();
    const status = String(state.marketStatuses?.[apiSymbol] || "").toUpperCase();
    if (!status) return "";

    const source = state.marketStatusSource;
    const checked = state.marketStatusCheckedAt
      ? new Date(state.marketStatusCheckedAt).toLocaleTimeString("zh-TW", {hour12:false, hour:"2-digit", minute:"2-digit"})
      : "";

    if (status === "TRADING") {
      const title = source === "PIONEX_REST"
        ? `Pionex 合約狀態：TRADING${checked ? `｜${checked}` : ""}`
        : `Pionex WebSocket：偵測到訂單簿活動${checked ? `｜${checked}` : ""}`;
      return `<div class="market-session-badge trading" title="${title}">
        <i></i><span>交易中</span>
      </div>`;
    }

    if (status === "OFFLINE") {
      const title = source === "PIONEX_REST"
        ? `Pionex 合約狀態：OFFLINE${checked ? `｜${checked}` : ""}`
        : `Pionex WebSocket：近期未偵測到訂單簿活動${checked ? `｜${checked}` : ""}`;
      return `<div class="market-session-badge offline" title="${title}">
        <i></i><span>休市</span>
      </div>`;
    }

    if (status === "WATCHING") {
      return `<div class="market-session-badge watching" title="Pionex REST 無法使用，改用 WebSocket 建立活動判斷">
        <i></i><span>監測中</span>
      </div>`;
    }

    return "";
  }

  function renderCard(r) {
    const opp=r.opportunity_long||{}, s=recordState(r), mid=opp.midline||{}, sectors=(r.sectors||[]).join(' · ')||'未分類';
    const move=Number(r.bb_pct||0); const moveClass=move>=0?'up':'down';
    const h4prev=String(r.h4_prev||''); const h4curr=String(r.h4_curr||'');
    const lamp = (x)=> x==='green'||x==='🟢'?'<span class="g">●</span>':x==='red'||x==='🔴'?'<span class="r">●</span>':'●';
    return `<article class="card">
      <div class="card-header"><div class="identity"><div>${escapeHtml(r.symbol)}　現價 ${fmtPrice(r.price)}　｜ 日前偏離 <span class="move ${moveClass}">${move>=0?'+':''}${num(move)}%</span></div><div class="lights">4H前 ${lamp(h4prev)}　｜　4H當 ${lamp(h4curr)}</div></div>
      <div class="badges"><div class="badge-row"><span class="pill state-pill ${stateClass(s)}">${escapeHtml(opp.stars_text||'★☆☆☆☆')} ${escapeHtml(s)}｜${escapeHtml(opp.market_state_name||opp.setup_name||'')}</span><span class="pill mid-pill">中軌 ${escapeHtml(mid.symbol||'?')} ${escapeHtml(mid.label||'未知')}</span></div><div class="badge-row">${renderProbability(r)}<span class="pill sector-pill">${escapeHtml(sectors)}</span></div></div></div>
      <div class="chart">${buildChartSvg(r.chart_30d||[])}${renderMarketStatusBadge(r)}${renderChartQuickStats(r)}</div>
    </article>`;
  }

  function chartTinyExponent(value) {
    const n = Math.abs(Number(value));
    if (!Number.isFinite(n) || n <= 0 || n >= 0.001) return 0;
    // Number of zeroes after the decimal before the first non-zero digit.
    // Example 0.0000029045 -> 5, displayed as 0.29045e-5 (TradingView-like).
    return Math.max(1, Math.floor(-Math.log10(n)));
  }

  function fmtChartPrice(value, exponent=0) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "—";
    if (exponent > 0) {
      const scaled = n * Math.pow(10, exponent);
      let s = scaled.toFixed(5).replace(/0+$/,'').replace(/\.$/,'');
      if (!s.includes('.')) s += '.0';
      return `${s}e-${exponent}`;
    }
    return fmtPrice(n);
  }

  function bindChartCrosshairs() {
    els.cards.querySelectorAll('svg.chart-svg').forEach(svg => {
      const L=Number(svg.dataset.l||42), R=Number(svg.dataset.r||14), T=Number(svg.dataset.t||12), B=Number(svg.dataset.b||24);
      const W=Number(svg.dataset.w||760), H=Number(svg.dataset.h||260);
      const min=Number(svg.dataset.min), max=Number(svg.dataset.max), count=Math.max(2,Number(svg.dataset.count||2));
      const exponent=Number(svg.dataset.exp||0);
      let dates=[];
      try { dates=JSON.parse(decodeURIComponent(svg.dataset.dates||'%5B%5D')); } catch (_) {}
      const innerW=W-L-R, innerH=H-T-B;
      const group=svg.querySelector('.tv-crosshair');
      const vline=svg.querySelector('.tv-cross-v');
      const hline=svg.querySelector('.tv-cross-h');
      const priceBox=svg.querySelector('.tv-price-box');
      const priceText=svg.querySelector('.tv-price-text');
      const dateBox=svg.querySelector('.tv-date-box');
      const dateText=svg.querySelector('.tv-date-text');
      if (!group || !vline || !hline || !priceBox || !priceText || !dateBox || !dateText) return;

      const hide=()=>group.setAttribute('visibility','hidden');
      svg.addEventListener('pointerleave', hide);
      svg.addEventListener('pointermove', ev => {
        const rect=svg.getBoundingClientRect();
        if (!rect.width || !rect.height) return hide();
        const vx=(ev.clientX-rect.left)/rect.width*W;
        const vy=(ev.clientY-rect.top)/rect.height*H;
        if (vx<L || vx>W-R || vy<T || vy>H-B) return hide();

        const idx=Math.max(0,Math.min(count-1,Math.round((vx-L)/innerW*(count-1))));
        const snapX=L+idx*(innerW/(count-1));
        const price=max-((vy-T)/innerH)*(max-min);
        const date=String(dates[idx]||'—');
        const priceLabel=fmtChartPrice(price,exponent);

        vline.setAttribute('x1',snapX); vline.setAttribute('x2',snapX);
        hline.setAttribute('y1',vy); hline.setAttribute('y2',vy);

        const pw=Math.max(48,Math.min(88,priceLabel.length*6.2+12));
        const py=Math.max(T,Math.min(H-B-20,vy-10));
        priceBox.setAttribute('x',1); priceBox.setAttribute('y',py); priceBox.setAttribute('width',pw);
        priceText.setAttribute('x',1+pw/2); priceText.setAttribute('y',py+13.5); priceText.textContent=priceLabel;

        const dw=Math.max(46,Math.min(78,date.length*6.2+14));
        const dx=Math.max(L,Math.min(W-R-dw,snapX-dw/2));
        dateBox.setAttribute('x',dx); dateBox.setAttribute('y',H-B+2); dateBox.setAttribute('width',dw);
        dateText.setAttribute('x',dx+dw/2); dateText.setAttribute('y',H-B+15.5); dateText.textContent=date;
        group.setAttribute('visibility','visible');
      });
    });
  }

  function buildChartSvg(points) {
    if (!Array.isArray(points) || points.length < 2) return '<div class="caption">無30日圖表資料</div>';
    const W=760,H=260,L=42,R=14,T=12,B=24, innerW=W-L-R, innerH=H-T-B;
    const vals=[]; points.forEach(p=>['bb_upper','bb_midline','bb_lower','ha_close'].forEach(k=>{const n=Number(p[k]);if(Number.isFinite(n)) vals.push(n)}));
    let min=Math.min(...vals), max=Math.max(...vals); const pad=(max-min||1)*.08; min-=pad; max+=pad;
    const x=(i)=>L+i*(innerW/(points.length-1)); const y=(v)=>T+(max-Number(v))/(max-min)*innerH;
    const linePath=(key)=>points.map((p,i)=>`${i?'L':'M'}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join(' ');
    const refPrice=Number(points[points.length-1]?.ha_close || points[points.length-1]?.close || max);
    const tinyExp=chartTinyExponent(refPrice);
    let grids=''; for(let i=0;i<4;i++){const yy=T+i*innerH/3; const val=max-i*(max-min)/3; grids+=`<line class="grid-line" x1="${L}" y1="${yy}" x2="${W-R}" y2="${yy}"/><text class="axis-text" x="2" y="${yy+3}">${escapeHtml(fmtChartPrice(val,tinyExp))}</text>`}
    let ladder=''; for(let i=0;i<points.length-1;i++){const p=points[i], q=points[i+1]; const cls=(p.ha_color==='yellow')?'ladder-yellow':'ladder-purple'; const x1=x(i),x2=x(i+1),yy=y(p.ha_close),y2=y(q.ha_close); ladder+=`<path class="${cls}" d="M${x1},${yy} H${x2} V${y2}"/>`;}
    const last=points[points.length-1], lc=last.ha_color==='yellow'?'#fde047':'#bba4e8';
    const labels=[0,Math.floor((points.length-1)/3),Math.floor((points.length-1)*2/3),points.length-1].map(i=>`<text class="axis-text" x="${x(i)-10}" y="${H-4}" transform="rotate(-35 ${x(i)-10} ${H-4})">${escapeHtml(points[i].date||'')}</text>`).join('');
    const dates=encodeURIComponent(JSON.stringify(points.map(p=>String(p.date||''))));
    const crosshair=`<g class="tv-crosshair" visibility="hidden" pointer-events="none">
      <line class="tv-cross-line tv-cross-v" x1="${L}" y1="${T}" x2="${L}" y2="${H-B}"/>
      <line class="tv-cross-line tv-cross-h" x1="${L}" y1="${T}" x2="${W-R}" y2="${T}"/>
      <rect class="tv-cross-label tv-price-box" x="1" y="${T}" width="54" height="20" rx="3"/>
      <text class="tv-cross-label-text tv-price-text" x="28" y="${T+13.5}" text-anchor="middle">—</text>
      <rect class="tv-cross-label tv-date-box" x="${L}" y="${H-B+2}" width="48" height="20" rx="3"/>
      <text class="tv-cross-label-text tv-date-text" x="${L+24}" y="${H-B+15.5}" text-anchor="middle">—</text>
    </g>`;
    return `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" data-w="${W}" data-h="${H}" data-l="${L}" data-r="${R}" data-t="${T}" data-b="${B}" data-min="${min}" data-max="${max}" data-count="${points.length}" data-exp="${tinyExp}" data-dates="${dates}">${grids}<path class="bb-line" d="${linePath('bb_upper')}"/><path class="mid-line" d="${linePath('bb_midline')}"/><path class="bb-line" d="${linePath('bb_lower')}"/>${ladder}<circle class="last-dot" cx="${x(points.length-1)}" cy="${y(last.ha_close)}" r="5" fill="${lc}"/>${labels}${crosshair}</svg>`;
  }

  function renderVolumeProgress(percent) {
    const p = Math.max(0, Math.min(100, Number(percent) || 0));
    const total = 24;
    const active = Math.round((p / 100) * total);
    els.runBar.innerHTML = Array.from({length: total}, (_, i) => {
      const on = i < active ? " active" : "";
      const level = i < 8 ? "low" : i < 16 ? "mid" : "high";
      return `<span class="volume-cell ${level}${on}" style="--cell:${i}"></span>`;
    }).join("");
  }

  async function startFullAnalysis() {
    if (!workerUrl) { showToast('尚未設定 Cloudflare Worker。先部署 cloudflare/worker.js，再把 URL 填到 config.js。',7000); return; }
    setAnalysisBusy(true);
    setRunUi(true,0,'正在送出 GitHub Actions…','建立本次 run_id');
    try {
      const out=await fetchJson(`${workerUrl}/api/analysis/start`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({market:state.market})});
      state.runId=out.run_id;
      showToast(`完整分析已啟動｜${out.run_id}`);
      pollRun();
    } catch(err){
      state.runId='';
      setAnalysisBusy(false);
      setRunUi(false,0,'','');
      showToast(`完整分析啟動失敗：${err.message}`,8000);
    }
  }

  function setRunUi(show,percent,title,detail){
    els.runPanel.classList.toggle('hidden',!show);
    els.runPercent.textContent=`${Math.round(Number(percent)||0)}%`;
    renderVolumeProgress(percent);
    els.runTitle.textContent=title||'';
    els.runDetail.textContent=detail||'';
  }

  async function pollRun(){
    clearTimeout(state.pollTimer); if(!state.runId)return;
    try{
      const s=await fetchJson(`${workerUrl}/api/analysis/status?run_id=${encodeURIComponent(state.runId)}&t=${Date.now()}`);
      const p=Number(s.percent||0);
      setRunUi(true,p,s.status==='SUCCESS'?'分析完成':s.status==='FAILED'?'分析失敗':'完整分析執行中',`${s.current_symbol||''} ${s.completed??''}/${s.total??''} ${s.message||''}`.trim());
      if(s.status==='SUCCESS'){
        state.runId='';
        setAnalysisBusy(false);
        await Promise.all([loadSnapshot(),loadModelBattle()]);
        setRunUi(false,100,'','');
        showToast('完整分析完成，畫面已切換到 R2 最新資料。',7000);
        return;
      }
      if(s.status==='FAILED'){
        state.runId='';
        setAnalysisBusy(false);
        setRunUi(false,0,'','');
        showToast(`分析失敗：${s.message||'請查看 GitHub Actions'}`,9000);
        return;
      }
    }catch(err){setRunUi(true,0,'等待 GitHub Actions 回報',err.message)}
    state.pollTimer=setTimeout(pollRun,pollInterval);
  }

  async function downloadCurrentJson(){
    if(state.analysisBusy){ showToast('完整分析進行中，完成後才能下載最新 JSON。',5000); return; }
    if(workerUrl){try{const res=await fetch(`${workerUrl}/api/download?market=${encodeURIComponent(state.market)}&t=${Date.now()}`);if(res.ok){const blob=await res.blob();downloadBlob(blob,marketFilename(state.market));return}}catch(_){} }
    if(state.snapshot) downloadBlob(new Blob([JSON.stringify(state.snapshot,null,2)],{type:'application/json'}),marketFilename(state.market));
  }
  function downloadBlob(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500)}

  els.market.addEventListener('change',async()=>{
    state.market=els.market.value;
    localStorage.setItem('sstate-market',state.market);
    state.filter='ALL';
    updateDownloadButton();
    await loadSnapshot();
  });
  els.run.addEventListener('click',startFullAnalysis);
  els.download.addEventListener('click',downloadCurrentJson);
  els.battleToggle.addEventListener('click',()=>setBattleExpanded(!state.battleExpanded));
  setBattleExpanded(false, false);
  updateDownloadButton();
  renderVolumeProgress(0);
  window.addEventListener("beforeunload",()=>stopMarketStatusSockets(false));
  Promise.all([loadSnapshot(), loadModelBattle()]);
})();
