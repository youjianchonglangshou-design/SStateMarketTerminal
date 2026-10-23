/**
 * SStateMarketTerminal MCP v0.2.1 – independent read-only Worker.
 * Imports the ORIGINAL root monitor-engine.js without changing any indicator formulas.
 */
import '../monitor-engine.js';
import { fallbackDailyHistory } from './source-fallbacks.mjs';
import { getLiquidityBounds, getFearGreedToday } from './radar-data.mjs';
import { getPionexContracts } from './pionex-contracts.mjs';
const Engine = globalThis.SStateMonitorEngine;
const DEFAULT_UPSTREAM = 'https://white-meadow-16bc.youjianchonglangshou.workers.dev';
const TV_URL = 'https://scanner.tradingview.com/crypto/scan';
const VERSION = '0.3.1';
const SCHEMA = {type:'object',additionalProperties:false};
const symbolList = n => ({type:'array',items:{type:'string',minLength:1,maxLength:45},minItems:1,maxItems:n});
const symProps = {symbols:symbolList(20),type:{type:'string',enum:['PERP','SPOT']},use_live:{type:'boolean'}};
const TOOLS=[
{name:'get_liquidation_bounds',description:'For ANY valid ticker, fetch actual CoinGlass 7D maximum-pain upper/lower liquidation levels from original MultiAssetLiquidityRadar; if unavailable optionally compute clearly labeled 15m estimated leverage price zones using the EXACT radar bucket formula. Never conflate proxy with CoinGlass or suggest probabilities.',inputSchema:{...SCHEMA,properties:{symbol:{type:'string',minLength:1,maxLength:45},allow_proxy:{type:'boolean'}},required:['symbol']}},
{name:'get_fear_greed_today',description:'Read today latest CMC cryptocurrency Fear and Greed index (0-100) from the original radar CMC Worker; include sentiment classification, date, update time, stale marker and six-color semantics. Not Alternative.me.',inputSchema:{...SCHEMA,properties:{}}},
{name:'get_pionex_contracts',description:'Fetch ALL currently listed active Pionex USDT perpetual contracts via official GET /api/v1/common/symbols?type=PERP&status=TRADING; or SPOT/ALL. Search by symbol/base and optionally paginate. If official API is blocked, reuse the monitor R2 universe with source, timestamp, and partial/staleness warnings. Read-only, no API key.',inputSchema:{...SCHEMA,properties:{type:{type:'string',enum:['PERP','SPOT','ALL']},query:{type:'string',maxLength:50},offset:{type:'integer',minimum:0,maximum:20000},limit:{type:'integer',minimum:1,maximum:2000}}}},
{name:'get_market_states',description:'Get daily SStateMarketTerminal S state, midline slope, Heikin-Ashi color, CCI-SMA color, based on ORIGINAL monitor-engine.js; returns data freshness and quote source.',inputSchema:{...SCHEMA,properties:symProps,required:['symbols']}},
{name:'scan_market_states',description:'Filter up to 30 PERP or SPOT symbols by real calculated S state, midline, average K and CCI-SMA. Supply symbols; private watchlist is disabled by default.',inputSchema:{...SCHEMA,properties:{...symProps,symbols:symbolList(30),source:{type:'string',enum:['symbols','watchlist']},s_state:{type:'string'},midline:{type:'string',enum:['rising','flat','flattening','falling','unknown']},average_k:{type:'string',enum:['yellow','purple','gray']},cci_sma:{type:'string',enum:['yellow','purple','gray']},limit:{type:'integer',minimum:1,maximum:30},sort_by:{type:'string',enum:['symbol','day_change_pct','midline','s_state']}},required:[]}},
{name:'get_symbol_detail',description:'Read one symbol, calculated original indicators, and 30-day original chart indicators.',inputSchema:{...SCHEMA,properties:{symbol:{type:'string'},type:{type:'string',enum:['PERP','SPOT']},use_live:{type:'boolean'}},required:['symbol']}},
{name:'get_watchlist',description:'Read private monitoring watchlist ONLY when ENABLE_PRIVATE_WATCHLIST=true and MCP_READ_TOKEN matches Authorization bearer token.',inputSchema:{...SCHEMA,properties:{}}},
{name:'get_snapshot',description:'Read scheduled analysis snapshot; clearly not a live technical calculation.',inputSchema:{...SCHEMA,properties:{market:{type:'string',enum:['crypto','us-stock']}}}},
{name:'find_symbols',description:'Find instruments in scheduled analysis snapshot by symbol and ticker.',inputSchema:{...SCHEMA,properties:{market:{type:'string',enum:['crypto','us-stock']},query:{type:'string',minLength:1,maxLength:40},limit:{type:'integer',minimum:1,maximum:50}},required:['query']}},
{name:'get_performance',description:'Read actual Champion performance data, not an intraday signal.',inputSchema:{...SCHEMA,properties:{}}},
{name:'get_model',description:'Read active probability model metadata, not a validated live forecast.',inputSchema:{...SCHEMA,properties:{}}}
];
const byName = new Map(TOOLS.map(t=>[t.name,t]));
const j = (data,status=200,headers={}) => new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...headers}});
const error = (id,code,message) => ({jsonrpc:'2.0',id,error:{code,message}});
const good = (id,result) => ({jsonrpc:'2.0',id,result});
const success = (id,val) => good(id,{content:[{type:'text',text:JSON.stringify(val)}],structuredContent:val,isError:false});
const failure = (id,e) => good(id,{content:[{type:'text',text:String(e.message||e)}],isError:true});
function upstream(env){const u = new URL(env.UPSTREAM_BASE_URL||DEFAULT_UPSTREAM);if(u.protocol!=='https:')throw Error('UPSTREAM_BASE_URL must be HTTPS');return u.origin;}
async function readJson(url,options={}){
 const controller = new AbortController();
 const timer = setTimeout(()=>controller.abort(),13000);
 try{
  const res=await fetch(url,{...options,signal:controller.signal,headers:{accept:'application/json',...(options.headers||{})}});
  if(!res.ok)throw Error('upstream HTTP '+res.status+' '+new URL(url).hostname);
  const p=await res.json();
  if(p&&p.ok===false)throw Error(String(p.error||p.message||'upstream rejected'));
  return p;
 }finally{clearTimeout(timer);}
}
const api=(env,path)=>readJson(upstream(env)+path);
function canonical(raw,type='PERP'){
 const s=String(raw||'').trim().toUpperCase();
 if(!/^[A-Z0-9._-]{1,45}$/.test(s))throw Error('invalid symbol '+s.slice(0,45));
 if(s.endsWith('_USDT_PERP'))return {symbol:s,type:'PERP'};
 if(s.endsWith('_USDT'))return {symbol:s,type:'SPOT'};
 if(s.endsWith('_PERP'))return {symbol:s.slice(0,-5)+'_USDT_PERP',type:'PERP'};
 return {symbol:s+'_USDT'+(type==='SPOT'?'':'_PERP'),type};
}
function canonMany(raw,type,max){
 if(!Array.isArray(raw)||raw.length<1||raw.length>max)throw Error('symbols must have 1 to '+max+' elements');
 return [...new Map(raw.map(x=>{let y=canonical(x,type);return [y.symbol,y]})).values()];
}
async function scanQuotes(items){
 const quotes=new Map(),warnings=[];
 const perps=items.filter(x=>x.type==='PERP');
 for(let i=0;i<perps.length;i+=20){
  const part=perps.slice(i,i+20);
  const body={filter:[],options:{lang:'en'},symbols:{query:{types:[]},tickers:part.map(x=>'PIONEX:'+x.symbol.replace(/_USDT_PERP$/,'')+'USDT.P')},columns:['name','close','open','high','low'],range:[0,Math.max(50,part.length+10)]};
  try{
   const result=await readJson(TV_URL,{method:'POST',body:JSON.stringify(body),headers:{'content-type':'application/json'}});
   for(const row of result.data||[]){
    const s=String(row.s||''), match=part.find(x=>s.endsWith(x.symbol.replace(/_USDT_PERP$/,'')+'USDT.P'));
    const d=row.d||[];
    const [close,open,high,low]=[d[1],d[2],d[3],d[4]].map(Number);
    if(match&&[close,open,high,low].every(Number.isFinite)&&Math.min(close,open,high,low)>0&&high>=Math.max(close,open)&&low<=Math.min(close,open)){
     quotes.set(match.symbol,{open,high,low,close,source:'TRADINGVIEW_PIONEX_SCAN',fetched_at:new Date().toISOString()});
    }
   }
  }catch(e){warnings.push(String(e.message||e));}
 }
 return {quotes,warnings};
}
function withQuote(rows,tick){
 const candles=Engine.normalizeKlines(rows).map(x=>({...x}));
 if(!tick||!candles.length)return candles;
 const day=Math.floor(Date.now()/86400000)*86400000;
 const last=candles[candles.length-1];
 const c={time:day,open:tick.open,high:tick.high,low:tick.low,close:tick.close,volume:last.time===day?last.volume:0};
 if(last.time<day)candles.push(c);
 else if(last.time===day)candles[candles.length-1]=c;
 else throw Error('future K-line timestamp');
 return candles;
}
function analysis(item,p,tick,detail){
 const raw=Engine.normalizeKlines(p.klines||p.data||[]);
 if(raw.length<40)throw Error('insufficient daily klines ('+raw.length+')');
 const bars=withQuote(raw,p.cross_exchange_proxy?null:tick);
 const a=Engine.analyze(bars);
 if(!a)throw Error('indicator calculation returned null');
 const ex=Engine.classifyOtherExtension(a.chart_30d,a.s_state);
 const out={
 symbol:item.symbol,market_type:item.type,price:a.price,day_change_pct:a.day_change_pct,
 s_state:a.s_state,s_state_display:ex.state,other_extension_reason:ex.reason,
 midline:a.midline?.state||'unknown',midline_details:a.midline,
 average_k:a.average_k,cci_sma:a.cci_sma,cci_sma_value:a.cci_sma_value,
 kline_source:p.source||null,kline_fetched_at:p.fetched_at||null,cross_exchange_proxy:!!p.cross_exchange_proxy,
 indicator_market_basis:p.market_basis||(item.type==='PERP'?'PIONEX_PERP':'PIONEX_SPOT'),indicator_quote_currency:p.quote_currency||'USDT',
 market_quote_price:tick?.close??null,indicator_quote_applied:!!tick&&!p.cross_exchange_proxy,
 quote_source:tick?.source||null,quote_fetched_at:tick?.fetched_at||null,
 last_kline_time:new Date(bars[bars.length-1].time).toISOString(),
 is_live_quote:!!tick,stale_kline:p.source==='R2_STALE',refresh_error:p.refresh_error||null,
 calculation_engine:Engine.constants.ENGINE_VERSION,indicator_timeframe:'1D',daily_reset_timezone:'Asia/Taipei 08:00 (UTC 00:00)'};
 if(detail)Object.assign(out,{cci:a.cci,day_open:a.day_open,opportunity_long:a.opportunity_long,chart_30d:a.chart_30d});
 return out;
}
async function loadDailyBars(env,item){
 const failures=[];
 try{
  const p=await api(env,'/api/monitor/klines?symbol='+encodeURIComponent(item.symbol)+'&interval=1D&limit=180');
  if(Array.isArray(p.klines||p.data)&&((p.klines||p.data).length>=40))return p;
  throw Error('original endpoint returned insufficient K-lines');
 }catch(e){failures.push('SSTATE:'+String(e.message||e));}
 try{
  const url='https://api.pionex.com/api/v1/market/klines?symbol='+encodeURIComponent(item.symbol)+'&interval=1D&limit=180';
  const p=await readJson(url);
  const bars=p?.data?.klines;
  if(p?.result!==true||!Array.isArray(bars)||bars.length<40)throw Error('invalid or insufficient K-lines');
  return {klines:bars,source:'PIONEX_OFFICIAL_REST_FALLBACK',fetched_at:new Date().toISOString(),refresh_error:failures.join(' | ')};
 }catch(e){failures.push('PIONEX:'+String(e.message||e));}
 const match=item.symbol.match(/^([A-Z0-9]+)_USDT(?:_PERP)?$/);
 if(!match)throw Error('daily K-lines unavailable: '+failures.join(' | '));
 const base=match[1],pair=base+'USDT';
 const fallback=[
  {name:'BINANCE_FUTURES_PROXY',url:'https://fapi.binance.com/fapi/v1/klines?symbol='+pair+'&interval=1d&limit=180',
   parse:p=>Array.isArray(p)?p.map(x=>({time:Number(x[0]),open:x[1],high:x[2],low:x[3],close:x[4],volume:x[5]})):null},
  {name:'OKX_SWAP_PROXY',url:'https://www.okx.com/api/v5/market/candles?instId='+base+'-USDT-SWAP&bar=1Dutc&limit=180',
   parse:p=>p?.code==='0'&&Array.isArray(p.data)?p.data.map(x=>({time:Number(x[0]),open:x[1],high:x[2],low:x[3],close:x[4],volume:x[5]})):null},
  {name:'BYBIT_PERP_PROXY',url:'https://api.bybit.com/v5/market/kline?category=linear&symbol='+pair+'&interval=D&limit=180',
   parse:p=>p?.retCode===0&&Array.isArray(p.result?.list)?p.result.list.map(x=>({time:Number(x[0]),open:x[1],high:x[2],low:x[3],close:x[4],volume:x[5]})):null},
  {name:'BINANCE_SPOT_PROXY',url:'https://data-api.binance.vision/api/v3/klines?symbol='+pair+'&interval=1d&limit=180',
   parse:p=>Array.isArray(p)?p.map(x=>({time:Number(x[0]),open:x[1],high:x[2],low:x[3],close:x[4],volume:x[5]})):null}
 ];
 for(const candidate of fallback){
  try{
   const p=await readJson(candidate.url),rows=candidate.parse(p);
   if(!Array.isArray(rows)||rows.length<40)throw Error('missing or insufficient history');
   const clean=Engine.normalizeKlines(rows);
   if(clean.length<40)throw Error('invalid OHLC');
   return {klines:clean,source:candidate.name,fetched_at:new Date().toISOString(),
    refresh_error:failures.join(' | '),cross_exchange_proxy:true};
  }catch(e){failures.push(candidate.name+':'+String(e.message||e));}
 }
 try{
  const proxy=await fallbackDailyHistory(base,readJson,Engine.normalizeKlines);
  return {...proxy,refresh_error:failures.join(' | ')};
 }catch(e){failures.push('PUBLIC_SPOT_PROXY:'+String(e.message||e));}
 throw Error('daily K-lines unavailable: '+failures.join(' | '));
}
async function collect(env,items,opts={}){
 const tv=opts.live===false?{quotes:new Map(),warnings:[]}:await scanQuotes(items);
 const results=await Promise.all(items.map(async(item)=>{
  try{
   const p=await loadDailyBars(env,item);
   return analysis(item,p,tv.quotes.get(item.symbol),opts.detail);
  }catch(e){return {symbol:item.symbol,available:false,error:String(e.message||e)};}
 }));
 return {as_of:new Date().toISOString(),count:items.length,success:results.filter(x=>!x.error).length,results,scanner_warnings:tv.warnings,price_data_note:'is_live_quote=false is latest daily candle, NOT verified realtime price. cross_exchange_proxy=true means indicators use a DIFFERENT EXCHANGE and may differ from Pionex. No invented indicators on failures.'};
}
function authorized(request,env){const actual=String(env.MCP_READ_TOKEN||'');return !!actual && request.headers.get('Authorization')==='Bearer '+actual;}
async function privateWatchlist(env,req){
 if(env.ENABLE_PRIVATE_WATCHLIST!=='true'||!authorized(req,env))throw Error('Private watchlist disabled: needs ENABLE_PRIVATE_WATCHLIST and bearer MCP_READ_TOKEN');
 const p=await api(env,'/api/monitor/watchlist');
 return {version:p.version,updated_at:p.updated_at,sort:p.sort,items:(p.items||[]).map(x=>({symbol:x.symbol,type:x.type,order:x.order}))};
}
function validate(name,args){
 const tool=byName.get(name);
 if(!tool)throw Error('Unknown tool: '+name);
 if(!args||typeof args!=='object'||Array.isArray(args))throw Error('arguments must be an object');
 for(const k of Object.keys(args))if(!(k in tool.inputSchema.properties))throw Error('unknown argument: '+k);
 for(const k of tool.inputSchema.required||[])if(!(k in args))throw Error('missing argument: '+k);
}
async function invoke(name,args,env,req){
 const market=args.market==='us-stock'?'us-stock':'crypto';
 if(name==='get_snapshot')return {market,kind:'scheduled_snapshot',data:await api(env,'/api/snapshot?market='+market)};
 if(name==='get_performance')return api(env,'/api/champion/performance');
 if(name==='get_model')return api(env,'/api/model/active');
 if(name==='get_liquidation_bounds')return getLiquidityBounds(args.symbol,{allowProxy:args.allow_proxy!==false,upstream:upstream(env)});
 if(name==='get_fear_greed_today')return getFearGreedToday();
 if(name==='get_pionex_contracts')return getPionexContracts(args,{getJSON:readJson,monitorOrigin:upstream(env)});
 if(name==='get_watchlist')return privateWatchlist(env,req);
 if(name==='find_symbols'){
  const data=await api(env,'/api/snapshot?market='+market);
  const rows=[data,data?.records,data?.opportunities,data?.rows,data?.items,data?.ranked_opportunities,data?.long_opportunities,data?.assets,data?.results].find(Array.isArray);
  if(!rows)return {market,warning:'unknown snapshot schema',keys:Object.keys(data||{})};
  const q=String(args.query||'').toUpperCase().trim();
  if(!q||q.length>40)throw Error('query required');
  return {market,kind:'scheduled_snapshot',total:rows.length,rows:rows.filter(x=>[x.symbol,x.api_symbol,x.ticker,x.name,x.base_symbol,x.asset].some(y=>typeof y==='string'&&y.toUpperCase().includes(q))).slice(0,Math.min(50,Math.max(1,Number(args.limit)||20)))};
 }
 if(name==='get_symbol_detail')return collect(env,[canonical(args.symbol,args.type)],{detail:true,live:args.use_live!==false});
 if(name==='get_market_states')return collect(env,canonMany(args.symbols,args.type,20),{live:args.use_live!==false});
 if(name==='scan_market_states'){
  const items=args.source==='watchlist'?canonMany((await privateWatchlist(env,req)).items.slice(0,30).map(x=>x.symbol),args.type,30):canonMany(args.symbols,args.type,30);
  const data=await collect(env,items,{live:args.use_live!==false});
  let rows=data.results.filter(x=>!x.error);
  for(const key of ['s_state','midline','average_k','cci_sma'])if(args[key])rows=rows.filter(x=>key==='s_state'?[x.s_state,x.s_state_display].includes(String(args[key]).toUpperCase()):x[key]===args[key]);
  const sort=args.sort_by||'symbol';
  if(sort==='day_change_pct')rows.sort((a,b)=>(b.day_change_pct||0)-(a.day_change_pct||0));
  else if(sort==='midline')rows.sort((a,b)=>['rising','flat','flattening','falling'].indexOf(a.midline)-['rising','flat','flattening','falling'].indexOf(b.midline));
  else if(sort==='s_state')rows.sort((a,b)=>String(a.s_state_display).localeCompare(String(b.s_state_display)));
  else rows.sort((a,b)=>a.symbol.localeCompare(b.symbol));
  return {...data,filtered_count:rows.length,matched:rows.slice(0,Math.min(30,Math.max(1,Number(args.limit)||20))),failed:data.results.filter(x=>x.error)};
 }
 throw Error('Unknown tool '+name);
}
export default {
 async fetch(req,env={}){
  const url=new URL(req.url);
  if(url.pathname==='/health'&&req.method==='GET')return j({ok:true,service:'SStateMarketTerminal MCP',version:VERSION,engine:Engine.constants.ENGINE_VERSION,upstream:upstream(env),watchlist_private:env.ENABLE_PRIVATE_WATCHLIST==='true',deploy_commit:env.DEPLOY_COMMIT||null});
  if(url.pathname!=='/mcp')return j({error:'Not Found'},404);
  if(req.method!=='POST')return j({error:'Use POST'},405,{allow:'POST'});
  const origin=req.headers.get('origin');
  if(origin&&!['https://chatgpt.com','https://chat.openai.com','https://platform.openai.com','http://localhost:8787','http://127.0.0.1:8787'].includes(origin))return j({error:'Origin denied'},403);
  let p;try{p=await req.json();}catch{return j(error(null,-32700,'Parse error'),400);}
  if(!p||Array.isArray(p)||p.jsonrpc!=='2.0'||typeof p.method!=='string')return j(error(p?.id??null,-32600,'Invalid Request'),400);
  if(p.method.startsWith('notifications/'))return new Response(null,{status:202});
  if(!Object.hasOwn(p,'id'))return j(error(null,-32600,'Missing JSON-RPC id'),400);
  if(p.method==='initialize')return j(good(p.id,{protocolVersion:['2025-03-26','2025-06-18','2025-11-25'].includes(p.params?.protocolVersion)?p.params.protocolVersion:'2025-03-26',capabilities:{tools:{listChanged:false}},serverInfo:{name:'sstate-market-terminal',version:VERSION},instructions:'Read-only. Original daily indicator engine; disclose real data source, freshness, and missing signals. Taiwan daily reset at 08:00.'}));
  if(p.method==='ping')return j(good(p.id,{}));
  if(p.method==='tools/list')return j(good(p.id,{tools:TOOLS.map(t=>({...t,annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:true}}))}));
  if(p.method==='tools/call'){
   const tool=byName.get(p.params?.name);
   if(!tool)return j(error(p.id,-32602,'Unknown tool'),200);
   try{const args=p.params?.arguments||{};validate(tool.name,args);return j(success(p.id,await invoke(tool.name,args,env,req)));}
   catch(e){return j(failure(p.id,e));}
  }
  return j(error(p.id,-32601,'Method not found'));
 }
};
