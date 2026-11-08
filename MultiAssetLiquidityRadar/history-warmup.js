/* v2.1.32 — warm the single active chart from verified PIONEX market candles. */
(()=>{'use strict';
 const GOAL=Object.freeze({'1D':500,'4H':1000});
 const CHECK_MS=1400,REQUEST_GAP_MS=3800;
 const waitUntil=new Map(),sourceFailures=new Map();
 let pending=null,lastCallAt=0,timer=0;
 function visible(){
   const win=window.LIQ_WORKSPACE?.getTopWindow?.(),api=window.LIQ_CHART_API;
   if(!win||!api||document.hidden||win.minimized||win.isPanning)return null;
   const interval=win.timeframe;if(!GOAL[interval])return null;
   const data=api.getData(win.symbol);
   const rows=interval==='1D'?data?.chart?.daily:data?.chart?.bars;
   if(!Array.isArray(rows)||rows.length<(interval==='1D'?50:70))return null;
   return {id:win.symbol,interval,count:rows.length,key:win.symbol+':'+interval,api};
 }
 async function check(){
   if(pending)return;
   const x=visible();if(!x||x.count>=GOAL[x.interval])return;
   if(Date.now()<lastCallAt+REQUEST_GAP_MS||Date.now()<(waitUntil.get(x.key)||0))return;
   const state=x.api.getHistoryState?.(x.id,x.interval);
   if(state?.phase==='loading'||state?.phase==='waiting')return;
   // 2.1.31 asked the same failing endTime URL again and again. Instead
   // the FIRST upgrade is a 500-bar request using the chart's PIONEX feed.
   const isPrime=x.count<490;
   if(!isPrime && (state?.phase==='exhausted'||(sourceFailures.get(x.key)||0)>=2))return;
   pending=x.key;lastCallAt=Date.now();
   try{
     const success=isPrime?await x.api.primeVisibleHistory?.(x.id,x.interval):
       await x.api.loadExtraHistory?.(x.id,x.interval);
     const after=x.api.getData?.(x.id);
     const rows=x.interval==='1D'?after?.chart?.daily:after?.chart?.bars;
     const n=Array.isArray(rows)?rows.length:0;
     const status=x.api.getHistoryState?.(x.id,x.interval);
     if(success&&n>x.count){sourceFailures.delete(x.key);waitUntil.delete(x.key);}
     else if(status?.phase==='waiting')waitUntil.set(x.key,Date.now()+60000);
     else if(status?.phase==='error'){
       sourceFailures.set(x.key,(sourceFailures.get(x.key)||0)+1);
       waitUntil.set(x.key,Date.now()+90000);
     }else waitUntil.set(x.key,Date.now()+20000);
   }finally{pending=null;}
 }
 function start(){if(timer)return;timer=setInterval(()=>{void check().catch(()=>{});},CHECK_MS);void check();}
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void check();});
 document.addEventListener('liq-radar-window-stack-changed',()=>{if(!document.hidden)void check();});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
 window.LIQ_HISTORY_WARMUP=Object.freeze({goals:GOAL,inspect:()=>({pending,wait:[...waitUntil],failures:[...sourceFailures],lastCallAt})});
})();
