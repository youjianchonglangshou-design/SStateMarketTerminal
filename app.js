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
  els.version.textContent = cfg.appVersion || "TERMINAL v0.1.75｜0825-DAILY-CHAMPION";
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
    bindChartCrosshairs();
    bindAdxCrosshairs();
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
      ${buildAdxPanel(r.chart_30d||[])}
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

  function adxPillStrengthClasses(plus, minus) {
    const p = Number(plus), m = Number(minus);
    if (!Number.isFinite(p) || !Number.isFinite(m) || p === m) {
      return { plus: "adx-pill-neutral", minus: "adx-pill-neutral" };
    }
    return p > m
      ? { plus: "adx-pill-strong-plus", minus: "adx-pill-neutral" }
      : { plus: "adx-pill-neutral", minus: "adx-pill-strong-minus" };
  }

  function roundAdx1(value) {
    const n=Number(value);
    return Number.isFinite(n) ? Math.round((n + Number.EPSILON) * 10) / 10 : NaN;
  }

  function adxStickyTrendSeries(values) {
    const series=Array.isArray(values)?values:[];
    const trends=new Array(series.length).fill(0);
    let trend=0;
    let previousRounded=NaN;
    for(let i=0;i<series.length;i++){
      const currentRounded=roundAdx1(series[i]);
      if(!Number.isFinite(currentRounded)){
        trends[i]=trend;
        continue;
      }
      if(Number.isFinite(previousRounded)){
        if(currentRounded>previousRounded) trend=1;
        else if(currentRounded<previousRounded) trend=-1;
        // 四捨五入到 1 位後相等：延續上一個有效方向，不切灰、不反轉。
      }
      trends[i]=trend;
      previousRounded=currentRounded;
    }
    return trends;
  }

  function adxDominanceState(plus, minus, adx, trend) {
    const p=Number(plus),m=Number(minus),a=Number(adx),t=Number(trend);
    if(!Number.isFinite(p)||!Number.isFinite(m)||p===m){
      return { text:"方向膠著｜ADX待確認", controllerClass:"adx-controller-neutral", trendClass:"adx-trend-neutral", trend:"FLAT" };
    }
    const controllerClass=p>m?'adx-controller-plus':'adx-controller-minus';
    if(!Number.isFinite(a)||!Number.isFinite(t)||t===0){
      return { text:`${p>m?'多方':'空方'}控制｜ADX待確認`, controllerClass, trendClass:"adx-trend-neutral", trend:"FLAT" };
    }
    const rising=t===1, falling=t===-1;
    if(p>m && rising) return { text:"多方控制｜趨勢強度增強 ↗↗", controllerClass, trendClass:"adx-trend-rising", trend:"RISING" };
    if(p>m && falling) return { text:"多方仍控制｜力量衰退 ↘↘", controllerClass, trendClass:"adx-trend-falling", trend:"FALLING" };
    if(p<m && rising) return { text:"空方控制｜趨勢強度增強 ↗↗", controllerClass, trendClass:"adx-trend-rising", trend:"RISING" };
    return { text:"空方仍控制｜力量衰退 ↘↘", controllerClass, trendClass:"adx-trend-falling", trend:"FALLING" };
  }

  function buildAdxPanel(points) {
    const usable = Array.isArray(points) ? points : [];
    let latestIndex=-1;
    for(let i=usable.length-1;i>=0;i--){
      if(finiteIndicator(usable[i]?.di_plus)&&finiteIndicator(usable[i]?.di_minus)){ latestIndex=i; break; }
    }
    const latest=latestIndex>=0?usable[latestIndex]:null;
    const latestPlus = latest ? Number(latest.di_plus) : NaN;
    const latestMinus = latest ? Number(latest.di_minus) : NaN;
    const latestAdx = latest&&finiteIndicator(latest.adx)?Number(latest.adx):NaN;
    const adxTrends=adxStickyTrendSeries(usable.map(p=>finiteIndicator(p?.adx)?Number(p.adx):null));
    const latestTrend=latestIndex>=0?Number(adxTrends[latestIndex]||0):0;
    const pillClasses = adxPillStrengthClasses(latestPlus, latestMinus);
    const dominance=adxDominanceState(latestPlus,latestMinus,latestAdx,latestTrend);
    return `<div class="adx-panel">
      <div class="adx-head">
        <span class="adx-title">ADX / DMI 14</span>
        <div class="adx-head-right">
          <span class="adx-state-pill ${dominance.controllerClass} ${dominance.trendClass}"><span class="adx-state-dot"></span><strong class="adx-state-text">${escapeHtml(dominance.text)}</strong></span>
          <div class="adx-live-values">
            <span class="adx-live-pill adx-pill-plus ${pillClasses.plus}">DI+ <strong class="adx-pill-value">${Number.isFinite(latestPlus)?latestPlus.toFixed(1):'—'}</strong></span>
            <span class="adx-live-pill adx-pill-minus ${pillClasses.minus}">DI− <strong class="adx-pill-value">${Number.isFinite(latestMinus)?latestMinus.toFixed(1):'—'}</strong></span>
          </div>
        </div>
      </div>
      ${buildAdxSvg(usable)}
    </div>`;
  }

  function buildAdxSvg(points) {
    if (!Array.isArray(points) || points.length < 2 || !points.some(p => finiteIndicator(p?.di_plus) || finiteIndicator(p?.di_minus))) {
      return '<div class="adx-empty">等待下一次完整分析產生 ADX / DMI 14</div>';
    }
    const W=760,H=142,L=42,R=14,T=10,B=30, innerW=W-L-R, innerH=H-T-B;
    const vals=[20];
    points.forEach(p=>['di_plus','di_minus','adx'].forEach(k=>{const raw=p?.[k];if(finiteIndicator(raw)) vals.push(Number(raw))}));
    const min=0;
    const rawMax=Math.max(...vals,40);
    const max=Math.max(40,Math.ceil(rawMax/10)*10);
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
    const adxTrendSeries=adxStickyTrendSeries(points.map(p=>finiteIndicator(p?.adx)?Number(p.adx):null));
    let adxSteps='';
    for(let i=1;i<points.length;i++){
      const prev=finiteIndicator(points[i-1]?.adx)?Number(points[i-1].adx):NaN;
      const curr=finiteIndicator(points[i]?.adx)?Number(points[i].adx):NaN;
      if(!Number.isFinite(prev)||!Number.isFinite(curr)) continue;
      const trend=Number(adxTrendSeries[i]||0);
      const cls=trend===1?'adx-step-rising':trend===-1?'adx-step-falling':'adx-step-flat';
      const x0=x(i-1),x1=x(i),y0=y(prev),y1=y(curr);
      adxSteps+=`<path class="adx-step ${cls}" d="M${x0.toFixed(1)},${y0.toFixed(1)} H${x1.toFixed(1)} V${y1.toFixed(1)}"/>`;
    }
    let grids='';
    for(let i=0;i<=2;i++){
      const val=max-i*(max/2), yy=y(val);
      grids+=`<line class="adx-grid-line" x1="${L}" y1="${yy}" x2="${W-R}" y2="${yy}"/><text class="adx-axis-text" x="4" y="${yy+3}">${val.toFixed(0)}</text>`;
    }
    const thresholdY=y(20);
    const threshold=`<line class="adx-threshold-line" x1="${L}" y1="${thresholdY}" x2="${W-R}" y2="${thresholdY}"/><text class="adx-threshold-text" x="4" y="${thresholdY+3}">20</text>`;
    const labelIdx=[0,Math.floor((points.length-1)/3),Math.floor((points.length-1)*2/3),points.length-1];
    const labels=[...new Set(labelIdx)].map(i=>`<text class="adx-axis-text adx-date-text" x="${x(i)-8}" y="${H-4}" transform="rotate(-35 ${x(i)-8} ${H-4})">${escapeHtml(points[i]?.date||'')}</text>`).join('');
    const dates=encodeURIComponent(JSON.stringify(points.map(p=>String(p?.date||''))));
    const pluses=encodeURIComponent(JSON.stringify(points.map(p=>finiteIndicator(p?.di_plus)?Number(p.di_plus):null)));
    const minuses=encodeURIComponent(JSON.stringify(points.map(p=>finiteIndicator(p?.di_minus)?Number(p.di_minus):null)));
    const adxs=encodeURIComponent(JSON.stringify(points.map(p=>finiteIndicator(p?.adx)?Number(p.adx):null)));
    const last=points[points.length-1]||{};
    const latestPlus=finiteIndicator(last.di_plus)?Number(last.di_plus):NaN, latestMinus=finiteIndicator(last.di_minus)?Number(last.di_minus):NaN;
    const lastDots=`${Number.isFinite(latestPlus)?`<circle class="adx-last-dot adx-plus-dot" cx="${x(points.length-1)}" cy="${y(latestPlus)}" r="3.5"/>`:''}${Number.isFinite(latestMinus)?`<circle class="adx-last-dot adx-minus-dot" cx="${x(points.length-1)}" cy="${y(latestMinus)}" r="3.5"/>`:''}`;
    const crosshair=`<g class="adx-crosshair" visibility="hidden" pointer-events="none">
      <line class="adx-cross-line adx-cross-v" x1="${L}" y1="${T}" x2="${L}" y2="${H-B}"/>
      <circle class="adx-hover-dot adx-hover-plus" cx="${L}" cy="${T}" r="4" visibility="hidden"/>
      <circle class="adx-hover-dot adx-hover-minus" cx="${L}" cy="${T}" r="4" visibility="hidden"/>
      <rect class="tv-cross-label adx-date-box" x="${L}" y="${H-B+2}" width="48" height="20" rx="3"/>
      <text class="tv-cross-label-text adx-hover-date" x="${L+24}" y="${H-B+15.5}" text-anchor="middle">—</text>
    </g>`;
    return `<svg class="adx-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" data-w="${W}" data-h="${H}" data-l="${L}" data-r="${R}" data-t="${T}" data-b="${B}" data-min="${min}" data-max="${max}" data-count="${points.length}" data-dates="${dates}" data-plus="${pluses}" data-minus="${minuses}" data-adx="${adxs}">${grids}${threshold}${adxSteps}<path class="adx-di-plus" d="${linePath('di_plus')}"/><path class="adx-di-minus" d="${linePath('di_minus')}"/>${lastDots}${labels}${crosshair}</svg>`;
  }

  function bindAdxCrosshairs() {
    els.cards.querySelectorAll('svg.adx-svg').forEach(svg => {
      const panel=svg.closest('.adx-panel');
      const plusPill=panel?.querySelector('.adx-pill-plus');
      const minusPill=panel?.querySelector('.adx-pill-minus');
      const plusValue=plusPill?.querySelector('.adx-pill-value');
      const minusValue=minusPill?.querySelector('.adx-pill-value');
      const statePill=panel?.querySelector('.adx-state-pill');
      const stateText=statePill?.querySelector('.adx-state-text');
      const latestPlus=plusValue?.textContent||'—';
      const latestMinus=minusValue?.textContent||'—';
      const latestPlusNumber=Number(latestPlus);
      const latestMinusNumber=Number(latestMinus);
      const L=Number(svg.dataset.l||42),R=Number(svg.dataset.r||14),T=Number(svg.dataset.t||10),B=Number(svg.dataset.b||30);
      const W=Number(svg.dataset.w||760),H=Number(svg.dataset.h||142);
      const min=Number(svg.dataset.min||0),max=Number(svg.dataset.max||40),count=Math.max(2,Number(svg.dataset.count||2));
      let dates=[],pluses=[],minuses=[],adxs=[];
      try{dates=JSON.parse(decodeURIComponent(svg.dataset.dates||'%5B%5D'));}catch(_){}
      try{pluses=JSON.parse(decodeURIComponent(svg.dataset.plus||'%5B%5D'));}catch(_){}
      try{minuses=JSON.parse(decodeURIComponent(svg.dataset.minus||'%5B%5D'));}catch(_){}
      try{adxs=JSON.parse(decodeURIComponent(svg.dataset.adx||'%5B%5D'));}catch(_){}
      const innerW=W-L-R,innerH=H-T-B;
      const group=svg.querySelector('.adx-crosshair');
      const vline=svg.querySelector('.adx-cross-v');
      const dateBox=svg.querySelector('.adx-date-box');
      const dateText=svg.querySelector('.adx-hover-date');
      const plusDot=svg.querySelector('.adx-hover-plus');
      const minusDot=svg.querySelector('.adx-hover-minus');
      if(!group||!vline||!dateBox||!dateText||!plusDot||!minusDot)return;
      const y=(v)=>T+(max-Number(v))/(max-min)*innerH;
      const setPillStrength=(p,m)=>{
        if(!plusPill||!minusPill)return;
        plusPill.classList.remove('adx-pill-strong-plus','adx-pill-strong-minus','adx-pill-neutral');
        minusPill.classList.remove('adx-pill-strong-plus','adx-pill-strong-minus','adx-pill-neutral');
        const classes=adxPillStrengthClasses(p,m);
        plusPill.classList.add(classes.plus);
        minusPill.classList.add(classes.minus);
      };
      const adxTrends=adxStickyTrendSeries(adxs);
      const setDominanceState=(idx,p,m)=>{
        if(!statePill||!stateText)return;
        const a=adxs[idx]===null?NaN:Number(adxs[idx]);
        const trend=Number(adxTrends[idx]||0);
        const stateInfo=adxDominanceState(p,m,a,trend);
        statePill.classList.remove('adx-controller-plus','adx-controller-minus','adx-controller-neutral','adx-trend-rising','adx-trend-falling','adx-trend-neutral');
        statePill.classList.add(stateInfo.controllerClass,stateInfo.trendClass);
        stateText.textContent=stateInfo.text;
      };
      const restore=()=>{
        group.setAttribute('visibility','hidden');
        if(plusValue) plusValue.textContent=latestPlus;
        if(minusValue) minusValue.textContent=latestMinus;
        setPillStrength(latestPlusNumber,latestMinusNumber);
        setDominanceState(count-1,latestPlusNumber,latestMinusNumber);
      };
      svg.addEventListener('pointerleave',restore);
      svg.addEventListener('pointermove',ev=>{
        const rect=svg.getBoundingClientRect();
        if(!rect.width||!rect.height)return restore();
        const vx=(ev.clientX-rect.left)/rect.width*W;
        const vy=(ev.clientY-rect.top)/rect.height*H;
        if(vx<L||vx>W-R||vy<T||vy>H-B)return restore();
        const idx=Math.max(0,Math.min(count-1,Math.round((vx-L)/innerW*(count-1))));
        const snapX=L+idx*(innerW/(count-1));
        const date=String(dates[idx]||'—');
        const p=pluses[idx]===null?NaN:Number(pluses[idx]),m=minuses[idx]===null?NaN:Number(minuses[idx]);
        vline.setAttribute('x1',snapX);vline.setAttribute('x2',snapX);
        if(Number.isFinite(p)){plusDot.setAttribute('cx',snapX);plusDot.setAttribute('cy',y(p));plusDot.setAttribute('visibility','visible');if(plusValue)plusValue.textContent=p.toFixed(1);}else{plusDot.setAttribute('visibility','hidden');if(plusValue)plusValue.textContent='—';}
        if(Number.isFinite(m)){minusDot.setAttribute('cx',snapX);minusDot.setAttribute('cy',y(m));minusDot.setAttribute('visibility','visible');if(minusValue)minusValue.textContent=m.toFixed(1);}else{minusDot.setAttribute('visibility','hidden');if(minusValue)minusValue.textContent='—';}
        setPillStrength(p,m);
        setDominanceState(idx,p,m);
        const dw=Math.max(46,Math.min(78,date.length*6.2+14));
        const dx=Math.max(L,Math.min(W-R-dw,snapX-dw/2));
        dateBox.setAttribute('x',dx);dateBox.setAttribute('width',dw);
        dateText.setAttribute('x',dx+dw/2);dateText.textContent=date;
        group.setAttribute('visibility','visible');
      });
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
