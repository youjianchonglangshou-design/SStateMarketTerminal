/* Browser Notification Monitor v1.0 — page-lifetime only, no Push/Worker/API polling. */
(()=>{'use strict';
 const $=id=>document.getElementById(id);
 const button=$('browserNotifyButton'),panel=$('browserNotifyPanel');
 if(!button||!panel)return;
 const PREF='SStateLiquidityRadar.browserNotify.prefs.v1';
 const LOG='SStateLiquidityRadar.browserNotify.events.v1';
 const SHARED='SStateLiquidityRadar.browserNotify.sharedRR.v1';
 const WEEK=7*86400000,MAX_LOG=3500;
 const states=new Map(),rrSeen=new Set();
 const defaultPrefs={rr:false,radar:false};
 const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||'null')??fallback;}catch(_){return fallback;}};
 const store=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));return true;}catch(_){return false;}};
 const prefs={...defaultPrefs,...read(PREF,{})};
 prefs.rr=!!prefs.rr;prefs.radar=!!prefs.radar;
 let journal=read(LOG,{events:[],minutes:[]});
 if(!Array.isArray(journal.events))journal.events=[];
 if(!Array.isArray(journal.minutes))journal.minutes=[];
 let viewing=false,validSeenAt=0;
 const todayKey=ms=>new Date(ms+8*3600000).toISOString().slice(0,10);
 const tpeTime=ms=>new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(ms));
 const fmtPrice=n=>!Number.isFinite(n)?'--':Number(n).toLocaleString('en-US',{maximumFractionDigits:Math.abs(n)>=100?2:Math.abs(n)>=1?5:Math.abs(n)>=.01?7:12});
 const tracked=s=>!window.LIQ_CHART_API?.hasSymbol||window.LIQ_CHART_API.hasSymbol(s);
 const recent=()=>{const min=Date.now()-WEEK;journal.events=journal.events.filter(e=>e?.at>=min).slice(-MAX_LOG);journal.minutes=journal.minutes.filter(t=>Number.isFinite(t)&&t*60000>=min).slice(-11000);};
 const save=()=>{recent();store(LOG,journal);if(viewing)render();};
 const allowed=()=>typeof window.Notification==='function'&&Notification.permission==='granted';
 const permission=()=>typeof window.Notification!=='function'?'unsupported':Notification.permission;
 function updatePermission(){const p=permission();$('browserNotifyPermission').textContent=p==='granted'?'已允許系統通知':p==='denied'?'瀏覽器已封鎖通知，請到網址列網站設定解除':p==='unsupported'?'此瀏覽器不支援系統通知':'尚未授權（點「允許通知」才會詢問）';$('browserNotifyPermissionButton').hidden=p==='granted'||p==='unsupported';$('browserNotifyPermissionButton').disabled=p==='denied';$('browserNotifyTest').disabled=p!=='granted';}
 function notification(title,body,tag,kind){if(!allowed()||!prefs[kind])return false;
  try{const n=new Notification(title,{body,tag});n.onclick=()=>{try{window.focus();n.close();}catch(_){}};return true;}catch(err){console.warn('[BrowserNotify] OS notification unavailable',err);return false;}
 }
 function record(type,info){const old=read(LOG,{events:[],minutes:[]});if(Array.isArray(old.events))journal.events=old.events;if(Array.isArray(old.minutes))journal.minutes=[...new Set([...journal.minutes,...old.minutes])];const row={...info,type,at:Date.now()};journal.events.push(row);save();return row;}
 async function coordinated(fn){
  if(navigator.locks?.request){try{return await navigator.locks.request('liq-browser-notify-v1',()=>fn());}catch(err){console.warn('[BrowserNotify] lock fallback',err);}}
  return fn();
 }
 function sharedTransition(symbol,next){
  const all=read(SHARED,{}),now=Date.now(),prev=all[symbol];
  // A second open tab receives the SAME update: state was already claimed recently.
  if(prev?.state===next&&now-prev.at<25000)return false;
  all[symbol]={state:next,at:now};
  for(const [id,v] of Object.entries(all))if(!v||now-v.at>WEEK)delete all[id];
  store(SHARED,all);return true;
 }
 function onRR(symbol,result){
  symbol=String(symbol||'').toUpperCase();if(!symbol||!tracked(symbol))return;
  // null means stale/missing data, NOT a genuine LED off transition.
  if(!result){states.set(symbol,'invalid');return;}
  validSeenAt=Date.now();
  const next=result.direction==='long'?'long':result.direction==='short'?'short':'none';
  const before=states.get(symbol);
  states.set(symbol,next);
  // Initial observation and recovery after invalid data always rebaseline silently.
  if(before===undefined||before==='invalid'||before===next)return;
  void coordinated(()=>{
   if(!sharedTransition(symbol,next))return;
   if(next==='none'){record('rr-exit',{symbol,before,after:next});return;}
   const ratio=next==='long'?result.longRR:result.shortRR;
   const detail={symbol,before,after:next,stage:result.stage||'',shoulder:result.shoulder?.price??null,
     price:result.price,ratio,threshold:result.threshold,group:result.group||''};
   const attempt=notification(`${symbol}｜${next==='long'?'做多':'做空'} RR 達標`,
     `${result.stage||''} · RR ${Number(ratio).toFixed(2)}\n${Number.isFinite(detail.shoulder)?'左肩膀 '+fmtPrice(detail.shoulder):'延續型態'}｜現價 ${fmtPrice(result.price)}\n門檻 ${Number(result.threshold).toFixed(2)} · 台灣時間 ${tpeTime(Date.now())}`,
     `liq-rr-${symbol}-${Date.now()}`, 'rr');
   record('rr-entry',{...detail,attempt});
  });
 }
 function onRadar(event){
  if(!event?.eventId||!tracked(event.symbol)||event.status==='retracted'||event.eventType!=='NEW')return;
  // Event ID is persisted by Signal Spotlight; browser monitor keeps its own seven-day audit.
  void coordinated(()=>{
   const seen=read('SStateLiquidityRadar.browserNotify.radarIds.v1',{});
   if(seen[event.eventId])return;
   const now=Date.now();seen[event.eventId]=now;
   for(const [id,t] of Object.entries(seen))if(t<now-WEEK)delete seen[id];
   store('SStateLiquidityRadar.browserNotify.radarIds.v1',seen);
   const attempt=notification(`${event.symbol}｜智慧雷達新事件`,
      `#${event.primaryRuleId} ${event.primaryTitle}\n注意分數：${event.attentionScore}\n台灣時間 ${tpeTime(now)}`,
      `liq-spotlight-${event.eventId}`,'radar');
   record('radar',{symbol:event.symbol,eventId:event.eventId,score:event.attentionScore,ruleId:event.primaryRuleId,attempt});
  });
 }
 function observed(){
  if(!validSeenAt||Date.now()-validSeenAt>120000)return;
  const minute=Math.floor(Date.now()/60000);
  if(!journal.minutes.includes(minute)){journal.minutes.push(minute);save();}
 }
 function stats(){const key=todayKey(Date.now()),today=journal.events.filter(e=>todayKey(e.at)===key),rr=today.filter(e=>e.type==='rr-entry'),radar=today.filter(e=>e.type==='radar');
   const minutes=new Set(journal.minutes.filter(m=>todayKey(m*60000)===key));
   const perHour=minutes.size?rr.length*60/minutes.size:0;
   const by=new Map();for(const e of rr)by.set(e.symbol,(by.get(e.symbol)||0)+1);
   const top=[...by.entries()].sort((a,b)=>b[1]-a[1]).slice(0,4);
   return {rr:rr.length,long:rr.filter(e=>e.after==='long').length,short:rr.filter(e=>e.after==='short').length,
    radar:radar.length,attempts:today.filter(e=>e.attempt).length,perHour,minutes:minutes.size,top};
 }
 function render(){if(!viewing)return;recent();
  $('browserNotifyRR').checked=prefs.rr;$('browserNotifyRadar').checked=prefs.radar;
  updatePermission();const s=stats();
  for(const [id,value] of Object.entries({browserNotifyRRCount:s.rr,browserNotifyLongCount:s.long,browserNotifyShortCount:s.short,browserNotifyRadarCount:s.radar,browserNotifyAttemptCount:s.attempts,browserNotifyHourly:s.minutes?s.perHour.toFixed(2):'—'}))$(id).textContent=String(value);
  $('browserNotifyTop').textContent=s.top.length?s.top.map(([id,n])=>`${id} ${n} 次`).join(' · '):'尚無 RR 達標事件';
  $('browserNotifyObserved').textContent=`今日有效觀測 ${s.minutes} 分鐘 · 紀錄保存 7 天 · 台灣 00:00 統計換日`;
  const list=$('browserNotifyEvents');list.replaceChildren();
  const rows=journal.events.slice().reverse().slice(0,18);
  for(const e of rows){const row=document.createElement('div');row.className='browser-notify-event';
   const when=`${todayKey(e.at)} ${tpeTime(e.at)}`;
   row.textContent=`${when} · ${e.symbol||''} · ${e.type==='rr-entry'?(e.after==='long'?'做多':'做空')+' RR '+Number(e.ratio).toFixed(2):e.type==='rr-exit'?'RR 熄燈':'雷達 #'+e.ruleId}`;
   list.append(row);
  }
  if(!rows.length)list.textContent='尚無事件；首次載入只建立基準，不補發舊訊號。';
 }
 function show(on){viewing=on;panel.hidden=!on;button.setAttribute('aria-expanded',String(on));if(on)render();}
 button.addEventListener('click',e=>{e.stopPropagation();show(!viewing);});
 $('browserNotifyClose').addEventListener('click',()=>show(false));
 document.addEventListener('pointerdown',e=>{if(viewing&&!panel.contains(e.target)&&!button.contains(e.target))show(false);});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&viewing)show(false);});
 $('browserNotifyRR').addEventListener('change',e=>{prefs.rr=e.target.checked;store(PREF,prefs);render();});
 $('browserNotifyRadar').addEventListener('change',e=>{prefs.radar=e.target.checked;store(PREF,prefs);render();});
 $('browserNotifyPermissionButton').addEventListener('click',async()=>{
   if(typeof Notification==='function'&&Notification.permission==='default'){
    try{await Notification.requestPermission();}catch(err){console.warn('[BrowserNotify] permission',err);}
   }render();
 });
 $('browserNotifyTest').addEventListener('click',()=>{
   if(!allowed())return;
   try{new Notification('MultiAssetLiquidityRadar｜測試通知',{body:'瀏覽器通知已啟用。正式事件僅在訊號狀態發生變化時通知。',tag:'liq-notify-test'});}catch(err){console.warn('[BrowserNotify] test',err);}
 });
 document.addEventListener('liq-radar-custom-updated',()=>{for(const symbol of states.keys())if(!tracked(symbol))states.delete(symbol);});
 // Every separate tab maintains its own baseline; localStorage claims deduplicate cross-tab events.
 window.addEventListener('storage',ev=>{if(ev.key===PREF){const latest=read(PREF,{});prefs.rr=!!latest.rr;prefs.radar=!!latest.radar;}if(ev.key===LOG)journal=read(LOG,{events:[],minutes:[]});if(viewing)render();});
 setInterval(observed,30000);
 updatePermission();
 window.LIQ_BROWSER_NOTIFICATIONS=Object.freeze({onRR,onRadar,isMonitoring:()=>prefs.rr||prefs.radar,resetRRBaseline:()=>states.clear(),inspect:()=>({prefs:{...prefs},states:Object.fromEntries(states),journal:JSON.parse(JSON.stringify(journal)),stats:stats()}),show});
})();
