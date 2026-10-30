/* Multi-Asset Liquidity Radar v1.9.0 — fixed full-market panels and up to four draggable/resizable charts.
 * Uses original source's existing Pionex, CoinGlass, BTC-model algorithms.
 * 4H OHLC, daily BB(20,2) / HA staircase / SState / CCI-SMA, 7D liquidation.
 */
(()=>{'use strict';
 const $=id=>document.getElementById(id);
 const MS=900000,H=3600000,DAY=86400000;
 const WORKER='https://white-meadow-16bc.youjianchonglangshou.workers.dev';
 const SCANNER='https://scanner.tradingview.com/crypto/scan';
 const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
 const priceEnough=p=>Number.isFinite(p)&&p>0;
 const livePrice=r=>r.priceAt&&Date.now()-r.priceAt<90000&&priceEnough(r.price)?r.price:null;
 const MONEY=n=>{if(!priceEnough(n))return '--';const abs=Math.abs(n),digits=abs>=100?2:abs>=1?4:abs>=.01?6:abs>=.0001?8:Math.min(16,Math.max(11,Math.ceil(-Math.log10(Math.max(abs,1e-16)))+5));return n.toLocaleString('en-US',{maximumFractionDigits:digits,minimumFractionDigits:abs>=100?2:0});};
 const pct=n=>Number.isFinite(n)?n.toFixed(2)+'%':'--';
 const tpe=t=>new Date(t).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'});
 const json=async(url,opts={},timeout=11000)=>{const ctrl=new AbortController(),tm=setTimeout(()=>ctrl.abort(),timeout);try{const r=await fetch(url,{...opts,signal:ctrl.signal,cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);const j=await r.json();if(j?.ok===false||j?.result===false)throw Error(String(j.error||j.message||'API失敗'));return j;}finally{clearTimeout(tm);}};
 const providerOverrides=Object.freeze({WTI:{tv:'PIONEX:CLUSDT.P',pionex:'WTI_USDT_PERP',cg:['CL']},CL:{tv:'PIONEX:CLUSDT.P',pionex:'WTI_USDT_PERP',cg:['CL']}});
 function canonical(s){const over=providerOverrides[String(s.id).toUpperCase()];return over?{...s,...over,cg:[...new Set([...over.cg,...(s.cg||[])])]}:{...s};}
 const entries=Array.isArray(window.LIQ_SYMBOLS)?window.LIQ_SYMBOLS.map(canonical):[];
 const records=entries.map((s,index)=>({s,index,id:s.id,price:null,priceAt:0,priceEventAt:0,priceFeed:'',live4h:null,bars15:[],bars4h:[],daily:[],barsAt:0,h4At:0,dailyAt:0,ha:null,cci:null,sstate:null,midline:null,liveOHLC:null,model:null,up:null,down:null,source:'none',cgId:'',cgFactor:1,upAmount:null,downAmount:null,zones:{upper:[],lower:[]},issue:'',errors:{},lastAttempt:{},dom:null}));
 const state={selected:'',sectorSort:{crypto:'marks',stock:'marks',custom:'watchlist'},cgRecords:new Map(),cgAt:0,cgVersion:'',cgError:'尚未取得',cgBusy:null,group:'all',search:'',sort:'watchlist',sortDir:1,diagDirty:false,priceAt:0,priceBusy:null,loadingJobs:0,queue:[],activeJobs:[],jobSet:new Set(),jobSeq:0,batchEnqueue:false,startupActive:false,cgInitialDone:false,priceInitialDone:false,networkLog:[],renderAt:0};
 const currentRows=()=>records;
 const cgFresh=()=>state.cgAt>0&&!state.cgError&&Date.now()-state.cgAt<180000;
 const sourceName=r=>r.source==='coinglass'?(cgFresh()?'CoinGlass 7D（1週）':'CoinGlass 7D（上次有效值・RR暫停）'):'CoinGlass 7D（尚無界限）';
 // RR reads the exact shared quote and liquidation bounds already used by charts.
 // Invalid/stale values MUST clear the LED instead of retaining yesterday's signal.
 function rrSnapshot(r,now=Date.now()){
   const price=livePrice(r);
   // Only fresh, successfully fetched CoinGlass 7D bounds may drive RR.
   // Price crossing either bound is NOT evidence that the bound is invalid;
   // RR itself requires lower < price < upper, so suppress such signals.
   if(r.source!=='coinglass'||!state.cgAt||state.cgError||now-state.cgAt>=180000||
      !priceEnough(price)||!priceEnough(r.up)||!priceEnough(r.down)||
      !(r.down<price&&price<r.up))return null;
   return {price,upper:r.up,lower:r.down,ha:r.ha,haDayKey:r.ha?.t??null,dayKey:Math.floor(now/DAY)*DAY,source:'coinglass',updatedAt:Math.max(r.priceAt,state.cgAt)};
 }
 function refreshRRLed(r){
   const led=r.dom?.rrLed,scanner=window.LIQ_RR_SCANNER;
   if(!led)return;
   const result=scanner?.evaluate(rrSnapshot(r));
   window.LIQ_BROWSER_NOTIFICATIONS?.onRR(r.id,result);
   led.hidden=true;led.className='liq-rr-led';led.removeAttribute('title');led.removeAttribute('aria-label');
   // Shoulder diagnostics are available on the ticker even when the LED is off.
   // This prevents a wrong/old left shoulder from hiding behind a dark LED.
   const name=r.dom?.name;
   if(name){
     if(result){
       const sh=result.shoulder;
       const candidate=result.candidateDirection==='long'?'多':result.candidateDirection==='short'?'空':'無';
       const ratio=result.candidateDirection==='long'?result.longRR:result.shortRR;
       name.title='RR 結構 '+(result.stage||'未確認')+'｜候選 '+candidate+
         (sh?'\n左肩膀 '+MONEY(sh.price)+'（'+tpe(sh.dayKey).slice(0,10)+'，'+sh.method+'）':'\n無有效歷史肩膀')+
         '\n現價 '+MONEY(result.price)+
         (Number.isFinite(ratio)?'\n候選 RR '+ratio.toFixed(3)+'｜門檻 '+Number(result.threshold).toFixed(2):'')+
         '\n結果 '+(result.direction==='none'?'未亮燈（RR未達標或結構無效）':'達標亮燈');
     } else name.title='RR：等待有效即時價格、7D 清算界與日線階梯資料';
   }
   if(!result||result.direction==='none')return;
   const long=result.direction==='long',ratio=long?result.longRR:result.shortRR;
   const label=(long?'做多':'做空')+' 理論賺賠比 '+ratio.toFixed(2)+':1';
   led.classList.add(long?'rr-long':'rr-short');
   const shoulder=result.shoulder;const shoulderNote=shoulder?('\n歷史左肩膀 '+MONEY(shoulder.price)+'（'+tpe(shoulder.dayKey).slice(0,10)+'，'+shoulder.daysBack+' 日前）'):'\n此階段不需有效肩膀';
   led.title='情境 '+result.stage+'｜'+label+'｜'+(result.group==='reversal'?'反向／轉勢':'原趨勢／延續')+'門檻 '+result.threshold.toFixed(2)+':1'+shoulderNote+'\n日線平均K '+result.haColor+'\n現價 '+MONEY(result.price)+'\n上界 '+MONEY(result.upper)+'\n下界 '+MONEY(result.lower)+'\n來源 '+'CoinGlass 7D'+'\n計算時間 '+tpe(Date.now());
   led.setAttribute('aria-label',label);
   led.hidden=false;
 }
 // Used by the existing bottom R2 drawing-manager settings: re-evaluate LED
 // immediately, without an extra market poll or a forced chart redraw.
 window.LIQ_RR_REFRESH=()=>{window.LIQ_BROWSER_NOTIFICATIONS?.resetRRBaseline();records.forEach(refreshRRLed);};

 // Ring-style bounded diagnostics: at most 32 entries. Avoid writing large text nodes
 // every 10 seconds when the panel is closed; entries are never persisted to storage.
 const LOG_CAP=32;
 function log(msg){
   const stamp=new Date().toLocaleTimeString('zh-TW',{timeZone:'Asia/Taipei',hour12:false});
   state.networkLog.push(`[${stamp}] ${String(msg).slice(0,230)}`);
   if(state.networkLog.length>LOG_CAP)state.networkLog.splice(0,state.networkLog.length-LOG_CAP);
   state.diagDirty=true;
   const count=$('diagCount');if(count)count.textContent=state.networkLog.length;
   if($('diagPanel')?.open)renderDiag();
 }
 function priceStreamDiagnostic(){
   const q=window.LIQ_PRICE_STREAM?.inspect?.();
   const age=q?.lastTradeAt?Math.round((Date.now()-q.lastTradeAt)/1000)+'s':'—';
   const sources=records.reduce((acc,r)=>{const key=r.priceFeed||'等待';acc[key]=(acc[key]||0)+1;return acc;},{});
   const info=state.cgDiagnostics||{};
   const matched=records.filter(r=>r.source==='coinglass').length;
   const cgSummary=`CoinGlass 7D ${cgFresh()?'正常':state.cgAt?'過期（僅保留真實值，RR暫停）':'尚無有效資料'}｜來源 ${info.origin||'等待讀取'}｜解析 ${state.cgRecords.size} 筆｜清單對應 ${matched}/${records.length}｜最後成功 ${state.cgAt?tpe(state.cgAt):'—'}｜加密版本 ${state.cgVersion||'未知'}｜上次嘗試 ${info.at?tpe(info.at):'—'}｜錯誤 ${state.cgError||'無'}｜識別鍵樣本 ${(info.sample||[]).join(',')||'—'}`;
   return cgSummary+'\n'+(q?`Pionex WebSocket ${q.state}｜訂閱 ${q.subscribed}/${q.desired}｜已收到 ${q.received}｜最後成交 ${q.lastTradeAt?tpe(q.lastTradeAt):'—'}｜接收年齡 ${age}｜重連 ${q.reconnectCount}｜失敗 ${JSON.stringify(q.failed)}`:'Pionex WebSocket：尚未初始化')+`\n價格來源 ${JSON.stringify(sources)}`;
 }
 function renderDiag(){
   if(!$('diagnostics')||!state.diagDirty)return;
   $('diagnostics').textContent=priceStreamDiagnostic()+'\n'+(state.networkLog.join('\n')||'無診斷訊息');
   state.diagDirty=false;
 }
  const FR='~m~';const textBytes=x=>new TextEncoder().encode(String(x)).length;
  function frame(value){const p=typeof value==='string'?value:JSON.stringify(value);return FR+textBytes(p)+FR+p;}
  function pkt(method,params){return frame(JSON.stringify({m:method,p:params}));}
  function unpack(source){const out=[];let start=0;while(start<source.length){const at=source.indexOf(FR,start);if(at<0)break;const sep=source.indexOf(FR,at+FR.length);if(sep<0)break;const byteLen=Number(source.slice(at+FR.length,sep));if(!Number.isSafeInteger(byteLen)||byteLen<0||byteLen>10000000)break;let k=sep+FR.length,n=0;while(k<source.length&&n<byteLen){const cp=source.codePointAt(k),ch=String.fromCodePoint(cp);n+=textBytes(ch);k+=ch.length;}if(n!==byteLen)break;out.push(source.slice(sep+FR.length,k));start=k;}return out;}
  function tvRow(row){const a=Array.isArray(row)?row:row?.v;if(!Array.isArray(a)||a.length<6)return null;const shift=a.length>=7?1:0;let t=+a[shift];if(t>0&&t<1e12)t*=1000;const o=+a[shift+1],h=+a[shift+2],l=+a[shift+3],c=+a[shift+4],v=+a[shift+5]||0;if(![t,o,h,l,c].every(Number.isFinite)||o<=0||h<l||l<=0||c<=0||h<o||h<c)return null;return {t,o,h,l,c,v};}
  function normalize(rows){const m=new Map();for(const r of rows){if(r&&r.t>0&&Number.isFinite(r.c)&&r.c>0)m.set(r.t,r);}return [...m.values()].sort((a,b)=>a.t-b.t);}
  // Reusable version of BTC_iquidation Pionex WS chart reader, parameterized by symbol and resolution.
  function tvBars(symbol,resolution,count=530,timeout=17000){return new Promise((resolve,reject)=>{
    const url=new URL(WORKER);url.protocol='wss:';url.pathname='/api/monitor/tv-chart-ws';url.search='';
    let ws;try{ws=new WebSocket(url.toString());}catch(e){reject(e);return;}
    const sess='cs_'+Math.random().toString(36).slice(2),sym='symbol_1',series='series_1',received=new Map();let ended=false;
    const timer=setTimeout(()=>fail(new Error('TradingView K 線逾時')),timeout);
    const done=()=>{if(ended)return;ended=true;clearTimeout(timer);try{ws.close();}catch{};const bars=normalize([...received.values()]).slice(-count);if(bars.length<2){reject(Error('TradingView 無足夠K線'));return;}resolve({bars,feed:symbol+' · TV圖表'});};
    const fail=e=>{if(ended)return;ended=true;clearTimeout(timer);try{ws.close();}catch{}reject(e);};
    ws.addEventListener('open',()=>{try{ws.send(pkt('set_auth_token',['unauthorized_user_token']));ws.send(pkt('chart_create_session',[sess,'']));ws.send(pkt('switch_timezone',[sess,'Etc/UTC']));ws.send(pkt('resolve_symbol',[sess,sym,'='+JSON.stringify({symbol,adjustment:'splits',session:'regular'})]));ws.send(pkt('create_series',[sess,series,'s1',sym,resolution,count,'']));}catch(e){fail(e);}});
    ws.addEventListener('message',async e=>{try{const data=typeof e.data==='string'?e.data:e.data instanceof Blob?await e.data.text():new TextDecoder().decode(e.data);for(const p of unpack(String(data))){if(p.startsWith('~h~')){ws.send(frame(p));continue;}let d;try{d=JSON.parse(p);}catch{continue;}if(['protocol_error','critical_error','symbol_error','series_error'].includes(d.m)){fail(Error('TV圖表錯誤 '+d.m));return;}const items=d.p||[];if(d.m==='timescale_update'&&items[0]===sess){for(const raw of items?.[1]?.[series]?.s||[]){const c=tvRow(raw);if(c)received.set(c.t,c);}}if(d.m==='series_completed'&&items[0]===sess&&items[1]===series){done();return;}}}catch(ex){fail(ex);}});
    ws.addEventListener('error',()=>fail(Error('TradingView WebSocket 連線失敗')));ws.addEventListener('close',()=>{if(!ended)fail(Error('TradingView 連線提前關閉'));});
  });}
  function parseRest(data){const arr=data?.data?.klines||data?.klines||[];if(!Array.isArray(arr))return [];return normalize(arr.map(r=>{let t=Number(Array.isArray(r)?r[0]:r.time??r.ts??r.t);if(t>0&&t<1e12)t*=1000;const a=Array.isArray(r)?r.slice(1):[r.open,r.high,r.low,r.close,r.volume];return {t,o:+a[0],h:+a[1],l:+a[2],c:+a[3],v:+(a[4]||0)};}).filter(r=>[r.t,r.o,r.h,r.l,r.c].every(Number.isFinite)&&r.o>0&&r.c>0&&r.h>=r.l));}
  async function restBars(s,interval,count){const u=new URL('/api/monitor/klines',WORKER);u.searchParams.set('symbol',s.pionex);u.searchParams.set('interval',interval);u.searchParams.set('limit',String(Math.min(count,300)));
    let r;try{r=await json(u.toString(),{},11000);}catch(e){throw Error('SState Worker '+interval+'：'+(e?.message||e));}
    const bars=parseRest(r);if(bars.length<2)throw Error('SState Worker '+interval+'：K線無效');return {bars,feed:'Pionex Worker / '+interval+(r.source?' · '+r.source:''),warning:r.refresh_error||null};}
  // SStateMarketTerminal's Python analysis calls this same Pionex public K-line REST endpoint.
  // It does NOT need a TradingView ticker to exist, e.g. WTI_USDT_PERP may be valid on Pionex
  // while PIONEX:WTIUSDT.P gets symbol_error from TradingView. Browser CORS may still block direct
  // requests; in that case we fall back to the SState Worker and do not pretend the feed worked.
  async function pionexDirectBars(s,interval,count){
    const u=new URL('https://api.pionex.com/api/v1/market/klines');
    u.searchParams.set('symbol',s.pionex);u.searchParams.set('interval',interval);
    u.searchParams.set('limit',String(Math.min(count,500)));
    let r;try{r=await json(u.toString(),{headers:{Accept:'application/json'}},10500);}catch(e){throw Error('Pionex REST '+interval+'（瀏覽器可能受 CORS 限制）：'+(e?.message||e));}
    const bars=parseRest(r);if(bars.length<2)throw Error('Pionex REST '+interval+'：K線不足');
    return {bars,feed:'Pionex 官方 REST '+interval};
  }
  async function binanceBars(s,interval,count){const symbol=s.id+'USDT',tf=interval==='15M'?'15m':interval==='4H'?'4h':'1d';let last='';for(const base of ['https://fapi.binance.com/fapi/v1/klines','https://data-api.binance.vision/api/v3/klines']){
    try{const u=new URL(base);u.searchParams.set('symbol',symbol);u.searchParams.set('interval',tf);u.searchParams.set('limit',String(Math.min(800,count)));const arr=await json(u.toString(),{},9000);const bars=normalize(arr.map(r=>({t:+r[0],o:+r[1],h:+r[2],l:+r[3],c:+r[4],v:+r[5]})));if(bars.length<Math.min(35,Math.max(2,count-3)))throw Error('根數不足');return {bars,feed:base.includes('fapi')?'Binance PERP 歷史備援':'Binance SPOT 歷史備援'};}catch(e){last=e.message;}}
    throw Error(last||'Binance K線失敗');}
  async function loadHistory(s,interval,count){
    const issues=[];
    const byTv=()=>tvBars(s.tv,interval==='15M'?'15':interval==='4H'?'240':'1D',count);
    // WTI/CL has a VERIFIED TradingView ticker PIONEX:CLUSDT.P. Read it first.
    // Other tokenized assets retain official Pionex REST first until verified TV aliases exist.
    // Crypto keeps its existing TV-first behavior.
    const isOilAlias=s.group==='stock'&&(s.id==='WTI'||s.id==='CL');
    const sources=isOilAlias
      ? [['TradingView',byTv],['Pionex 官方',()=>pionexDirectBars(s,interval,count)],['SState Worker',()=>restBars(s,interval,count)]]
      : s.group==='stock'
        ? [['Pionex 官方',()=>pionexDirectBars(s,interval,count)],['SState Worker',()=>restBars(s,interval,count)],['TradingView',byTv]]
        : [['TradingView',byTv],['SState Worker',()=>restBars(s,interval,count)],['Pionex 官方',()=>pionexDirectBars(s,interval,count)]];
    // Startup provider preference only changes retry ORDER; every original fallback remains.
    const preferred=state.startupActive&&!startupComplete?window.LiqHistoryCache?.preferred(s.pionex,interval):null;
    if(preferred){const i=sources.findIndex(([name])=>name===preferred);if(i>0)sources.unshift(sources.splice(i,1)[0]);}
    for(const [name,fn] of sources){try{
      const result=await fn();window.LiqHistoryCache?.remember(s.pionex,interval,name);
      return {...result,provider:name};
    }catch(e){issues.push(name+': '+(e?.message||e));}}
    if(s.group==='crypto')try{return await binanceBars(s,interval,count);}catch(e){issues.push('Binance: '+(e?.message||e));}
    throw Error(interval+' 無法取得：'+issues.join(' / '));
  }
  // CoinGlass encryption-version compatibility remains in the ORIGINAL external
 // CoinGlassReader (V0/V1/V2/V55/V66/V77). This parser handles the DECRYPTED
 // payload only; it does not synthesize price levels or swap upper/lower sides.
 function cgTicker(raw){
   if(typeof raw!=='string')return '';
   let s=raw.trim().toUpperCase().replace(/^([A-Z0-9]+):/,'').replace(/[\s/_\-.]/g,'');
   // Recognize exchange contract suffixes, not arbitrary token suffixes.
   s=s.replace(/(?:USDT|USDC|USD)(?:PERP|SWAP)?$/,'');
   return /^[A-Z0-9]{2,24}$/.test(s)?s:'';
 }
 function extractCG(data){
   const records=new Map(),seen=new WeakSet(),fields=['symbol','coin','currency','baseCoin','baseAsset','base_coin','base_asset','ticker'];
   const read=n=>{if(typeof n==='string')n=n.replaceAll(',','').replaceAll('$','');const v=Number(n);return Number.isFinite(v)&&v>0?v:null;};
   function walk(obj,depth,hint=''){
     if(typeof obj==='string'&&depth<3&&obj.length<800000){
       try{const parsed=JSON.parse(obj);if(parsed&&typeof parsed==='object')walk(parsed,depth+1,hint);}catch(_){}
       return;
     }
     if(!obj||typeof obj!=='object'||depth>12||seen.has(obj))return;
     seen.add(obj);
     if(!Array.isArray(obj)){
       const raw=fields.map(k=>obj[k]).find(x=>typeof x==='string'&&x.trim())||hint;
       const symbol=cgTicker(raw);
       const upper=read(obj.maxLongLiquidationPrice??obj.short_max_pain_liq_price??obj.shortMaxPainLiqPrice??obj.max_long_liquidation_price);
       const lower=read(obj.maxShortLiquidationPrice??obj.long_max_pain_liq_price??obj.longMaxPainLiqPrice??obj.max_short_liquidation_price);
       if(symbol&&upper&&lower&&upper>lower){
         const row={upper,lower,upAmount:read(obj.maxLongLiquidationLevel??obj.short_max_pain_liq_level??obj.shortMaxPainLiqLevel),downAmount:read(obj.maxShortLiquidationLevel??obj.long_max_pain_liq_level??obj.longMaxPainLiqLevel),ref:read(obj.price),coinGlassId:String(raw).toUpperCase()};
         // Explicit exact identifiers win. A BTCUSDT record may ALSO be
         // addressed as BTC, but only when no BTC entry already exists.
         const original=String(raw).toUpperCase().replace(/[\s/_\-.]/g,'').replace(/^([A-Z0-9]+):/,'');
         if(original&&/^[A-Z0-9]{2,30}$/.test(original))records.set(original,row);
         if(!records.has(symbol))records.set(symbol,row);
       }
     }
     for(const [key,value] of Object.entries(obj)){
       if(value&&typeof value==='object')walk(value,depth+1,key);
       else if(typeof value==='string'&&(key==='data'||key==='result'||key==='list'))walk(value,depth+1,'');
     }
   }
   walk(data,0);return records;
 }
  function resolveCG(s,records){
    if(!s||!(records instanceof Map))return null;
    const aliases=[...new Set([...(s.cg||[]).map(x=>String(x).toUpperCase()),
      ...(s.group==='crypto'?['1000'+s.id]:[])])];
    for(const id of aliases){
      const row=records.get(id);
      if(!row)continue;
      let factor=1;
      const lot=id.match(/^(\d+)([A-Z].*)$/);
      if(s.group==='crypto'&&lot&&lot[2]===s.id&&+lot[1]>1)factor=+lot[1];
      // Explicit per-symbol scale may be supplied in symbols.js later, but not required for PEPE.
      if(Number.isFinite(Number(s.cgPriceUnit))&&Number(s.cgPriceUnit)>0)factor=Number(s.cgPriceUnit);
      return {...row,upper:row.upper/factor,lower:row.lower/factor,
        ref:row.ref?row.ref/factor:null,sourceId:id,unitFactor:factor};
    }
    return null;
  }
  // Cache only successful, VERIFIED CoinGlass 7D decoded records.
  // NEVER persist (or restore) the legacy 15M proxy. Cached levels are
  // display-only and RR remains disabled until a fresh CoinGlass fetch.
  const CG_CACHE_KEY='SStateLiquidityRadar.coinglass7d.verified.v1';
  function matchedCG(map){return records.filter(r=>!!resolveCG(r.s,map)).length;}
  function restoreCG(){
    try{
      const text=localStorage.getItem(CG_CACHE_KEY);if(!text||text.length>350000)return;
      const c=JSON.parse(text);
      if(c?.schema!==1||c.range!=='7d'||c.origin!=='CoinGlassReader'||!Number.isFinite(c.at)||Date.now()-c.at>48*H||c.at>Date.now()+30000||!Array.isArray(c.rows))return;
      const map=new Map();for(const pair of c.rows.slice(0,1200)){
        const [key,row]=pair;
        if(typeof key==='string'&&/^[A-Z0-9]{2,30}$/.test(key)&&priceEnough(row?.upper)&&priceEnough(row?.lower)&&row.upper>row.lower)map.set(key,row);
      }
      const matched=matchedCG(map);if(!matched)return;
      state.cgRecords=map;state.cgAt=c.at;state.cgVersion=String(c.version||'?');
      state.cgError='僅使用上次成功的 CoinGlass 7D 本機快取，等待取得最新資料；RR 暫停';
      state.cgDiagnostics={at:Date.now(),origin:'上次有效快取（非即時）',sample:[...map.keys()].slice(0,8),matched};
      log(`CoinGlass 7D 已恢復上次成功紀錄 ${matched}/${records.length}，資料暫視為過期、RR 暫停`);
    }catch(e){log('CoinGlass 7D 快取讀取失敗：'+e.message);}
  }
  function rememberCG(map,version){
    try{
      const pairs=[...map.entries()].filter(([k,v])=>/^[A-Z0-9]{2,30}$/.test(k)&&priceEnough(v?.upper)&&priceEnough(v?.lower)&&v.upper>v.lower).slice(0,1200);
      const jsonText=JSON.stringify({schema:1,range:'7d',origin:'CoinGlassReader',at:state.cgAt,version,rows:pairs});
      if(jsonText.length<350000)localStorage.setItem(CG_CACHE_KEY,jsonText);
    }catch(e){log('CoinGlass 7D 快取無法寫入：'+e.message);}
  }
  // Exactly the SState monitor's daily CCI(20) + SMA(14) color rule.
 // Clone fetched candles; never change the cached historical source while the quote refreshes.
 function dailyAsOf(r){
   // Share the same forming UTC daily candle across BB chart, daily HA, CCI,
   // S state and midline badge. A 1D REST/TV feed can lag until its refresh;
   // today's 4H OHLC plus a fresh quote must still advance today's 1D bands.
   return window.LiqRadar4H.projectDaily(r.daily,r.bars4h,livePrice(r),Date.now(),r.liveOHLC);
 }
 function dailyHA(days){
   if(days.length<26)return null;
   let po=null,pc=null,before=null,cur=null;
   const history=[];
   for(const b of days){const ho=po===null?(b.o+b.c)/2:(po+pc)/2,hc=(b.o+b.h+b.l+b.c)/4;before=cur;cur={color:hc>=ho?'黃':'紫',ho,hc,t:b.t};history.push(cur);po=ho;pc=hc;}
   // The RR scanner uses the same complete, formed HA history as the list
   // and chart, including today's evolving candle. No independent API fetch.
   return cur?{...cur,priorColor:before?.color||'--',priorHc:before?.hc??null,priorT:before?.t??null,history}:null;
 }
 // v2.0.6: the prior-day dot is positioned on the same HA staircase price scale:
 // prior HA CLOSE above today's -> upper dot; below today's -> lower dot.
 // A yellow->purple transition cannot rise and a purple->yellow transition cannot
 // fall in a continuous HA sequence. An inconsistency hides the dot, not the tile.
 function classifyHaSemanticDot(ha){
   const current=ha?.color,previous=ha?.priorColor;
   const today=ha?.hc,yesterday=ha?.priorHc;
   if(!['黃','紫'].includes(current)||!['黃','紫'].includes(previous)||
      !Number.isFinite(today)||!Number.isFinite(yesterday)||today<=0||yesterday<=0 ||
      !(Number.isFinite(ha?.t)&&Number.isFinite(ha?.priorT)&&ha.t-ha.priorT===DAY)){
     return {position:null,state:'missing',meaning:'HA 今日／昨日資料不足或日期不連續'};
   }
   // Relative epsilon works for both BTC and micro-priced tokens (e.g. PEPE).
   const delta=today-yesterday;
   const eps=16*Number.EPSILON*Math.max(Math.abs(today),Math.abs(yesterday));
   const vertical=Math.abs(delta)<=eps?'middle':delta>0?'bottom':'top';
   // The preceding-day dot is ALWAYS at the LEFT edge, for both yellow and purple today.
   // Only height encodes yesterday's HA close relative to today's HA close.
   if((previous==='紫'&&current==='黃'&&vertical!=='bottom')||
      (previous==='黃'&&current==='紫'&&vertical!=='top')){
     return {position:null,state:'anomaly',meaning:'HA 轉色與收盤價高度矛盾（需檢查日線資料）',delta};
   }
   const meaning=vertical==='middle'?'HA 收盤價持平':
     current==='紫'?(vertical==='bottom'?'連續紫抬高，留意可能止跌':previous==='黃'?'黃轉紫，HA 收盤價降低':'連續紫降低，偏弱延續'):
     vertical==='top'?'連續黃降低，留意漲勢衰退':previous==='紫'?'紫轉黃，HA 收盤價抬高':'連續黃抬高，偏強延續';
   return {position:'left-'+vertical,state:'valid',meaning,delta};
 }
 const reportedHaDotConflicts=new Set();
 function dailyCciSma(days){
   // SStateMarketTerminal/monitor-engine.js: CCI_LENGTH=20, CCI_SMOOTHING_LENGTH=14.
   const n=days.length,cci=Array(n).fill(null),sma=Array(n).fill(null);
   if(n<34)return null;
   const tp=days.map(x=>(x.h+x.l+x.c)/3);
   for(let i=19;i<n;i++){
     const window=tp.slice(i-19,i+1),mean=window.reduce((x,y)=>x+y,0)/20;
     const deviation=window.reduce((sum,x)=>sum+Math.abs(x-mean),0)/20;
     if(deviation>0)cci[i]=(tp[i]-mean)/(.015*deviation);
   }
   for(let i=32;i<n;i++){
     const window=cci.slice(i-13,i+1);
     if(window.every(Number.isFinite))sma[i]=window.reduce((x,y)=>x+y,0)/14;
   }
   const value=sma[n-1],prev=sma[n-2];
   if(!Number.isFinite(value)||!Number.isFinite(prev))return null;
   const color=value>prev?'黃':value<prev?'紫':'--';
   return {color,value,prev,change:value-prev,time:days.at(-1).t};
 }
 function dailySState(days){
   // SStateMarketTerminal/monitor-engine.js is loaded before this script.
   // Require same >=40 days as SState's monitor; otherwise do not mislabel OTHER as genuine.
   if(days.length<40)return null;
   const engine=window.SStateMonitorEngine;
   if(!engine?.analyze)return null;
   const rows=days.map(x=>({time:x.t,open:x.o,high:x.h,low:x.l,close:x.c,volume:x.v||0}));
   const analyzed=engine.analyze(rows);
   if(!analyzed?.midline||!analyzed?.s_state)return null;
   const rawState=String(analyzed.s_state);
   const ext=engine.classifyOtherExtension?.(analyzed.chart_30d,rawState);
   return {sstate:ext?.state||rawState,rawState,extensionReason:ext?.reason||'',midline:analyzed.midline,source:'SStateMonitorEngine',engine:engine.constants?.ENGINE_VERSION||''};
 }
 function updateDerived(r){const days=dailyAsOf(r);r.ha=dailyHA(days);r.cci=dailyCciSma(days);
   try{const s=dailySState(days);r.sstate=s?.sstate||null;r.sstateRaw=s?.rawState||null;r.sstateReason=s?.extensionReason||'';r.midline=s?.midline||null;
     r.errors.sstate=s?'':(!window.SStateMonitorEngine?.analyze?'SState 原版引擎尚未載入':days.length<40?'日線歷史不足 40 根':'SState 分析暫無結果');
   }catch(e){r.sstate=null;r.midline=null;r.errors.sstate=String(e?.message||e);}

   // Strict 7D source isolation: market prices NEVER control whether
   // CoinGlass upper/lower levels are kept. Only a NEW valid CoinGlass pull
   // is allowed to change them. Retain last-known actual levels on failures,
   // mark them stale and disable RR until a fresh successful pull.
   const cg=resolveCG(r.s,state.cgRecords);
   r.cgId=cg?.sourceId||'';r.cgFactor=cg?.unitFactor||1;
   r.upAmount=cg?.upAmount??null;r.downAmount=cg?.downAmount??null;
   if(cg){
     r.up=cg.upper;r.down=cg.lower;r.source='coinglass';
     r.errors.cg=cgFresh()?'':('CoinGlass 7D 資料過期，RR 暫停'+(state.cgError?'：'+state.cgError:''));
   }else{
     r.up=null;r.down=null;r.source='none';
     r.errors.cg=state.cgError||'CoinGlass 7D 無此標的／尚未取得';
   }
   // Reuse the same projected daily candles for Signal Spotlight; no duplicate API calls.
   window.SignalSpotlight?.queueRecord?.(r,days);
   // Probability model is not calculated in the redesigned chart view.
 }
 function calcModel(r){r.model=null;const engine=window.BTCLiqEngine,weights=window.BTCLiqModel;if(!engine?.features||!weights?.probabilities){r.errors.model='BTC 模型尚未載入';return;}
   const now=Date.now(),closed=r.bars15.filter(x=>x.t+MS<=now);if(closed.length<340){r.errors.model=`15M 歷史不足 340 根 (${closed.length})`;return;}
   const recent=closed.slice(-520);if(recent.slice(1).some((x,i)=>x.t-recent[i].t!==MS)){r.errors.model='15M K 線不連續';return;}
   const anchor=Date.parse('2032-03-08T12:00:00Z');const shifted=recent.map((x,i)=>({...x,t:anchor-(recent.length-i+1)*MS}));const when=anchor-MS+(now%MS);
   try{const f=engine.features(shifted,when,r.price||recent.at(-1).c);if(!f)throw Error('BTC 39 特徵無法組成滾動資料');const pred=weights.probabilities(f.features);const delta=r.ha?(r.ha.color==='黃'?.045:-.045):0;
     const up=clamp(pred.up+delta,0,1);r.model={up,down:1-up,rawUp:pred.up,delta,time:now};r.errors.model='';
   }catch(e){r.errors.model=String(e?.message||e);}
 }
 const setText=(element,text)=>{element.textContent=text;return element;};
 function el(tag,cls='',txt=''){const node=document.createElement(tag);if(cls)node.className=cls;if(txt)node.textContent=txt;return node;}
 // Distinguish a fresh HA color change (黃 → 紫) from an established trend (紫 → 紫).
 // Both daily colors are taken directly from dailyHA(); this is presentation only.
 function renderHaTransition(target,ha,errorMessage){
   target.className='ha-sub ha-transition';
   target.replaceChildren();
   if(!ha||!['黃','紫'].includes(ha.color)){
     target.textContent=errorMessage||'等待日線';
     target.title='';
     return;
   }
   const paint=(value,side)=>el('span','ha-transition-state '+side+' '+(value==='黃'?'yellow':value==='紫'?'purple':'unknown'),value);
   target.append('前日 ',paint(ha.priorColor||'--','previous'),' → ',paint(ha.color,'current'));
   target.title=ha.priorColor!==ha.color&&['黃','紫'].includes(ha.priorColor)
     ?`平均 K：前日${ha.priorColor}，今日轉${ha.color}（轉色首日）`
     :`平均 K：前日${ha.priorColor||'--'}，今日${ha.color}（維持原色）`;
 }
 function makeRow(r){
   // Indicator nodes are mounted into the fixed sector panel; no 33-chart DOM tree.
   r.dom={
     tr:null, name:el('span','liq-nav-symbol',r.id), rrLed:el('span','liq-rr-led'),
     px:el('span','liq-nav-quote','—'), sf:el('span'),
     sBadge:el('span','state-badge unknown','--'),sSub:el('span','state-sub','等待日線'),
     midLabel:el('span','mid-label unknown','--'),midSub:el('span','mid-sub','等待日線'),
     ha:el('span','ha-color unknown','--'),hn:el('span','ha-sub','等待日線'),
     cci:el('span','ha-color unknown','--'),cn:el('span','ha-sub','等待日線')
   };
   return r.dom;
 }
 // Lightweight shared quote for the fast SVG NOW layer. Never project daily
 // candles or recalculate HA/CCI/BB merely to read the current price.
 function chartPricePayload(id){
   const r=records.find(x=>x.id===id);if(!r)return null;
   const price=livePrice(r);
   return {price,priceText:priceEnough(price)?MONEY(price):'--',upper:r.up,lower:r.down};
 }
 function chartPayload(id){
   const r=records.find(x=>x.id===id);
   if(!r)return null;
   const sc=r.sstate||'--', ms=r.midline?.state||'unknown',ha=r.ha?.color||'--',cci=r.cci?.color||'--';
   const toneColor=v=>v==='黃'?'yellow':v==='紫'?'purple':'unknown';
   const capsules=[
     {kind:'s',tone:({'S3':'s3','S2':'s2','S1':'s1','S0.5':'s05','S0':'s0','OTHER-UP':'other-up','OTHER-DN':'other-dn','OTHER':'other'})[sc]||'unknown',text:sc==='OTHER-UP'?'OT-UP':sc==='OTHER-DN'?'OT-DN':sc},
     {kind:'mid',tone:ms,text:(r.midline?.symbol||'')+' '+(r.midline?.label||'--')},
     {kind:'ha',tone:toneColor(ha),text:'HA '+ha,title:'前日 '+(r.ha?.priorColor||'--')+' → '+ha},
     {kind:'cci',tone:toneColor(cci),text:'CCI '+cci}
   ];
   return {capsules,symbol:r.id,priceText:priceEnough(livePrice(r))?MONEY(r.price):'--',source:sourceName(r),
     indicator:`${r.sstate||'--'}  ·  ${r.midline?.symbol||''}${r.midline?.label||'--'}  ·  HA ${r.ha?.color||'--'} (${r.ha?.priorColor||'--'}→${r.ha?.color||'--'})  ·  CCI ${r.cci?.color||'--'}`,
     chart:{bars:r.live4h&&r.bars4h.length&&r.bars4h.at(-1)?.t===r.live4h.t?[...r.bars4h.slice(0,-1),{...r.bars4h.at(-1),h:Math.max(r.bars4h.at(-1).h,r.live4h.h),l:Math.min(r.bars4h.at(-1).l,r.live4h.l),c:r.live4h.c}]:r.bars4h,daily:dailyAsOf(r),price:livePrice(r),upper:r.up,lower:r.down,source:sourceName(r),updatedAt:Date.now()}};
 }
 function renderActiveChart(){window.LIQ_WORKSPACE?.refreshSymbol(state.selected);}
 function updateActiveSelection(id){
   if(!records.some(r=>r.id===id))return;
   state.selected=id;setNavActive(id);
   const selected=records.find(r=>r.id===id);
   if(selected&&!selected.bars4h?.length)enqueue(selected,'h4',false,-15);
   try{localStorage.setItem('liq-v140-active-symbol',id);}catch(_){}
 }
 function renderRow(r){if(!r.dom)return;const d=r.dom;
   d.px.textContent=priceEnough(livePrice(r))?MONEY(r.price):(r.priceAt?'現價過期 --':'現價 --');
   refreshRRLed(r);
   d.sf.textContent='4H OHLC '+(r.h4Feed?'· '+r.h4Feed:'· 等待 K 線');
   window.LIQ_WORKSPACE?.refreshSymbol(r.id);
   const sv=r.sstate||null,mid=r.midline;
   const stateClass=({'S3':'s3','S2':'s2','S1':'s1','S0.5':'s05','S0':'s0','OTHER-UP':'other-up','OTHER-DN':'other-dn','OTHER':'other'})[sv]||'unknown';
   const stateName=({'S3':'3浪啟動','S2':'2浪回踩','S1':'1浪突破','S0.5':'優質反轉','S0':'下殺反彈','OTHER-UP':'上軌延續','OTHER-DN':'下軌延續','OTHER':'其他'})[sv]||'等待日線';
   d.sBadge.textContent=sv==='OTHER-UP'?'OT-UP':sv==='OTHER-DN'?'OT-DN':sv||'--';d.sBadge.className='state-badge '+stateClass;
   d.sSub.textContent=sv?stateName:(r.daily.length&&r.daily.length<40?'日 K 不足 40 根':'資料不足');
   d.sBadge.title=sv?`SState ${sv}｜${stateName}｜${r.sstateReason||'原始狀態'}｜${window.SStateMonitorEngine?.constants?.ENGINE_VERSION||'共用引擎'}`:(r.errors.sstate||'尚無 S 狀態');
   const midClass=({'rising':'rising','flat':'flat','flattening':'flattening','falling':'falling'})[mid?.state]||'unknown';
   d.midLabel.textContent=mid?mid.symbol+' '+mid.label:'--';d.midLabel.className='mid-label '+midClass;
   d.midSub.textContent=mid?.state?`${mid.recent_5d_slope_pct_per_day>0?'+':''}${mid.recent_5d_slope_pct_per_day}%/日`:'等待資料';
   d.midLabel.title=mid?`SState 最近5日中軌斜率 ${mid.recent_5d_slope_pct_per_day}%/日；前5日 ${mid.previous_5d_slope_pct_per_day}%/日；改善 ${mid.slope_improvement_pct_per_day}%/日`:'日 K 中軌斜率尚無資料';
   d.ha.textContent=r.ha?.color||'--';d.ha.className='ha-color '+(r.ha?.color==='黃'?'yellow':r.ha?.color==='紫'?'purple':'unknown');
   renderHaTransition(d.hn,r.ha,r.errors.day?'日線取得失敗':'等待日線');
   const haDot=classifyHaSemanticDot(r.ha);
   // Attribute is intentionally absent for bad/missing data: no stale prior dot.
   if(haDot.position){d.ha.dataset.prior=r.ha.priorColor;d.ha.dataset.haDotPosition=haDot.position;}
   else{delete d.ha.dataset.prior;delete d.ha.dataset.haDotPosition;}
   d.ha.title=haDot.state==='valid'
     ?`平均 K：昨天${r.ha.priorColor} ${MONEY(r.ha.priorHc)} → 今天${r.ha.color} ${MONEY(r.ha.hc)}｜${haDot.meaning}（今日可能未收線）`
     :haDot.meaning;
   if(haDot.state==='anomaly'){
     const key=r.id+':'+r.ha?.t;
     if(!reportedHaDotConflicts.has(key)){
       reportedHaDotConflicts.add(key);log(`${r.id} HA 語意圓點隱藏：${haDot.meaning}`);
     }
   }
   d.cci.textContent=r.cci?.color==='黃'||r.cci?.color==='紫'?r.cci.color:'--';
   d.cci.className='ha-color '+(r.cci?.color==='黃'?'yellow':r.cci?.color==='紫'?'purple':'unknown');
   d.cn.textContent=r.cci?`SMA ${r.cci.value.toFixed(1)}`:(r.daily.length&&r.daily.length<34?'日 K 不足 34 根':r.errors.day?'日 K 取得失敗':'等待日 K');
   d.cn.className='ha-sub '+(r.cci?.color==='黃'?'yellow':r.cci?.color==='紫'?'purple':'');
   d.cci.title=r.cci?`CCI(20) / SMA(14)：當 ${r.cci.value.toFixed(3)}，前 ${r.cci.prev.toFixed(3)}，差 ${r.cci.change.toFixed(3)}`:'CCI-SMA 尚無有效資料';
   if(d.tr)d.tr.title=Object.entries(r.errors).filter(([,value])=>value).map(([key,value])=>`${key}: ${value}`).join(' | ')||'';
   if(d.sBadge.parentElement){d.sBadge.parentElement.title=d.sBadge.title+'\n'+d.sSub.textContent;}
   if(d.midLabel.parentElement){d.midLabel.parentElement.title=d.midLabel.title+'\n'+d.midSub.textContent;}
   if(d.ha.parentElement){d.ha.parentElement.title=d.ha.title+'\n'+d.hn.textContent;}
   if(d.cci.parentElement){d.cci.parentElement.title=d.cci.title+'\n'+d.cn.textContent;}
 }
 // A header click chooses its column and a subsequent click reverses direction.
 // Color flags are stored on the original symbol row, not on visible row positions.
 // Unknown values always go to the bottom; ties fall back to original watchlist order.
 function sortValue(r,key){
   if(key==='watchlist')return r.index;
   if(key==='symbol')return r.id.toUpperCase();
   if(key==='ha')return r.ha&&['黃','紫'].includes(r.ha.color)?(r.ha.color==='黃'?1:0):null;
   if(key==='sstate')return r.sstate?({'S3':80,'S0.5':70,'S1':60,'S2':50,'S0':40,'OTHER-UP':30,'OTHER-DN':20,'OTHER':10}[r.sstate]??0):null;
   if(key==='midline')return r.midline?({'rising':4,'flat':3,'flattening':2,'falling':1}[r.midline.state]??0):null;
   if(key==='cci')return r.cci&&['黃','紫'].includes(r.cci.color)?(r.cci.color==='黃'?1:0):null;
   if(key==='bull_pair')return r.ha?.color==='黃'&&r.cci?.color==='黃'?1:0;
   if(key==='bear_pair')return r.ha?.color==='紫'&&r.cci?.color==='紫'?1:0;
   const price=livePrice(r);
   if(key==='near')return priceEnough(price)&&priceEnough(r.up)&&priceEnough(r.down)
     ?Math.min(Math.abs(r.up/price-1),Math.abs(1-r.down/price))*100:null;
   const model=r.model&&priceEnough(price)&&priceEnough(r.up)&&priceEnough(r.down)?r.model:null;
   if(!model)return null;
   if(key==='upper')return model.up;
   if(key==='lower')return model.down;
   if(key==='edge')return Math.abs(model.up-model.down);
   return null;
 }
 function compareValues(a,b){
   if(typeof a==='string'||typeof b==='string')return String(a).localeCompare(String(b),'en',{numeric:true,sensitivity:'base'});
   return a===b?0:a<b?-1:1;
 }
 function compareSectorRows(a,b,key){
   if(key==='marks'){
     const ma=navButtons.get(a.id)?.wrapper?.dataset.markColor;
     const mb=navButtons.get(b.id)?.wrapper?.dataset.markColor;
     const va=Object.hasOwn(MARK_GROUP_ORDER,ma)?MARK_GROUP_ORDER[ma]:999;
     const vb=Object.hasOwn(MARK_GROUP_ORDER,mb)?MARK_GROUP_ORDER[mb]:999;
     return va-vb||a.index-b.index;
   }
   const va=sortValue(a,key),vb=sortValue(b,key);
   if(va===null&&vb===null)return a.index-b.index;
   if(va===null)return 1;if(vb===null)return -1;
   const ascending=key==='watchlist'||key==='symbol'||key==='near';
   const primary=compareValues(va,vb)*(ascending?1:-1);
   if(primary)return primary;
   // Tie breakers prioritize bullish context; flags never interfere with analytical modes.
   if(['ha','cci','bull_pair','bear_pair'].includes(key)){
     const p=r=>key==='bear_pair'?Number(r.ha?.color==='紫')+Number(r.cci?.color==='紫'):Number(r.ha?.color==='黃')+Number(r.cci?.color==='黃');
     const ps=p(b)-p(a);if(ps)return ps;
     const ms=(sortValue(b,'midline')??-1)-(sortValue(a,'midline')??-1);if(ms)return ms;
     const ss=(sortValue(b,'sstate')??-1)-(sortValue(a,'sstate')??-1);if(ss)return ss;
   }
   return a.index-b.index;
 }
 function reorder(){reorderSideNavByMarks();}
 // Floating rails bind directly to symbols.js records and stable symbol identities.
 const navButtons=new Map();
 const MARK_GROUP_ORDER=Object.freeze({red:0,orange:1,yellow:2,green:3,blue:4,purple:5});
 let navActive='',navScrollQueued=false,navJumpUntil=0,navPulseTimer=0;
 function reorderSideNavByMarks(){
   for(const group of ['crypto','stock','custom']){
     const list=$('liq-'+group+'-list');if(!list)continue;
     const key=state.sectorSort[group]||'marks';
     const items=records.filter(r=>r.s.group===group).sort((a,b)=>compareSectorRows(a,b,key));
     list.replaceChildren(...items.map(r=>navButtons.get(r.id)?.wrapper).filter(Boolean));
   }
 }
 function setNavActive(id){
   if(navActive===id)return;
   navActive=id;
   for(const [key,element] of navButtons){
     if(key===id)element.btn.setAttribute('aria-current','location');
     else element.btn.removeAttribute('aria-current');
   }
 }
 function syncNavFromScroll(){/* v1.4: no page scrolling or list scrolling. */}
 function jumpToSymbol(r){
   if(window.LIQ_WORKSPACE){
     if(window.LIQ_WORKSPACE.selectSymbol(r.id))updateActiveSelection(r.id);
   }else updateActiveSelection(r.id);
 }
 function setupSideNav(groupNames=['crypto','stock']){
   for(const group of groupNames){
     const host=$('liq-'+group+'-nav'),list=$('liq-'+group+'-list');if(!host||!list)continue;
     const subset=records.filter(r=>r.s.group===group);
     $('liq-'+group+'-side-count').textContent=subset.length;
     const frag=document.createDocumentFragment();
     for(const r of subset){
       const wrapper=el('div','liq-nav-row');wrapper.dataset.symbol=r.id;
       const markBtn=el('button','liq-nav-mark-trigger');markBtn.type='button';markBtn.dataset.markSymbol=String(r.s.pionex||r.id).toUpperCase();markBtn.dataset.radarId=r.id;markBtn.dataset.markLocation='side-nav';markBtn.title=`${r.id}：選擇註記顏色`;markBtn.setAttribute('aria-label',`${r.id}：選擇註記顏色`);markBtn.innerHTML='<span class="liq-nav-mark-glyph" aria-hidden="true"></span>';
       const btn=el('button','liq-nav-item');btn.type='button';btn.dataset.symbol=r.id;
       btn.title='檢視 '+r.id+' 的 4H K 線圖';btn.setAttribute('aria-label','切換至 '+r.id+' 的圖表');
       const values=el('span','liq-nav-values'),change=el('span','liq-nav-change','—');
       values.append(r.dom.px,change);
       const symbolGroup=el('span','liq-nav-symbol-group');r.dom.rrLed.hidden=true;symbolGroup.append(r.dom.name,r.dom.rrLed);
       const main=el('span','liq-nav-main');main.append(symbolGroup,values);btn.append(main);
       btn.addEventListener('click',()=>jumpToSymbol(r));
       const metrics=el('span','liq-nav-indicators');
       const s=el('span','metric metric-s'),m=el('span','metric metric-mid'),h=el('span','metric metric-ha'),c=el('span','metric metric-cci');
       c.dataset.cciHover=r.id;
       s.append(r.dom.sBadge);m.append(r.dom.midLabel);h.append(r.dom.ha);c.append(r.dom.cci);metrics.append(s,m,h,c);
       const bell=el('button','liq-alert-bell','♧');bell.type='button';bell.dataset.alertSymbol=String(r.s.pionex||'').toUpperCase();bell.dataset.radarId=r.id;bell.textContent='🔔';bell.setAttribute('aria-label',`設定 ${r.id} Telegram 價格提醒`);bell.title=`設定 ${r.id} Telegram 價格提醒`;
       wrapper.append(markBtn,bell,btn,metrics);
       // Custom member deletion belongs to the explicit Manage dialog, not the CCI capsule.
       // This avoids an invisible hover × intercepting the indicator cell.
       r.dom.tr=wrapper;
       navButtons.set(r.id,{wrapper,btn,quote:r.dom.px,change,markBtn,bell,group,record:r});frag.append(wrapper);
     }
     list.replaceChildren(frag);
     host.addEventListener('pointerdown',()=>window.LIQ_WORKSPACE?.focusList(group));
   }
   setNavActive(records[0]?.id||'');
   reorderSideNavByMarks();
 }
 // User-owned watchlist: same records / analysis pipeline, but NEVER mutates symbols.js.
 const CUSTOM_KEY='SStateLiquidityRadar.customPERP.v1';
 const CUSTOM_MAX=9;
 let customUniverse=[],customLoaded=false,customPartial=false;
 const customIds=()=>records.filter(row=>row.s.group==='custom').map(row=>row.id);
 const customSave=()=>{try{localStorage.setItem(CUSTOM_KEY,JSON.stringify(customIds()));window.LIQ_SHARED_STATE?.changed?.();}catch(_){/* storage disabled */}};
 function makeCustomRecord(base){
   const id=String(base||'').toUpperCase().replace(/_USDT_PERP$/,'');
   if(!/^[A-Z0-9]{1,22}$/.test(id)||records.some(x=>x.id===id))return null;
   const symbol=id+'_USDT_PERP';
   const s={id,group:'custom',pionex:symbol,tv:'PIONEX:'+id+'USDT.P',cg:[id]};
   const rec={s,index:records.length,id,price:null,priceAt:0,priceEventAt:0,priceFeed:'',live4h:null,bars15:[],bars4h:[],daily:[],barsAt:0,h4At:0,dailyAt:0,ha:null,cci:null,sstate:null,midline:null,liveOHLC:null,model:null,up:null,down:null,source:'none',cgId:'',cgFactor:1,upAmount:null,downAmount:null,zones:{upper:[],lower:[]},issue:'',errors:{},lastAttempt:{},dom:null};
   records.push(rec);makeRow(rec);return rec;
 }
 function updateCustomPanel(){
   $('liq-custom-side-count').textContent=customIds().length+'/'+CUSTOM_MAX;
   $('customEmpty').hidden=customIds().length>0;
   $('customAddSymbol').disabled=customIds().length>=CUSTOM_MAX;
   if(!$('customManageModal')?.hidden)renderCustomManage();
 }
 function renderCustomManage(){
   const list=$('customManageList');if(!list)return;
   list.replaceChildren();
   const members=records.filter(row=>row.s.group==='custom');
   if(!members.length){const p=el('div','custom-manage-empty','目前沒有自由清單標的');list.append(p);return;}
   for(const item of members){
     const row=el('div','custom-manage-row');
     const label=el('span','custom-manage-name',item.id+' · PERP');
     const remove=el('button','custom-manage-remove','移除');remove.type='button';
     // The Manage dialog already identifies the target; removal is immediate.
     // removeCustomSymbol refreshes the watchlist, Manage dialog, and storage.
     remove.setAttribute('aria-label','移除 '+item.id);remove.addEventListener('click',()=>{
       removeCustomSymbol(item.id);
     });row.append(label,remove);list.append(row);
   }
 }
 const closeCustomManage=()=>{$('customManageModal').hidden=true;};
 function addCustomSymbol(raw){
   const base=String(raw||'').toUpperCase().replace(/_USDT_PERP$/,'');
   if(customIds().length>=CUSTOM_MAX){$('customSymbolHint').textContent='最多 9 檔，請至「管理」移除其他標的';return false;}
   if(records.some(x=>x.id===base)){$('customSymbolHint').textContent=base+' 已在監控清單內';return false;}
   const rec=makeCustomRecord(base);if(!rec)return false;
   setupSideNav(['custom']);renderRow(rec);updateCustomPanel();customSave();renderOverview();
   enqueue(rec,'day',false,0);
   enqueue(rec,'h4',false,5); // A newly added symbol is an intentional chart candidate.
   window.LIQ_PRICE_STREAM?.sync(records.map(r=>r.s));
   fetchPrices();
   document.dispatchEvent(new CustomEvent('liq-radar-custom-updated'));
   window.LIQ_ALERT_TEST?.refreshBells?.();
   closeCustomModal();return true;
 }
 function removeCustomSymbol(id){
   const i=records.findIndex(r=>r.id===id&&r.s.group==='custom');if(i<0)return;
   // Closing chart windows bound to a removed custom record prevents dangling chart tabs.
   window.LIQ_WORKSPACE?.getWindows?.().filter(w=>w.symbol===id).forEach(w=>window.LIQ_WORKSPACE.closeWindow(w.id));
   records.splice(i,1);navButtons.delete(id);
   state.queue=state.queue.filter(job=>job.r.id!==id);
   if(state.selected===id)updateActiveSelection(records[0]?.id||'');
   setupSideNav(['custom']);updateCustomPanel();customSave();renderOverview();
   window.LIQ_PRICE_STREAM?.sync(records.map(r=>r.s));
   document.dispatchEvent(new CustomEvent('liq-radar-custom-updated'));
   window.LIQ_ALERT_TEST?.refreshBells?.();
 }
 const closeCustomModal=()=>{$('customSymbolModal').hidden=true;};
 async function loadCustomUniverse(){
   $('customSymbolHint').textContent='正在載入派網 USDT 永續合約…';
   try{
     const response=await json(WORKER+'/api/monitor/symbols',{},16000);
     const rows=Array.isArray(response.symbols)?response.symbols:[];
     customUniverse=rows.filter(x=>x&&String(x.type).toUpperCase()==='PERP'&&String(x.symbol).toUpperCase().endsWith('_USDT_PERP'))
       .map(x=>({symbol:String(x.symbol).toUpperCase(),base:String(x.symbol).toUpperCase().replace(/_USDT_PERP$/,'')}))
       .filter(x=>/^[A-Z0-9]{1,22}$/.test(x.base));
     customLoaded=true;customPartial=Boolean(response.partial);
     $('customSymbolHint').textContent='派網 PERP 清單 '+customUniverse.length+' 檔'+(customPartial?'（部分清單）':'')+'；最多新增 9 檔';
   }catch(err){customLoaded=true;customUniverse=[];customPartial=true;
     $('customSymbolHint').textContent='派網清單連線失敗，可輸入合約代碼嘗試新增；未驗證前不可視為已上市';
     log('自由清單 PERP universe：'+err.message);
   }
   renderCustomResults();
 }
 function renderCustomResults(){
   const term=String($('customSymbolQuery').value||'').trim().toUpperCase().replace(/_USDT_PERP$/,'').replace(/[^A-Z0-9]/g,'');
   const existing=new Set(records.map(x=>x.id));
   let items=customUniverse.filter(x=>!term||x.base.includes(term)).slice(0,80);
   if(term&&!items.some(x=>x.base===term)&&/^[A-Z0-9]{1,22}$/.test(term)&&customPartial){
     items.unshift({base:term,symbol:term+'_USDT_PERP',manual:true});
   }
   const holder=$('customSymbolResults');holder.replaceChildren();
   if(!items.length){const notice=document.createElement('div');notice.className='custom-result-empty';notice.textContent=customLoaded?'沒有符合的 PERP 合約':'載入中…';holder.append(notice);return;}
   for(const item of items){const button=document.createElement('button');button.type='button';button.className='custom-result';button.disabled=existing.has(item.base);
     const left=document.createElement('span'),right=document.createElement('small');left.textContent=item.base;right.textContent=existing.has(item.base)?'已監控':item.manual?'候選 · 未驗證':'PERP';
     button.append(left,right);button.addEventListener('click',()=>addCustomSymbol(item.base));holder.append(button);
   }
 }
 function setupCustomSymbols(){
   let saved=[];try{const raw=JSON.parse(localStorage.getItem(CUSTOM_KEY)||'[]');if(Array.isArray(raw))saved=raw;}catch(_){/* invalid user cache */}
   for(const base of saved.slice(0,CUSTOM_MAX))makeCustomRecord(base);
   setupSideNav(['custom']);updateCustomPanel();
   // Fit the independent panel exactly below the final fixed stock row.
   const fitPanel=()=>{
     const stock=$('liq-stock-nav'),custom=$('liq-custom-nav');if(!stock||!custom)return;
     const rows=stock.querySelectorAll('.liq-nav-row');
     const y=(rows.length?rows[rows.length-1].getBoundingClientRect().bottom:stock.getBoundingClientRect().top+38)+7;
     custom.style.top=Math.max(40,Math.ceil(y))+'px';
   };
   fitPanel();window.addEventListener('resize',fitPanel,{passive:true});
   if('ResizeObserver' in window)new ResizeObserver(fitPanel).observe($('liq-stock-nav'));
   $('customAddSymbol').addEventListener('click',()=>{if(customIds().length>=CUSTOM_MAX)return;
     $('customSymbolModal').hidden=false;$('customSymbolQuery').value='';renderCustomResults();
     if(!customLoaded)loadCustomUniverse();else $('customSymbolHint').textContent='派網 PERP 清單 '+customUniverse.length+' 檔'+(customPartial?'（部分清單）':'')+'；最多新增 9 檔';
     $('customSymbolQuery').focus();});
   $('customManageSymbol').addEventListener('click',()=>{$('customManageModal').hidden=false;renderCustomManage();});
   $('customManageClose').addEventListener('click',closeCustomManage);
   $('customManageModal').addEventListener('click',ev=>{if(ev.target.matches('[data-manage-close]'))closeCustomManage();});
   $('customSymbolClose').addEventListener('click',closeCustomModal);
   $('customSymbolModal').addEventListener('click',ev=>{if(ev.target.matches('[data-custom-close]'))closeCustomModal();});
   $('customSymbolQuery').addEventListener('input',renderCustomResults);
   document.addEventListener('keydown',ev=>{if(ev.key==='Escape'){if(!$('customSymbolModal').hidden)closeCustomModal();if(!$('customManageModal').hidden)closeCustomManage();}});
 }

 // Taiwan's 08:00 daily reset is UTC 00:00. Never use the TV Scanner
 // open column as daily open: it can represent the current 4H bar instead.
 // If the daily feed has not loaded, the 00:00 UTC 4H bar is the only
 // safe fallback; a later 4H candle is not today's actual open.
 function navDayOpen(r,now=Date.now()){
   const start=Math.floor(now/DAY)*DAY;
   const currentDaily=(r.daily||[]).findLast(b=>b&&Number.isFinite(b.t)&&Math.floor(b.t/DAY)*DAY===start&&priceEnough(b.o));
   if(currentDaily)return currentDaily.o;
   const first4h=(r.bars4h||[]).find(b=>b&&b.t===start&&priceEnough(b.o));
   return first4h?first4h.o:null;
 }
 function updateNavPrices(){
   const now=Date.now();
   for(const r of records){
     const item=navButtons.get(r.id);if(!item)continue;
     const price=livePrice(r),open=navDayOpen(r,now);
     item.quote.textContent=priceEnough(price)?MONEY(price):'—';
     refreshRRLed(r);
     item.btn.classList.remove('is-up','is-down','is-flat');
     if(!priceEnough(price)||!priceEnough(open)){
       item.change.textContent='—';
       item.btn.title='跳至 '+r.id+' 的 4H K 線圖（日線開盤價尚未取得）';
       continue;
     }
     const dayPct=(price/open-1)*100;
     const sign=dayPct>0?'+':dayPct<0?'-':'';
     const abs=Math.abs(dayPct);
     item.change.textContent=sign+abs.toFixed(abs>0&&abs<.01?4:2)+'%';
     item.btn.classList.add(dayPct>0?'is-up':dayPct<0?'is-down':'is-flat');
     item.btn.title=r.id+' ｜ 日線開盤 '+MONEY(open)+' ｜ 現價 '+MONEY(price)+' ｜ '+item.change.textContent;
   }
 }
 function chooseSort(key,sector='crypto'){
   if(!['crypto','stock','custom'].includes(sector))sector='crypto';
   state.sectorSort[sector]=key;
   const sel=$(sector+'Sort');if(sel)sel.value=key;
   try{localStorage.setItem('liq-v140-sort-'+sector,key);}catch(_){/* no storage */}
   reorderSideNavByMarks();
 }
 let terminalBootFinished=false;
 // Startup progress counts VALID current-day daily indicators, never attempted requests.
 let startupComplete=false, startupBackgroundQueued=false;
 function dailyReady(r){
   if(!r.dailyAt||r.daily.length<40)return false;
   const days=dailyAsOf(r),today=Math.floor(Date.now()/DAY)*DAY;
   const currentOpenVerified=r.daily.some(b=>b.t===today)||r.bars4h.some(b=>b.t===today);
   return currentOpenVerified&&days.at(-1)?.t===today&&r.ha?.t===today&&!!r.cci&&!!r.sstate&&!!r.midline;
 }
 function updateTerminalProgress(){
   const total=records.length;
   const ready=records.filter(dailyReady).length;
   const attempted=records.filter(r=>r.lastAttempt?.day).length;
   const active=activeChartIds().length;
   const activeLoaded=activeChartIds().filter(id=>records.find(r=>r.id===id)?.bars4h.length>=21).length;
   const cgWaiting=!(state.cgInitialDone&&state.priceInitialDone);
   const importantQueued=state.queue.some(j=>j.kind==='day'||j.kind==='bar'||(j.kind==='h4'&&j.priority<=0));
   const importantRunning=state.activeJobs.some(j=>j.kind==='day'||j.kind==='bar'||(j.kind==='h4'&&j.priority<=0));
   const finished=state.startupActive&&!cgWaiting&&attempted===total&&!importantQueued&&!importantRunning;
   const meter=$('terminalProgressFill'),msg=$('terminalProgressText'),detail=$('terminalDetail');
   const container=$('terminalStatus');if(!meter||!msg||!detail||!container)return;
   if(finished)startupComplete=true;
   container.classList.toggle('is-ready',startupComplete);
   meter.parentElement.hidden=startupComplete;
   const boundCount=records.filter(r=>r.source==='coinglass'&&cgFresh()).length;
   const good=ready===total&&boundCount===total;
   const pct=total?Math.round(ready/total*100):0;
   if(startupComplete){
     const yellow=records.filter(r=>r.ha?.color==='黃'&&r.cci?.color==='黃').length;
     const purple=records.filter(r=>r.ha?.color==='紫'&&r.cci?.color==='紫').length;
     msg.textContent=good?'READY｜必要監控資料就緒':'PARTIAL｜部分日線資料不足';
     detail.textContent=`日線 ${ready}/${total} · 上下界 ${boundCount}/${total} · 圖表 ${activeLoaded}/${active} · 雙黃 ${yellow} · 雙紫 ${purple}`;
   }else{
     meter.style.width=pct+'%';meter.parentElement.setAttribute('aria-valuenow',String(pct));
     msg.textContent=`BOOT｜日線指標 ${pct}%`;
     detail.textContent=`有效日線 ${ready}/${total} · 已嘗試 ${attempted}/${total} · 圖表 ${activeLoaded}/${active}`;
   }
 }
 function renderOverview(){const coverage=records.filter(r=>r.source==='coinglass').length,stale=records.filter(r=>r.source==='coinglass'&&!cgFresh()).length,model=records.filter(r=>r.model).length,ha=records.filter(r=>r.ha).length,sstate=records.filter(r=>r.sstate).length,midline=records.filter(r=>r.midline).length,cci=records.filter(r=>r.cci?.color==='黃'||r.cci?.color==='紫').length,price=records.filter(r=>priceEnough(livePrice(r))).length;
   $('coverage').textContent=`${records.length} 標的｜現價 ${price}｜CoinGlass 7D ${coverage}${stale?'（過期 '+stale+'）':''}｜S狀態 ${sstate}｜中軌 ${midline}｜平均K ${ha}｜CCI-SMA ${cci}`;
   updateNavPrices();
   $('loadedCount').textContent=`監控 ${records.length}／${records.length}`;
   updateTerminalProgress();
   const s=$('liveStatus');s.className='status-pill '+(price===0?'waiting':'');s.textContent=price?'即時監控 · '+price+'/'+records.length:'等待行情';
 }
 function renderAll(){records.forEach(renderRow);reorder();renderOverview();window.LiqRadarCciCard?.refresh();}
 async function fetchCG(force=false){
   if(state.cgBusy)return state.cgBusy;
   // A cache restored during startup must not suppress an immediate fresh fetch.
   if(!force&&cgFresh()&&Date.now()-state.cgAt<50000)return;
   const task=(async()=>{
     const attemptedAt=Date.now();
     state.cgDiagnostics={...state.cgDiagnostics,at:attemptedAt,origin:'CoinGlassReader 7d 嘗試中'};
     try{
       if(!window.CoinGlassReader?.fetchCoinGlass)throw Error('CoinGlass 解碼器尚未載入（請檢查外部 script 請求）');
       const raw=await window.CoinGlassReader.fetchCoinGlass('7d');
       const decoded=extractCG(raw.data),matched=matchedCG(decoded),sample=[...decoded.keys()].slice(0,10);
       state.cgDiagnostics={at:attemptedAt,origin:'CoinGlassReader 7d 已解密',version:String(raw.version??'?'),decoded:decoded.size,matched,sample};
       if(!decoded.size)throw Error('解密成功但解析不到有效上下界；可能是回應欄位格式變動');
       if(!matched)throw Error(`解析出 ${decoded.size} 個鍵，但 0/${records.length} 能對應清單，樣本 ${sample.join(',')}`);
       state.cgRecords=decoded;state.cgAt=Date.now();state.cgVersion=String(raw.version||'?');state.cgError='';
       state.cgDiagnostics.origin='CoinGlassReader 7d 即時抓取';
       rememberCG(decoded,state.cgVersion);
       log(`CoinGlass 7D V${state.cgVersion} 成功：解析 ${decoded.size} 個鍵，清單對應 ${matched}/${records.length}`);
     }catch(e){
       state.cgError=String(e?.message||e);
       state.cgDiagnostics={...state.cgDiagnostics,at:attemptedAt,origin:state.cgDiagnostics?.origin==='CoinGlassReader 7d 嘗試中'?'CoinGlassReader 抓取／解密失敗':state.cgDiagnostics?.origin||'CoinGlassReader 失敗'};
       log('CoinGlass 7D 無法更新（絕不切換代理）：'+state.cgError);
     }finally{
       records.forEach(updateDerived);renderAll();state.cgBusy=null;
       state.cgInitialDone=true;queueMissingProxies();updateTerminalProgress();
     }
   })();state.cgBusy=task;return task;
 }
 // Quote layer: WS writes immediately; UI/RR batch at 300ms; 1D indicators at 3s.
 const wsDirty=new Set(),wsDerived=new Set();let wsFlushTimer=null,wsDerivedTimer=null;
 function updateLiveBar(r,price,receivedAt,tickHigh=price,tickLow=price){
   const day=Math.floor(receivedAt/DAY)*DAY, h4Start=Math.floor(receivedAt/(4*H))*(4*H);
   // Never manufacture a day's open from the first websocket tick.
   const daily=(r.daily||[]).findLast(b=>b.t===day&&priceEnough(b.o));
   const first4h=(r.bars4h||[]).find(b=>b.t===day&&priceEnough(b.o));
   const todayOpen=daily?.o??first4h?.o;
   const old=r.liveOHLC?.day===day?r.liveOHLC:null;
   if(priceEnough(todayOpen)){
     r.liveOHLC={day,o:todayOpen,h:Math.max(tickHigh,price,old?.h||price,todayOpen),
       l:Math.min(tickLow,price,old?.l||price,todayOpen),c:price};
   }else r.liveOHLC=null;
   const original=(r.bars4h||[]).findLast(b=>b.t===h4Start);
   if(original){const prior=r.live4h?.t===h4Start?r.live4h:null;
     r.live4h={t:h4Start,o:original.o,h:Math.max(original.h,tickHigh,price,prior?.h||price),
       l:Math.min(original.l,tickLow,price,prior?.l||price),c:price};
   }else r.live4h=null;
 }
 function quoteUI(r){
   if(r.dom){r.dom.px.textContent=priceEnough(livePrice(r))?MONEY(r.price):(r.priceAt?'現價過期 --':'現價 --');refreshRRLed(r);}
   // Keep the chart NOW badge/line in lockstep with the side list, without a full SVG redraw.
   window.LIQ_WORKSPACE?.refreshPrice?.(r.id);
   const item=navButtons.get(r.id);if(item){
     const price=livePrice(r),open=navDayOpen(r);
     item.quote.textContent=priceEnough(price)?MONEY(price):'—';
     item.btn.classList.remove('is-up','is-down','is-flat');
     if(priceEnough(price)&&priceEnough(open)){
       const diff=(price/open-1)*100,sign=diff>0?'+':diff<0?'-':'';
       item.change.textContent=sign+Math.abs(diff).toFixed(Math.abs(diff)>0&&Math.abs(diff)<.01?4:2)+'%';
       item.btn.classList.add(diff>0?'is-up':diff<0?'is-down':'is-flat');
       item.btn.title=r.id+' ｜ 日線開盤 '+MONEY(open)+' ｜ 現價 '+MONEY(price)+' ｜ '+item.change.textContent;
     }else{item.change.textContent='—';}
   }
 }
 function scheduleWsUI(r){wsDirty.add(r);wsDerived.add(r);
   if(!wsFlushTimer)wsFlushTimer=setTimeout(()=>{wsFlushTimer=null;
     for(const row of wsDirty)quoteUI(row);wsDirty.clear();
     state.priceAt=Date.now();
   },300);
   if(!wsDerivedTimer)wsDerivedTimer=setTimeout(()=>{wsDerivedTimer=null;
     let did=false;for(const row of wsDerived){if(!records.includes(row))continue;
       updateDerived(row);renderRow(row);did=true;
     }wsDerived.clear();if(did){reorder();renderOverview();window.LiqRadarCciCard?.refresh();}
   },3000);
 }
 function applyWsQuote(q){const rec=records.find(r=>r.s.pionex===q.symbol);
   if(!rec||!priceEnough(q.price))return;
   // Ignore out-of-order batches and prices older than a newer fallback observation.
   if(q.tradeAt<Number(rec.priceEventAt||0))return;
   rec.price=q.price;rec.priceAt=q.receivedAt;rec.priceEventAt=q.tradeAt;
   rec.priceFeed='Pionex WebSocket';updateLiveBar(rec,q.price,q.receivedAt,q.high,q.low);
   scheduleWsUI(rec);
 }
 const wsFresh=r=>r.priceFeed==='Pionex WebSocket'&&r.priceAt&&Date.now()-r.priceAt<45000;
 // REST is the first fallback. Scanner is consulted only for PERPs still lacking data.
 async function fetchPrices(){if(state.priceBusy)return state.priceBusy;
   const task=(async()=>{
     const candidates=records.filter(r=>!wsFresh(r));
     if(!candidates.length){state.priceInitialDone=true;updateTerminalProgress();return;}
     const found=new Set(),changed=new Set(),requestedAt=Date.now();
     function fallback(r,price,eventAt,source,ohlc){
       if(!priceEnough(price)||wsFresh(r))return false;
       const stamped=Number.isFinite(eventAt)&&eventAt>0?eventAt:requestedAt;
       if(r.priceAt&&r.priceEventAt&&stamped<r.priceEventAt)return false;
       r.price=price;r.priceAt=Date.now();r.priceEventAt=stamped;r.priceFeed=source;
       // A REST-only quote cannot replace valid current-day high/low with yesterday's values.
       if(ohlc&&ohlc.day===Math.floor(Date.now()/DAY)*DAY)r.liveOHLC=ohlc;
       changed.add(r);found.add(r.id);return true;
     }
     try{
       const j=await json(WORKER+'/api/monitor/tickers?type=PERP',{},11000);
       const byP=new Map((j.tickers||[]).map(x=>[String(x.symbol).toUpperCase(),x]));
       for(const r of candidates){const t=byP.get(r.s.pionex.toUpperCase());if(!t)continue;
         const stamp=Number(t.time);fallback(r,Number(t.price),stamp>0?(stamp<1e12?stamp*1000:stamp):Date.parse(j.fetched_at), 'Pionex Worker');
       }
     }catch(e){log('Pionex Worker ticker: '+e.message);}
     const missing=candidates.filter(r=>!found.has(r.id)&&!wsFresh(r));
     for(let i=0;i<missing.length;i+=70){const group=missing.slice(i,i+70);
       try{const tickers=[...new Set(group.map(r=>r.s.tv.toUpperCase()))];
         const payload={filter:[],options:{lang:'en'},symbols:{query:{types:[]},tickers},columns:['close','open','high','low'],range:[0,Math.max(80,tickers.length+10)]};
         const j=await json(SCANNER,{method:'POST',mode:'cors',headers:{Accept:'application/json','Content-Type':'text/plain'},body:JSON.stringify(payload)},11000);
         const byTv=new Map((j.data||[]).map(x=>[String(x.s).toUpperCase(),x.d]));
         for(const r of group){const d=byTv.get(r.s.tv.toUpperCase()),price=Number(d?.[0]);
           const o=Number(d?.[1]),h=Number(d?.[2]),l=Number(d?.[3]);
           // Scanner open may be 4H; never invent a daily open from this field.
           fallback(r,price,Date.now(),'TradingView Scanner');
         }
       }catch(e){log('TV Scanner fallback: '+e.message);}
     }
     for(const r of changed){updateDerived(r);renderRow(r);}if(changed.size){reorder();renderOverview();}
     state.priceAt=Date.now();state.priceInitialDone=true;queueMissingProxies();updateTerminalProgress();
     if(changed.size)log('備援報價 '+changed.size+'/'+candidates.length+'（優先 REST）');
   })();state.priceBusy=task;try{return await task;}finally{state.priceBusy=null;}
 }
 const MAX_WORKERS=3,TTLS={bar:4*60_000,h4:4*60_000,day:12*60_000};
 // Chart preferences are restored without constructing or painting every chart.
 function activeChartIds(){
   let stored=null;
   try{stored=JSON.parse(localStorage.getItem('SStateLiquidityRadar.workspace.v1.5')||'null');}catch(_){/* first load */}
   if(stored&&Array.isArray(stored.windows)){
     return [...new Set(stored.windows.filter(w=>w&&!w.minimized).slice(0,4).map(w=>w.symbol))]
       .filter(id=>records.some(r=>r.id===id));
   }
   // Legacy first boot creates the BTC/last-selected window.
   return state.selected?[state.selected]:[];
 }
 // Strict CoinGlass-only policy: never queue 15M proxy history.
 function queueMissingProxies(){/* disabled by v2.1.15 */}
 function enqueue(r,kind,force=false,priority=8){
   if(!r||!records.includes(r)||kind==='bar')return;
   const key=r.id+':'+kind,attempt=r.lastAttempt[kind]||0;
   const have=kind==='bar'?r.bars15.length:kind==='h4'?r.bars4h.length:r.daily.length;
   if(state.jobSet.has(key)){
     const queued=state.queue.find(j=>j.key===key);
     if(queued&&priority<queued.priority){queued.priority=priority;state.queue.sort((a,b)=>a.priority-b.priority||a.seq-b.seq);}
     return;
   }
   if(!force&&attempt&&Date.now()-attempt<TTLS[kind])return;
   state.jobSet.add(key);state.queue.push({r,kind,key,priority,seq:++state.jobSeq});
   state.queue.sort((a,b)=>a.priority-b.priority||a.seq-b.seq);
   if(!state.batchEnqueue)pump();
 }
 function mergeHistory(cached,latest,kind){
   const by=new Map((cached||[]).map(b=>[b.t,b]));
   for(const b of latest)by.set(b.t,b);
   const max=kind==='day'?95:kind==='h4'?300:530;
   return [...by.values()].sort((a,b)=>a.t-b.t).slice(-max);
 }
 async function pump(){
   while(state.loadingJobs<MAX_WORKERS&&state.queue.length){
     const job=state.queue.shift();
     if(!records.includes(job.r)){state.jobSet.delete(job.key);continue;}
     state.loadingJobs++;state.activeJobs.push(job);
     const {r,kind}=job;r.lastAttempt[kind]=Date.now();
     void(async()=>{try{
       const interval=kind==='bar'?'15M':kind==='h4'?'4H':'1D';
       const count=kind==='bar'?530:kind==='h4'?130:95;
       const cache=window.LiqHistoryCache;
       const cached=!state.startupActive||startupComplete?null:await cache?.read(r.s.pionex,interval);
       // Cached closed history is merged only after a fresh overlapping tail
       // is verified; never publish unverified startup signals to the radar.
       const usable=!!cached?.bars?.length&&cached.bars.length>=(kind==='day'?60:kind==='bar'?300:80);
       const recent=usable&&Date.now()-cached.bars.at(-1).t<(kind==='day'?3*DAY:kind==='bar'?3*MS:3*H);
       const fetchCount=recent?kind==='day'?16:kind==='bar'?120:36:count;
       let received=await loadHistory(r.s,interval,fetchCount);
       let merged=recent?mergeHistory(cached.bars,received.bars,kind):received.bars;
       // A provider may revise completed historical OHLC; never silently mix
       // materially conflicting source data with our cached history.
       if(recent){
         const matches=new Map(cached.bars.map(b=>[b.t,b]));
         const overlap=received.bars.filter(b=>matches.has(b.t));
         const incompatible=overlap.length<2||overlap.some(b=>{
           const old=matches.get(b.t);
           return ['o','h','l','c'].some(k=>Math.abs(b[k]-old[k])>Math.max(1e-9,Math.abs(old[k])*.00001));
         });
         if(incompatible){received=await loadHistory(r.s,interval,count);merged=received.bars;}
       }
       if(kind==='bar'){r.bars15=merged;r.barsAt=Date.now();r.errors.bar='';}
       else if(kind==='h4'){
         if(r.bars4h.length>merged.length){const m=new Map([...r.bars4h,...merged].map(b=>[b.t,b]));merged=[...m.values()].sort((a,b)=>a.t-b.t).slice(-300);}
         r.bars4h=merged;r.h4At=Date.now();r.h4Feed=received.feed;r.errors.h4='';} 
       else{r.daily=merged;r.dailyAt=Date.now();r.errors.day='';}
       if(received.warning)log(`${r.id} ${interval}: ${received.warning}`);
       // Persist immutable closed candles only; never persist today's evolving K.
       if(cache)void cache.write(r.s.pionex,interval,merged,received.provider);
       updateDerived(r);renderRow(r);reorder();renderOverview();
       if(kind==='day'&&!r.daily.some(b=>b.t===Math.floor(Date.now()/DAY)*DAY)&&!r.bars4h.some(b=>b.t===Math.floor(Date.now()/DAY)*DAY))
         enqueue(r,'h4',false,0); // a scanner quote alone cannot certify today's daily open
     }catch(e){r.errors[kind]=String(e?.message||e);log(`${r.id} ${kind}: ${e?.message||e}`);renderRow(r);}
     finally{
       state.loadingJobs--;state.activeJobs=state.activeJobs.filter(x=>x!==job);
       state.jobSet.delete(job.key);updateTerminalProgress();
       if(state.startupActive&&!startupBackgroundQueued&&
          records.every(row=>!!row.lastAttempt.day)&&
          !state.queue.some(j=>j.kind==='day')&&!state.activeJobs.some(j=>j.kind==='day')){
         startupBackgroundQueued=true;
         setTimeout(()=>{for(const row of records)enqueue(row,'h4',false,20);},3000);
       }
       pump();
     }
     })();
   }
 }
 function queueStartup(){
   state.batchEnqueue=true;state.startupActive=true;
   const important=activeChartIds();
   // One selected 4h chart can start early; daily OHLC jobs take precedence over
   // the remaining background 4h history.
   for(const id of important){const r=records.find(x=>x.id===id);if(r)enqueue(r,'h4',false,-5);}
   for(const r of records)enqueue(r,'day',false,0);
   state.batchEnqueue=false;pump();updateTerminalProgress();
 }
 // Maintenance keeps v1.8.5's existing 4h/1d refresh cadence unchanged.
 function queueAll(force=false){
   state.batchEnqueue=true;
   for(const r of records)enqueue(r,'h4',force,5);
   for(const r of records)enqueue(r,'day',force,5);
   state.batchEnqueue=false;
   queueMissingProxies();pump();updateTerminalProgress();
 }
 const extra4h=new Map();
 let deepHistoryQueue=Promise.resolve(),lastDeepFetch=0;
 async function loadExtra4H(id){
   const r=records.find(x=>x.id===id);if(!r)return false;
   if(r.bars4h.length>=295)return true;
   if(extra4h.has(id))return extra4h.get(id);
   if(r.extra4hAttempt&&Date.now()-r.extra4hAttempt<30000)return false;
   r.extra4hAttempt=Date.now();
   const job=(async()=>{try{
     // Extended 300-bar history is requested ONLY after actual user exploration.
     // One deep-history request at a time across four windows, with conservative
     // pacing. The interactive drawing layer never floods Pionex on wheel input.
     const process=async()=>{
       const pause=Math.max(0,2000-(Date.now()-lastDeepFetch));
       if(pause)await new Promise(resolve=>setTimeout(resolve,pause));
       lastDeepFetch=Date.now();return loadHistory(r.s,'4H',300);
     };
     const queued=deepHistoryQueue.then(process,process);
     deepHistoryQueue=queued.then(()=>{},()=>{});
     const response=await queued;
     const combined=new Map([...r.bars4h,...response.bars].map(b=>[b.t,b]));
     r.bars4h=[...combined.values()].sort((a,b)=>a.t-b.t).slice(-300);
     r.h4At=Date.now();r.h4Feed=response.feed;
     if(window.LiqHistoryCache)void window.LiqHistoryCache.write(r.s.pionex,'4H',r.bars4h,response.provider||response.feed);
     updateDerived(r);renderRow(r);renderOverview();return true;
   }catch(e){log(id+' 延伸 4H 歷史失敗：'+e.message);return false;}
   finally{extra4h.delete(id);}})();extra4h.set(id,job);return job;
 }
 function updateClock(){$('clock').textContent='台灣時間 '+tpe(Date.now());}
 function setup(){
   const counts={crypto:records.filter(r=>r.s.group==='crypto').length,stock:records.filter(r=>r.s.group==='stock').length};
   $('cryptoCount').textContent=counts.crypto;$('stockCount').textContent=counts.stock;$('allCount').textContent=records.length;
   records.forEach(makeRow);
   for(const group of ['crypto','stock']){
     const key=(()=>{try{return localStorage.getItem('liq-v140-sort-'+group);}catch(_){return null;}})();
     if(key&&[...$(group+'Sort').options].some(option=>option.value===key))state.sectorSort[group]=key;
     $(group+'Sort').value=state.sectorSort[group];
     $(group+'Sort').addEventListener('change',e=>chooseSort(e.target.value,group));
   }
   const saved=(()=>{try{return localStorage.getItem('liq-v140-active-symbol');}catch(_){return null;}})();
   state.selected=records.some(r=>r.id===saved)?saved:records[0]?.id||'';
   setupSideNav();setupCustomSymbols();setNavActive(state.selected);
   window.LiqRadarCciCard?.init({getDaily(symbol){const r=records.find(row=>row.id===symbol);return r?dailyAsOf(r):[];}});
   document.addEventListener('liq-radar-marks-updated',reorderSideNavByMarks);

   $('diagToggle').addEventListener('click',()=>{const d=$('diagHolder');d.hidden=!d.hidden;$('diagToggle').setAttribute('aria-expanded',String(!d.hidden));if(!d.hidden)renderDiag();});
   restoreCG();records.forEach(updateDerived);renderAll();updateClock();
   if(records.length){
     window.LIQ_PRICE_STREAM?.start({symbols:records.map(r=>r.s),onQuote:applyWsQuote,
       onState:s=>{state.diagDirty=true;if($('diagPanel')?.open)renderDiag();}});
     fetchCG();fetchPrices();queueStartup();
   }
   else log('自選清單為空，請編輯 symbols.js');
   setInterval(updateClock,1000);
   setInterval(()=>{if(!document.hidden||window.LIQ_BROWSER_NOTIFICATIONS?.isMonitoring?.())fetchPrices();},10000);
   setInterval(()=>{if(!document.hidden||window.LIQ_BROWSER_NOTIFICATIONS?.isMonitoring?.())fetchCG();},60000);
   setInterval(()=>{if(!document.hidden||window.LIQ_BROWSER_NOTIFICATIONS?.isMonitoring?.())queueAll();},60000);
   document.addEventListener('visibilitychange',()=>{if(!document.hidden){window.LIQ_PRICE_STREAM?.check(true);fetchPrices();fetchCG();queueAll();}});
   window.LIQ_RADAR_ALERT_CONTEXT={records,getCurrentPrice(symbol){const r=records.find(row=>String(row.s.pionex).toUpperCase()===String(symbol).toUpperCase());return r?livePrice(r):null;}};
   // The alerts module may have executed while remote workspace state was loading.
   // Signal readiness after publishing the complete live records context.
   window.dispatchEvent(new Event('liq-radar-alert-context-ready'));
   window.LIQ_CHART_API={getData:chartPayload,getPrice:chartPricePayload,hasSymbol:id=>records.some(r=>r.id===id),updateActiveSelection,loadExtra4H};
   window.LIQ_TEST={version:'2.1.16',records,state,queueStartup,queueMissingProxies,dailyReady,activeChartIds,extractCG,resolveCG,fetchCG,rrSnapshot,restoreCG,matchedCG,dailyAsOf,dailyHA,classifyHaSemanticDot,dailyCciSma,dailySState,renderRow,renderAll,renderActiveChart,jumpToSymbol,updateDerived,calcModel,enqueue,log,renderDiag,reorder,chooseSort,sortValue};
 }
 (window.LIQ_SHARED_STATE?.ready||Promise.resolve()).then(setup).catch(e=>console.error('[Radar setup]',e));
})();
