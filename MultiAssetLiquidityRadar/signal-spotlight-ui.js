/* Signal Spotlight v1.8.0 — browser-local radar event queue and 4-chart-safe UI.
   It never polls market APIs, writes R2, or steals focus from the user's charts. */
(()=>{'use strict';
 const core=window.SignalSpotlightCore, engine=window.SStateMonitorEngine;
 const button=document.getElementById('signalSpotlightButton'),panel=document.getElementById('signalSpotlightPanel');
 if(!core||!button||!panel)return;
 const KEY='SStateLiquidityRadar.signalSpotlight.v1',MAX_HISTORY=240,MAX_QUEUE=90;
 const $=id=>document.getElementById(id);
 const events=new Map(),contexts=new Map(),fingerprints=new Map(),pending=new Map();
 let scanning=false,visible=false,threshold=80,unknown=0,complete=0;
 const nowDay=()=>Math.floor(Date.now()/core.DAY)*core.DAY;
 const timeFmt=ms=>new Date(ms).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
 function load(){try{
   const obj=JSON.parse(localStorage.getItem(KEY)||'{}');
   if([70,75,80,85,90].includes(obj.threshold))threshold=obj.threshold;
   for(const e of Array.isArray(obj.events)?obj.events:[]){if(e?.eventId&&/^[^|]{1,40}\|R\d{2}\|\d{4}-\d{2}-\d{2}$/.test(e.eventId))events.set(e.eventId,e);}
 }catch(_){/* storage disabled */}}
 function persist(){try{
   const recent=[...events.values()].sort((a,b)=>b.firstSeenAt-a.firstSeenAt).slice(0,MAX_HISTORY);
   localStorage.setItem(KEY,JSON.stringify({version:1,threshold,events:recent}));
 }catch(_){/* browser memory quota or private mode */}}
 const active=e=>e.status!=='retracted';
 const isUnread=e=>active(e)&&!e.viewedAt&&e.attentionScore>=threshold&&e.favorite&&e.eventType==='NEW'&&Date.now()-Date.parse(e.signalDayKey+'T00:00:00Z')<=2*core.DAY;
 function updateButton(){const count=[...events.values()].filter(isUnread).length;
   button.classList.toggle('has-fresh-events',count>0);
   button.setAttribute('aria-label',count?`智慧雷達：${count} 個未讀新事件`:'智慧雷達：沒有未讀新事件');
   button.title=count?`${count} 個未讀新鮮事件`:'開啟 Signal Spotlight 智慧事件雷達';
   $('signalSpotlightUnread').textContent=count>99?'99+':String(count);
   $('signalSpotlightUnread').hidden=count===0;
 }
 function ingest(symbol,result,{provisional=true,source='daily OHLC + SStateMonitorEngine'}={}){
  if(!result||result.reason==='insufficient_history'||result.reason==='missing_daily_candle'||!result.signalDayKey)return;
  const day=result.signalDayKey,ids=new Set(result.rules.map(r=>r.id));
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
   const item={eventId,symbol,signalDayKey:day,region:result.region,primaryRuleId:main.id,primaryTitle:main.title,matchedRuleIds:result.rules.map(r=>r.id),eventType:'NEW',favorite:true,status:provisional?'provisional':'confirmed',baseScore:main.score,attentionScore:result.attentionScore,firstSeenAt:existing?.firstSeenAt||Date.now(),lastSeenAt:Date.now(),viewedAt:existing?.viewedAt||null,dataSource:source};
   events.set(eventId,item);
  }
  if(provisional)contexts.set(symbol,{region:result.region,rules:result.rules.map(x=>x.id),day});
  for(const e of [...events.values()]){if(Date.now()-e.firstSeenAt>35*core.DAY&&!isUnread(e))events.delete(e.eventId);}
  if(events.size>MAX_HISTORY){for(const e of [...events.values()].sort((a,b)=>a.firstSeenAt-b.firstSeenAt).slice(0,events.size-MAX_HISTORY))events.delete(e.eventId);}
  persist();updateButton();if(visible)render();
 }
 function process(record,days){
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
   const w=window.LIQ_WORKSPACE;
   if(!w){displayMessage('圖表工作台仍在初始化');return;}
   const existing=w.getWindows?.().find(x=>x.symbol===e.symbol);
   const success=existing?(w.focusWindow(existing.id),true):w.selectSymbol(e.symbol);
   if(!success){displayMessage('四張圖表皆鎖定，不能取代原有圖表。事件仍可再次開啟。');return;}
   e.viewedAt=e.viewedAt||Date.now();persist();updateButton();render();
   const banner=$('signalSpotlightNotice');banner.textContent=`已顯示 ${e.symbol} · #${e.primaryRuleId} ${e.primaryTitle}`;
   // Temporary context chip attached to chosen window, without replacing or resizing the chart.
   const current=w.getWindows?.().find(x=>x.symbol===e.symbol);
   const active=[...document.querySelectorAll("[data-chart-window]")].find(node=>node.dataset.chartWindow===current?.id);
   if(active){let c=active.querySelector('.spotlight-chart-chip');if(!c){c=el('span','spotlight-chart-chip');active.querySelector('.chart-titlebar')?.append(c);}c.textContent=`雷達 #${e.primaryRuleId} · ${e.primaryTitle}`;c.title=`${e.matchedRuleIds.map(i=>'#'+i).join('、')} · ${e.attentionScore} 分（注意力排序，非勝率）`;setTimeout(()=>c?.remove(),6500);}
 }
 function render(){if(!visible)return;
   const list=$('signalSpotlightCards');list.replaceChildren();
   const all=[...events.values()].sort((a,b)=>Number(isUnread(b))-Number(isUnread(a))||b.attentionScore-a.attentionScore||b.firstSeenAt-a.firstSeenAt);
   const unread=all.filter(isUnread).length;
   $('signalSpotlightSummary').textContent=`${unread} 未讀 · ${all.filter(active).length} 有效事件 · ${contexts.size} 檔已評估`;
   if(!all.length){list.append(el('div','spotlight-empty','目前尚無符合「五星＋新事件」的訊號。雷達持續分析已取得的有效日線；HOLD 與非五星條件只作研究背景。'));}
   for(const e of all.slice(0,40)){
    const row=el('button','spotlight-event');row.type='button';row.classList.toggle('spotlight-event-unread',isUnread(e));row.classList.toggle('spotlight-event-retracted',e.status==='retracted');
    const top=el('div','spotlight-event-top');top.append(el('strong','',e.symbol),el('span','spotlight-rule','#'+e.primaryRuleId+' '+e.primaryTitle),el('span','spotlight-score',e.attentionScore+' 分'));row.append(top);
    const info=el('div','spotlight-event-meta');info.append(el('span','',e.region==='above'?'中軌上':'中軌下'),el('span','',e.status==='confirmed'?'已確認':e.status==='retracted'?'形成中已撤銷':'形成中'),el('span','',timeFmt(e.firstSeenAt)),el('span','',e.viewedAt?'已讀':'未讀'));row.append(info);
    row.title=`${e.matchedRuleIds.map(id=>'#'+id).join('、')}｜注意力分數並非勝率｜${e.dataSource}`;
    row.addEventListener('click',()=>openChart(e));list.append(row);
   }
   const observations=[...contexts.entries()].filter(([,x])=>x.rules.length).sort((a,b)=>a[0].localeCompare(b[0]));
   if(observations.length){
     const details=el('details','spotlight-context');
     const summary=el('summary','',`觀察中／延續條件 ${observations.length} 檔（不啟動呼吸）`);details.append(summary);
     const body=el('div','spotlight-context-list');
     for(const [symbol,x] of observations){
       const r=el('div','spotlight-context-item');
       r.append(el('strong','',symbol),el('span','',x.region==='above'?'中軌上':'中軌下'),el('span','',x.rules.map(id=>'#'+id).join('、')));
       body.append(r);
     }details.append(body);list.append(details);
   }
 }
 function setVisible(on){visible=on;panel.hidden=!on;button.setAttribute('aria-expanded',String(on));if(on){const r=button.getBoundingClientRect(),pw=Math.min(430,innerWidth-20);panel.style.left=Math.max(10,Math.min(innerWidth-pw-10,r.left+r.width/2-pw/2))+'px';render();}}
 load();$('signalSpotlightThreshold').value=String(threshold);updateButton();
 button.addEventListener('click',e=>{e.stopPropagation();setVisible(!visible);});
 $('signalSpotlightClose').addEventListener('click',()=>setVisible(false));
 $('signalSpotlightThreshold').addEventListener('change',e=>{threshold=Number(e.target.value)||80;persist();updateButton();render();});
 document.addEventListener('pointerdown',ev=>{if(visible&&!panel.contains(ev.target)&&!button.contains(ev.target))setVisible(false);});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&visible)setVisible(false);});
 window.SignalSpotlight={queueRecord,inspect:()=>({events:[...events.values()],contexts:[...contexts.entries()],unknown,complete,pending:pending.size}),rescan:()=>{
  for(const r of window.LIQ_TEST?.records||[])if(r.daily?.length>=43){try{queueRecord(r,window.LIQ_TEST.dailyAsOf(r));}catch(_){}}
 }};
})();
