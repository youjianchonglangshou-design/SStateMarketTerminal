(() => {
  "use strict";
  const cfg = window.SSTATE_CONFIG || {};
  const workerUrl = String(cfg.workerUrl || "").replace(/\/$/, "");
  const pollInterval = Number(cfg.pollIntervalMs || 4000);
  const RESEARCH_PIPELINE_VERSION = "tavily-answer-direct-zhtw-v9-asset-identity";
  const state = { market: localStorage.getItem("sstate-market") || cfg.defaultMarket || "crypto", snapshot: null, filter: "ALL", searchQuery: "", runId: "", pollTimer: null, champion: null, sectorFlow: null, sectorFlowExpanded: false, sectorFlowHover: "", sectorFlowTimer: null, analysisBusy: false, autoBatchBusy: false, autoBatchStatus: null, autoBatchTimer: null, usStockResearch: null, researchSymbolBusy: new Set(), researchSymbolErrors: Object.create(null), marketStatuses: {}, marketStatusCheckedAt: "", marketStatusTimer: null, marketSockets: [], marketActivity: {}, marketStatusStartedAt: 0, marketStatusReconnectTimer: null, marketStatusRenderTimer: null, marketStatusSource: "" };

  const $ = (id) => document.getElementById(id);
  const els = {
    version: $("version-chip"), systemCaption: $("system-caption"), market: $("market-select"), search: $("symbol-search"), run: $("run-button"), download: $("download-button"),
    runPanel: $("run-panel"), runTitle: $("run-title"), runPercent: $("run-percent"), runBar: $("run-bar"), runDetail: $("run-detail"),
    snapshotMeta: $("snapshot-meta"), filters: $("state-filters"), summary: $("summary-strip"), cards: $("cards"), empty: $("empty-state"), toast: $("toast"),
    sectorFlow: $("sector-flow"), sectorFlowToggle: $("sector-flow-toggle"), sectorFlowBody: $("sector-flow-body"), sectorFlowCaption: $("sector-flow-caption"),
    sectorFlowLeader: $("sector-flow-leader"), sectorWheel: $("sector-wheel"), sectorFlowDetail: $("sector-flow-detail")
  };
  els.version.textContent = cfg.appVersion || "TERMINAL v0.1.78｜CCI-SYNC-CROSSHAIR";
  els.market.value = state.market;

  const marketFilename = (market) => market === "us-stock" ? "snapshot_us_stock_ai.json" : "snapshot_ai.json";
  const marketLabel = (market) => market === "us-stock" ? "美股代幣" : "加密貨幣";
  const marketJsonButtonLabel = (market) => market === "us-stock" ? "⬇ 美股 JSON" : "⬇ 加密 JSON";
  const marketJsonButtonBusyLabel = (market) => market === "us-stock" ? "⏳ 美股 JSON" : "⏳ 加密 JSON";

  // PropW 可交易標的 ↔ SState/Pionex RWA symbol 對照。
  // 只保留目前 Terminal 已確認存在、且能對上 PropW 清單的標的；不猜測尚未存在的 symbol。
  const PROPW_PIONEX_SYMBOL_MAP = Object.freeze({
    XAG: "XAG",
    XAU: "XAU",
    AAPLX: "AAPL",
    TSLAX: "TSLA",
    INTCX: "INTC",
    MSTRX: "MSTR",
    NVDAX: "NVDA",
    CRCLX: "CRCL",
    COINX: "COIN",
    HOODX: "HOOD",
    AMZNX: "AMZN",
    GOOGLX: "GOOGL",
    CRMX: "CRM",
    MUX: "MU",
    EWYX: "EWY",
    AMDX: "AMD",
    MRVLX: "MRVL",
    SKHX: "SKHYNIX",
    SMSN: "SAMSUNG",
    HYUNDAI: "HYUNDAI",
    NOWX: "NOW"
  });
  const escapeHtml = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  const pct = (v, digits=1) => Number.isFinite(Number(v)) ? `${(Number(v)*100).toFixed(digits)}%` : "—";
  const num = (v, digits=2) => Number.isFinite(Number(v)) ? Number(v).toFixed(digits) : "—";
  const finiteIndicator = (v) => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v));
  // generated_at_taiwan is already Taiwan local time. Display it directly without
  // parsing through Date(), so the browser will not apply another timezone shift.
  const fmtTaiwanTimestamp = (v) => {
    const s = String(v || "").trim();
    if (!s) return "—";
    const m = s.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})/);
    return m ? `${m[1]} ${m[2]}` : s.replace("T", " ").replace(/(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/, "");
  };
  const fmtPrice = (v) => {
    const n = Number(v); if (!Number.isFinite(n)) return "—";
    if (n >= 10000) return n.toLocaleString("en-US", {maximumFractionDigits:1});
    if (n >= 1000) return n.toLocaleString("en-US", {maximumFractionDigits:2});
    if (n >= 100) return n.toFixed(2); if (n >= 10) return n.toFixed(3); if (n >= 1) return n.toFixed(4); if (n >= .01) return n.toFixed(5); if (n >= .0001) return n.toFixed(6); return n.toFixed(8);
  };
  const showToast = (message, timeout=5000) => { els.toast.textContent = message; els.toast.classList.remove("hidden"); clearTimeout(showToast.t); showToast.t=setTimeout(()=>els.toast.classList.add("hidden"), timeout); };


  function autoBatchTitle() {
    const s = state.autoBatchStatus || {};
    const phase = String(s.phase || '').toUpperCase();
    if (phase === 'CRYPTO') return '自動排程分析進行中｜目前：加密貨幣分析｜完成後將自動分析美股代幣';
    if (phase === 'US_STOCK') return '自動排程分析進行中｜目前：美股代幣分析';
    if (String(s.mode || '') === 'us-stock-only') return '自動排程分析進行中｜等待美股代幣分析';
    return '自動排程分析進行中｜等待加密貨幣分析，完成後將自動分析美股代幣';
  }

  function updateActionState() {
    const manualBusy = Boolean(state.analysisBusy);
    const autoBusy = Boolean(state.autoBatchBusy);
    els.run.disabled = manualBusy || autoBusy;
    els.run.classList.toggle('auto-batch-locked', autoBusy);
    els.run.textContent = autoBusy ? '⚡🚫 完整分析' : '⚡ 完整分析';
    els.run.title = autoBusy ? autoBatchTitle() : (manualBusy ? '完整分析執行中' : `只分析目前選取的${marketLabel(state.market)}`);

    // Per-symbol Tavily search is an independent event. It never locks the
    // market selector or the Full Analysis button.
    els.market.disabled = manualBusy;
    updateDownloadButton();
  }

  function updateDownloadButton() {
    const busy = Boolean(state.analysisBusy || state.autoBatchBusy);
    els.download.disabled = busy;
    els.download.textContent = busy ? marketJsonButtonBusyLabel(state.market) : marketJsonButtonLabel(state.market);
    els.download.title = busy
      ? (state.autoBatchBusy ? `${autoBatchTitle()}｜完成後才能下載最新 JSON` : '完整分析進行中，完成後才能下載最新 JSON')
      : `下載 ${marketLabel(state.market)}｜${marketFilename(state.market)}`;
  }

  function setAnalysisBusy(busy) {
    state.analysisBusy = Boolean(busy);
    updateActionState();
  }

  function applyAutoBatchStatus(payload) {
    const wasBusy = Boolean(state.autoBatchBusy);
    state.autoBatchStatus = payload || null;
    state.autoBatchBusy = Boolean(payload?.busy || ['QUEUED','RUNNING'].includes(String(payload?.status || '').toUpperCase()));
    updateActionState();
    if (wasBusy && !state.autoBatchBusy) {
      Promise.all([loadSnapshot(), loadChampionModel()]).catch(()=>{});
    }
  }

  async function pollAutomationStatus() {
    clearTimeout(state.autoBatchTimer);
    if (!workerUrl) return;
    try {
      const payload = await fetchJson(`${workerUrl}/api/automation/status?t=${Date.now()}`);
      applyAutoBatchStatus(payload);
    } catch (_) {
      // Do not lock the UI merely because the status endpoint is temporarily unreachable.
    }
    state.autoBatchTimer = setTimeout(pollAutomationStatus, 5000);
  }

  async function fetchJson(url, options={}) {
    const res = await fetch(url, { cache: "no-store", ...options });
    if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(()=>res.statusText)}`);
    return res.json();
  }


  async function fetchOptionalJson(url) {
    try { return await fetchJson(url); } catch (_) { return null; }
  }

  const SECTOR_ORDER = ["TECH","FIN","HEALTH","CD","CS","COMM","IND","ENERGY","UTIL","RE","MAT"];
  const SECTOR_LABELS = {
    TECH:"科技", FIN:"金融", HEALTH:"醫療", CD:"非必需消費", CS:"必需消費", COMM:"通訊",
    IND:"工業", ENERGY:"能源", UTIL:"公用事業", RE:"房地產", MAT:"原物料"
  };
  // State Street Select Sector SPDR 是 11 大標準 sector；Pionex 主頁現有分類是 us_stock_sec_* 題材 tag。
  // 只把有明確父層關係的 Pionex 題材放進 11 大板塊，不對「熱門 / S&P500 / NASDAQ100」做猜測。
  const PIONEX_PARENT_SECTOR = Object.freeze({
    "半導體晶片":"TECH", "半導體":"TECH", "費城半導體":"TECH", "量子計算":"TECH",
    "銀行":"FIN", "生物科技/醫藥":"HEALTH", "消費":"CD", "軍工":"IND", "航太/太空":"IND",
    "石油":"ENERGY", "核能":"UTIL", "房地產":"RE", "稀土":"MAT", "大宗商品":"MAT"
  });
  // 少數 Pionex 個股只有泛用 tag；對常見大型股給標準 GICS 父層，避免熱門/NASDAQ tag 讓它們落到「無對應」。
  const SYMBOL_PARENT_SECTOR = Object.freeze({
    AAPLX:"TECH", AMDX:"TECH", AMATX:"TECH", ARMX:"TECH", ASMLX:"TECH", AVGOX:"TECH", CSCOX:"TECH", DELLX:"TECH", IBMX:"TECH", INTCX:"TECH", KLACX:"TECH", LITEX:"TECH", LRCXX:"TECH", MRVLX:"TECH", MSFTX:"TECH", MUX:"TECH", NVDAX:"TECH", ORCLX:"TECH", QCOMX:"TECH", SMCIX:"TECH", SNDKX:"TECH", TSMX:"TECH",
    COINX:"FIN", HOODX:"FIN", PAYPX:"FIN",
    HIMSX:"HEALTH", LLYX:"HEALTH", UNHX:"HEALTH",
    AMZNX:"CD", TSLAX:"CD", GMEX:"CD",
    METAX:"COMM", GOOGLX:"COMM", NFLXX:"COMM",
    LMTX:"IND", RKLBX:"IND", RTXX:"IND",
    CVXX:"ENERGY", LNGX:"ENERGY",
    CEGX:"UTIL", OKLOX:"UTIL",
    MPX:"MAT", MOSX:"MAT", NTRX:"MAT", USARX:"MAT"
  });

  function setSectorFlowExpanded(expanded) {
    if (!els.sectorFlow || !els.sectorFlowBody || !els.sectorFlowToggle) return;
    state.sectorFlowExpanded = Boolean(expanded);
    els.sectorFlow.classList.toggle("collapsed", !state.sectorFlowExpanded);
    els.sectorFlowBody.classList.toggle("hidden", !state.sectorFlowExpanded);
    els.sectorFlowToggle.setAttribute("aria-expanded", state.sectorFlowExpanded ? "true" : "false");
    els.sectorFlowToggle.title = state.sectorFlowExpanded ? "收合美股板塊資金羅盤" : "展開美股板塊資金羅盤";
    const arrow = els.sectorFlowToggle.querySelector(".sector-flow-arrow");
    if (arrow) arrow.textContent = state.sectorFlowExpanded ? "▼" : "▶";
    if (state.sectorFlowExpanded) renderSectorFlow();
  }

  function sectorById(id) {
    return (state.sectorFlow?.sectors || []).find(x => String(x?.id || "") === String(id || "")) || null;
  }

  function formatFlowMoney(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "—";
    const sign = n > 0 ? "+" : n < 0 ? "-" : "";
    const abs = Math.abs(n);
    if (abs >= 1e9) return `${sign}$${(abs/1e9).toFixed(abs >= 1e11 ? 1 : 2)}B`;
    if (abs >= 1e6) return `${sign}$${(abs/1e6).toFixed(abs >= 1e8 ? 0 : 1)}M`;
    if (abs >= 1e3) return `${sign}$${(abs/1e3).toFixed(0)}K`;
    return `${sign}$${abs.toFixed(0)}`;
  }

  function formatSignedPctPoint(value, digits=3) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "—";
    return `${n > 0 ? "+" : ""}${n.toFixed(digits)}%`;
  }

  function broadSectorsForRecord(r) {
    const out = new Set();
    const direct = SYMBOL_PARENT_SECTOR[String(r?.symbol || "").toUpperCase()];
    if (direct) out.add(direct);
    for (const label of (Array.isArray(r?.sectors) ? r.sectors : [])) {
      const mapped = PIONEX_PARENT_SECTOR[String(label || "").trim()];
      if (mapped) out.add(mapped);
    }
    return [...out];
  }

  function hudOpportunityPriority(r) {
    const opp = r?.opportunity_long || {};
    const s = recordState(r);
    const current = opp.current || {};
    const bp = Number(current.ha_band_position);
    const wave2 = opp?.purple_structure?.wave2_pullback || {};
    const phase = String(wave2.pullback_phase || "");
    const b = Number.isFinite(bp) ? bp : 9;
    // 沿用現有 S-state 邏輯：S2 不是固定高於 S1。
    // S2 已回到 0.50~0.68 中軌回踩區時優先於 S1；高位剛轉紫 early_upper_pullback 則低於健康 S1。
    if (s === "S3") return 500 + Math.max(0, .75 - b) * 100;
    if (s === "S0.5") return 420 + Math.max(0, .5 - Math.abs(b-.5)) * 20;
    if (s === "S2" && phase === "midline_retest_zone") return 390 + Math.max(0, .68 - b) * 120;
    if (s === "S1") return 360 + Math.max(0, .75 - b) * 70;
    if (s === "S2") return 330 + Math.max(0, .78 - b) * 30;
    if (s === "S0") return 200;
    return 100;
  }

  function hudOpportunityReason(r) {
    const opp = r?.opportunity_long || {};
    const s = recordState(r);
    const bp = Number(opp?.current?.ha_band_position);
    const wave2 = opp?.purple_structure?.wave2_pullback || {};
    const phase = String(wave2.pullback_phase || "");
    const pos = Number.isFinite(bp) ? `BB ${bp.toFixed(2)}` : "BB —";
    if (s === "S2" && phase === "midline_retest_zone") return `中軌回踩區｜${pos}｜S2→S3觀察`;
    if (s === "S2" && phase === "early_upper_pullback") return `高位剛轉紫｜${pos}｜仍離中軌較遠`;
    if (s === "S1") return `1浪突破｜${pos}`;
    if (s === "S3") return `3浪啟動｜${pos}`;
    if (s === "S0.5") return `優質反轉｜${pos}`;
    return `${escapeHtml(opp.market_state_name || opp.setup_name || s)}｜${pos}`;
  }

  function sectorTopTokens(sectorId) {
    if (state.market !== "us-stock") return [];
    return [...(state.snapshot?.records || [])]
      .filter(r => broadSectorsForRecord(r).includes(sectorId))
      .sort((a,b) => hudOpportunityPriority(b) - hudOpportunityPriority(a) || String(a.symbol||"").localeCompare(String(b.symbol||"")))
      .slice(0,3);
  }

  function sectorTokenStateClass(s) {
    return s === "S3" ? "s3" : s === "S0.5" ? "s05" : s === "S2" ? "s2" : s === "S1" ? "s1" : "other";
  }

  function renderSectorDetail(id) {
    if (!els.sectorFlowDetail) return;
    const row = sectorById(id);
    if (!row) {
      els.sectorFlowDetail.innerHTML = `<div class="sector-flow-detail-kicker">NO DATA</div><div class="sector-flow-detail-title">尚無板塊資料</div><div class="sector-flow-detail-note">等待下一次 21:31 排程完成。</div>`;
      return;
    }
    const strength = row.flow_strength || {};
    const flowClass = Number(row.flow_pct) >= 0 ? "up" : "down";
    const score = strength.available ? Number(strength.score).toFixed(0) : "—";
    const top = sectorTopTokens(row.id);
    const tokenHtml = top.length ? top.map((r,i) => {
      const s = recordState(r);
      return `<div class="sector-token"><span class="sector-token-rank">${i+1}</span><div class="sector-token-main"><div class="sector-token-symbol">${escapeHtml(r.symbol||"—")}</div><div class="sector-token-reason">${hudOpportunityReason(r)}</div></div><span class="sector-token-state ${sectorTokenStateClass(s)}">${escapeHtml(s)}</span></div>`;
    }).join("") : `<div class="sector-flow-empty-token">目前 Pionex 分類中沒有可明確對應到此 11 大板塊的美股代幣；不使用「熱門 / 指數成分」標籤硬猜。</div>`;
    els.sectorFlowDetail.innerHTML = `
      <div class="sector-flow-detail-kicker">${escapeHtml(row.id)} · STATE STREET SPDR</div>
      <div class="sector-flow-detail-title">${escapeHtml(row.label || SECTOR_LABELS[row.id] || row.name || row.id)}</div>
      <div class="sector-flow-detail-note">資料日 ${escapeHtml(row.data_as_of || "—")}｜Δ Shares × NAV 推算 1D 資金，再除以前一交易日 AUM。</div>
      <div class="sector-flow-stats">
        <div class="sector-flow-stat"><span>RAW 1D FLOW</span><strong class="${flowClass}">${formatFlowMoney(row.flow_1d_usd)}</strong></div>
        <div class="sector-flow-stat"><span>FLOW / AUM</span><strong class="${flowClass}">${formatSignedPctPoint(row.flow_pct)}</strong></div>
        <div class="sector-flow-stat"><span>FLOW STRENGTH</span><strong>${score}${strength.available ? " / 100" : ""}</strong></div>
        <div class="sector-flow-stat"><span>NAV 1D</span><strong class="${Number(row.perf_1d_pct)>=0?'up':'down'}">${formatSignedPctPoint(row.perf_1d_pct,2)}</strong></div>
      </div>
      <div class="sector-sample">20D 基準樣本 <b>${Number(strength.sample_prior || 0)} / ${Number(strength.sample_target || 20)}</b>${strength.available ? `｜Z ${Number(strength.z).toFixed(2)}` : "｜累積中"}</div>
      <div class="sector-top-title">PIONEX｜目前板塊 TOP 3（沿用 S-state + S2 BB 位置）</div>
      <div class="sector-token-list">${tokenHtml}</div>`;
  }

  function polar(cx, cy, r, angleDeg) {
    const a = (angleDeg - 90) * Math.PI / 180;
    return {x: cx + r * Math.cos(a), y: cy + r * Math.sin(a)};
  }

  function sectorSlicePath(cx, cy, r, start, end) {
    const p1 = polar(cx,cy,r,end), p2 = polar(cx,cy,r,start);
    const large = end - start <= 180 ? 0 : 1;
    return `M ${cx} ${cy} L ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} A ${r} ${r} 0 ${large} 0 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)} Z`;
  }

  function renderSectorWheel() {
    if (!els.sectorWheel) return;
    const flow = state.sectorFlow;
    const rows = Array.isArray(flow?.sectors) ? flow.sectors : [];
    if (rows.length !== 11) {
      els.sectorWheel.innerHTML = `<div class="sector-flow-empty-token">尚無完整 11 大板塊資料。部署 Worker + sector-flow workflow 後，下一次 21:31 會自動建立。</div>`;
      return;
    }
    const map = Object.fromEntries(rows.map(x => [x.id,x]));
    const leaderId = String(flow.leader || "");
    const leaderIndex = Math.max(0, SECTOR_ORDER.indexOf(leaderId));
    const step = 360 / SECTOR_ORDER.length;
    const cx=260, cy=260, r=232;
    let paths="", labels="";
    SECTOR_ORDER.forEach((id,index)=>{
      const row=map[id]||{};
      const start=index*step, end=(index+1)*step;
      const mid=(start+end)/2;
      const lp=polar(cx,cy,184,mid);
      const positive=Number(row.flow_pct)>0, negative=Number(row.flow_pct)<0;
      const klass = id===leaderId ? "leader" : positive ? "positive" : negative ? "negative" : "neutral";
      paths += `<path class="sector-slice ${klass}" data-sector="${escapeHtml(id)}" d="${sectorSlicePath(cx,cy,r,start,end)}"></path>`;
      labels += `<text class="sector-label" x="${lp.x.toFixed(1)}" y="${(lp.y-5).toFixed(1)}">${escapeHtml(id)}</text><text class="sector-label-sub" x="${lp.x.toFixed(1)}" y="${(lp.y+11).toFixed(1)}">${escapeHtml(SECTOR_LABELS[id]||"")}</text>`;
    });
    const leaderAngle = leaderIndex*step + step/2;
    const end = polar(cx,cy,151,leaderAngle);
    const left = polar(end.x,end.y,15,leaderAngle-145);
    const right = polar(end.x,end.y,15,leaderAngle+145);
    const leaderRow=map[leaderId]||{};
    const strength=leaderRow.flow_strength||{};
    const centerValue = strength.available ? `${Number(strength.score).toFixed(0)}` : formatSignedPctPoint(leaderRow.flow_pct,2);
    const centerSub = strength.available ? "FLOW STRENGTH" : "FLOW / AUM";
    els.sectorWheel.innerHTML = `<svg viewBox="0 0 520 520" role="img" aria-label="美股11大板塊資金流向">
      ${paths}${labels}
      <line class="sector-pointer" x1="260" y1="260" x2="${end.x.toFixed(1)}" y2="${end.y.toFixed(1)}"></line>
      <polygon class="sector-pointer-head" points="${end.x.toFixed(1)},${end.y.toFixed(1)} ${left.x.toFixed(1)},${left.y.toFixed(1)} ${right.x.toFixed(1)},${right.y.toFixed(1)}"></polygon>
      <circle class="sector-center-ring" cx="260" cy="260" r="69"></circle>
      <circle class="sector-center-dot" cx="260" cy="260" r="8"></circle>
      <text class="sector-center-title" x="260" y="230">${escapeHtml(leaderId||"—")}</text>
      <text class="sector-center-value" x="260" y="286">${escapeHtml(centerValue)}</text>
      <text class="sector-center-sub" x="260" y="304">${escapeHtml(centerSub)}</text>
    </svg>`;
    els.sectorWheel.querySelectorAll(".sector-slice").forEach(path=>{
      path.addEventListener("mouseenter",()=>{
        state.sectorFlowHover=path.dataset.sector||leaderId;
        els.sectorWheel.querySelectorAll(".sector-slice").forEach(x=>x.classList.toggle("hovered",x===path));
        renderSectorDetail(state.sectorFlowHover);
      });
      path.addEventListener("mouseleave",()=>{
        els.sectorWheel.querySelectorAll(".sector-slice").forEach(x=>x.classList.remove("hovered"));
        state.sectorFlowHover=leaderId;
        renderSectorDetail(leaderId);
      });
    });
  }

  function renderSectorFlow() {
    if (!els.sectorFlow) return;
    const show = state.market === "us-stock";
    els.sectorFlow.classList.toggle("hidden", !show);
    if (!show) return;
    const flow = state.sectorFlow;
    if (!flow || !Array.isArray(flow.sectors) || flow.sectors.length !== 11) {
      els.sectorFlowCaption.textContent = "尚無 21:31 板塊資金資料｜等待 sector-flow 首次成功排程";
      els.sectorFlowLeader.textContent = "WAITING";
      els.sectorFlowLeader.className = "sector-flow-leader waiting";
      if (state.sectorFlowExpanded) { renderSectorWheel(); renderSectorDetail(""); }
      return;
    }
    const leader = sectorById(flow.leader);
    const strength = leader?.flow_strength || {};
    const dates = Array.isArray(flow.data_dates) ? flow.data_dates : [];
    const dateText = dates.length === 1 ? dates[0] : dates.length ? `${dates[0]} ~ ${dates[dates.length-1]}` : "—";
    const sample = Number(strength.sample_prior || 0);
    els.sectorFlowCaption.textContent = `State Street SPDR｜資料日 ${dateText}｜21:31 TW 自動更新｜20D 樣本 ${sample}/20`;
    const allOut = String(flow.flow_regime) === "all_non_positive";
    els.sectorFlowLeader.textContent = allOut ? `全流出｜${flow.leader} 相對最強` : `資金指向｜${flow.leader}`;
    els.sectorFlowLeader.className = `sector-flow-leader ${allOut ? "outflow" : "ready"}`;
    state.sectorFlowHover = state.sectorFlowHover && sectorById(state.sectorFlowHover) ? state.sectorFlowHover : flow.leader;
    if (state.sectorFlowExpanded) {
      renderSectorWheel();
      renderSectorDetail(state.sectorFlowHover);
    }
  }

  async function loadSectorFlow() {
    if (state.market !== "us-stock") { renderSectorFlow(); return; }
    if (!workerUrl) { state.sectorFlow = null; renderSectorFlow(); return; }
    const payload = await fetchOptionalJson(`${workerUrl}/api/sector-flow?t=${Date.now()}`);
    if (payload?.sectors?.length === 11) state.sectorFlow = payload;
    renderSectorFlow();
  }

  async function loadUsStockResearch() {
    if (state.market !== "us-stock" || !workerUrl) {
      state.usStockResearch = null;
      return;
    }
    try {
      state.usStockResearch = await fetchJson(`${workerUrl}/api/research/us-stock/latest?t=${Date.now()}`);
    } catch (_) {
      state.usStockResearch = { schema_version: "2.0", ttl_hours: 24, items: [], items_by_symbol: {} };
    }
    if (state.snapshot?.records) renderCards();
  }

  function currentResearchFor(symbol) {
    if (state.market !== "us-stock") return null;
    const key = String(symbol || "").trim().toUpperCase();
    return state.usStockResearch?.items_by_symbol?.[key] || null;
  }

  function researchExpiresAt(info) {
    if (!info || typeof info !== 'object') return 0;
    const direct = Date.parse(info.expires_at || '');
    if (Number.isFinite(direct)) return direct;
    const searched = Date.parse(info.searched_at || '');
    return Number.isFinite(searched) ? searched + 24 * 60 * 60 * 1000 : 0;
  }

  function researchIsFresh(info) {
    if (!info || typeof info !== 'object') return false;
    if (['ERROR','DEFERRED','SKIPPED_NON_COMPANY'].includes(String(info.research_status || '').toUpperCase())) return false;
    if (info.api !== 'tavily-search-api') return false;
    if (info.pipeline_version !== RESEARCH_PIPELINE_VERSION) return false;
    const expires = researchExpiresAt(info);
    return expires > Date.now();
  }

  function researchEligible(r) {
    return state.market === 'us-stock' && ['S3','S0.5','S1'].includes(recordState(r));
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
    clearTimeout(state.marketStatusTimer);

    if (state.market !== "us-stock") {
      state.marketStatuses = {};
      state.marketStatusSource = "";
      state.marketStatusCheckedAt = "";
      renderCards();
      return;
    }

    if (!workerUrl) {
      state.marketStatuses = {};
      state.marketStatusSource = "NO_WORKER";
      renderCards();
      return;
    }

    try {
      const payload = await fetchJson(
        `${workerUrl}/api/market/status?market=us-stock&t=${Date.now()}`
      );

      state.marketStatuses = payload?.statuses || {};
      state.marketStatusSource = payload?.source || "PIONEX_TRADE_RULES";
      state.marketStatusCheckedAt = payload?.checked_at || new Date().toISOString();
      renderCards();
    } catch (error) {
      // Preserve the last good Pionex state instead of inventing a market state.
      if (!Object.keys(state.marketStatuses || {}).length) {
        state.marketStatusSource = "ERROR";
        renderCards();
      }
    }

    state.marketStatusTimer = setTimeout(() => {
      if (state.market === "us-stock") loadMarketStatuses();
    }, 30_000);
  }

  async function loadChampionModel() {
    if (!workerUrl) {
      state.champion = null;
      return;
    }
    state.champion = await fetchOptionalJson(`${workerUrl}/api/model/active?t=${Date.now()}`);
    // Sample-tier coloring depends on each S-state baseline in the active Champion model.
    // Snapshot and Champion are loaded in parallel, so repaint once Champion metadata is ready.
    if (state.snapshot?.records) renderCards();
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
    loadUsStockResearch();
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
    els.systemCaption.textContent = `${marketLabel(state.market)}｜UPDATED ${fmtTaiwanTimestamp(b.generated_at_taiwan)}｜ENGINE ${b.engine_version || "—"}｜AI ${b.ai_analysis_layer || "—"}`;
    els.snapshotMeta.textContent = `資料源：${source}｜${b.count ?? snap.records.length} 標的｜Probability ${pm.available ? `${pm.model_id || "active"} / max L${pm.max_level || "?"}` : "未載入"}｜主判定 72H（3日）`;
    renderFilters(); renderSummary(); renderCards(); renderSectorFlow();
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
    const q = String(state.searchQuery || "").trim().toLowerCase();
    if (q) {
      rows = rows.filter(r => {
        const research = currentResearchFor(r?.symbol);
        const haystack = [
          r?.symbol, r?.api_symbol, recordState(r),
          ...(Array.isArray(r?.sectors) ? r.sectors : []),
          r?.opportunity_long?.market_state_name, r?.opportunity_long?.setup_name,
          research?.underlying_ticker, research?.company_name, research?.summary, research?.verdict
        ].filter(Boolean).join(" ").toLowerCase();
        return haystack.includes(q);
      });
    }
    rows.sort((a,b) => stateRank(recordState(a))-stateRank(recordState(b)) || Number(b.historical_probability?.["72h"]?.success_probability||0)-Number(a.historical_probability?.["72h"]?.success_probability||0));
    els.cards.innerHTML = rows.map(renderCard).join("");
    bindSynchronizedChartCrosshairs();
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
  const SAMPLE_TIER_RATIOS = {
    // Ratios are calibrated from the current Level-5 signature distribution.
    // The denominator is NOT fixed here: it is read from the active Champion model.
    'S3': [
      { ratio: 0.12644310, key: 'ssr', label: 'SSR' },
      { ratio: 0.04947774, key: 'sr',  label: 'SR' },
      { ratio: 0.01924134, key: 'r',   label: 'R' },
      { ratio: 0.00769654, key: 'n',   label: 'N' }
    ],
    'S2': [
      { ratio: 0.06435835, key: 'ssr', label: 'SSR' },
      { ratio: 0.03217917, key: 'sr',  label: 'SR' },
      { ratio: 0.01544600, key: 'r',   label: 'R' },
      { ratio: 0.00643583, key: 'n',   label: 'N' }
    ],
    'S1': [
      { ratio: 0.05554369, key: 'ssr', label: 'SSR' },
      { ratio: 0.03204443, key: 'sr',  label: 'SR' },
      { ratio: 0.01922666, key: 'r',   label: 'R' },
      { ratio: 0.01068148, key: 'n',   label: 'N' }
    ],
    'S0.5': [
      { ratio: 0.05304758, key: 'ssr', label: 'SSR' },
      { ratio: 0.03182855, key: 'sr',  label: 'SR' },
      { ratio: 0.02121903, key: 'r',   label: 'R' },
      { ratio: 0.01060952, key: 'n',   label: 'N' }
    ]
  };

  function activeStateBaselineSamples(marketState) {
    const model = state.champion || {};
    const stateModel = model.states?.[marketState];
    const horizons = stateModel?.horizons || {};
    if (!stateModel || !Object.keys(horizons).length) return 0;

    // Follow the Champion model's declared primary swing horizon.
    const primaryBars = model.primary_swing_horizon_bars;
    if (primaryBars !== null && primaryBars !== undefined) {
      const direct = Number(horizons?.[String(primaryBars)]?.baseline?.samples || 0);
      if (Number.isFinite(direct) && direct > 0) return direct;
    }

    // Compatibility fallback: locate the horizon declared as 72H by the model itself.
    const horizonHours = model.horizon_hours || {};
    const horizonKey = Object.keys(horizonHours).find(k => Number(horizonHours[k]) === 72);
    const fallback = Number(horizonKey ? horizons?.[horizonKey]?.baseline?.samples : 0);
    return Number.isFinite(fallback) && fallback > 0 ? fallback : 0;
  }

  function sampleTierInfo(matchedSamples, marketState) {
    const matched = Number(matchedSamples || 0);
    const total = activeStateBaselineSamples(marketState);
    const ratioRules = SAMPLE_TIER_RATIOS[marketState];
    if (!ratioRules || total <= 0) return { key: 'low', label: 'LOW', ratio: 0, total: 0, min: 0 };

    const ratio = matched / total;
    const tiers = ratioRules.map(item => ({
      ...item,
      min: Math.max(50, Math.round(total * item.ratio))
    }));
    tiers.push({ min: 50, ratio: 50 / total, key: 'c', label: 'C' });

    const tier = tiers.find(item => matched >= item.min);
    if (!tier) return { key: 'low', label: 'LOW', ratio, total, min: 50 };
    return { ...tier, ratio, total };
  }

  function renderChartQuickStats(r) {
    const hp = r.historical_probability || {};
    const h72 = hp["72h"] || {};
    if (!hp.available || !h72.available) return "";
    const fail = pct(h72.true_fail_probability);
    const survival = pct(h72.structural_survival_probability);
    const matchedSamples = Number(h72.matched_samples || hp.matched_samples || 0);
    const samples = matchedSamples.toLocaleString();
    const level = h72.level || hp.model_level || "—";
    const marketState = recordState(r);
    const tier = sampleTierInfo(matchedSamples, marketState);
    const tierRatio = tier.total > 0 ? `${(tier.ratio * 100).toFixed(2)}%` : '—';
    const tierMinRatio = tier.total > 0 && tier.min > 0 ? `${((tier.min / tier.total) * 100).toFixed(2)}%` : '—';
    const tierTitle = tier.total > 0
      ? `樣本厚度 ${tier.label}｜${marketState} 匹配 ${samples} / ${tier.total.toLocaleString()}｜占該狀態 ${tierRatio}｜本級門檻 ≥${tier.min.toLocaleString()} (${tierMinRatio})`
      : `樣本厚度 ${tier.label}｜匹配 ${samples}｜此狀態沒有樣本分級規則`;
    const tierStyle = ({
      ssr: 'background:#facc15;border-color:#fef08a;box-shadow:0 0 10px #facc1588',
      sr:  'background:#a855f7;border-color:#d8b4fe;box-shadow:0 0 10px #a855f788',
      r:   'background:#3b82f6;border-color:#93c5fd;box-shadow:0 0 10px #3b82f688',
      n:   'background:#22c55e;border-color:#86efac;box-shadow:0 0 10px #22c55e88',
      c:   'background:#f8fafc;border-color:#cbd5e1;box-shadow:0 0 8px #ffffff55',
      low: 'background:#334155;border-color:#64748b;box-shadow:none'
    })[tier.key] || 'background:#334155;border-color:#64748b;box-shadow:none';
    return `<div class="chart-quick-stats" aria-label="72H historical quick stats">
      <span class="chart-stat fail"><i></i><b>失敗</b> ${fail}</span>
      <span class="chart-stat survival"><i></i><b>存活</b> ${survival}</span>
      <span class="chart-stat samples" title="${escapeHtml(tierTitle)}"><i class="sample-tier-${tier.key}" style="${tierStyle}"></i><b>樣本</b> ${samples}</span>
      <span class="chart-stat level">L${escapeHtml(level)}</span>
    </div>`;
  }

  function midHuman(v){return ({rising:'中軌上斜',flat:'中軌平緩',flattening:'中軌走平',falling:'中軌下斜'})[v]||'中軌未知'}
  function bandHuman(v){return ({LT_025:'<0.25','025_050':'0.25-0.50','050_060':'0.50-0.60','060_075':'0.60-0.75',GE_075:'>0.75'})[v]||'?'}
  function bwHuman(v){return ({EXPANDING:'布林擴張',CONTRACTING:'布林收縮',FLAT:'布林平穩'})[v]||'布林未知'}
  function ageHuman(v){return ({'1':'1根4H','2_3':'2-3根4H','4_6':'4-6根4H','7_PLUS':'7+根4H'})[v]||'—'}

  function researchVerdictMeta(value) {
    return ({
      strong_positive: ['strong-positive','🔥 明顯利多'],
      positive: ['positive','🟢 利多'],
      mixed: ['mixed','🟡 多空相同'],
      neutral: ['neutral','⚪ 中性'],
      risk: ['risk','🔴 利空'],
      high_risk: ['high-risk','🔴 明顯利空']
    })[String(value || 'neutral')] || ['neutral','⚪ 中性'];
  }

  function researchStatusLabel(value) {
    return ({ON_DEMAND:'ON DEMAND',NEW_SEARCH:'NEW',CACHE_24H:'24H CACHE',STALE_CACHE:'STALE',ERROR:'ERROR',DEFERRED:'待下輪',SKIPPED_NON_COMPANY:'SKIP'})[String(value || '')] || '';
  }

  function researchCategoryMeta(value) {
    return ({
      earnings: ['財報','📊'], guidance: ['財測','🧭'], company_catalyst: ['公司催化','⚡'],
      analyst: ['分析師','🏦'], sec_capital: ['SEC／資本','📄'], regulatory_legal: ['法規／訴訟','⚖'],
      fund_event: ['ETF／基金','🧺'], commodity_supply: ['供需／庫存','🛢'], policy_macro: ['政策／產業','🌐'],
      direct_industry: ['產業事件','🏭']
    })[String(value || '')] || ['近期事件','•'];
  }

  function researchImpactMeta(value) {
    return ({
      positive: ['positive','▲ 利多'], negative: ['negative','▼ 利空'], mixed: ['mixed','◆ 混合'], neutral: ['neutral','• 中性']
    })[String(value || 'neutral')] || ['neutral','• 中性'];
  }

  function researchImpactCountsClient(info, events) {
    const saved = info?.impact_counts && typeof info.impact_counts === 'object' ? info.impact_counts : null;
    if (saved) {
      return {
        positive: Number(saved.positive || 0),
        negative: Number(saved.negative || 0),
        neutral: Number(saved.neutral || 0),
        mixed: Number(saved.mixed || 0),
        total: Number(saved.total || 0),
      };
    }
    const counts = { positive:0, negative:0, neutral:0, mixed:0, total:0 };
    for (const e of Array.isArray(events) ? events : []) {
      const impact = String(e?.impact || 'neutral');
      if (impact === 'positive') counts.positive += 1;
      else if (impact === 'negative') counts.negative += 1;
      else if (impact === 'mixed') counts.mixed += 1;
      else counts.neutral += 1;
      counts.total += 1;
    }
    return counts;
  }

  function renderResearch(r) {
    if (!researchEligible(r)) return '';

    const symbol = String(r?.symbol || '').trim().toUpperCase();
    const rawInfo = currentResearchFor(symbol);
    const fresh = researchIsFresh(rawInfo);
    const busy = state.researchSymbolBusy.has(symbol);
    const anotherBusy = state.researchSymbolBusy.size > 0 && !busy;
    const error = String(state.researchSymbolErrors[symbol] || '');

    if (!fresh) {
      const expired = Boolean(rawInfo && researchExpiresAt(rawInfo) && researchExpiresAt(rawInfo) <= Date.now());
      const label = busy ? '⏳ 搜尋中…' : anotherBusy ? '… 等待上一筆' : error ? '⚠ 查詢失敗・重試' : expired ? '↻ 已過24H・重新查詢' : '🔎 等待查詢';
      const title = busy
        ? `${symbol} 正在使用 Tavily 搜尋 + Tavily Answer 查詢`
        : error
          ? `${symbol} 前次查詢失敗：${error}｜點擊重試`
          : expired
            ? `${symbol} 新聞快取已超過 24 小時｜點擊重新查詢`
            : `${symbol} 尚未查詢｜有興趣再點擊，成功後快取 24 小時`;
      return `<button type="button" class="pill research-query-pill ${busy?'is-busy':error?'is-error':'is-waiting'}" data-research-symbol="${escapeHtml(symbol)}" title="${escapeHtml(title)}" ${(busy||anotherBusy)?'disabled':''}>${escapeHtml(label)}</button>`;
    }

    const info = rawInfo;
    const events = Array.isArray(info.events) ? info.events : [];
    const sources = Array.isArray(info.sources) ? info.sources : [];
    const counts = researchImpactCountsClient(info, events);
    const verdictMeta = events.length ? researchVerdictMeta(info.verdict) : ['neutral','⚪ 無搜尋結果'];
    const [verdictCls,verdictLabel] = verdictMeta;
    const [cls,label] = [verdictCls,verdictLabel];
    const statusLabel = researchStatusLabel(info.research_status);
    const title = [...new Set([info.underlying_ticker, info.company_name].filter(Boolean).map(String))].join('｜') || symbol;

    const eventHtml = events.length ? `<div class="research-section"><div class="research-section-title">Tavily 搜尋結果 <small>${events.length} 則</small></div>${events.map(e => {
      const [catLabel,catIcon] = researchCategoryMeta(e.category);
      const [impactCls,impactLabel] = researchImpactMeta(e.impact);
      return `<div class="research-event ${escapeHtml(impactCls)}">
        <div class="research-event-head"><span class="research-category">${catIcon} ${escapeHtml(catLabel)}</span><span class="research-impact ${escapeHtml(impactCls)}">${escapeHtml(impactLabel)}</span><time>${escapeHtml(e.date||'日期未明')}</time></div>
        <div class="research-event-title">${escapeHtml(e.display_title_zh_tw||e.title||'近期資訊')}</div>
        ${(e.display_detail_zh_tw||e.detail)?`<div class="research-event-detail">${escapeHtml(e.display_detail_zh_tw||e.detail)}</div>`:''}
      </div>`;
    }).join('')}</div>` : '<div class="research-section"><div class="research-section-title">Tavily 搜尋結果</div><div class="research-empty">Tavily 本次沒有回傳新聞。</div></div>';

    const sourceHtml = sources.length ? `<div class="research-section research-sources"><div class="research-section-title">查證來源 <small>${sources.length}</small></div>${sources.map((src,i)=>`<a href="${escapeHtml(src.url||'#')}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(src.title||'原始來源')}"><span>${i+1}</span>${escapeHtml(src.display_title_zh_tw||`查證來源 ${i+1}`)}</a>`).join('')}</div>` : '<div class="research-section research-sources muted"><div class="research-section-title">查證來源</div><div>本次沒有可顯示的 grounding URL。</div></div>';

    const searched = info.searched_at ? new Date(info.searched_at).toLocaleString('zh-TW',{hour12:false}) : '—';
    const modelLabel = String(info.model || state.usStockResearch?.model || 'Tavily Search + Answer').replace(/^models\//,'');
    const verdictHtml = `<div class="research-verdict-line">
      <span>情報方向</span>
      <div class="research-impact-counts">
        <em class="positive">利多 ${counts.positive}</em>
        <em class="negative">利空 ${counts.negative}</em>
        <em class="neutral">中性 ${counts.neutral}</em>
        ${counts.mixed ? `<em class="mixed">混合 ${counts.mixed}</em>` : ''}
      </div>
      <b class="research-verdict-chip ${escapeHtml(verdictCls)}">${escapeHtml(verdictLabel)}</b>
    </div>`;

    return `<div class="research-wrap"><span class="pill research-pill ${cls}">${label}${statusLabel?` <small>${statusLabel}</small>`:''}</span><div class="research-card">
      <div class="research-title"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(recordState(r))}</span></div>
      ${verdictHtml}
      <div class="research-section research-overview"><div class="research-section-title">Tavily 重點</div><div class="research-summary">${escapeHtml(info.summary_zh_tw||info.summary||'')}</div></div>
      ${eventHtml}${sourceHtml}
      <div class="research-meta">${escapeHtml(modelLabel)}｜Tavily 最多 20 則 → Tavily Answer 繁中整理｜文章多空統計｜不經第二層 AI 過濾｜${escapeHtml(searched)}｜24H 固定快取</div>
    </div></div>`;
  }

  function renderPropwMatchBadge(r) {
    if (state.market !== "us-stock") return "";
    const pionexSymbol = String(r?.symbol || "").trim().toUpperCase();
    const propwSymbol = PROPW_PIONEX_SYMBOL_MAP[pionexSymbol];
    if (!propwSymbol) return "";
    return `<div class="propw-match-badge" title="PropW 清單已對上｜${escapeHtml(propwSymbol)} ↔ ${escapeHtml(pionexSymbol)}"><span>PW</span></div>`;
  }

  function renderMarketStatusBadge(r) {
    if (state.market !== "us-stock") return "";

    const apiSymbol = String(r?.api_symbol || "").trim();
    const info = state.marketStatuses?.[apiSymbol];
    if (!info) return "";

    const code = String(
      typeof info === "string" ? info : (info.status || "")
    ).toUpperCase();
    const tradeTag = typeof info === "object" ? String(info.trade_tag || "") : "";
    const checked = state.marketStatusCheckedAt
      ? new Date(state.marketStatusCheckedAt).toLocaleTimeString(
          "zh-TW", { hour12:false, hour:"2-digit", minute:"2-digit" }
        )
      : "";

    if (code === "ALWAYS_OPEN") {
      return `<div class="market-session-badge trading always-open"
        title="Pionex future_markets｜${escapeHtml(tradeTag || "trade_time_7_24")}${checked ? `｜${checked}` : ""}">
        <i></i><span>7×24</span>
      </div>`;
    }

    if (code === "OPEN") {
      return `<div class="market-session-badge trading"
        title="Pionex 交易時段規則：目前可交易${checked ? `｜${checked}` : ""}">
        <i></i><span>交易中</span>
      </div>`;
    }

    if (code === "CLOSED") {
      return `<div class="market-session-badge offline"
        title="Pionex 交易時段規則：目前休市${tradeTag ? `｜${escapeHtml(tradeTag)}` : ""}${checked ? `｜${checked}` : ""}">
        <i></i><span>休市</span>
      </div>`;
    }

    if (code === "OFFLINE") {
      return `<div class="market-session-badge offline"
        title="Pionex 合約目前不是 TRADING${checked ? `｜${checked}` : ""}">
        <i></i><span>停用</span>
      </div>`;
    }

    return `<div class="market-session-badge unknown"
      title="Pionex 交易時段規則無法判定${checked ? `｜${checked}` : ""}">
      <i></i><span>狀態未知</span>
    </div>`;
  }

  function renderCard(r) {
    const opp=r.opportunity_long||{}, s=recordState(r), mid=opp.midline||{}, sectors=(r.sectors||[]).join(' · ')||'未分類';
    const move=Number(r.bb_pct||0); const moveClass=move>=0?'up':'down';
    const h4prev=String(r.h4_prev||''); const h4curr=String(r.h4_curr||'');
    const lamp = (x)=> x==='green'||x==='🟢'?'<span class="g">●</span>':x==='red'||x==='🔴'?'<span class="r">●</span>':'●';
    return `<article class="card">
      <div class="card-header"><div class="identity"><div>${escapeHtml(r.symbol)}　現價 ${fmtPrice(r.price)}　｜ 日前偏離 <span class="move ${moveClass}">${move>=0?'+':''}${num(move)}%</span></div><div class="lights">4H前 ${lamp(h4prev)}　｜　4H當 ${lamp(h4curr)}</div></div>
      <div class="badges"><div class="badge-row"><span class="pill state-pill ${stateClass(s)}">${escapeHtml(opp.stars_text||'★☆☆☆☆')} ${escapeHtml(s)}｜${escapeHtml(opp.market_state_name||opp.setup_name||'')}</span><span class="pill mid-pill">中軌 ${escapeHtml(mid.symbol||'?')} ${escapeHtml(mid.label||'未知')}</span></div><div class="badge-row">${renderProbability(r)}${renderResearch(r)}<span class="pill sector-pill">${escapeHtml(sectors)}</span></div></div></div>
      <div class="chart">${buildChartSvg(r.chart_30d||[])}${renderMarketStatusBadge(r)}${renderPropwMatchBadge(r)}${renderChartQuickStats(r)}</div>
      ${buildCciPanel(r.chart_30d||[])}
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

  function buildChartSvg(points) {
    if (!Array.isArray(points) || points.length < 2) return '<div class="caption">無30日圖表資料</div>';
    const W=760,H=260,L=42,R=14,T=12,B=24, innerW=W-L-R, innerH=H-T-B;
    const vals=[]; points.forEach(p=>['bb_upper','bb_midline','bb_lower','ha_close'].forEach(k=>{const n=Number(p[k]);if(Number.isFinite(n)) vals.push(n)}));
    let min=Math.min(...vals), max=Math.max(...vals); const pad=(max-min||1)*.08; min-=pad; max+=pad;
    const x=(i)=>L+i*(innerW/(points.length-1)); const y=(v)=>T+(max-Number(v))/(max-min)*innerH;
    const linePath=(key)=>{
      let d='', drawing=false;
      points.forEach((p,i)=>{
        const raw=p?.[key];
        if(raw===null || raw===undefined || raw===''){ drawing=false; return; }
        const n=Number(raw);
        if(!Number.isFinite(n)){ drawing=false; return; }
        d+=`${drawing?'L':'M'}${x(i).toFixed(1)},${y(n).toFixed(1)}`;
        drawing=true;
      });
      return d;
    };
    const refPrice=Number(points[points.length-1]?.ha_close || points[points.length-1]?.close || max);
    const tinyExp=chartTinyExponent(refPrice);
    let grids=''; for(let i=0;i<4;i++){const yy=T+i*innerH/3; const val=max-i*(max-min)/3; grids+=`<line class="grid-line" x1="${L}" y1="${yy}" x2="${W-R}" y2="${yy}"/><text class="axis-text" x="2" y="${yy+3}">${escapeHtml(fmtChartPrice(val,tinyExp))}</text>`}
    let ladder=''; for(let i=0;i<points.length-1;i++){const p=points[i], q=points[i+1]; const cls=(p.ha_color==='yellow')?'ladder-yellow':'ladder-purple'; const x1=x(i),x2=x(i+1),yy=y(p.ha_close),y2=y(q.ha_close); ladder+=`<path class="${cls}" d="M${x1},${yy} H${x2} V${y2}"/>`;}
    const last=points[points.length-1], lc=last.ha_color==='yellow'?'#fde047':'#bba4e8';
    const dates=encodeURIComponent(JSON.stringify(points.map(p=>String(p.date||''))));
    const crosshair=`<g class="tv-crosshair" visibility="hidden" pointer-events="none">
      <line class="tv-cross-line tv-cross-v" x1="${L}" y1="${T}" x2="${L}" y2="${H-B}"/>
      <line class="tv-cross-line tv-cross-h" x1="${L}" y1="${T}" x2="${W-R}" y2="${T}"/>
      <rect class="tv-cross-label tv-price-box" x="1" y="${T}" width="54" height="20" rx="3"/>
      <text class="tv-cross-label-text tv-price-text" x="28" y="${T+13.5}" text-anchor="middle">—</text>
      <rect class="tv-cross-label tv-date-box" x="${L}" y="${H-B+2}" width="48" height="20" rx="3"/>
      <text class="tv-cross-label-text tv-date-text" x="${L+24}" y="${H-B+15.5}" text-anchor="middle">—</text>
    </g>`;
    return `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" data-w="${W}" data-h="${H}" data-l="${L}" data-r="${R}" data-t="${T}" data-b="${B}" data-min="${min}" data-max="${max}" data-count="${points.length}" data-exp="${tinyExp}" data-dates="${dates}">${grids}<path class="bb-line" d="${linePath('bb_upper')}"/><path class="mid-line" d="${linePath('bb_midline')}"/><path class="bb-line" d="${linePath('bb_lower')}"/>${ladder}<circle class="last-dot" cx="${x(points.length-1)}" cy="${y(last.ha_close)}" r="5" fill="${lc}"/>${crosshair}</svg>`;
  }

  function cciSmoothingPillClass(color) {
    const normalized=String(color||'gray').toLowerCase();
    if(normalized==='yellow') return 'cci-pill-sma-yellow';
    if(normalized==='purple') return 'cci-pill-sma-purple';
    return 'cci-pill-sma-neutral';
  }

  function fmtCci(value) {
    const n=Number(value);
    return Number.isFinite(n) ? n.toFixed(1) : '—';
  }

  function buildCciPanel(points) {
    const usable=Array.isArray(points)?points:[];
    let latestIndex=-1;
    for(let i=usable.length-1;i>=0;i--){
      if(finiteIndicator(usable[i]?.cci)||finiteIndicator(usable[i]?.cci_smoothing_ma)){latestIndex=i;break;}
    }
    const latest=latestIndex>=0?usable[latestIndex]:null;
    const latestSma=latest&&finiteIndicator(latest.cci_smoothing_ma)?Number(latest.cci_smoothing_ma):NaN;
    const latestCci=latest&&finiteIndicator(latest.cci)?Number(latest.cci):NaN;
    const latestColor=latest?.cci_smoothing_color||'gray';
    return `<div class="cci-panel">
      <div class="cci-head">
        <span class="cci-title">CCI 20 / SMA 14</span>
        <div class="cci-head-right">
          <div class="cci-live-values">
            <span class="cci-live-pill cci-pill-sma ${cciSmoothingPillClass(latestColor)}">SMA <strong class="cci-sma-value">${fmtCci(latestSma)}</strong></span>
            <span class="cci-live-pill cci-pill-cci">CCI <strong class="cci-cci-value">${fmtCci(latestCci)}</strong></span>
          </div>
        </div>
      </div>
      ${buildCciSvg(usable)}
    </div>`;
  }

  function buildCciSvg(points) {
    if(!Array.isArray(points)||points.length<2||!points.some(p=>finiteIndicator(p?.cci)||finiteIndicator(p?.cci_smoothing_ma))){
      return '<div class="cci-empty">等待下一次完整分析產生 CCI 20 / SMA 14</div>';
    }
    const W=760,H=150,L=42,R=14,T=10,B=30,innerW=W-L-R,innerH=H-T-B;
    const vals=[-100,0,100];
    points.forEach(p=>['cci','cci_smoothing_ma'].forEach(k=>{if(finiteIndicator(p?.[k]))vals.push(Number(p[k]));}));
    const rawMin=Math.min(...vals),rawMax=Math.max(...vals),range=Math.max(1,rawMax-rawMin),pad=range*.08;
    const min=Math.min(-150,Math.floor((rawMin-pad)/50)*50);
    const max=Math.max(150,Math.ceil((rawMax+pad)/50)*50);
    const x=(i)=>L+i*(innerW/(points.length-1));
    const y=(v)=>T+(max-Number(v))/(max-min)*innerH;
    const linePath=(key)=>{
      let d='',drawing=false;
      points.forEach((p,i)=>{
        const raw=p?.[key];
        if(!finiteIndicator(raw)){drawing=false;return;}
        const n=Number(raw);
        d+=`${drawing?'L':'M'}${x(i).toFixed(1)},${y(n).toFixed(1)}`;
        drawing=true;
      });
      return d;
    };
    let smoothingSteps='';
    for(let i=1;i<points.length;i++){
      const prev=finiteIndicator(points[i-1]?.cci_smoothing_ma)?Number(points[i-1].cci_smoothing_ma):NaN;
      const curr=finiteIndicator(points[i]?.cci_smoothing_ma)?Number(points[i].cci_smoothing_ma):NaN;
      if(!Number.isFinite(prev)||!Number.isFinite(curr))continue;
      const color=String(points[i]?.cci_smoothing_color||'gray').toLowerCase();
      const cls=color==='yellow'?'cci-sma-yellow':color==='purple'?'cci-sma-purple':'cci-sma-flat';
      smoothingSteps+=`<path class="cci-sma-step ${cls}" d="M${x(i-1).toFixed(1)},${y(prev).toFixed(1)} H${x(i).toFixed(1)} V${y(curr).toFixed(1)}"/>`;
    }
    const reference=[100,0,-100].map(value=>{
      const yy=y(value),cls=value===0?'cci-ref-zero':'cci-ref-band';
      return `<line class="cci-ref-line ${cls}" x1="${L}" y1="${yy}" x2="${W-R}" y2="${yy}"/><text class="cci-axis-text" x="4" y="${yy+3}">${value}</text>`;
    }).join('');
    const labelIdx=[0,Math.floor((points.length-1)/3),Math.floor((points.length-1)*2/3),points.length-1];
    const labels=[...new Set(labelIdx)].map(i=>`<text class="cci-axis-text cci-date-text" x="${x(i)-8}" y="${H-4}" transform="rotate(-35 ${x(i)-8} ${H-4})">${escapeHtml(points[i]?.date||'')}</text>`).join('');
    const dates=encodeURIComponent(JSON.stringify(points.map(p=>String(p?.date||''))));
    const ccis=encodeURIComponent(JSON.stringify(points.map(p=>finiteIndicator(p?.cci)?Number(p.cci):null)));
    const smas=encodeURIComponent(JSON.stringify(points.map(p=>finiteIndicator(p?.cci_smoothing_ma)?Number(p.cci_smoothing_ma):null)));
    const colors=encodeURIComponent(JSON.stringify(points.map(p=>String(p?.cci_smoothing_color||'gray'))));
    let lastIndex=-1;
    for(let i=points.length-1;i>=0;i--){if(finiteIndicator(points[i]?.cci)||finiteIndicator(points[i]?.cci_smoothing_ma)){lastIndex=i;break;}}
    let lastDots='';
    if(lastIndex>=0){
      const last=points[lastIndex];
      if(finiteIndicator(last.cci)) lastDots+=`<circle class="cci-last-dot cci-line-dot" cx="${x(lastIndex)}" cy="${y(Number(last.cci))}" r="3.5"/>`;
      if(finiteIndicator(last.cci_smoothing_ma)){
        const color=String(last.cci_smoothing_color||'gray').toLowerCase();
        const cls=color==='yellow'?'cci-sma-dot-yellow':color==='purple'?'cci-sma-dot-purple':'cci-sma-dot-neutral';
        lastDots+=`<circle class="cci-last-dot ${cls}" cx="${x(lastIndex)}" cy="${y(Number(last.cci_smoothing_ma))}" r="3.5"/>`;
      }
    }
    const crosshair=`<g class="cci-crosshair" visibility="hidden" pointer-events="none">
      <line class="cci-cross-line cci-cross-v" x1="${L}" y1="${T}" x2="${L}" y2="${H-B}"/>
      <line class="cci-cross-line cci-cross-h" x1="${L}" y1="${T}" x2="${W-R}" y2="${T}"/>
      <circle class="cci-hover-dot cci-hover-sma" cx="${L}" cy="${T}" r="4" visibility="hidden"/>
      <circle class="cci-hover-dot cci-hover-cci" cx="${L}" cy="${T}" r="4" visibility="hidden"/>
      <rect class="tv-cross-label cci-date-box" x="${L}" y="${H-B+2}" width="48" height="20" rx="3"/>
      <text class="tv-cross-label-text cci-hover-date" x="${L+24}" y="${H-B+15.5}" text-anchor="middle">—</text>
    </g>`;
    return `<svg class="cci-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" data-w="${W}" data-h="${H}" data-l="${L}" data-r="${R}" data-t="${T}" data-b="${B}" data-min="${min}" data-max="${max}" data-count="${points.length}" data-dates="${dates}" data-cci="${ccis}" data-sma="${smas}" data-colors="${colors}">${reference}${smoothingSteps}<path class="cci-line" d="${linePath('cci')}"/>${lastDots}${labels}${crosshair}</svg>`;
  }

  function bindSynchronizedChartCrosshairs() {
    els.cards.querySelectorAll('.card').forEach(card=>{
      const main=card.querySelector('svg.chart-svg');
      if(!main)return;
      const cci=card.querySelector('svg.cci-svg');

      const mL=Number(main.dataset.l||42),mR=Number(main.dataset.r||14),mT=Number(main.dataset.t||12),mB=Number(main.dataset.b||24);
      const mW=Number(main.dataset.w||760),mH=Number(main.dataset.h||260),mMin=Number(main.dataset.min),mMax=Number(main.dataset.max);
      const mCount=Math.max(2,Number(main.dataset.count||2)),mInnerW=mW-mL-mR,mInnerH=mH-mT-mB;
      const exponent=Number(main.dataset.exp||0);
      let mainDates=[];
      try{mainDates=JSON.parse(decodeURIComponent(main.dataset.dates||'%5B%5D'));}catch(_){}
      const mainGroup=main.querySelector('.tv-crosshair');
      const mainV=main.querySelector('.tv-cross-v');
      const mainHLine=main.querySelector('.tv-cross-h');
      const priceBox=main.querySelector('.tv-price-box');
      const priceText=main.querySelector('.tv-price-text');
      const mainDateBox=main.querySelector('.tv-date-box');
      const mainDateText=main.querySelector('.tv-date-text');
      if(!mainGroup||!mainV||!mainHLine||!priceBox||!priceText)return;

      let cL=42,cR=14,cT=10,cB=30,cW=760,cH=150,cMin=-150,cMax=150,cCount=mCount,cInnerW=704,cInnerH=110;
      let dates=mainDates,ccis=[],smas=[],colors=[];
      let cciGroup=null,cciV=null,cciHLine=null,cciDateBox=null,cciDateText=null,cciDot=null,smaDot=null;
      const panel=card.querySelector('.cci-panel');
      const smaPill=panel?.querySelector('.cci-pill-sma');
      const cciPill=panel?.querySelector('.cci-pill-cci');
      const smaValue=panel?.querySelector('.cci-sma-value');
      const cciValue=panel?.querySelector('.cci-cci-value');

      if(cci){
        cL=Number(cci.dataset.l||42);cR=Number(cci.dataset.r||14);cT=Number(cci.dataset.t||10);cB=Number(cci.dataset.b||30);
        cW=Number(cci.dataset.w||760);cH=Number(cci.dataset.h||150);cMin=Number(cci.dataset.min||-150);cMax=Number(cci.dataset.max||150);
        cCount=Math.max(2,Number(cci.dataset.count||mCount));cInnerW=cW-cL-cR;cInnerH=cH-cT-cB;
        try{dates=JSON.parse(decodeURIComponent(cci.dataset.dates||'%5B%5D'));}catch(_){}
        try{ccis=JSON.parse(decodeURIComponent(cci.dataset.cci||'%5B%5D'));}catch(_){}
        try{smas=JSON.parse(decodeURIComponent(cci.dataset.sma||'%5B%5D'));}catch(_){}
        try{colors=JSON.parse(decodeURIComponent(cci.dataset.colors||'%5B%5D'));}catch(_){}
        cciGroup=cci.querySelector('.cci-crosshair');cciV=cci.querySelector('.cci-cross-v');cciHLine=cci.querySelector('.cci-cross-h');
        cciDateBox=cci.querySelector('.cci-date-box');cciDateText=cci.querySelector('.cci-hover-date');
        cciDot=cci.querySelector('.cci-hover-cci');smaDot=cci.querySelector('.cci-hover-sma');
      }

      const setSmaPillColor=(color)=>{
        if(!smaPill)return;
        smaPill.classList.remove('cci-pill-sma-yellow','cci-pill-sma-purple','cci-pill-sma-neutral');
        smaPill.classList.add(cciSmoothingPillClass(color));
      };
      const setPills=(idx)=>{
        if(!cci)return;
        const cv=ccis[idx]===null?NaN:Number(ccis[idx]);
        const sv=smas[idx]===null?NaN:Number(smas[idx]);
        if(cciValue)cciValue.textContent=fmtCci(cv);
        if(smaValue)smaValue.textContent=fmtCci(sv);
        setSmaPillColor(colors[idx]||'gray');
      };
      let latestIndex=-1;
      for(let i=Math.min(ccis.length,smas.length,cCount)-1;i>=0;i--){
        const cv=ccis[i]===null?NaN:Number(ccis[i]),sv=smas[i]===null?NaN:Number(smas[i]);
        if(Number.isFinite(cv)||Number.isFinite(sv)){latestIndex=i;break;}
      }
      const cY=(v)=>cT+(cMax-Number(v))/(cMax-cMin)*cInnerH;
      const setCciDots=(idx,snapX)=>{
        if(!cciDot||!smaDot)return;
        const cv=ccis[idx]===null?NaN:Number(ccis[idx]),sv=smas[idx]===null?NaN:Number(smas[idx]);
        if(Number.isFinite(cv)){cciDot.setAttribute('cx',snapX);cciDot.setAttribute('cy',cY(cv));cciDot.setAttribute('visibility','visible');}
        else cciDot.setAttribute('visibility','hidden');
        if(Number.isFinite(sv)){
          smaDot.setAttribute('cx',snapX);smaDot.setAttribute('cy',cY(sv));smaDot.setAttribute('visibility','visible');
          smaDot.setAttribute('class',`cci-hover-dot cci-hover-sma ${colors[idx]==='yellow'?'cci-hover-sma-yellow':colors[idx]==='purple'?'cci-hover-sma-purple':'cci-hover-sma-neutral'}`);
        }else smaDot.setAttribute('visibility','hidden');
      };
      const setBottomDate=(idx,snapX)=>{
        if(!cciDateBox||!cciDateText)return;
        const date=String(dates[idx]||mainDates[idx]||'—');
        const dw=Math.max(46,Math.min(78,date.length*6.2+14));
        const dx=Math.max(cL,Math.min(cW-cR-dw,snapX-dw/2));
        cciDateBox.setAttribute('x',dx);cciDateBox.setAttribute('width',dw);
        cciDateText.setAttribute('x',dx+dw/2);cciDateText.textContent=date;
      };
      const setMainFallbackDate=(idx,snapX,visible)=>{
        if(!mainDateBox||!mainDateText)return;
        mainDateBox.setAttribute('visibility',visible?'visible':'hidden');
        mainDateText.setAttribute('visibility',visible?'visible':'hidden');
        if(!visible)return;
        const date=String(mainDates[idx]||'—');
        const dw=Math.max(46,Math.min(78,date.length*6.2+14));
        const dx=Math.max(mL,Math.min(mW-mR-dw,snapX-dw/2));
        mainDateBox.setAttribute('x',dx);mainDateBox.setAttribute('width',dw);
        mainDateText.setAttribute('x',dx+dw/2);mainDateText.textContent=date;
      };
      const syncIndex=(idx,source,sourceVy)=>{
        idx=Math.max(0,Math.min(mCount-1,idx));
        const mainX=mL+idx*(mInnerW/(mCount-1));
        mainV.setAttribute('x1',mainX);mainV.setAttribute('x2',mainX);
        mainGroup.setAttribute('visibility','visible');

        if(source==='main'){
          const vy=sourceVy;
          const price=mMax-((vy-mT)/mInnerH)*(mMax-mMin);
          const priceLabel=fmtChartPrice(price,exponent);
          mainHLine.setAttribute('y1',vy);mainHLine.setAttribute('y2',vy);mainHLine.setAttribute('visibility','visible');
          const pw=Math.max(48,Math.min(88,priceLabel.length*6.2+12));
          const py=Math.max(mT,Math.min(mH-mB-20,vy-10));
          priceBox.setAttribute('x',1);priceBox.setAttribute('y',py);priceBox.setAttribute('width',pw);priceBox.setAttribute('visibility','visible');
          priceText.setAttribute('x',1+pw/2);priceText.setAttribute('y',py+13.5);priceText.textContent=priceLabel;priceText.setAttribute('visibility','visible');
        }else{
          mainHLine.setAttribute('visibility','hidden');priceBox.setAttribute('visibility','hidden');priceText.setAttribute('visibility','hidden');
        }

        if(cci&&cciGroup&&cciV){
          const subIdx=Math.max(0,Math.min(cCount-1,idx));
          const cciX=cL+subIdx*(cInnerW/(cCount-1));
          cciV.setAttribute('x1',cciX);cciV.setAttribute('x2',cciX);
          if(cciHLine){
            if(source==='cci'){cciHLine.setAttribute('y1',sourceVy);cciHLine.setAttribute('y2',sourceVy);cciHLine.setAttribute('visibility','visible');}
            else cciHLine.setAttribute('visibility','hidden');
          }
          setBottomDate(subIdx,cciX);setCciDots(subIdx,cciX);setPills(subIdx);
          cciGroup.setAttribute('visibility','visible');
          setMainFallbackDate(idx,mainX,false);
        }else{
          setMainFallbackDate(idx,mainX,true);
        }
      };
      const restore=()=>{
        mainGroup.setAttribute('visibility','hidden');
        if(cciGroup)cciGroup.setAttribute('visibility','hidden');
        if(latestIndex>=0)setPills(latestIndex);
      };
      const pointerIndex=(ev,svg,L,R,T,B,W,H,count)=>{
        const rect=svg.getBoundingClientRect();
        if(!rect.width||!rect.height)return null;
        const vx=(ev.clientX-rect.left)/rect.width*W,vy=(ev.clientY-rect.top)/rect.height*H;
        if(vx<L||vx>W-R||vy<T||vy>H-B)return null;
        const idx=Math.max(0,Math.min(count-1,Math.round((vx-L)/(W-L-R)*(count-1))));
        return {idx,vy};
      };
      main.addEventListener('pointermove',ev=>{
        const hit=pointerIndex(ev,main,mL,mR,mT,mB,mW,mH,mCount);
        if(hit)syncIndex(hit.idx,'main',hit.vy);
      });
      if(cci){
        cci.addEventListener('pointermove',ev=>{
          const hit=pointerIndex(ev,cci,cL,cR,cT,cB,cW,cH,cCount);
          if(hit)syncIndex(hit.idx,'cci',hit.vy);
        });
      }
      card.addEventListener('pointerleave',restore);
      restore();
    });
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
    if (state.autoBatchBusy) { showToast(autoBatchTitle(), 7000); return; }
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

  async function queryResearchSymbol(symbol) {
    const key = String(symbol || '').trim().toUpperCase();
    if (!key || state.market !== 'us-stock' || !workerUrl || state.researchSymbolBusy.has(key)) return;
    if (state.researchSymbolBusy.size > 0) { showToast('目前已有一筆 Tavily 新聞查詢中，完成後再查下一筆。', 5000); return; }

    state.researchSymbolBusy.add(key);
    delete state.researchSymbolErrors[key];
    renderCards();
    showToast(`${key}｜Tavily 新聞查詢中…`, 4000);

    try {
      const out = await fetchJson(`${workerUrl}/api/research/us-stock/symbol`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: key })
      });

      if (!state.usStockResearch || typeof state.usStockResearch !== 'object') {
        state.usStockResearch = { schema_version: '2.0', ttl_hours: 24, items: [], items_by_symbol: {} };
      }
      if (!state.usStockResearch.items_by_symbol) state.usStockResearch.items_by_symbol = {};
      state.usStockResearch.items_by_symbol[key] = out.item;
      state.usStockResearch.items = Object.values(state.usStockResearch.items_by_symbol);
      state.usStockResearch.generated_at = out.generated_at || new Date().toISOString();
      state.usStockResearch.model = out.item?.model || 'Tavily Search + Answer';
      delete state.researchSymbolErrors[key];
      showToast(out.cached ? `${key}｜沿用 24H 快取，不重新搜尋。` : `${key}｜新聞查詢完成，已寫入 R2 並固定快取 24H。`, 7000);
    } catch (err) {
      state.researchSymbolErrors[key] = String(err?.message || err).slice(0, 500);
      showToast(`${key}｜新聞查詢失敗：${err?.message || err}`, 9000);
    } finally {
      state.researchSymbolBusy.delete(key);
      renderCards();
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
        await Promise.all([loadSnapshot(),loadChampionModel()]);
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
    if(state.analysisBusy || state.autoBatchBusy){ showToast(state.autoBatchBusy ? autoBatchTitle() : '完整分析進行中，完成後才能下載最新 JSON。',5000); return; }
    if(workerUrl){try{const res=await fetch(`${workerUrl}/api/download?market=${encodeURIComponent(state.market)}&t=${Date.now()}`);if(res.ok){const blob=await res.blob();downloadBlob(blob,marketFilename(state.market));return}}catch(_){} }
    if(state.snapshot) downloadBlob(new Blob([JSON.stringify(state.snapshot,null,2)],{type:'application/json'}),marketFilename(state.market));
  }
  function downloadBlob(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500)}

  els.market.addEventListener('change',async()=>{
    state.market=els.market.value;
    localStorage.setItem('sstate-market',state.market);
    state.filter='ALL';
    updateActionState();
    await loadSnapshot();
    await loadSectorFlow();
  });
  if (els.search) {
    els.search.addEventListener('input', () => { state.searchQuery = els.search.value || ''; renderCards(); });
    els.search.addEventListener('keydown', e => { if (e.key === 'Escape') { els.search.value=''; state.searchQuery=''; renderCards(); els.search.blur(); } });
  }
  els.run.addEventListener('click',startFullAnalysis);
  document.addEventListener('click', event => {
    const trigger = event.target.closest?.('.research-query-pill');
    if (!trigger) return;
    event.preventDefault();
    event.stopPropagation();
    queryResearchSymbol(trigger.dataset.researchSymbol || '');
  }, true);
  els.download.addEventListener('click',downloadCurrentJson);
  if (els.sectorFlowToggle) els.sectorFlowToggle.addEventListener('click',()=>setSectorFlowExpanded(!state.sectorFlowExpanded));
  setSectorFlowExpanded(false);
  updateActionState();
  renderVolumeProgress(0);
  pollAutomationStatus();
  clearInterval(state.sectorFlowTimer);
  state.sectorFlowTimer = setInterval(()=>{ if (state.market === 'us-stock') loadSectorFlow(); }, 30000);
  Promise.all([loadSnapshot(), loadChampionModel(), loadSectorFlow()]);
})();
