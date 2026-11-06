import assert from 'node:assert/strict';
import worker from './worker.mjs';
import {getPionexQuotes,websocketQuotes} from './pionex-live.mjs';
import {getPionexContracts} from './pionex-contracts.mjs';
import '../monitor-engine.js';
const Engine=globalThis.SStateMonitorEngine;
const today=Math.floor(Date.now()/86400000)*86400000;
const candles=Array.from({length:180},(_,i)=>{const time=today-(179-i)*86400000;const mid=60+i*.5+Math.sin(i/8)*3;return {time,open:mid,high:mid+2,low:mid-2,close:mid+.7,volume:200+i};});
const stock={schema_version:'pionex-us-stock-symbols-v4-live-active-sectors',source:'Pionex spot_markets + future_markets',generated_at:new Date().toISOString(),symbols:['NVDAX','HOODX','AAPLX','MUX','INTCX','WTI','GOOGLX'],symbol_map:{NVDAX:'NVDAX_USDT_PERP',HOODX:'HOODX_USDT_PERP',AAPLX:'AAPLX_USDT_PERP',MUX:'MUX_USDT_PERP',INTCX:'INTCX_USDT_PERP',WTI:'WTI_USDT_PERP',GOOGLX:'GOOGLX_USDT_PERP'}};
const universe={schema_version:'pionex-monitor-universe-v3',fetched_at:new Date().toISOString(),symbols:[...stock.symbols.map(s=>({symbol:s+'_USDT_PERP',type:'PERP',base:s,quote:'USDT'})),{symbol:'BTC_USDT_PERP',type:'PERP',base:'BTC',quote:'USDT'}]};
let r2Enabled=true, klineEnabled=true, wsEnabled=true, wsTradeEnabled=true, todayPresent=true, upstreamAvailable=false, tickerEnabled=true, snapshotAvailable=true, requests=[];
const env={JSON_BUCKET:{get:async(key)=>{
 if(!r2Enabled)return null;
 let p=null;
 if(key==='pionex/symbols/us_stock_symbols.json')p=stock;
 else if(key==='pionex/cache/monitor_universe.json')p=universe;
 else if(key.startsWith('pionex/cache/monitor_klines/1D/'))p={symbol:decodeURIComponent(key.split('/').at(-1).replace(/\.json$/,'')),fetched_at:new Date().toISOString(),klines:todayPresent?candles:candles.slice(0,-1)};
 return p?{text:async()=>JSON.stringify(p)}:null;
}}};
class FakeWS{
 constructor(){this.handlers=new Map();this.count=0;}
 accept(){}close(){}
 addEventListener(name,fn){const list=this.handlers.get(name)||[];list.push(fn);this.handlers.set(name,list);}
 send(raw){const msg=JSON.parse(raw);if(msg.op==='SUBSCRIBE'&&wsTradeEnabled){this.count++;let price=msg.symbol.startsWith('NVDAX')?200:msg.symbol.startsWith('HOODX')?87:101;queueMicrotask(()=>{for(const fn of this.handlers.get('message')||[])fn({data:JSON.stringify({topic:'TRADE',data:[{symbol:msg.symbol,price,timestamp:Date.now()}]})});});}}
}
const oldFetch=globalThis.fetch;
globalThis.fetch=async(url,opts={})=>{
 const u=new URL(url);requests.push(u.toString());
 if(u.pathname==='/api/monitor/ws'){
  if(!wsEnabled)return {status:502};
  return {status:101,webSocket:new FakeWS()};
 }
 if(u.pathname==='/api/monitor/tickers'){
  if(!tickerEnabled)return new Response('{}',{status:429});
  return new Response(JSON.stringify({tickers:[{symbol:'NVDAX_USDT_PERP',price:188,time:Date.now()},{symbol:'HOODX_USDT_PERP',price:85,time:Date.now()},{symbol:'BTC_USDT_PERP',price:80000,time:Date.now()}],fetched_at:new Date().toISOString()}));
 }
 if(u.hostname==='api.pionex.com'&&u.pathname==='/api/v1/market/tickers')return new Response('{}',{status:429});
 if(u.hostname==='api.pionex.com'&&u.pathname==='/api/v1/common/symbols')return new Response('{}',{status:429});
 if(u.hostname==='api.pionex.com'&&u.pathname==='/api/v1/market/klines')return new Response('{}',{status:429});
 if(u.pathname==='/api/monitor/klines'){if(!upstreamAvailable)return new Response('{}',{status:404});return new Response(JSON.stringify({ok:true,source:'PIONEX_LIVE',fetched_at:new Date().toISOString(),klines:candles}));}
 if(u.pathname==='/api/monitor/symbols')return new Response('{}',{status:404});
 if(u.pathname.endsWith('us_stock_symbols.json'))return new Response(JSON.stringify(stock));
 if(u.pathname==='/api/snapshot')return snapshotAvailable?new Response(JSON.stringify({records:[{symbol:'BTC',api_symbol:'BTC_USDT_PERP'}]})):new Response('{}',{status:404});
 if(u.pathname==='/api/champion/performance')return new Response(JSON.stringify({win_rate:.52}));
 if(u.pathname==='/api/model/active')return new Response(JSON.stringify({version:'test'}));
 if(u.hostname==='fapi.coinglass.com')return new Response('{}',{status:403});
 if(u.hostname==='cmc-fear-greed.youjianchonglangshou.workers.dev'&&u.pathname==='/api/latest')return new Response(JSON.stringify({data:{timestamp:Math.round(Date.now()/1000),value:42}}));
 if(u.hostname==='cmc-fear-greed.youjianchonglangshou.workers.dev'&&u.pathname==='/api/historical')return new Response(JSON.stringify({data:[{timestamp:Math.round(Date.now()/1000)-86400,value:35},{timestamp:Math.round(Date.now()/1000),value:42}]}));
 throw Error('unexpected upstream '+u);
};
const pass=[];
const check=async(name,fn)=>{await fn();pass.push(name);console.log('PASS',name)};
async function rpc(name,args={},opts=env){
 const req=new Request('https://sstate-mcp.test/mcp',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})});
 const out=await worker.fetch(req,opts);const json=await out.json();if(json.error)throw Error(JSON.stringify(json.error));return json.result;
}
try{
 await check('MCP 0.3.3 healthy',async()=>{let r=await worker.fetch(new Request('https://sstate-mcp.test/health'));let p=await r.json();assert.equal(p.version,'0.3.3')});
 await check('MCP tool list contains Pionex WS quotes',async()=>{let r=await worker.fetch(new Request('https://sstate-mcp.test/mcp',{method:'POST',body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})}));let p=(await r.json()).result.tools;assert(p.some(x=>x.name==='get_pionex_quotes'));});
 await check('R2 original Pionex universe when official rate limits',async()=>{const r=await rpc('get_pionex_contracts',{query:'NVDAX'});assert.equal(r.isError,false);assert.equal(r.structuredContent.source,'SSTATE_R2_DIRECT');assert.equal(r.structuredContent.symbols[0].symbol,'NVDAX_USDT_PERP');});
 await check('stock-only R2 fallback with complete universe missing is partial, no other exchange',async()=>{
  const stockOnly={get:async(key)=>key==='pionex/symbols/us_stock_symbols.json'?{text:async()=>JSON.stringify(stock)}:null};
  const p=await getPionexContracts({query:'NVDAX'},{getJSON:async()=>{throw Error('Pionex 429')},monitorOrigin:null,bucket:stockOnly});
  assert.equal(p.source,'PIONEX_US_STOCK_R2_ONLY');assert.equal(p.partial,true);
  assert.equal(p.symbols[0].symbol,'NVDAX_USDT_PERP');
 });
 await check('scheduled US stock snapshot missing returns Pionex directory, not fake signals',async()=>{
  snapshotAvailable=false;const p=(await rpc('get_snapshot',{market:'us-stock'})).structuredContent;assert.equal(p.kind,'pionex_us_stock_directory_only');assert(p.symbols.includes('NVDAX_USDT_PERP'));snapshotAvailable=true;
 });
 await check('us-stock symbol lookup uses Pionex directory not broken snapshot',async()=>{const p=(await rpc('find_symbols',{market:'us-stock',query:'NVDAX'})).structuredContent;assert.equal(p.rows[0].api_symbol,'NVDAX_USDT_PERP');assert.equal(p.source,'PIONEX_STOCK_R2_DIRECT');});
 await check('us-stock bare NVDA lookup -> NVDAX real pair',async()=>{const p=(await rpc('find_symbols',{market:'us-stock',query:'NVDA'})).structuredContent;assert.equal(p.rows[0].api_symbol,'NVDAX_USDT_PERP');});
 await check('real websocket uses same relay and trade topic',async()=>{const d=await websocketQuotes(['NVDAX_USDT_PERP'],{relay:'https://white-meadow-16bc.youjianchonglangshou.workers.dev',waitMs:500});assert.equal(d.quotes.get('NVDAX_USDT_PERP').source,'PIONEX_WEBSOCKET_TRADE');});
 await check('Pionex quote alias NVDA resolves to NVDAX',async()=>{const p=(await rpc('get_pionex_quotes',{symbols:['NVDA']})).structuredContent;assert.equal(p.results[0].symbol,'NVDAX_USDT_PERP');assert.equal(p.websocket_count,1);});
 await check('market states source Pionex-only even when main Worker OHLC 404',async()=>{const p=(await rpc('get_market_states',{symbols:['NVDA','HOODX','BTC']})).structuredContent;assert.equal(p.success,3);for(const x of p.results){assert.equal(x.cross_exchange_proxy,false);assert.equal(x.kline_source,'PIONEX_R2_DIRECT');assert.equal(x.indicator_market_basis,'PIONEX_PERP');assert.equal(x.signal_usable,true);assert(!x.kline_source.includes('GATE'));}assert.equal(p.quote_diagnostics.websocket,3);});
 await check('live quote updates same-day K line but not prior historical days',async()=>{const p=(await rpc('get_symbol_detail',{symbol:'NVDA'})).structuredContent.results[0];assert.equal(p.price,200);assert.equal(p.is_live_quote,true);assert.equal(p.indicator_quote_applied,true);assert.equal(p.last_kline_time,new Date(today).toISOString());});
 await check('original engine daily indicator identical to same OHLC with newest trade',async()=>{const p=(await rpc('get_symbol_detail',{symbol:'NVDA'})).structuredContent.results[0];const d=candles.map(x=>({...x}));d.at(-1).close=200;d.at(-1).high=200;const a=Engine.analyze(d);assert.equal(p.s_state,a.s_state);assert.equal(p.average_k,a.average_k);assert.equal(p.cci_sma,a.cci_sma);assert.equal(p.midline,a.midline.state);});
 await check('WS no trade uses SAME Pionex REST tickers and labels them non-live',async()=>{wsTradeEnabled=false;const p=(await rpc('get_symbol_detail',{symbol:'NVDA'})).structuredContent.results[0];assert.equal(p.market_quote_price,188);assert.equal(p.quote_source,'PIONEX_WORKER_TICKERS');assert.equal(p.is_live_quote,false);assert.equal(p.indicator_quote_applied,false);wsTradeEnabled=true;});
 await check('WS and ticker both unavailable never fabricate live quotes',async()=>{wsEnabled=false;tickerEnabled=false;const p=(await rpc('get_symbol_detail',{symbol:'NVDA'})).structuredContent.results[0];assert.equal(p.market_quote_price,null);assert.equal(p.is_live_quote,false);wsEnabled=true;tickerEnabled=true;});
 await check('yesterday R2 OHLC is marked stale and not accepted into scan',async()=>{todayPresent=false;const p=(await rpc('scan_market_states',{symbols:['NVDA']})).structuredContent;assert.equal(p.filtered_count,0);assert.deepEqual(p.skipped_stale,['NVDAX_USDT_PERP']);todayPresent=true;});
 await check('no OHLC / R2 / API => unavailable not Gate proxy',async()=>{r2Enabled=false;const p=(await rpc('get_market_states',{symbols:['NVDAX'],use_live:false})).structuredContent;assert.equal(p.success,0);assert.equal(p.results[0].available,false);assert(p.results[0].error.includes('other-exchange proxies disabled'));r2Enabled=true;});
 await check('CL uses exact Pionex WTI pair only',async()=>{const p=(await rpc('get_market_states',{symbols:['CL'],use_live:false})).structuredContent;assert.equal(p.results[0].symbol,'WTI_USDT_PERP');});
 await check('unknown symbol NOT guessed to other exchange',async()=>{const p=(await rpc('get_market_states',{symbols:['UNKNOWN'],use_live:false})).structuredContent;assert.equal(p.results[0].symbol,'UNKNOWN_USDT_PERP');assert(!requests.some(x=>/gateio|bybit|binance|okx/.test(x)));});
 await check('scan rejects stale results and still returns original indicators on valid row',async()=>{const p=(await rpc('scan_market_states',{symbols:['NVDAX'],limit:20})).structuredContent;assert.equal(p.filtered_count,1);assert.equal(p.matched[0].signal_usable,true);});
 await check('CoinGlass estimated price proxy OFF by default',async()=>{const p=(await rpc('get_liquidation_bounds',{symbol:'BTC'})).structuredContent;assert.notEqual(p.is_estimate,true);});
 await check('Pionex WS failure has typed warning',async()=>{wsEnabled=false;const p=(await rpc('get_pionex_quotes',{symbols:['HOODX']})).structuredContent;assert.equal(p.results[0].source,'PIONEX_WORKER_TICKERS');assert(p.warnings.some(x=>x.includes('WebSocket')));wsEnabled=true;});
 await check('never call third-party scan or spot proxies during scan',async()=>{requests.length=0;await rpc('scan_market_states',{symbols:['NVDAX','BTC']});assert.equal(requests.filter(x=>/scanner.tradingview|gateio.ws|binance.com|bybit.com|okx.com|cryptocompare/i.test(x)).length,0);});
 console.log('TOTAL',pass.length,'PASS');
}finally{globalThis.fetch=oldFetch;}
