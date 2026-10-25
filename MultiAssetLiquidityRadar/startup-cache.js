/* MultiAssetLiquidityRadar v1.9.0 — immutable history and provider startup hints.
 * IndexedDB failures never block live monitoring. No stale prices/signals stored.
 */
(function(root){'use strict';
 const DB='SStateLiquidityRadar.history.v1',STORE='closedOHLC';
 const duration={"1D":86400000,"4H":14400000,"15M":900000};
 const MIN={"1D":60,"4H":80,"15M":100};
 let dbPromise;
 const valid=b=>b&&Number.isFinite(b.t)&&b.t>0&&
   ['o','h','l','c'].every(k=>Number.isFinite(b[k])&&b[k]>0)&&
   b.h>=Math.max(b.o,b.c)&&b.l<=Math.min(b.o,b.c);
 function open(){
   if(!('indexedDB'in root))return Promise.resolve(null);
   if(!dbPromise)dbPromise=new Promise(resolve=>{
     let req;try{req=indexedDB.open(DB,1);}catch(_){resolve(null);return;}
     req.onupgradeneeded=()=>{const d=req.result;if(!d.objectStoreNames.contains(STORE))d.createObjectStore(STORE);};
     req.onsuccess=()=>resolve(req.result);
     req.onerror=()=>resolve(null);
     req.onblocked=()=>resolve(null);
   });return dbPromise;
 }
 async function read(symbol,interval){
   const db=await open();if(!db)return null;
   return new Promise(resolve=>{
     try{const tx=db.transaction(STORE,'readonly'),q=tx.objectStore(STORE).get(symbol+':'+interval);
       q.onsuccess=()=>{const v=q.result;
         if(!v||!Array.isArray(v.bars)||!duration[interval]||v.bars.length<MIN[interval])return resolve(null);
         const rows=v.bars.filter(valid).sort((a,b)=>a.t-b.t);
         const age=Date.now()-rows.at(-1)?.t;
         if(rows.length<MIN[interval]||!Number.isFinite(age)||age<0||age>duration[interval]*4)return resolve(null);
         resolve({bars:rows,provider:v.provider||''});
       };q.onerror=()=>resolve(null);
     }catch(_){resolve(null);}
   });
 }
 async function write(symbol,interval,bars,provider){
   const span=duration[interval];if(!span||!Array.isArray(bars))return false;
   const now=Date.now();
   // Closed candles only; an unfinished latest 1D/4H/15m cannot be reused as history.
   const rows=bars.filter(valid).filter(b=>b.t+span<=now).slice(-Math.max(95,interval==='15M'?530:interval==='4H'?130:95));
   if(rows.length<MIN[interval])return false;
   const db=await open();if(!db)return false;
   return new Promise(resolve=>{try{const tx=db.transaction(STORE,'readwrite');
     tx.objectStore(STORE).put({bars:rows,provider:provider||'',savedAt:now},symbol+':'+interval);
     tx.oncomplete=()=>resolve(true);tx.onerror=()=>resolve(false);tx.onabort=()=>resolve(false);
   }catch(_){resolve(false);}});
 }
 const SOURCE_KEY='SStateLiquidityRadar.histProvider.v1';
 function preferred(symbol,interval){try{return JSON.parse(localStorage.getItem(SOURCE_KEY)||'{}')[symbol+':'+interval]||'';}catch(_){return '';}}
 function remember(symbol,interval,provider){try{const old=JSON.parse(localStorage.getItem(SOURCE_KEY)||'{}');old[symbol+':'+interval]=provider;
   localStorage.setItem(SOURCE_KEY,JSON.stringify(old));}catch(_){/* storage disabled */}}
 root.LiqHistoryCache=Object.freeze({read,write,preferred,remember});
})(typeof window!=='undefined'?window:globalThis);
