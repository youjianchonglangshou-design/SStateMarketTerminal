(() => {
  "use strict";
  const cfg = window.SSTATE_CONFIG || {};
  const workerUrl = String(cfg.workerUrl || "").replace(/\/$/, "");
  const performanceUrl = String(cfg.performanceDataUrl || "");
  const ledgerUrl = String(cfg.performanceLedgerUrl || "");
  const OUTCOME = {
    SUCCESS_WITHIN_HORIZON: { label: "成功", cls: "success" },
    ALIVE_SLOW: { label: "存活", cls: "alive" },
    TRUE_FAIL: { label: "真失敗", cls: "fail" },
    OTHER: { label: "其他", cls: "other" },
  };
  const state = { days: "7", market: "ALL", performance: null, ledger: [], currentRows: [], activeModel: null };
  const $ = id => document.getElementById(id);
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  const pct = (value, digits=1) => Number.isFinite(Number(value)) ? `${(Number(value)*100).toFixed(digits)}%` : "—";
  const signedPct = (value, digits=1) => {
    const n=Number(value); if(!Number.isFinite(n)) return "—";
    return `${n>0?"+":""}${(n*100).toFixed(digits)}%`;
  };
  const bust = url => `${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`;
  async function fetchJson(url) { const r=await fetch(bust(url),{cache:"no-store"}); if(!r.ok) throw new Error(`${r.status} ${r.statusText}`); return r.json(); }
  async function fetchText(url) { const r=await fetch(bust(url),{cache:"no-store"}); if(!r.ok) throw new Error(`${r.status} ${r.statusText}`); return r.text(); }
  function parseLedger(text) {
    return String(text||"").split(/\r?\n/).map(x=>x.trim()).filter(Boolean).map((line,i)=>{ try{return JSON.parse(line)}catch(e){console.warn("ledger line parse failed",i+1,e);return null} }).filter(Boolean);
  }
  function currentChampion() { return state.performance?.champion || {}; }
  function currentGenerationRows() {
    const c=currentChampion();
    const modelId=String(c.model_id||""); const generation=Number(c.generation||0);
    return state.ledger.filter(r=>String(r.champion_model_id||"")===modelId && Number(r.generation||0)===generation);
  }
  function marketRows(rows) {
    if(state.market==="ALL") return rows.slice();
    return rows.filter(r=>String(r.market_type||"CRYPTO").toUpperCase()===state.market);
  }
  function scopedRows() {
    return windowRows(marketRows(state.currentRows),state.days);
  }
  function marketLabel(value) {
    const v=String(value||"CRYPTO").toUpperCase();
    return v==="US_STOCK" ? "美股" : "Crypto";
  }
  function windowRows(rows, days) {
    if(days==="all") return rows.slice();
    const d=Number(days); if(!Number.isFinite(d)) return rows.slice();
    const cutoff=Date.now()-d*86400000;
    return rows.filter(r=>Number(r.decision_time||0)>=cutoff);
  }
  function settlement(row, horizon="72H") { return row?.settlements?.[horizon] || {status:"PENDING"}; }
  function summary(rows) {
    const counts={SUCCESS_WITHIN_HORIZON:0,ALIVE_SLOW:0,TRUE_FAIL:0,OTHER:0};
    let settled=0;
    for(const r of rows){ const s=settlement(r); if(s.status!=="SETTLED") continue; settled++; if(counts[s.outcome]!==undefined) counts[s.outcome]++; }
    const success=counts.SUCCESS_WITHIN_HORIZON, alive=counts.ALIVE_SLOW, fail=counts.TRUE_FAIL, other=counts.OTHER;
    return { snapshots:rows.length, settled_72h:settled, pending_72h:rows.length-settled, success, alive_slow:alive, true_fail:fail, other,
      success_rate:settled?success/settled:null, alive_slow_rate:settled?alive/settled:null, structural_survival_rate:settled?(success+alive)/settled:null,
      true_fail_rate:settled?fail/settled:null, other_rate:settled?other/settled:null };
  }
  function outcomeHtml(outcome, status="SETTLED") {
    if(status!=="SETTLED") return '<span class="outcome-pill pending">待結算</span>';
    const node=OUTCOME[outcome]||{label:"其他",cls:"other"};
    return `<span class="outcome-pill ${node.cls}">${node.label}</span>`;
  }
  function renderChampion() {
    const c=currentChampion(); const all=summary(state.currentRows); const threshold=Number(c.evolution_min_settled_72h||120);
    $("champion-id").textContent=c.model_id||"—";
    $("generation-badge").textContent=`GEN ${String(c.generation||"—").padStart(3,"0")}`;
    $("snapshot-count").textContent=all.snapshots.toLocaleString();
    $("settled-count").textContent=all.settled_72h.toLocaleString();
    $("pending-count").textContent=all.pending_72h.toLocaleString();
    $("evolution-count").textContent=`${all.settled_72h.toLocaleString()} / ${threshold.toLocaleString()}`;
    $("evolution-fill").style.width=`${Math.min(100, threshold?all.settled_72h/threshold*100:0).toFixed(1)}%`;
    const activeId=String(state.activeModel?.model_id||"");
    const mismatch=activeId && c.model_id && activeId!==c.model_id;
    const generated=state.performance?.generated_at ? new Date(state.performance.generated_at).toLocaleString("zh-TW",{hour12:false}) : "—";
    $("champion-meta").textContent=mismatch ? `⚠ R2 Active ${activeId}｜戰績帳本仍是 ${c.model_id}` : `戰績更新 ${generated}｜Frozen Snapshot 不做賽後回算`;
    $("champion-meta").classList.toggle("rate-bad",Boolean(mismatch));
    $("evolution-note").textContent=all.settled_72h>=threshold ? "本代已達學習門檻；HistoricalTraining 將進入下一代 Champion 學習。" : `還差 ${Math.max(0,threshold-all.settled_72h)} 筆正式 72H 結算，觸發下一代學習。`;
  }
  function renderSummaryCard(card, node) {
    const main=card.querySelector(".summary-main"), outcomes=card.querySelector(".summary-outcomes"), sub=card.querySelector(".summary-sub");
    main.textContent=node.settled_72h ? `${node.success} 成功 / ${node.settled_72h} 結算` : "尚無正式結算";
    outcomes.innerHTML=`<span class="outcome-success">成功 ${node.success}</span>｜<span class="outcome-alive">存活 ${node.alive_slow}</span>｜<span class="outcome-fail">真失敗 ${node.true_fail}</span>｜<span class="outcome-other">其他 ${node.other}</span>`;
    sub.textContent=`成功率 ${pct(node.success_rate)}｜結構存活 ${pct(node.structural_survival_rate)}｜真失敗 ${pct(node.true_fail_rate)}｜待結算 ${node.pending_72h}`;
  }
  function renderSummary() {
    const rows=scopedRows(); const all=summary(rows);
    $("overall-main").textContent=all.settled_72h ? `${all.success} 成功 / ${all.settled_72h} 結算` : "尚無正式結算";
    $("overall-outcomes").innerHTML=`<span class="outcome-success">成功 ${all.success}</span>｜<span class="outcome-alive">存活 ${all.alive_slow}</span>｜<span class="outcome-fail">真失敗 ${all.true_fail}</span>｜<span class="outcome-other">其他 ${all.other}</span>`;
    $("overall-sub").textContent=`成功率 ${pct(all.success_rate)}｜結構存活 ${pct(all.structural_survival_rate)}｜真失敗 ${pct(all.true_fail_rate)}｜快照 ${all.snapshots}｜待結算 ${all.pending_72h}`;
    document.querySelectorAll("[data-state-card]").forEach(card=>{ const s=card.dataset.stateCard; renderSummaryCard(card,summary(rows.filter(r=>r.state===s))); });
  }
  function thresholdSummary(rows, threshold) {
    const settled=rows.filter(r=>settlement(r).status==="SETTLED" && Number(r?.prediction?.success_probability||0)>=threshold);
    const wins=settled.filter(r=>settlement(r).outcome==="SUCCESS_WITHIN_HORIZON").length;
    const avg=settled.length?settled.reduce((a,r)=>a+Number(r?.prediction?.success_probability||0),0)/settled.length:null;
    const actual=settled.length?wins/settled.length:null;
    return {samples:settled.length,wins,average:avg,actual,gap:actual!=null&&avg!=null?actual-avg:null};
  }
  function renderProbability() {
    const rows=scopedRows(); const host=$("probability-cards");
    host.innerHTML=[.60,.65,.70].map(t=>{ const x=thresholdSummary(rows,t); const gapClass=Number(x.gap)>=0?"cal-positive":"cal-negative";
      return `<article class="probability-card ${t===.65?"focus":""}"><div class="probability-label">預估成功率 ≥${Math.round(t*100)}%</div><div class="probability-main">${x.samples?pct(x.actual):"尚無樣本"}</div><div class="probability-sub">${x.samples?`成功 ${x.wins} / ${x.samples}｜平均預估 ${pct(x.average)}<br>校準差 <span class="${gapClass}">${signedPct(x.gap)}</span>`:"等待 72H 正式結算累積"}</div></article>`;
    }).join("");
  }
  function renderDaily() {
    const rows=scopedRows(); const groups=new Map();
    for(const r of rows){ const day=String(r.decision_date_tw||String(r.decision_time_tw||"").slice(0,10)); if(!groups.has(day))groups.set(day,[]); groups.get(day).push(r); }
    const days=[...groups.keys()].sort().reverse(); const body=$("daily-body");
    if(!days.length){body.innerHTML='<tr><td colspan="9" class="loading-cell">此範圍尚無 Frozen Snapshot。</td></tr>';return;}
    body.innerHTML=days.map(day=>{const s=summary(groups.get(day));return `<tr><td><b>${escapeHtml(day)}</b></td><td>${s.settled_72h}</td><td class="outcome-success">${s.success}</td><td class="outcome-alive">${s.alive_slow}</td><td class="outcome-fail">${s.true_fail}</td><td>${s.other}</td><td>${pct(s.success_rate)}</td><td>${pct(s.structural_survival_rate)}</td><td>${pct(s.true_fail_rate)}</td></tr>`}).join("");
  }
  function pathText(path) { return Array.isArray(path)&&path.length ? path.map(x=>typeof x==="string"?x:(x?.state||"")).filter(Boolean).join(" → ") : "—"; }
  function horizonCell(r,key){const s=settlement(r,key);return outcomeHtml(s.outcome,s.status)}
  function detailRows() {
    let rows=scopedRows();
    const sf=$("state-filter").value, of=$("outcome-filter").value, pf=$("probability-filter").value, q=$("search-input").value.trim().toUpperCase();
    if(sf!=="ALL") rows=rows.filter(r=>r.state===sf);
    if(of!=="ALL") rows=rows.filter(r=>of==="PENDING"?settlement(r).status!=="SETTLED":settlement(r).status==="SETTLED"&&settlement(r).outcome===of);
    if(pf!=="ALL") rows=rows.filter(r=>Number(r?.prediction?.success_probability||0)>=Number(pf));
    if(q) rows=rows.filter(r=>String(r.symbol||"").toUpperCase().includes(q));
    return rows.sort((a,b)=>Number(b.decision_time||0)-Number(a.decision_time||0));
  }
  function stateClass(s){return s==="S0.5"?"s05":s==="S1"?"s1":s==="S2"?"s2":"s3"}
  function renderDetail() {
    const rows=detailRows(); const body=$("detail-body");
    if(!rows.length){body.innerHTML='<tr><td colspan="11" class="loading-cell">沒有符合篩選條件的紀錄。</td></tr>';$("detail-footer").textContent="0 筆";return;}
    body.innerHTML=rows.slice(0,500).map(r=>{const p=r.prediction||{}, s72=settlement(r), mfe=Number(s72.max_return), mae=Number(s72.max_drawdown);
      return `<tr><td>${escapeHtml(r.checkpoint_time_tw||r.decision_time_tw||"—")}</td><td><b>${marketLabel(r.market_type)}</b></td><td><b>${escapeHtml(r.symbol||"—")}</b></td><td><span class="state-pill ${stateClass(r.state)}">${escapeHtml(r.state||"—")}</span><span class="target-pill">${escapeHtml(r.target||"—")}</span></td><td><div class="prediction-stack"><b>成功 ${pct(p.success_probability)}</b><span>存活 ${pct(p.structural_survival_probability)}｜失敗 ${pct(p.true_fail_probability)}</span></div></td><td>${horizonCell(r,"12H")}</td><td>${horizonCell(r,"24H")}</td><td>${horizonCell(r,"48H")}</td><td>${horizonCell(r,"72H")}</td><td class="path-cell" title="${escapeHtml(pathText(s72.state_path||r.final_path))}">${escapeHtml(pathText(s72.state_path||r.final_path))}</td><td>${Number.isFinite(mfe)?`<span class="mfe">${signedPct(mfe)}</span>`:"—"} / ${Number.isFinite(mae)?`<span class="mae">${signedPct(mae)}</span>`:"—"}</td></tr>`;
    }).join("");
    $("detail-footer").textContent=`顯示 ${Math.min(500,rows.length)} / ${rows.length} 筆｜只使用本代 Champion Frozen Snapshot`;
  }
  function renderRange() {
    renderSummary(); renderProbability(); renderDaily(); renderDetail();
  }
  function bind() {
    document.querySelectorAll(".market-tab").forEach(btn=>btn.addEventListener("click",()=>{
      document.querySelectorAll(".market-tab").forEach(x=>x.classList.remove("active"));
      btn.classList.add("active");
      state.market=btn.dataset.market||"ALL";
      const labels={ALL:"全部市場戰績",CRYPTO:"Crypto 戰績",US_STOCK:"美股戰績"};
      $("market-note").textContent=labels[state.market]||"全部市場戰績";
      renderRange();
    }));
    document.querySelectorAll(".range-tab").forEach(btn=>btn.addEventListener("click",()=>{document.querySelectorAll(".range-tab").forEach(x=>x.classList.remove("active"));btn.classList.add("active");state.days=btn.dataset.days||"7";renderRange()}));
    ["state-filter","outcome-filter","probability-filter"].forEach(id=>$(id).addEventListener("change",renderDetail));
    $("search-input").addEventListener("input",renderDetail);
    $("refresh-button").addEventListener("click",load);
  }
  async function load() {
    const status=$("status-text"); status.textContent="正在讀取 Champion Frozen Snapshot…"; $("refresh-button").disabled=true;
    try {
      if(!performanceUrl||!ledgerUrl) throw new Error("config.js 尚未設定 performanceDataUrl / performanceLedgerUrl");
      const tasks=[fetchJson(performanceUrl),fetchText(ledgerUrl)];
      if(workerUrl) tasks.push(fetchJson(`${workerUrl}/api/model/active` ).catch(()=>null));
      const [perf,text,active]=await Promise.all(tasks);
      state.performance=perf; state.ledger=parseLedger(text); state.activeModel=active||null; state.currentRows=currentGenerationRows();
      renderChampion(); renderRange();
      const generated=perf?.generated_at?new Date(perf.generated_at).toLocaleString("zh-TW",{hour12:false}):"尚未產生正式戰績";
      status.textContent=`戰績資料 ${generated}｜本代 ${state.currentRows.length} 筆 Frozen Snapshot`;
    } catch(err) {
      console.error(err); status.textContent=`戰績載入失敗：${err.message}`; state.performance={champion:{generation:1,model_id:"—",evolution_min_settled_72h:120}}; state.ledger=[]; state.currentRows=[]; renderChampion(); renderRange();
    } finally { $("refresh-button").disabled=false; }
  }
  bind(); load();
})();
