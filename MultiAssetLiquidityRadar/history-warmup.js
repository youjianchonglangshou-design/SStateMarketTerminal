/* MultiAssetLiquidityRadar v2.1.31 — visible-chart history warmup.
 * Loaded AFTER existing app.js/workspace.js. It only uses their public APIs.
 * Does not alter S/CCI/HA/BB/CoinGlass or price feed calculations.
 */
(()=>{'use strict';
 const GOAL=Object.freeze({'1D':390,'4H':1000});
 const MIN_READY=Object.freeze({'1D':70,'4H':90});
 const CHECK_MS=2100,REQUEST_GAP_MS=3200;
 const stopped=new Set(),retryAt=new Map(),faults=new Map();
 let inflight=null,lastRequestAt=0,timer=0;
 const now=()=>Date.now();
 function getCount(data,interval){
   const series=interval==='1D'?data?.chart?.daily:data?.chart?.bars;
   return Array.isArray(series)?series.length:0;
 }
 function current(){
   const ws=window.LIQ_WORKSPACE,chart=window.LIQ_CHART_API;
   if(!ws||!chart||document.hidden)return null;
   const w=ws.getTopWindow?.();
   if(!w||w.minimized||w.el?.hidden||w.isPanning||!GOAL[w.timeframe])return null;
   const info=chart.getData?.(w.symbol);
   const count=getCount(info,w.timeframe);
   if(count<MIN_READY[w.timeframe])return null;
   return {symbol:w.symbol,interval:w.timeframe,key:w.symbol+':'+w.timeframe,count,chart};
 }
 async function check(){
   if(inflight)return;
   const x=current();if(!x||x.count>=GOAL[x.interval]||stopped.has(x.key))return;
   const status=x.chart.getHistoryState?.(x.symbol,x.interval);
   if(['loading','waiting'].includes(status?.phase))return;
   if(status?.phase==='exhausted'){
     stopped.add(x.key);return;
   }
   if(now()<lastRequestAt+REQUEST_GAP_MS||now()<(retryAt.get(x.key)||0))return;
   // Do not amplify 429 or other failures by repeatedly requesting in a loop.
   if(status?.phase==='error' && (faults.get(x.key)||0)>=2)return;
   inflight=x.key;lastRequestAt=now();
   try{
     const ok=await x.chart.loadExtraHistory?.(x.symbol,x.interval);
     const newCount=getCount(x.chart.getData?.(x.symbol),x.interval);
     const nextStatus=x.chart.getHistoryState?.(x.symbol,x.interval);
     if(ok&&newCount>x.count){faults.delete(x.key);retryAt.delete(x.key);}
     else if(nextStatus?.phase==='exhausted')stopped.add(x.key);
     else if(nextStatus?.phase==='waiting')retryAt.set(x.key,now()+65000);
     else if(nextStatus?.phase==='error'){
       faults.set(x.key,(faults.get(x.key)||0)+1);
       retryAt.set(x.key,now()+120000);
     }else retryAt.set(x.key,now()+12000);
   }catch(_){
     faults.set(x.key,(faults.get(x.key)||0)+1);
     retryAt.set(x.key,now()+120000);
   }finally{inflight=null;}
 }
 function start(){
   if(timer)return;
   // Default chart can appear while the 33-symbol watchlist is still starting.
   // This uses only the visible topmost chart and never fans out to 33 symbols.
   timer=setInterval(()=>{void check();},CHECK_MS);
 }
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void check();});
 document.addEventListener('liq-radar-history-status',event=>{
   const h=event.detail;if(!h)return;
   const key=h.id+':'+h.interval;
   if(h.phase==='loaded'){
     faults.delete(key);retryAt.delete(key);
   }else if(h.phase==='exhausted')stopped.add(key);
   else if(h.phase==='waiting')retryAt.set(key,now()+65000);
 });
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
 else start();
 // Inspection only: no control of data/indicators, no extra public API calls.
 window.LIQ_HISTORY_WARMUP=Object.freeze({goals:GOAL,getStatus:()=>({active:inflight,stopped:[...stopped],retries:[...retryAt]})});
})();
