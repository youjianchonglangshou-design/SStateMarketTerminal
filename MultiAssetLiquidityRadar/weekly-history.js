/* MultiAssetLiquidityRadar v2.1.37 — 1D PIONEX chart WebSocket -> 1W UTC-Monday OHLCV.
 * Same chart transport and TV framing as app.js tvBars and the user's successful
 * BTC_Weekly_Radar_1D_Unlimited_History_v1.2. No native 1W, other exchange or total history cap.
 * Daily watchlist/indicator records are deliberately NOT mutated here.
 */
(()=>{'use strict';
 const DAY=86400000,WEEK=7*DAY,BATCH=500,REST_BATCH=300,FRAME='~m~';
 const BASE='https://white-meadow-16bc.youjianchonglangshou.workers.dev';
 const sessions=new Map();let foreground=null;
 const textBytes=s=>new TextEncoder().encode(s).length;
 const frame=s=>FRAME+textBytes(s)+FRAME+s;
 const pkt=(m,p)=>frame(JSON.stringify({m,p}));
 const monday=t=>Math.floor((t+3*DAY)/WEEK)*WEEK-3*DAY;
 function unpack(source){const out=[];let cursor=0;
   while(cursor<source.length){const a=source.indexOf(FRAME,cursor);if(a<0)break;const b=source.indexOf(FRAME,a+FRAME.length);if(b<0)break;
     const need=Number(source.slice(a+FRAME.length,b));if(!Number.isSafeInteger(need)||need<0||need>10000000)break;
     let at=b+FRAME.length,n=0;while(at<source.length&&n<need){const ch=String.fromCodePoint(source.codePointAt(at));n+=textBytes(ch);at+=ch.length;}
     if(n!==need)break;out.push(source.slice(b+FRAME.length,at));cursor=at;
   }return out;}
 function tvBar(row){const a=Array.isArray(row)?row:row?.v;if(!Array.isArray(a)||a.length<6)return null;
   const offset=a.length>=7?1:0;let t=+a[offset];if(t>0&&t<1e12)t*=1000;
   const o=+a[offset+1],h=+a[offset+2],l=+a[offset+3],c=+a[offset+4],v=+a[offset+5]||0;
   if(![t,o,h,l,c].every(Number.isFinite)||t<=0||o<=0||l<=0||c<=0||h<Math.max(o,c)||l>Math.min(o,c))return null;
   return {t,o,h,l,c,v};
 }
 function restBar(row){let t=Number(Array.isArray(row)?row[0]:row.time??row.ts??row.t);
   if(t>0&&t<1e12)t*=1000;const a=Array.isArray(row)?row.slice(1):[row.open,row.high,row.low,row.close,row.volume];
   return tvBar([t,+a[0],+a[1],+a[2],+a[3],+a[4]||0]);
 }
 function sorted(rows){return [...new Map(rows.filter(b=>b&&Number.isFinite(b.t)&&b.t>0).map(b=>[b.t,b])).values()].sort((a,b)=>a.t-b.t);}
 function aggregate(days){const map=new Map();for(const b of sorted(days)){
   const key=monday(b.t),w=map.get(key);
   if(!w){map.set(key,{...b,t:key});continue;}
   w.h=Math.max(w.h,b.h);w.l=Math.min(w.l,b.l);w.c=b.c;w.v+=(Number(b.v)||0);
 }return [...map.values()].sort((a,b)=>a.t-b.t);}
 const describe=(e)=>String(e?.message||e||'未知錯誤');
 function state(id){return sessions.get(id)||null;}
 function publish(s,phase,message){
   s.phase=phase;s.message=String(message||'');
   document.dispatchEvent(new CustomEvent('liq-radar-weekly-updated',{detail:{id:s.id,interval:'1W',phase,message:s.message,
     count:s.weeks.length,days:s.days.length,oldest:s.days[0]?.t||null,source:s.source}}));
 }
 function merge(s,rows){const before=s.days[0]?.t??Infinity,oldCount=s.days.length;
   s.days=sorted([...s.days,...rows]);s.weeks=aggregate(s.days);const older=s.days.some(b=>b.t<before);
   return {older,added:s.days.length-oldCount};
 }
 function openTV(s){
   const url=new URL(BASE);url.protocol='wss:';url.pathname='/api/monitor/tv-chart-ws';url.search='';
   const ws=new WebSocket(url.toString()),session='cs_'+Math.random().toString(36).slice(2),sym='symbol_1',series='series_1';
   let closed=false,active=null,ready=false;
   function finish(error,completed=null){if(!active)return;const a=active;active=null;clearTimeout(a.timer);
     if(error){a.reject(error);return;}a.resolve({bars:sorted([...a.rows.values()]),completed});}
   function schedule(resolve,reject){if(active){reject(Error('前一批日 K 尚未完成'));return;}
     active={resolve,reject,rows:new Map(),timer:setTimeout(()=>finish(Error('週線日 K WebSocket 逾時')),22000)};}
   function close(){if(closed)return;closed=true;finish(Error('週線日 K 連線已關閉'));try{ws.close();}catch{}}
   ws.addEventListener('open',()=>{try{
     for(const [method,params] of [
       ['set_auth_token',['unauthorized_user_token']],['chart_create_session',[session,'']],['switch_timezone',[session,'Etc/UTC']],
       ['resolve_symbol',[session,sym,'='+JSON.stringify({symbol:s.tv,adjustment:'splits',session:'regular'})]],
       ['create_series',[session,series,'s1',sym,'1D',BATCH,'']]])ws.send(pkt(method,params));
     ready=true;
   }catch(e){finish(e);close();}});
   ws.addEventListener('message',async e=>{try{if(closed)return;
     const raw=typeof e.data==='string'?e.data:e.data instanceof Blob?await e.data.text():new TextDecoder().decode(e.data);
     for(const part of unpack(String(raw))){if(part.startsWith('~h~')){ws.send(frame(part));continue;}
       let d;try{d=JSON.parse(part);}catch{continue;}
       const items=d.p||[];
       if(['protocol_error','critical_error','symbol_error','series_error'].includes(d.m)){finish(Error('PIONEX 圖表 '+d.m));close();return;}
       if(d.m==='timescale_update'&&items[0]===session&&active)
         for(const item of items?.[1]?.[series]?.s||[]){const bar=tvBar(item);if(bar)active.rows.set(bar.t,bar);}
       if(d.m==='series_completed'&&items[0]===session&&items[1]===series){const signal=items[2];
         finish(null,typeof signal==='string'?signal:signal?.data_completed||signal?.dataCompleted||signal?.status||null);
       }
     }
   }catch(e){finish(e);close();}});
   ws.addEventListener('error',()=>{finish(Error('主雷達 PIONEX 圖表 WebSocket 失敗'));close();});
   ws.addEventListener('close',()=>{if(!closed){closed=true;finish(Error('PIONEX 圖表連線中斷'));}});
   const initial=new Promise((resolve,reject)=>schedule(resolve,reject));
   function more(){return new Promise((resolve,reject)=>{if(closed||!ready||ws.readyState!==WebSocket.OPEN){reject(Error('PIONEX 圖表連線已中斷'));return;}
     schedule(resolve,reject);try{ws.send(pkt('request_more_data',[session,series,BATCH]));}catch(e){finish(e);close();}});}
   return {initial,more,close,isClosed:()=>closed};
 }
 async function restPage(s,endTime=null){const url=new URL('/api/monitor/klines',BASE);
   url.searchParams.set('symbol',s.pionex);url.searchParams.set('interval','1D');url.searchParams.set('limit',String(REST_BATCH));
   if(endTime!==null)url.searchParams.set('endTime',String(endTime));
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),16000);
   try{const response=await fetch(url.toString(),{cache:'no-store',signal:controller.signal});
     const body=await response.json().catch(()=>({}));
     if(!response.ok){const err=Error('Pionex Worker 日線 HTTP '+response.status);err.status=response.status;
       err.retryAfter=Number(body.retry_after_seconds||response.headers.get('Retry-After')||65);throw err;}
     if(body.ok===false||body.result===false)throw Error(String(body.error||'Pionex Worker 日線失敗'));
     const bars=body?.data?.klines||body?.klines||[];
     const out=sorted(bars.map(restBar).filter(Boolean));
     if(endTime!==null&&out.some(b=>b.t>endTime))throw Error('日線備援忽略 endTime，拒絕無效補載');
     return out;
   }finally{clearTimeout(timer);}
 }
 function getOrCreate(id){let s=sessions.get(id);if(s)return s;
   const spec=window.LIQ_CHART_API?.getWeeklySpec?.(id);
   if(!spec||!spec.pionex)return null;
   s={id,tv:spec.tv,pionex:spec.pionex,days:[],weeks:[],phase:'idle',message:'',source:'',session:null,
     inFlight:null,olderBusy:false,backoff:0,exhausted:false,paused:false,activated:false,retryTimer:null};
   sessions.set(id,s);return s;
 }
 function clearRetry(s){if(s.retryTimer){clearTimeout(s.retryTimer);s.retryTimer=null;}}
 function throttleRetry(s,error){const seconds=Math.max(65,Math.min(900,Number(error?.retryAfter)||65));s.backoff=Date.now()+seconds*1000;
   publish(s,'waiting','Pionex 429 限流，保留週 K，約 '+Math.round(seconds)+' 秒後再試');
   clearRetry(s);s.retryTimer=setTimeout(()=>{s.retryTimer=null;
     if(document.hidden||foreground!==s.id)return;
     void loadOlder(s.id);
   },seconds*1000+100);}
 function stopSession(s){s.session?.close();s.session=null;}
 function autoMore(s){if(s.exhausted||s.paused||document.hidden||foreground!==s.id)return;
   clearTimeout(s.autoTimer);s.autoTimer=setTimeout(()=>{if(foreground===s.id)void loadOlder(s.id);},160);
 }
 async function ensure(id){const s=getOrCreate(id);if(!s)return false;
   if(s.inFlight)return s.inFlight;
   if(s.days.length){if(!s.paused)autoMore(s);return true;}
   if(Date.now()<s.backoff)return false;
   const task=(async()=>{
     publish(s,'loading','使用原雷達 PIONEX 1D WebSocket 載入週線');
     try{
       s.session=openTV(s);const page=await s.session.initial;
       if(!page.bars.length)throw Error('PIONEX WebSocket 沒有日 K');
       merge(s,page.bars);s.source='PIONEX 1D chart WS';
       s.exhausted=['end','no_data'].includes(page.completed);s.paused=page.completed==='limit';
       publish(s,s.exhausted?'exhausted':s.paused?'paused':'loaded','日 K '+s.days.length+' 根 → 週 K '+s.weeks.length+' 根');
       if(!s.paused&&!s.exhausted)autoMore(s);
       return true;
     }catch(e){stopSession(s);
       // Preserve the successful radar's fallback, never switch exchange or request native 1W.
       try{const days=await restPage(s);if(!days.length)throw Error('Worker 1D 無資料');
         merge(s,days);s.source='Pionex Worker 1D';s.paused=false;
         publish(s,'loaded','原有 Worker 日 K 備援：'+s.days.length+' 根');autoMore(s);return true;
       }catch(err){if(err.status===429){throttleRetry(s,err);return false;}
         s.backoff=Date.now()+30000;publish(s,'error',describe(e)+'；備援：'+describe(err));return false;}
     }
   })().finally(()=>{s.inFlight=null;});
   s.inFlight=task;return task;
 }
 async function loadOlder(id){const s=getOrCreate(id);if(!s||s.exhausted||document.hidden)return false;
   if(s.inFlight)return s.inFlight;if(s.olderBusy)return false;
   if(!s.days.length)return ensure(id);
   if(Date.now()<s.backoff){publish(s,'waiting','等待歷史請求冷卻');return false;}
   s.olderBusy=true;publish(s,'loading','沿用 1D WebSocket 補載更早日 K');
   try{
     const old=s.days[0].t;let page;
     if(s.session&&!s.session.isClosed()){
       try{page=await s.session.more();}catch(e){stopSession(s);
         s.source='Pionex Worker 1D';page={bars:await restPage(s,old-1),completed:null};}
     }else page={bars:await restPage(s,old-1),completed:null};
     const result=merge(s,page.bars),ended=['end','no_data'].includes(page.completed);
     if(ended){s.exhausted=true;s.paused=true;stopSession(s);
       publish(s,'exhausted','圖表來源確認已到最早日 K');return false;}
     if(page.completed==='limit'){s.paused=true;publish(s,'paused','來源限制，暫停補載（非歷史盡頭）');return false;}
     if(!result.older){s.paused=true;
       publish(s,'paused','沒有收到更早日 K，已暫停；不推定來源歷史盡頭');return false;}
     s.paused=false;publish(s,'loaded','已取得日 K '+s.days.length+' 根 → 週 K '+s.weeks.length+' 根');
     autoMore(s);return true;
   }catch(e){if(e.status===429)throttleRetry(s,e);
     else{s.paused=true;s.backoff=Date.now()+30000;publish(s,'error','補載暫停：'+describe(e));}
     return false;
   }finally{s.olderBusy=false;}
 }
 function focus(id){foreground=id||null;
   for(const s of sessions.values()){clearTimeout(s.autoTimer);}
   if(!id)return;
   const s=getOrCreate(id);if(!s)return;
   s.paused=false;
   if(s.days.length){autoMore(s);return;}
   void ensure(id);
 }
 function getWeeks(id){return state(id)?.weeks||[];}
 function info(id){const s=state(id);return s?{phase:s.phase,message:s.message,count:s.weeks.length,days:s.days.length,
   oldest:s.days[0]?.t??null,source:s.source,exhausted:s.exhausted}:null;}
 document.addEventListener('visibilitychange',()=>{if(document.hidden){for(const s of sessions.values())clearTimeout(s.autoTimer);}else if(foreground){void ensure(foreground);}});
 window.LIQ_WEEKLY_HISTORY=Object.freeze({focus,ensure,loadOlder,getWeeks,info,aggregate,monday,inspect:id=>state(id)});
})();
