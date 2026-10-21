/**
 * MultiAssetLiquidityRadar read-only MCP adapters.
 * Exact CoinGlass 7D fields and 15m proxy bucket/weights from ../MultiAssetLiquidityRadar/app.js.
 * Official CoinGlass 7D is always distinguished from estimated 15m leverage price zones.
 * No model probabilities; no fabricated OI/liquidation amounts.
 */
import {fetchCoinGlass} from './coinglass-reader.mjs';

const BASE='https://white-meadow-16bc.youjianchonglangshou.workers.dev';
const CMC='https://cmc-fear-greed.youjianchonglangshou.workers.dev';
const CMC_PUBLIC='https://pro-api.coinmarketcap.com/public-api/v3/fear-and-greed';
const SCANNER='https://scanner.tradingview.com/crypto/scan';
const H=3600000,MS=900000;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const positive=x=>Number.isFinite(x)&&x>0;
const n=x=>{let y=typeof x==='string'?x.replaceAll(',','').replaceAll('$',''):x;const v=Number(y);return positive(v)?v:null};
const iso=t=>new Date(t).toISOString();
async function json(url,options={},timeout=10000){
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),timeout);
 try{
  const r=await fetch(url,{...options,signal:ctrl.signal,headers:{accept:'application/json',...(options.headers||{})}});
  if(!r.ok)throw Error('HTTP '+r.status+' '+new URL(url).hostname);
  const p=await r.json();
  if(p?.ok===false||p?.result===false)throw Error(String(p.error||p.message||'provider rejected'));
  return p;
 }finally{clearTimeout(timer)}
}
export function normalizeSymbol(input){
 let s=String(input||'').trim().toUpperCase().replace(/^PIONEX:/,'');
 s=s.replace(/USDT\.P$/,'').replace(/_USDT_PERP$|_USDT$|_PERP$|\/USDT$/,'');
 if(!/^[A-Z0-9]{1,22}$/.test(s))throw Error('invalid coin ticker; use e.g. BTC, ETH, PEPE, ATOM');
 return s;
}
export function extractCoinGlass(data){
 const records=new Map(),seen=new WeakSet();
 const keys=['symbol','coin','currency','baseCoin','baseAsset'];
 function walk(obj,d){
  if(!obj||typeof obj!=='object'||d>9||seen.has(obj))return;
  seen.add(obj);
  if(!Array.isArray(obj)){
   const symbol=String(keys.map(k=>obj[k]).find(x=>typeof x==='string'&&x.trim())||'').toUpperCase().replace(/[\s/_-]/g,'');
   const upper=n(obj.maxLongLiquidationPrice??obj.short_max_pain_liq_price??obj.shortMaxPainLiqPrice);
   const lower=n(obj.maxShortLiquidationPrice??obj.long_max_pain_liq_price??obj.longMaxPainLiqPrice);
   if(symbol&&upper&&lower&&upper>lower)records.set(symbol,{
    upper,lower,upAmount:n(obj.maxLongLiquidationLevel??obj.short_max_pain_liq_level??obj.shortMaxPainLiqLevel),
    downAmount:n(obj.maxShortLiquidationLevel??obj.long_max_pain_liq_level??obj.longMaxPainLiqLevel),
    referencePrice:n(obj.price),source_symbol:symbol});
  }
  for(const v of Object.values(obj))if(v&&typeof v==='object')walk(v,d+1);
 }
 walk(data,0);return records;
}
export function resolveCoinGlass(symbol,records){
 const s=normalizeSymbol(symbol);
 const overrides={CL:['CL'],WTI:['CL'],MUX:['MU'],XAU:['XAU'],PEPE:['1000PEPE'],TSLAX:['TSLA'],INTCX:['INTC'],MSTRX:['MSTR'],NVDAX:['NVDA'],CRCLX:['CRCL'],COINX:['COIN'],HOODX:['HOOD'],MRVLX:['MRVL']};
 const aliases=[...new Set([...(overrides[s]||[]),s,'1000'+s])];
 for(const alias of aliases){
  const row=records.get(alias);if(!row)continue;
  let factor=1;
  const lot=alias.match(/^(\d+)([A-Z].*)$/);
  if(lot&&lot[2]===s&&Number(lot[1])>1)factor=Number(lot[1]);
  return {...row,upper:row.upper/factor,lower:row.lower/factor,referencePrice:row.referencePrice?row.referencePrice/factor:null,source_symbol:alias,unit_factor:factor};
 }
 return null;
}
export function candidateZones(bars,price){
 const result={upper:[],lower:[]};if(!positive(price)||!bars?.length)return result;
 const buckets={upper:new Map(),lower:new Map()},minStep=price*.0018;
 const last=bars.at(-1).t,validV=bars.filter(b=>Number.isFinite(b.v)&&b.v>0).map(b=>b.v).sort((a,b)=>a-b);
 const med=validV.length>bars.length*.55?validV[Math.floor(validV.length/2)]:0;
 const levs=[[25,.28],[50,.34],[75,.24],[100,.14]];
 for(const b of bars.slice(-288)){
  const age=(last-b.t)/H,timeWeight=Math.exp(-age/48),volWeight=med?clamp((b.v||0)/med,.25,3):1,entry=(b.h+b.l+b.c)/3;
  if(!(entry>0))continue;
  for(const [lev,w] of levs){
   const base=timeWeight*volWeight*w;
   for(const [dir,target] of [['upper',entry*(1+1/lev-.004)],['lower',entry*(1-1/lev+.004)]]){
    const gap=Math.abs(target/price-1);
    if((dir==='upper'&&target<=price)||(dir==='lower'&&target>=price)||gap<.001||gap>.06)continue;
    const k=Math.round(target/minStep),map=buckets[dir];map.set(k,(map.get(k)||0)+base);
   }
  }
 }
 for(const dir of ['upper','lower']){
  const m=buckets[dir],arr=[];
  for(const [i,v] of m){
   const total=v+.20*(m.get(i-1)||0)+.20*(m.get(i+1)||0),p=i*minStep,dist=Math.abs(p/price-1);
   if(dist>.001&&total>.001)arr.push({price:p,strength:total,distance:dist,score:total/(.5+Math.sqrt(dist*100)),width:minStep});
  }
  arr.sort((a,b)=>b.score-a.score);
  const used=[];for(const item of arr){if(used.every(z=>Math.abs(z.price-item.price)>minStep*2.5)){used.push(item);if(used.length===3)break;}}
  const max=Math.max(1e-9,...used.map(z=>z.strength));
  result[dir]=used.map((x,i)=>({...x,power:Math.round(100*x.strength/max),tier:i+1}));
 }
 return result;
}
function normalizeBars(rows){
 const m=new Map();
 for(const x of rows||[]){
  let t=Number(x.t??x.time??x.ts);
  if(t>0&&t<1e12)t*=1000;
  const o=Number(x.o??x.open),h=Number(x.h??x.high),l=Number(x.l??x.low),c=Number(x.c??x.close),v=Number(x.v??x.volume)||0;
  if(!positive(t)||![o,h,l,c].every(positive)||h<l||h<o||h<c||l>o||l>c)continue;
  m.set(t,{t,o,h,l,c,v});
 }
 return [...m.values()].sort((a,b)=>a.t-b.t).slice(-500);
}
function arrayBars(rows){
 return (rows||[]).map(x=>Array.isArray(x)?{t:x[0],o:x[1],h:x[2],l:x[3],c:x[4],v:x[5]}:x);
}
async function priceOf(base){
 const ticker=base==='WTI'||base==='CL'?'CLUSDT.P':base+'USDT.P';
 const body={filter:[],options:{lang:'en'},symbols:{query:{types:[]},tickers:['PIONEX:'+ticker]},columns:['name','close','open','high','low'],range:[0,5]};
 const p=await json(SCANNER,{method:'POST',body:JSON.stringify(body),headers:{'content-type':'application/json'}},8500);
 const row=(p.data||[]).find(x=>String(x.s||'').includes(ticker));
 const price=n(row?.d?.[1]);if(!price)throw Error('no valid current quote');
 return {price,source:'TRADINGVIEW_PIONEX_SCAN',fetched_at:iso(Date.now())};
}
async function load15m(base,origin){
 const b=base==='WTI'||base==='CL'?'WTI':base;
 const pair=b+'USDT';
 const attempts=[
  {name:'SSTATE_PIONEX_WORKER',url:origin+'/api/monitor/klines?symbol='+pair+'_PERP&interval=15M&limit=500',
   parse:p=>arrayBars(p?.klines||p?.data?.klines)},
  {name:'PIONEX_OFFICIAL_15M',url:'https://api.pionex.com/api/v1/market/klines?symbol='+pair+'_PERP&interval=15M&limit=500',
   parse:p=>p?.result===true?arrayBars(p?.data?.klines):null},
  {name:'OKX_SWAP_15M_PROXY',url:'https://www.okx.com/api/v5/market/candles?instId='+b+'-USDT-SWAP&bar=15m&limit=300',
   parse:p=>p?.code==='0'?arrayBars(p?.data):null},
  {name:'BINANCE_FUTURES_15M_PROXY',url:'https://fapi.binance.com/fapi/v1/klines?symbol='+pair+'&interval=15m&limit=500',parse:arrayBars},
  {name:'BYBIT_PERP_15M_PROXY',url:'https://api.bybit.com/v5/market/kline?category=linear&symbol='+pair+'&interval=15&limit=500',
   parse:p=>p?.retCode===0?arrayBars(p?.result?.list):null},
  {name:'GATE_USDT_SPOT_15M_PROXY',url:'https://api.gateio.ws/api/v4/spot/candlesticks?currency_pair='+b+'_USDT&interval=15m&limit=500',
   parse:p=>Array.isArray(p)?p.map(x=>({t:x[0],o:x[5],h:x[3],l:x[4],c:x[2],v:x[6]??x[1]})):null},
  {name:'CRYPTOCOMPARE_SPOT_15M_PROXY',url:'https://min-api.cryptocompare.com/data/v2/histominute?fsym='+b+'&tsym=USDT&aggregate=15&limit=499',
   parse:p=>p?.Response!=='Error'?Array.isArray(p?.Data?.Data)?p.Data.Data.map(x=>({t:x.time*1000,o:x.open,h:x.high,l:x.low,c:x.close,v:x.volumefrom})):null:null},
  {name:'COINBASE_USD_SPOT_15M_PROXY',url:'https://api.exchange.coinbase.com/products/'+b+'-USD/candles?granularity=900',
   parse:p=>Array.isArray(p)?p.map(x=>({t:x[0]*1000,o:x[3],h:x[2],l:x[1],c:x[4],v:x[5]})):null}
 ];
 const outcomes=await Promise.allSettled(attempts.map(async provider=>{
  const p=await json(provider.url,{},9000);
  const bars=normalizeBars(provider.parse(p));
  if(bars.length<50)throw Error('insufficient valid 15m candles: '+bars.length);
  if(bars.at(-1).t<Date.now()-2*86400000)throw Error('15m series stale');
  return {bars,source:provider.name,market_basis:provider.name.includes('PROXY')?'CROSS_EXCHANGE_PROXY':'PIONEX_PERP',fetched_at:iso(Date.now())};
 }));
 const first=outcomes.find(x=>x.status==='fulfilled');
 if(first)return first.value;
 throw Error(outcomes.map((x,i)=>attempts[i].name+':'+String(x.reason?.message||'unavailable')).join(' | '));
}
function relative(bounds,price){
 return {upper_pct:positive(price)?(bounds.upper/price-1)*100:null,lower_pct:positive(price)?(bounds.lower/price-1)*100:null};
}
export async function getLiquidityBounds(symbol,{coinglass=fetchCoinGlass,priceReader=priceOf,barsReader=load15m,upstream=BASE,allowProxy=true}={}){
 const ticker=normalizeSymbol(symbol),errors=[],queried_at=iso(Date.now());
 let quote=null;try{quote=await priceReader(ticker)}catch(e){errors.push('QUOTE:'+String(e.message||e))}
 let cg=null,cg_version=null;
 try{
  const raw=await coinglass('7d');cg_version=raw.version??null;
  cg=resolveCoinGlass(ticker,extractCoinGlass(raw.data));
  if(!cg)errors.push('COINGLASS: no verified 7D bounds for '+ticker);
  else if(quote?.price&&!(cg.upper>quote.price&&cg.lower<quote.price)){
   errors.push('COINGLASS: official bounds do not straddle latest price');cg=null;
  }
 }catch(e){errors.push('COINGLASS:'+String(e.message||e))}
 if(cg){
  return {available:true,symbol:ticker,range:'7d',kind:'max_pain_liquidation_bands',source:'COINGLASS_7D',is_estimate:false,
   source_symbol:cg.source_symbol,unit_factor:cg.unit_factor,upper:cg.upper,lower:cg.lower,
   upper_liquidation_amount:cg.upAmount,lower_liquidation_amount:cg.downAmount,
   current_price:quote?.price??null,quote_source:quote?.source??null,quote_fetched_at:quote?.fetched_at??null,
   ...relative(cg,quote?.price),reference_price:cg.referencePrice,
   retrieved_at:queried_at,coinglass_version:cg_version,price_straddle_verified:!!quote?.price,warnings:errors,
   note:'Official CoinGlass 7D maximum-pain liquidation price levels, not probability of reaching them.'};
 }
 if(!allowProxy)return {available:false,symbol:ticker,range:'7d',source:'NONE',retrieved_at:queried_at,reasons:errors};
 try{
  const history=await barsReader(ticker,upstream);
  const isCross=history.market_basis==='CROSS_EXCHANGE_PROXY';
  const price=positive(quote?.price)&&!isCross?quote.price:history.bars.at(-1).c;
  const zones=candidateZones(history.bars,price);
  if(!zones.upper.length||!zones.lower.length)throw Error('15m history contains no qualified two-sided zones');
  const upper=zones.upper[0].price,lower=zones.lower[0].price;
  return {available:true,symbol:ticker,range:'15m_weighted_proxy',kind:'estimated_leverage_price_zones',
   source:history.source,is_estimate:true,upper,lower,upper_liquidation_amount:null,lower_liquidation_amount:null,
   upper_zones:zones.upper,lower_zones:zones.lower,confidence:'UNVALIDATED_ESTIMATE',
   current_price:quote?.price??null,quote_source:quote?.source??null,quote_fetched_at:quote?.fetched_at??null,
   proxy_reference_price:price,proxy_market_basis:history.market_basis,proxy_kline_fetched_at:history.fetched_at,
   ...relative({upper,lower},quote?.price||price),retrieved_at:queried_at,warnings:errors,
   note:'NOT CoinGlass 7D. Inferred from 15m OHLC, synthetic leverages 25/50/75/100x. No actual liquidation orders or OI. Cross-exchange prices may differ. Do not treat strength score as probability.'};
 }catch(e){
  return {available:false,symbol:ticker,range:'7d_or_proxy',source:'NONE',retrieved_at:queried_at,reasons:[...errors,'PROXY:'+String(e.message||e)],note:'No verifiable bands; no prices fabricated.'};
 }
}
const categories=['極度恐懼','恐懼','中性','貪婪','極度貪婪'];
export const emotion=v=>categories[v<20?0:v<40?1:v<60?2:v<80?3:4];
export function classifyCMC(points){
 let result=[],mode=null,origin=null;
 for(let i=0;i<points.length;i++){
  const v=points[i].value;
  if(v<20){result.push('red');origin='below';mode=null}
  else if(v>=40){result.push(v<60?'yellow':v<80?'lime':'green');origin='above';mode=null}
  else{
   if(mode===null)mode=origin==='above'?'purple':origin==='below'?'orange':(i>0&&v<points[i-1].value?'purple':'orange');
   result.push(mode);
  }
 }
 return result;
}
function parseTime(v){
 if(v==null)return null;
 if(typeof v==='number'||/^\d+$/.test(String(v))){
  const t=Number(v);return t<1e12?t*1000:t;
 }
 return Date.parse(String(v));
}
function parsePoint(p){
 const v=Number(p?.value),t=parseTime(p?.timestamp??p?.update_time??p?.time??p?.date);
 return Number.isFinite(v)&&v>=0&&v<=100&&Number.isFinite(t)&&t>0?{t,value:v}:null;
}
const utcDay=t=>new Date(t).toISOString().slice(0,10);
const twDay=t=>new Date(t).toLocaleDateString('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'});
async function readCMC(path,getJSON){
 const history=path.startsWith('historical'),kind=history?'historical':'latest';
 const query=history?'?limit=370':'';
 const original=CMC+'/api/'+kind+query;
 try{
  const result=await getJSON(original,{},12000);
  if(history?!Array.isArray(result?.data):!result?.data)throw Error('invalid CMC Worker schema');
  return {payload:result,source:'CMC_EXISTING_WORKER'};
 }catch(primary){
  const url=CMC_PUBLIC+'/'+kind+query;
  try{
   const result=await getJSON(url,{},12000);
   if(result?.status?.error_code!=null && Number(result.status.error_code)!==0)throw Error('CMC error '+result.status.error_code);
   if(history?!Array.isArray(result?.data):!result?.data)throw Error('invalid official CMC response');
   return {payload:result,source:'CMC_OFFICIAL_KEYLESS_API',warning:'Existing CMC Worker unavailable: '+String(primary.message||primary)};
  }catch(secondary){
   throw Error('CMC Worker: '+String(primary.message||primary)+' | CMC keyless API: '+String(secondary.message||secondary));
  }
 }
}
export async function getFearGreedToday({getJSON=json,now=()=>Date.now()}={}){
 const errors=[],fetched_at=iso(now());
 let latest=null,history=null;
 const results=await Promise.allSettled([
  readCMC('latest',getJSON),
  readCMC('historical',getJSON)
 ]);
 if(results[0].status==='fulfilled')latest=parsePoint(results[0].value?.payload?.data);
 else errors.push('CMC_LATEST:'+String(results[0].reason?.message||results[0].reason));
 if(results[1].status==='fulfilled')history=(Array.isArray(results[1].value?.payload?.data)?results[1].value.payload.data:[]).map(parsePoint).filter(Boolean).sort((a,b)=>a.t-b.t);
 else errors.push('CMC_HISTORY:'+String(results[1].reason?.message||results[1].reason));
 if(results[0].status==='fulfilled'&&results[0].value.warning)errors.push(results[0].value.warning);
 if(results[1].status==='fulfilled'&&results[1].value.warning)errors.push(results[1].value.warning);
 if(!latest&&history?.length)latest=history.at(-1);
 if(!latest)return {available:false,source:'CMC_FEAR_GREED_OFFICIAL_PROXY_WORKER',fetched_at,reasons:errors,note:'CMC index missing; no substitution with Alternative.me or other indices'};
 const seq=(history||[]).filter(p=>p.t<latest.t);
 seq.push(latest);
 const palette=history?.length?classifyCMC(seq).at(-1):null;
 const previous=seq.length>1?seq.at(-2):null;
 const age=now()-latest.t;
 const today=twDay(now());
 const source=latest&&results[0].status==='fulfilled'?results[0].value.source:(results[1].status==='fulfilled'?results[1].value.source:'UNKNOWN');
 return {available:true,index:'CMC_CRYPTO_FEAR_AND_GREED',source,
  value:latest.value,category:emotion(latest.value),semantic_color:palette,
  semantic_color_explanation:palette==='orange'?'由下方進入恐懼區（起漲段）':palette==='purple'?'由上方進入恐懼區（起跌段）':null,
  change_from_previous:previous?latest.value-previous.value:null,previous_value:previous?.value??null,
  source_date_utc:utcDay(latest.t),source_date_taipei:twDay(latest.t),today_taipei:today,
  is_same_taipei_date:twDay(latest.t)===today,stale:age>36*H,
  data_timestamp:iso(latest.t),fetched_at,used_historical_fallback:results[0].status!=='fulfilled',
  warnings:errors,note:'Official CMC index; data source field distinguishes existing SState CMC Worker from CoinMarketCap keyless public API. Show source date if not current Taiwan date; not price prediction.'};
}
