/**
 * SStateMarketTerminal MCP v0.3.3 – Pionex-only quote and indicator Worker.
 * Imports the ORIGINAL root monitor-engine.js without changing any indicator formulas.
 */
import '../monitor-engine.js';
import { getPionexQuotes } from './pionex-live.mjs';
import { getLiquidityBounds, getFearGreedToday } from './radar-data.mjs';
import { getPionexContracts } from './pionex-contracts.mjs';
const Engine = globalThis.SStateMonitorEngine;
const DEFAULT_UPSTREAM = 'https://white-meadow-16bc.youjianchonglangshou.workers.dev';
const US_STOCK_R2_URL = 'https://pub-8840e93658904e0aabc7fbe666af2444.r2.dev/pionex/symbols/us_stock_symbols.json';
const STOCK_R2_KEY='pionex/symbols/us_stock_symbols.json';
const VERSION = '0.3.3';
const SCHEMA = {type:'object',additionalProperties:false};
const symbolList = n => ({type:'array',items:{type:'string',minLength:1,maxLength:45},minItems:1,maxItems:n});
const symProps = {symbols:symbolList(20),type:{type:'string',enum:['PERP','SPOT']},use_live:{type:'boolean'}};
const TOOLS=[
{name:'get_liquidation_bounds',description:'CoinGlass original 7D bounds ONLY. Estimated/15m proxy zones are disabled, including when allow_proxy=true.',inputSchema:{...SCHEMA,properties:{symbol:{type:'string',minLength:1,maxLength:45},allow_proxy:{type:'boolean'}},required:['symbol']}},
{name:'get_fear_greed_today',description:'Read today latest CMC cryptocurrency Fear and Greed index (0-100) from the original radar CMC Worker; include sentiment classification, date, update time, stale marker and six-color semantics. Not Alternative.me.',inputSchema:{...SCHEMA,properties:{}}},
{name:'get_pionex_contracts',description:'Search Pionex official contract universe, then the existing Pionex-sourced R2 universe when rate limited; source, timestamp, staleness and partial flags are explicit. No third-party symbol source.',inputSchema:{...SCHEMA,properties:{type:{type:'string',enum:['PERP','SPOT','ALL']},query:{type:'string',maxLength:50},offset:{type:'integer',minimum:0,maximum:20000},limit:{type:'integer',minimum:1,maximum:2000}}}},
{name:'get_market_states',description:'Pionex-only daily S state, midline, HA, CCI-SMA, using original indicator engine; Pionex WebSocket TRADE quotes + Pionex 1D OHLC (R2/direct). Never cross-exchange spot proxies; missing data remains unavailable.',inputSchema:{...SCHEMA,properties:symProps,required:['symbols']}},
{name:'scan_market_states',description:'Filter Pionex-only technical states; does not match cross-exchange proxies or stale signal rows. Uses original daily indicator engine.',inputSchema:{...SCHEMA,properties:{...symProps,symbols:symbolList(30),source:{type:'string',enum:['symbols','watchlist']},s_state:{type:'string'},midline:{type:'string',enum:['rising','flat','flattening','falling','unknown']},average_k:{type:'string',enum:['yellow','purple','gray']},cci_sma:{type:'string',enum:['yellow','purple','gray']},limit:{type:'integer',minimum:1,maximum:30},sort_by:{type:'string',enum:['symbol','day_change_pct','midline','s_state']}},required:[]}},
{name:'get_symbol_detail',description:'Pionex-only market detail and daily original indicators; token stock aliases like NVDA resolve to NVDAX, using R2 directory. No third-party indicator proxy.',inputSchema:{...SCHEMA,properties:{symbol:{type:'string'},type:{type:'string',enum:['PERP','SPOT']},use_live:{type:'boolean'}},required:['symbol']}},
{name:'get_pionex_quotes',description:'One-shot Pionex TRADE WebSocket snapshot via the same radar Worker relay; only Pionex official tickers as same-exchange fallback; never Gate/other exchanges. Returns source per price.',inputSchema:{...SCHEMA,properties:{symbols:symbolList(20)},required:['symbols']}},
{name:'get_watchlist',description:'Read private monitoring watchlist ONLY when ENABLE_PRIVATE_WATCHLIST=true and MCP_READ_TOKEN matches Authorization bearer token.',inputSchema:{...SCHEMA,properties:{}}},
{name:'get_snapshot',description:'Read scheduled analysis snapshot; clearly not a live technical calculation.',inputSchema:{...SCHEMA,properties:{market:{type:'string',enum:['crypto','us-stock']}}}},
{name:'find_symbols',description:'For us-stock, search the actual Pionex tokenized-stock directory from the existing R2 source; crypto searches the scheduled snapshot.',inputSchema:{...SCHEMA,properties:{market:{type:'string',enum:['crypto','us-stock']},query:{type:'string',minLength:1,maxLength:40},limit:{type:'integer',minimum:1,maximum:50}},required:['query']}},
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
// R2 stock directory is generated from Pionex active stock contracts, not another exchange's market data.
async function stockDirectory(env){
 let data=null,from=null;
 try{const object=await env.JSON_BUCKET?.get(STOCK_R2_KEY);if(object){data=JSON.parse(await object.text());from='PIONEX_STOCK_R2_DIRECT';}}catch(_){/* try public same R2 object */}
 if(!data){data=await readJson(US_STOCK_R2_URL);from='PIONEX_STOCK_R2_PUBLIC';}
 if(!Array.isArray(data?.symbols)||!data.symbols.length||typeof data?.symbol_map!=='object')throw Error('Pionex stock symbol directory missing');
 const symbols=new Map();
 for(const key of data.symbols){const short=String(key).toUpperCase(),full=String(data.symbol_map[short]||'').toUpperCase();
  if(/^[A-Z0-9]{1,35}$/.test(short)&&/^[A-Z0-9]{1,35}_USDT_PERP$/.test(full))symbols.set(short,full);
 }
 return {symbols,source:from,generated_at:data.generated_at||null,verified_source:data.source||null};
}
async function resolveSymbol(raw,type,stock){
 const c=canonical(raw,type);
 if(c.type!=='PERP'||!stock?.symbols?.size)return c;
 let name=c.symbol.replace(/_USDT_PERP$/,'');
 if(name==='CL')name='WTI';
 if(stock.symbols.has(name))return {symbol:stock.symbols.get(name),type:'PERP'};
 // Bare US equity ticker, e.g. NVDA -> NVDAX, MU -> MUX, INTC -> INTCX.
 // Map only if the actual Pionex directory contains that EXACT token pair.
 if(stock.symbols.has(name+'X'))return {symbol:stock.symbols.get(name+'X'),type:'PERP'};
 return c;
}
async function resolveMany(raw,type,max,stock){
 if(!Array.isArray(raw)||raw.length<1||raw.length>max)throw Error('symbols must have 1 to '+max+' elements');
 const values=await Promise.all(raw.map(x=>resolveSymbol(x,type,stock)));
 return [...new Map(values.map(x=>[x.symbol,x])).values()];
}
function normalizePionexBars(rows){
 const entries=(Array.isArray(rows)?rows:[]).map(row=>{
  if(Array.isArray(row))return {time:Number(row[0]),open:row[1],high:row[2],low:row[3],close:row[4],volume:row[5]};
  return row;
 });
 return Engine.normalizeKlines(entries.map(x=>({...x,time:Number(x.time)<1e12?Number(x.time)*1000:Number(x.time)}))).filter(x=>x.time>1e12&&x.time<Date.now()+86400000&&x.high>=Math.max(x.open,x.close)&&x.low<=Math.min(x.open,x.close));
}
function validPionexHistory(p,origin){
 if(p?.cross_exchange_proxy || /PROXY/i.test(String(p?.market_basis||'')) || /(GATE|BINANCE|OKX|BYBIT|COINBASE|KRAKEN|CROSS[_-]?EXCHANGE|SPOT[_-]?PROXY)/i.test(String(p?.source||'')))throw Error('cross-exchange OHLC rejected');
 const normalized=normalizePionexBars(p?.klines||p?.data?.klines||p?.data);
 if(normalized.length<40)throw Error('fewer than 40 valid Pionex daily OHLC bars');
 return {...p,klines:normalized,source:origin||p.source||'PIONEX_UNKNOWN'};
}
async function loadDailyBars(env,item){
 const errors=[];let cached=null;
 // Same persisted Pionex OHLC used by the radar's existing SState Worker.
 try{
  const obj=await env.JSON_BUCKET?.get('pionex/cache/monitor_klines/1D/'+encodeURIComponent(item.symbol)+'.json');
  if(obj){const p=JSON.parse(await obj.text());cached=validPionexHistory(p,'PIONEX_R2_DIRECT');cached.fetched_at=p.fetched_at||null;}
 }catch(e){errors.push('R2 Pionex: '+String(e.message||e));}
 // Use cached Pionex OHLC immediately when recent, without hitting blocked endpoints.
 const age=cached?.fetched_at?Date.now()-Date.parse(cached.fetched_at):Infinity;
 if(cached && age>=0 && age<15*60_000)return cached;
 try{
  const p=await api(env,'/api/monitor/klines?symbol='+encodeURIComponent(item.symbol)+'&interval=1D&limit=180');
  return validPionexHistory(p,p.source==='R2_STALE'?'PIONEX_WORKER_R2_STALE':'PIONEX_WORKER_'+String(p.source||'DIRECT'));
 }catch(e){errors.push('SSTATE: '+String(e.message||e));}
 try{
  const url='https://api.pionex.com/api/v1/market/klines?symbol='+encodeURIComponent(item.symbol)+'&interval=1D&limit=180';
  const p=await readJson(url),bars=p?.data?.klines;
  if(p?.result!==true)throw Error('Pionex official API rejected');
  return validPionexHistory({klines:bars,source:'PIONEX_OFFICIAL_REST',fetched_at:new Date().toISOString()},'PIONEX_OFFICIAL_REST');
 }catch(e){errors.push('PIONEX: '+String(e.message||e));}
 if(cached)return {...cached,source:'PIONEX_R2_STALE',refresh_error:errors.join(' | ')};
 throw Error('Pionex daily OHLC unavailable; other-exchange proxies disabled: '+errors.join(' | '));
}
function analysis(item,p,tick,detail){
 const bars=p.klines.map(x=>({...x}));
 const utcDay=Math.floor(Date.now()/86400000)*86400000;
 const last=bars.at(-1);const hasToday=last.time===utcDay;
 const quoted=Number(tick?.price),usableQuote=Number.isFinite(quoted)&&quoted>0;
 // Never create a fictitious daily candle from a single WebSocket trade.
 // If Pionex supplied today's OHLC, only advance its close/high/low from the actual TRADE.
 if(hasToday && usableQuote && tick.is_live_quote===true && Date.parse(tick.trade_at)>=last.time){
  last.close=quoted;last.high=Math.max(last.high,quoted);last.low=Math.min(last.low,quoted);
 }
 const a=Engine.analyze(bars);if(!a)throw Error('indicator calculation returned null');
 const ex=Engine.classifyOtherExtension(a.chart_30d,a.s_state);
 const signalFresh=hasToday && !String(p.source||'').includes('STALE') && Number.isFinite(Date.parse(p.fetched_at||'')) && Date.now()-Date.parse(p.fetched_at)<24*60*60_000;
 const marketPrice=usableQuote?quoted:a.price,dayPct=hasToday&&Number.isFinite(marketPrice)&&a.day_open>0?(marketPrice/a.day_open-1)*100:null;
 const out={symbol:item.symbol,market_type:item.type,price:marketPrice,day_change_pct:dayPct,indicator_last_close:a.price,indicator_as_of:new Date(last.time).toISOString(),signal_usable:signalFresh,
  s_state:a.s_state,s_state_display:ex.state,other_extension_reason:ex.reason,midline:a.midline?.state||'unknown',midline_details:a.midline,
  average_k:a.average_k,cci_sma:a.cci_sma,cci_sma_value:a.cci_sma_value,kline_source:p.source||null,kline_fetched_at:p.fetched_at||null,cross_exchange_proxy:false,
  indicator_market_basis:item.type==='PERP'?'PIONEX_PERP':'PIONEX_SPOT',indicator_quote_currency:'USDT',
  market_quote_price:usableQuote?quoted:null,indicator_quote_applied:hasToday&&!!tick?.is_live_quote,
  quote_source:tick?.source||null,quote_fetched_at:tick?.fetched_at||null,quote_trade_at:tick?.trade_at||null,
  last_kline_time:new Date(last.time).toISOString(),is_live_quote:!!tick?.is_live_quote,
  stale_kline:!signalFresh,refresh_error:p.refresh_error||null,calculation_engine:Engine.constants.ENGINE_VERSION,
  indicator_timeframe:'1D',daily_reset_timezone:'Asia/Taipei 08:00 (UTC 00:00)'};
 if(detail)Object.assign(out,{cci:a.cci,day_open:a.day_open,opportunity_long:a.opportunity_long,chart_30d:a.chart_30d});
 return out;
}
async function collect(env,items,opts={}){
 const quotes=opts.live===false?{quotes:new Map(),warnings:[],received_ws:0,received_pionex_rest:0,missing:[]}:
   await getPionexQuotes(items.filter(x=>x.type==='PERP').map(x=>x.symbol),{relay:upstream(env),fetchJson:readJson});
 const results=await Promise.all(items.map(async(item)=>{
  try{const p=await loadDailyBars(env,item);return analysis(item,p,quotes.quotes.get(item.symbol),opts.detail);}
  catch(e){return {symbol:item.symbol,available:false,signal_usable:false,error:String(e.message||e)};}
 }));
 return {as_of:new Date().toISOString(),count:items.length,success:results.filter(x=>!x.error).length,results,
  quote_diagnostics:{websocket:quotes.received_ws,pionex_rest:quotes.received_pionex_rest,missing:quotes.missing||[],warnings:quotes.warnings},
  price_data_note:'Pionex-only: TRADE from existing radar WebSocket relay, Pionex official tickers as same-exchange fallback; OHLC from Pionex official/R2 only. No cross-exchange indicator proxies. A WebSocket trade does not replace historical OHLC. signal_usable=false when daily data is stale.'};
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
 if(name==='get_snapshot'){
  try{return {market,kind:'scheduled_snapshot',data:await api(env,'/api/snapshot?market='+market)};}
  catch(e){if(market!=='us-stock')throw e;const dir=await stockDirectory(env);
   return {market,kind:'pionex_us_stock_directory_only',source:dir.source,generated_at:dir.generated_at,
    count:dir.symbols.size,symbols:[...dir.symbols.values()],warning:'Scheduled US-stock analytics snapshot unavailable; returned ONLY verified Pionex token contracts, NOT market analysis.'};}
 }
 if(name==='get_performance')return api(env,'/api/champion/performance');
 if(name==='get_model')return api(env,'/api/model/active');
 if(name==='get_liquidation_bounds'){if(args.allow_proxy===true)throw Error('Proxy liquidation zones disabled; CoinGlass 7D only');return getLiquidityBounds(args.symbol,{allowProxy:false,upstream:upstream(env)});}
 if(name==='get_fear_greed_today')return getFearGreedToday();
 if(name==='get_pionex_contracts')return getPionexContracts(args,{getJSON:readJson,monitorOrigin:upstream(env),bucket:env.JSON_BUCKET});
 if(name==='get_pionex_quotes'){let dir=null;try{dir=await stockDirectory(env)}catch(_){};const items=await resolveMany(args.symbols,'PERP',20,dir);const d=await getPionexQuotes(items.map(x=>x.symbol),{relay:upstream(env),fetchJson:readJson});return {as_of:new Date().toISOString(),results:items.map(x=>d.quotes.get(x.symbol)||{symbol:x.symbol,available:false}),websocket_count:d.received_ws,pionex_rest_count:d.received_pionex_rest,missing:d.missing,warnings:d.warnings};}
 if(name==='get_watchlist')return privateWatchlist(env,req);
 if(name==='find_symbols'){
  const q=String(args.query||'').toUpperCase().trim();if(!q||q.length>40)throw Error('query required');
  if(market==='us-stock'){
   const dir=await stockDirectory(env),rows=[...dir.symbols].map(([base,symbol])=>({symbol:base,ticker:base,api_symbol:symbol,market:'PIONEX_US_STOCK_PERP'}));
   const matches=rows.filter(x=>x.symbol.includes(q)||x.api_symbol.includes(q)||x.symbol.replace(/X$/,'')===q);
   return {market,kind:'pionex_us_stock_directory',source:dir.source,generated_at:dir.generated_at,total:rows.length,matched_total:matches.length,rows:matches.slice(0,Math.min(50,Math.max(1,Number(args.limit)||20)))};
  }
  const data=await api(env,'/api/snapshot?market='+market);
  const rows=[data,data?.records,data?.opportunities,data?.rows,data?.items,data?.ranked_opportunities,data?.long_opportunities,data?.assets,data?.results].find(Array.isArray);
  if(!rows)return {market,warning:'unknown snapshot schema',keys:Object.keys(data||{})};
  return {market,kind:'scheduled_snapshot',total:rows.length,rows:rows.filter(x=>[x.symbol,x.api_symbol,x.ticker,x.name,x.base_symbol,x.asset].some(y=>typeof y==='string'&&y.toUpperCase().includes(q))).slice(0,Math.min(50,Math.max(1,Number(args.limit)||20)))};
 }
 if(name==='get_symbol_detail'){let dir=null;try{dir=await stockDirectory(env)}catch(_){};return collect(env,[await resolveSymbol(args.symbol,args.type,dir)],{detail:true,live:args.use_live!==false});}
 if(name==='get_market_states'){let dir=null;try{dir=await stockDirectory(env)}catch(_){};return collect(env,await resolveMany(args.symbols,args.type,20,dir),{live:args.use_live!==false});}
 if(name==='scan_market_states'){
  let dir=null;try{dir=await stockDirectory(env)}catch(_){};const items=args.source==='watchlist'?await resolveMany((await privateWatchlist(env,req)).items.slice(0,30).map(x=>x.symbol),args.type,30,dir):await resolveMany(args.symbols,args.type,30,dir);
  const data=await collect(env,items,{live:args.use_live!==false});
  let rows=data.results.filter(x=>!x.error && x.signal_usable);
  for(const key of ['s_state','midline','average_k','cci_sma'])if(args[key])rows=rows.filter(x=>key==='s_state'?[x.s_state,x.s_state_display].includes(String(args[key]).toUpperCase()):x[key]===args[key]);
  const sort=args.sort_by||'symbol';
  if(sort==='day_change_pct')rows.sort((a,b)=>(b.day_change_pct||0)-(a.day_change_pct||0));
  else if(sort==='midline')rows.sort((a,b)=>['rising','flat','flattening','falling'].indexOf(a.midline)-['rising','flat','flattening','falling'].indexOf(b.midline));
  else if(sort==='s_state')rows.sort((a,b)=>String(a.s_state_display).localeCompare(String(b.s_state_display)));
  else rows.sort((a,b)=>a.symbol.localeCompare(b.symbol));
  return {...data,filtered_count:rows.length,skipped_stale:data.results.filter(x=>!x.error&&!x.signal_usable).map(x=>x.symbol),matched:rows.slice(0,Math.min(30,Math.max(1,Number(args.limit)||20))),failed:data.results.filter(x=>x.error)};
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
  if(p.method==='initialize')return j(good(p.id,{protocolVersion:['2025-03-26','2025-06-18','2025-11-25'].includes(p.params?.protocolVersion)?p.params.protocolVersion:'2025-03-26',capabilities:{tools:{listChanged:false}},serverInfo:{name:'sstate-market-terminal',version:VERSION},instructions:'Read-only. Pionex TRADE WebSocket/same-exchange official tickers; Pionex historical OHLC only. No Gate/Binance/OKX/Bybit indicator proxies. Original daily indicator engine; disclose source/freshness. Taiwan reset 08:00.'}));
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
