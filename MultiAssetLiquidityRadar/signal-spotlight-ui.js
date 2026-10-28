/* Signal Spotlight v2.1.12 — Taiwan-midnight daily event cycle, with compact cross-day deduplication.
   Browser-only: no new market API requests, cloud storage or background Worker. */
(()=>{'use strict';
 const core=window.SignalSpotlightCore, engine=window.SStateMonitorEngine;
 const button=document.getElementById('signalSpotlightButton'),panel=document.getElementById('signalSpotlightPanel');
 if(!core||!button||!panel)return;
 const KEY='SStateLiquidityRadar.signalSpotlight.v1',MAX_QUEUE=90,SEEN_TTL=3*86400000;
 const $=id=>document.getElementById(id);
 const events=new Map(),contexts=new Map(),fingerprints=new Map(),pending=new Map(),seededSymbols=new Set(),seenIds=new Map();
 let scanning=false,visible=false,threshold=80,unknown=0,complete=0,storageError=false;
 // Separate Taiwan calendar day from the 08:00 daily-candle day in the indicator engine.
 const dayFormatter=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'});
 const tpeDay=()=>{const p=Object.fromEntries(dayFormatter.formatToParts(Date.now()).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));return `${p.year}-${p.month}-${p.day}`;};
 let activeDate=tpeDay();
 const nowDay=()=>Math.floor(Date.now()/core.DAY)*core.DAY;
 const timeFmt=ms=>new Date(ms).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
 function readStore(){try{return JSON.parse(localStorage.getItem(KEY)||'null')||{};}catch(_){return {};}}
 function rememberSeen(id,at=Date.now()){
  if(typeof id!=='string'||!/^[^|]{1,40}\|R\d{2}\|\d{4}-\d{2}-\d{2}$/.test(id))return;
  seenIds.set(id,Math.max(Number(seenIds.get(id))||0,Number(at)||Date.now()));
 }
 function trimSeen(){const cut=Date.now()-SEEN_TTL;
  for(const [id,at] of seenIds)if(at<cut)seenIds.delete(id);
 }
 function mergeSeen(obj){
  for(const [id,at] of Object.entries(obj?.seenIds||{}))rememberSeen(id,at);
  // An existing event is also a seen ID, even when a different tab crosses midnight first.
  for(const e of Array.isArray(obj?.events)?obj.events:[])if(e?.eventId)rememberSeen(e.eventId,e.lastSeenAt||e.firstSeenAt);
  trimSeen();
 }
 function mergeCurrent(obj){
  if(obj?.version!==2||obj.taipeiDate!==activeDate)return;
  mergeSeen(obj);
  for(const e of Array.isArray(obj.events)?obj.events:[]){
   if(!e?.eventId||e.localDate!==activeDate||!tracked(e.symbol))continue;
   const old=events.get(e.eventId);
   if(!old){events.set(e.eventId,e);continue;}
   if((Number(e.lastSeenAt)||0)>(Number(old.lastSeenAt)||0))events.set(e.eventId,{...old,...e,viewedAt:old.viewedAt||e.viewedAt||null});
   else if(e.viewedAt&&!old.viewedAt)old.viewedAt=e.viewedAt;
  }
 }
 function warnStorage(){if(storageError)return;storageError=true;
  const notice=$('signalSpotlightNotice');if(notice)notice.textContent='雷達本機儲存失敗／容量不足：目前事件可能無法在重新整理後保留。';
  console.warn('[SignalSpotlight] localStorage could not save the daily radar events');
 }
 function persist(){
  // Never let an old tab overwrite today's reset with yesterday's in-memory events.
  ensureDate();
  try{
   const obj=readStore();
   if(obj?.version===2&&obj.taipeiDate===activeDate)mergeCurrent(obj);
   trimSeen();
   localStorage.setItem(KEY,JSON.stringify({version:2,taipeiDate:activeDate,threshold,
    events:[...events.values()].filter(e=>e.localDate===activeDate),seenIds:Object.fromEntries(seenIds)}));
   storageError=false;
  }catch(_){warnStorage();}
 }
 function load(){
  const obj=readStore();
  if([70,75,80,85,90].includes(obj.threshold))threshold=obj.threshold;
  mergeSeen(obj); // Legacy v1 audit events migrate to compact ID-only deduplication.
  if(obj.version===2&&obj.taipeiDate===activeDate)mergeCurrent(obj);
  // v1 history and events from older Taiwan dates are never migrated into today's list.
  persist();
 }
 function ensureDate(){
  const today=tpeDay();if(today===activeDate)return false;
  const old=[...events.values()];
  for(const e of old)rememberSeen(e.eventId,e.lastSeenAt||e.firstSeenAt);
  events.clear();contexts.clear();pending.clear();fingerprints.clear();
  activeDate=today;
  const stored=readStore();mergeSeen(stored);
  if(stored.version===2&&stored.taipeiDate===today)mergeCurrent(stored);
  // Do not clear user threshold, page notification statistics or RR state.
  persist();updateButton();if(visible)render();
  return true;
 }
 // Watchlist is authoritative: an event from a removed custom PERP is not actionable.
 // While the main chart API has not initialized, postpone filtering rather than erase history.
 const tracked=symbol=>!window.LIQ_CHART_API?.hasSymbol||window.LIQ_CHART_API.hasSymbol(symbol);
 function pruneRemoved(){
   if(!window.LIQ_CHART_API?.hasSymbol)return;
   let changed=false;
   for(const [id,e] of events)if(!tracked(e.symbol)){events.delete(id);changed=true;}
   for(const id of contexts.keys())if(!tracked(id))contexts.delete(id);
   for(const id of pending.keys())if(!tracked(id))pending.delete(id);
   for(const id of fingerprints.keys())if(!tracked(id))fingerprints.delete(id);
   if(changed)persist();
 }
 const active=e=>e.status!=='retracted';
 const isUnread=e=>e.localDate===activeDate&&tracked(e.symbol)&&active(e)&&!e.viewedAt&&e.attentionScore>=threshold&&e.favorite&&e.eventType==='NEW';
 function updateButton(){pruneRemoved();const count=[...events.values()].filter(isUnread).length;
   button.classList.toggle('has-fresh-events',count>0);
   button.setAttribute('aria-label',count?`智慧雷達：${count} 個未讀新事件`:'智慧雷達：沒有未讀新事件');
   button.title=count?`${count} 個未讀新鮮事件`:'開啟 Signal Spotlight 智慧事件雷達';
   $('signalSpotlightUnread').textContent=count>99?'99+':String(count);
   $('signalSpotlightUnread').hidden=count===0;
 }
 function ingest(symbol,result,{provisional=true,source='daily OHLC + SStateMonitorEngine'}={}){
  ensureDate();if(!tracked(symbol))return;
  if(!result||result.reason==='insufficient_history'||result.reason==='missing_daily_candle'||!result.signalDayKey)return;
  const day=result.signalDayKey,ids=new Set(result.rules.map(r=>r.id));
  const firstObservation=!seededSymbols.has(symbol);seededSymbols.add(symbol);
  // A forming daily candle may lose a previous event; keep the audit record as retracted.
  for(const e of events.values()){
   if(e.symbol!==symbol||e.signalDayKey!==day)continue;
   if(!ids.has(e.primaryRuleId)&&e.status!=='retracted'){
    e.status='retracted';e.retractedAt=Date.now();
   }else if(ids.has(e.primaryRuleId)&&e.status==='retracted'){
    e.status=provisional?'provisional':'confirmed';
   }else if(ids.has(e.primaryRuleId)&&!provisional){e.status='confirmed';}
  }
  const main=result.primary;
  if(main){const eventId=core.eventId(symbol,main.id,day),existing=events.get(eventId);
   // A cleared previous-day event must never reappear on a 00:00 re-scan.
   // Confirming yesterday's provisional candle must not create a fresh event either.
   if(!((seenIds.has(eventId)&&!existing)||(!provisional&&!existing))){
   rememberSeen(eventId);
   const item={eventId,symbol,signalDayKey:day,region:result.region,primaryRuleId:main.id,primaryTitle:main.title,matchedRuleIds:result.rules.map(r=>r.id),eventType:'NEW',favorite:true,status:provisional?'provisional':'confirmed',baseScore:main.score,attentionScore:result.attentionScore,firstSeenAt:existing?.firstSeenAt||Date.now(),lastSeenAt:Date.now(),viewedAt:existing?.viewedAt||null,localDate:activeDate,dataSource:source};
   events.set(eventId,item);
   // Only a newly created event AFTER the first live evaluation may notify.
   if(!existing&&!firstObservation&&result.notify&&item.attentionScore>=threshold&&!item.viewedAt)window.LIQ_BROWSER_NOTIFICATIONS?.onRadar(item);
   }
  }
  if(provisional)contexts.set(symbol,{region:result.region,rules:result.rules.map(x=>x.id),day});
  persist();updateButton();if(visible)render();
 }
 function process(record,days){
   ensureDate();
   if(!record||!Array.isArray(days)||days.length<43||!engine)return;
   const cur=days.at(-1),utc=nowDay();
   if(cur.t!==utc){unknown++;return;} // Do not invent today's candle from yesterday's feed.
   const final=core.evaluateHistory(days,engine,undefined,{provisional:true,threshold});
   if(final.reason==='insufficient_history'||final.reason==='missing_daily_candle'){unknown++;return;}
   complete++;ingest(record.id,final,{provisional:true});
   // At 08:00 Taiwan the prior day closes: confirm or retract only previously known events.
   const yesterday=core.utcDay(utc-core.DAY);
   if([...events.values()].some(e=>e.symbol===record.id&&e.signalDayKey===yesterday&&e.status==='provisional')){
     const prev=core.evaluateHistory(days,engine,days.length-2,{provisional:false,threshold});
     if(!prev.reason)ingest(record.id,prev,{provisional:false});
   }
 }
 function drain(){
   if(scanning)return;scanning=true;
   const cycle=()=>{
    const batch=[...pending.entries()].slice(0,2);
    for(const [id,item] of batch){pending.delete(id);try{process(item.record,item.days);}catch(err){console.warn('[SignalSpotlight]',id,err);unknown++;}}
    if(pending.size)setTimeout(cycle,65);else{scanning=false;if(visible)render();}
   };setTimeout(cycle,30);
 }
 function queueRecord(record,days){
  ensureDate();
  if(!record||!tracked(record.id))return;
  if(!record||!Array.isArray(days)||days.length<43)return;
  const cur=days.at(-1),prev=days.at(-2);
  if(!cur||!prev)return;
  // Re-evaluate when 1D derived state / crossed threshold changes, or a fresh 1D feed arrives.
  const cci=record.cci,ha=record.ha;
  const fingerprint=[cur.t,record.dailyAt,record.sstate,record.midline?.state,ha?.color,
   cci?.color,Number(cci?.value)>-100,Math.round(Number(cci?.value)),prev.t].join('|');
  if(fingerprints.get(record.id)===fingerprint)return;
  fingerprints.set(record.id,fingerprint);
  pending.set(record.id,{record,days:days.map(x=>({...x}))});
  if(pending.size>MAX_QUEUE)pending.delete(pending.keys().next().value);
  drain();
 }
 function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=String(text);return n;}
 function displayMessage(msg){const m=$('signalSpotlightNotice');m.textContent=msg;}
 function openChart(e){
   ensureDate();if(e.localDate!==activeDate)return; // Stale card clicked just after midnight.
   if(!tracked(e.symbol)){pruneRemoved();updateButton();render();displayMessage('此標的已從自由清單移除，雷達已清理舊事件。');return;}
   const w=window.LIQ_WORKSPACE;
   if(!w){displayMessage('圖表工作台仍在初始化');return;}
   const existing=w.getWindows?.().find(x=>x.symbol===e.symbol);
   const success=existing?(w.focusWindow(existing.id),true):w.selectSymbol(e.symbol);
   if(!success){
     const all=w.getWindows?.()||[];
     displayMessage(all.length>=4&&all.every(x=>x.locked)
       ?'目前四張圖表皆已鎖定，請解鎖其中一張或關閉一張後重試。'
       :'無法開啟圖表，請確認標的仍在監控清單及圖表工作台狀態。');return;
   }
   e.viewedAt=e.viewedAt||Date.now();persist();updateButton();render();
   const banner=$('signalSpotlightNotice');banner.textContent=`已顯示 ${e.symbol} · #${e.primaryRuleId} ${e.primaryTitle}`;
   // Temporary context chip attached to chosen window, without replacing or resizing the chart.
   const current=w.getWindows?.().find(x=>x.symbol===e.symbol);
   const active=[...document.querySelectorAll("[data-chart-window]")].find(node=>node.dataset.chartWindow===current?.id);
   if(active){let c=active.querySelector('.spotlight-chart-chip');if(!c){c=el('span','spotlight-chart-chip');active.querySelector('.chart-titlebar')?.append(c);}c.textContent=`雷達 #${e.primaryRuleId} · ${e.primaryTitle}`;c.title=`${e.matchedRuleIds.map(i=>'#'+i).join('、')} · ${e.attentionScore} 分（注意力排序，非勝率）`;setTimeout(()=>c?.remove(),6500);}
 }
 function render(){if(!visible)return;pruneRemoved();
   const list=$('signalSpotlightCards');list.replaceChildren();
   const all=[...events.values()].filter(e=>tracked(e.symbol)).sort((a,b)=>Number(isUnread(b))-Number(isUnread(a))||b.attentionScore-a.attentionScore||b.firstSeenAt-a.firstSeenAt);
   const unread=all.filter(isUnread).length;
   $('signalSpotlightSummary').textContent=`${unread} 未讀 · ${all.filter(active).length} 有效事件 · ${new Set(all.map(e=>e.symbol)).size} 檔事件標的`;
   if(!all.length){list.append(el('div','spotlight-empty','目前尚無符合「五星＋新事件」的訊號。雷達持續分析已取得的有效日線；HOLD 與非五星條件只作研究背景。'));}
   for(const e of all.slice(0,40)){
    const row=el('button','spotlight-event');row.type='button';row.classList.toggle('spotlight-event-unread',isUnread(e));row.classList.toggle('spotlight-event-retracted',e.status==='retracted');
    const top=el('div','spotlight-event-top');top.append(el('strong','',e.symbol),el('span','spotlight-rule','#'+e.primaryRuleId+' '+e.primaryTitle),el('span','spotlight-score',e.attentionScore+' 分'));row.append(top);
    const info=el('div','spotlight-event-meta');info.append(el('span','',e.region==='above'?'中軌上':'中軌下'),el('span','',e.status==='confirmed'?'已確認':e.status==='retracted'?'形成中已撤銷':'形成中'),el('span','',timeFmt(e.firstSeenAt)),el('span','',e.viewedAt?'已讀':'未讀'));row.append(info);
    row.title=`${e.matchedRuleIds.map(id=>'#'+id).join('、')}｜注意力分數並非勝率｜${e.dataSource}`;
    row.addEventListener('click',()=>openChart(e));list.append(row);
   }

 }
 function setVisible(on){ensureDate();visible=on;panel.hidden=!on;button.setAttribute('aria-expanded',String(on));if(on){const r=button.getBoundingClientRect(),pw=Math.min(430,innerWidth-20);panel.style.left=Math.max(10,Math.min(innerWidth-pw-10,r.left+r.width/2-pw/2))+'px';render();}}
 load();
 // Date checks on an open page, return from a throttled tab, sleep and focus.
 const onResume=()=>{ensureDate();};
 // Aim at 00:00 itself; the interval and focus checks cover background timer throttling.
 const offset=8*60*60*1000;let midnightTimer;
 function scheduleMidnight(){clearTimeout(midnightTimer);
  const now=Date.now(),until=(Math.floor((now+offset)/core.DAY)+1)*core.DAY-(now+offset);
  midnightTimer=setTimeout(()=>{onResume();scheduleMidnight();},Math.max(250,until+150));
 }
 scheduleMidnight();setInterval(onResume,15000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)onResume();});
 window.addEventListener('focus',onResume);
 window.addEventListener('pageshow',onResume);
 window.addEventListener('storage',ev=>{if(ev.key!==KEY)return;
  if(ensureDate())return;
  const obj=readStore();if(obj.version===2&&obj.taipeiDate===activeDate){
   mergeCurrent(obj);if([70,75,80,85,90].includes(obj.threshold)){threshold=obj.threshold;$('signalSpotlightThreshold').value=String(threshold);}
   updateButton();if(visible)render();
  }
 });
 document.addEventListener('liq-radar-custom-updated',()=>{pruneRemoved();updateButton();if(visible)render();});
 $('signalSpotlightThreshold').value=String(threshold);updateButton();
 button.addEventListener('click',e=>{e.stopPropagation();setVisible(!visible);});
 $('signalSpotlightClose').addEventListener('click',()=>setVisible(false));
 $('signalSpotlightThreshold').addEventListener('change',e=>{threshold=Number(e.target.value)||80;persist();updateButton();render();});
 document.addEventListener('pointerdown',ev=>{if(visible&&!panel.contains(ev.target)&&!button.contains(ev.target))setVisible(false);});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&visible)setVisible(false);});
 window.SignalSpotlight={queueRecord,inspect:()=>{ensureDate();return {taipeiDate:activeDate,events:[...events.values()].filter(e=>tracked(e.symbol)),seenCount:seenIds.size,unknown,complete,pending:pending.size,storageError};},rescan:()=>{
  for(const r of window.LIQ_TEST?.records||[])if(r.daily?.length>=43){try{queueRecord(r,window.LIQ_TEST.dailyAsOf(r));}catch(_){}}
 }};
})();
