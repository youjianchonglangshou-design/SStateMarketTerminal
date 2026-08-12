(() => {
  "use strict";
  const cfg = window.SSTATE_CONFIG || {};
  const workerUrl = String(cfg.workerUrl || "").replace(/\/$/, "");
  const pollInterval = Number(cfg.pollIntervalMs || 4000);
  const state = { market: localStorage.getItem("sstate-market") || cfg.defaultMarket || "crypto", snapshot: null, filter: "ALL", runId: "", pollTimer: null, champion: null, challenger: null, evaluation: null };

  const $ = (id) => document.getElementById(id);
  const els = {
    version: $("version-chip"), systemCaption: $("system-caption"), market: $("market-select"), run: $("run-button"), download: $("download-button"),
    runPanel: $("run-panel"), runTitle: $("run-title"), runPercent: $("run-percent"), runBar: $("run-bar"), runDetail: $("run-detail"),
    snapshotMeta: $("snapshot-meta"), filters: $("state-filters"), summary: $("summary-strip"), cards: $("cards"), empty: $("empty-state"), toast: $("toast"),
    battleCaption: $("battle-caption"), battleDecision: $("battle-decision"), championId: $("champion-id"), championMeta: $("champion-meta"),
    challengerId: $("challenger-id"), challengerMeta: $("challenger-meta"), battleMetrics: $("battle-metrics")
  };
  els.version.textContent = cfg.appVersion || "TERMINAL v0.1.0";
  els.market.value = state.market;

  const marketFilename = (market) => market === "us-stock" ? "snapshot_us_stock_ai.json" : "snapshot_ai.json";
  const marketLabel = (market) => market === "us-stock" ? "美股代幣" : "加密貨幣";
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

  async function fetchJson(url, options={}) {
    const res = await fetch(url, { cache: "no-store", ...options });
    if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(()=>res.statusText)}`);
    return res.json();
  }


  async function fetchOptionalJson(url) {
    try { return await fetchJson(url); } catch (_) { return null; }
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
      return;
    }

    const generated = h.assigned_at || h.generated_at;
    els.battleCaption.textContent =
      `Active ${shortId(c.model_id)}｜Challenger ${shortId(h.model_id)}｜Shadow 起點 ${generated ? new Date(generated).toLocaleString("zh-TW",{hour12:false}) : "—"}`;

    if (!e || e.challenger_model_id !== h.model_id) {
      els.battleMetrics.innerHTML = [
        ["OOS 已結算案例","等待第一批 72H settlement"],
        ["最低證據","180 cases / 50 symbols"],
        ["最早可判定","Challenger 年齡 ≥ 72H"],
        ["目前動作","Active 不變，Challenger 只做 Shadow"]
      ].map(([k,v])=>`<div class="battle-metric"><span>${escapeHtml(k)}</span><strong>${escapeHtml(v)}</strong></div>`).join("");
      return;
    }

    const active = e.active || {};
    const challenger = e.challenger || {};
    const pBetter = Number(e.bootstrap_probability_challenger_brier_better);
    els.battleMetrics.innerHTML = [
      ["OOS cases", Number(e.paired_oos_cases || 0).toLocaleString()],
      ["OOS symbols", Number(e.paired_oos_symbols || 0).toLocaleString()],
      ["Champion Brier", fmtMetric(active.multiclass_brier)],
      ["Challenger Brier", fmtMetric(challenger.multiclass_brier)],
      ["Challenger 較佳信心", Number.isFinite(pBetter) ? pct(pBetter,1) : "—"],
      ["Decision", decisionZh(e.decision)]
    ].map(([k,v])=>`<div class="battle-metric"><span>${escapeHtml(k)}</span><strong>${escapeHtml(v)}</strong></div>`).join("");
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
    els.filters.innerHTML = order.map(k => `<button class="filter ${state.filter===k?'active':''}" data-filter="${k}">${k==='ALL'?'全部':k} ${k==='ALL'?(state.snapshot?.records?.length||0):(counts[k]||0)}</button>`).join("");
    els.filters.querySelectorAll("button").forEach(btn => btn.addEventListener("click", () => { state.filter=btn.dataset.filter; renderFilters(); renderCards(); }));
  }

  function renderSummary() {
    const counts = state.snapshot?.breadth?.market_state || {};
    const probs = (state.snapshot?.records || []).filter(r => r.historical_probability?.["72h"]?.available).map(r => r.historical_probability["72h"]);
    const avgSuccess = probs.length ? probs.reduce((a,x)=>a+Number(x.success_probability||0),0)/probs.length : null;
    const avgFail = probs.length ? probs.reduce((a,x)=>a+Number(x.true_fail_probability||0),0)/probs.length : null;
    els.summary.innerHTML = [
      ["S3",counts.S3||0],["S0.5",counts["S0.5"]||0],["S1",counts.S1||0],["S2",counts.S2||0],["平均3日成功",avgSuccess==null?'—':pct(avgSuccess)],["平均真失敗",avgFail==null?'—':pct(avgFail)]
    ].map(([k,v])=>`<div class="summary-item"><b>${escapeHtml(k)}</b> ${escapeHtml(v)}</div>`).join("");
  }

  function recordState(r) { return r?.opportunity_long?.market_state_id || "OTHER"; }
  function stateRank(s){ return ({"S3":0,"S0.5":1,"S2":2,"S1":3,"S0":4,"OTHER":5})[s] ?? 9; }

  function renderCards() {
    let rows = [...(state.snapshot?.records || [])];
    if (state.filter !== "ALL") rows = rows.filter(r => recordState(r) === state.filter);
    rows.sort((a,b) => stateRank(recordState(a))-stateRank(recordState(b)) || Number(b.historical_probability?.["72h"]?.success_probability||0)-Number(a.historical_probability?.["72h"]?.success_probability||0));
    els.cards.innerHTML = rows.map(renderCard).join("");
  }

  function stateClass(s){ if(s==='S0.5')return 'state-s05'; if(s==='S1')return 'state-s1'; if(s==='S2')return 'state-s2'; if(s==='S0')return 'state-s0'; return ''; }
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
  function midHuman(v){return ({rising:'中軌上斜',flat:'中軌平緩',flattening:'中軌走平',falling:'中軌下斜'})[v]||'中軌未知'}
  function bandHuman(v){return ({LT_025:'<0.25','025_050':'0.25-0.50','050_060':'0.50-0.60','060_075':'0.60-0.75',GE_075:'>0.75'})[v]||'?'}
  function bwHuman(v){return ({EXPANDING:'布林擴張',CONTRACTING:'布林收縮',FLAT:'布林平穩'})[v]||'布林未知'}
  function ageHuman(v){return ({'1':'1根4H','2_3':'2-3根4H','4_6':'4-6根4H','7_PLUS':'7+根4H'})[v]||'—'}

  function renderCard(r) {
    const opp=r.opportunity_long||{}, s=recordState(r), mid=opp.midline||{}, sectors=(r.sectors||[]).join(' · ')||'未分類';
    const move=Number(r.bb_pct||0); const moveClass=move>=0?'up':'down';
    const h4prev=String(r.h4_prev||''); const h4curr=String(r.h4_curr||'');
    const lamp = (x)=> x==='green'||x==='🟢'?'<span class="g">●</span>':x==='red'||x==='🔴'?'<span class="r">●</span>':'●';
    return `<article class="card">
      <div class="card-header"><div class="identity"><div>${escapeHtml(r.symbol)}　現價 ${fmtPrice(r.price)}　｜ 日前偏離 <span class="move ${moveClass}">${move>=0?'+':''}${num(move)}%</span></div><div class="lights">4H前 ${lamp(h4prev)}　｜　4H當 ${lamp(h4curr)}</div></div>
      <div class="badges"><div class="badge-row"><span class="pill state-pill ${stateClass(s)}">${escapeHtml(opp.stars_text||'★☆☆☆☆')} ${escapeHtml(s)}｜${escapeHtml(opp.market_state_name||opp.setup_name||'')}</span><span class="pill mid-pill">中軌 ${escapeHtml(mid.symbol||'?')} ${escapeHtml(mid.label||'未知')}</span></div><div class="badge-row">${renderProbability(r)}<span class="pill sector-pill">${escapeHtml(sectors)}</span></div></div></div>
      <div class="chart">${buildChartSvg(r.chart_30d||[])}</div>
    </article>`;
  }

  function buildChartSvg(points) {
    if (!Array.isArray(points) || points.length < 2) return '<div class="caption">無30日圖表資料</div>';
    const W=760,H=260,L=42,R=14,T=12,B=24, innerW=W-L-R, innerH=H-T-B;
    const vals=[]; points.forEach(p=>['bb_upper','bb_midline','bb_lower','ha_close'].forEach(k=>{const n=Number(p[k]);if(Number.isFinite(n)) vals.push(n)}));
    let min=Math.min(...vals), max=Math.max(...vals); const pad=(max-min||1)*.08; min-=pad; max+=pad;
    const x=(i)=>L+i*(innerW/(points.length-1)); const y=(v)=>T+(max-Number(v))/(max-min)*innerH;
    const linePath=(key)=>points.map((p,i)=>`${i?'L':'M'}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join(' ');
    let grids=''; for(let i=0;i<4;i++){const yy=T+i*innerH/3; const val=max-i*(max-min)/3; grids+=`<line class="grid-line" x1="${L}" y1="${yy}" x2="${W-R}" y2="${yy}"/><text class="axis-text" x="2" y="${yy+3}">${fmtPrice(val)}</text>`}
    let ladder=''; for(let i=0;i<points.length-1;i++){const p=points[i], q=points[i+1]; const cls=(p.ha_color==='yellow')?'ladder-yellow':'ladder-purple'; const x1=x(i),x2=x(i+1),yy=y(p.ha_close),y2=y(q.ha_close); ladder+=`<path class="${cls}" d="M${x1},${yy} H${x2} V${y2}"/>`;}
    const last=points[points.length-1], lc=last.ha_color==='yellow'?'#fde047':'#bba4e8';
    const labels=[0,Math.floor((points.length-1)/3),Math.floor((points.length-1)*2/3),points.length-1].map(i=>`<text class="axis-text" x="${x(i)-10}" y="${H-4}" transform="rotate(-35 ${x(i)-10} ${H-4})">${escapeHtml(points[i].date||'')}</text>`).join('');
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${grids}<path class="bb-line" d="${linePath('bb_upper')}"/><path class="mid-line" d="${linePath('bb_midline')}"/><path class="bb-line" d="${linePath('bb_lower')}"/>${ladder}<circle class="last-dot" cx="${x(points.length-1)}" cy="${y(last.ha_close)}" r="5" fill="${lc}"/>${labels}</svg>`;
  }

  async function startFullAnalysis() {
    if (!workerUrl) { showToast('尚未設定 Cloudflare Worker。先部署 cloudflare/worker.js，再把 URL 填到 config.js。',7000); return; }
    els.run.disabled=true; setRunUi(true,0,'正在送出 GitHub Actions…','建立本次 run_id');
    try {
      const out=await fetchJson(`${workerUrl}/api/analysis/start`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({market:state.market})});
      state.runId=out.run_id; showToast(`完整分析已啟動｜${out.run_id}`); pollRun();
    } catch(err){ els.run.disabled=false; setRunUi(true,0,'啟動失敗',err.message); showToast(`完整分析啟動失敗：${err.message}`,8000); }
  }
  function setRunUi(show,percent,title,detail){els.runPanel.classList.toggle('hidden',!show);els.runPercent.textContent=`${percent||0}%`;els.runBar.style.width=`${Math.max(0,Math.min(100,percent||0))}%`;els.runTitle.textContent=title||'';els.runDetail.textContent=detail||''}
  async function pollRun(){
    clearTimeout(state.pollTimer); if(!state.runId)return;
    try{
      const s=await fetchJson(`${workerUrl}/api/analysis/status?run_id=${encodeURIComponent(state.runId)}&t=${Date.now()}`);
      const p=Number(s.percent||0); setRunUi(true,p,s.status==='SUCCESS'?'分析完成':s.status==='FAILED'?'分析失敗':'完整分析執行中',`${s.current_symbol||''} ${s.completed??''}/${s.total??''} ${s.message||''}`.trim());
      if(s.status==='SUCCESS'){els.run.disabled=false;state.runId='';await Promise.all([loadSnapshot(),loadModelBattle()]);showToast('完整分析完成，畫面已切換到 R2 最新資料。',7000);return}
      if(s.status==='FAILED'){els.run.disabled=false;state.runId='';showToast(`分析失敗：${s.message||'請查看 GitHub Actions'}`,9000);return}
    }catch(err){setRunUi(true,0,'等待 GitHub Actions 回報',err.message)}
    state.pollTimer=setTimeout(pollRun,pollInterval);
  }

  async function downloadCurrentJson(){
    if(workerUrl){try{const res=await fetch(`${workerUrl}/api/download?market=${encodeURIComponent(state.market)}&t=${Date.now()}`);if(res.ok){const blob=await res.blob();downloadBlob(blob,marketFilename(state.market));return}}catch(_){} }
    if(state.snapshot) downloadBlob(new Blob([JSON.stringify(state.snapshot,null,2)],{type:'application/json'}),marketFilename(state.market));
  }
  function downloadBlob(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500)}

  els.market.addEventListener('change',async()=>{state.market=els.market.value;localStorage.setItem('sstate-market',state.market);state.filter='ALL';await loadSnapshot()});
  els.run.addEventListener('click',startFullAnalysis); els.download.addEventListener('click',downloadCurrentJson);
  Promise.all([loadSnapshot(), loadModelBattle()]);
})();
