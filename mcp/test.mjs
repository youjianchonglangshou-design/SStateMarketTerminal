import assert from 'node:assert/strict';
import worker from './worker.mjs';
import '../monitor-engine.js';
import {extractCoinGlass,resolveCoinGlass,candidateZones,getLiquidityBounds,getFearGreedToday,classifyCMC,normalizeSymbol} from './radar-data.mjs';
const engine=globalThis.SStateMonitorEngine;
const today=Math.floor(Date.now()/86400000)*86400000;
const candles=Array.from({length:180},(_,i)=>{const time=today-(179-i)*86400000;const mid=45000+300*Math.sin(i/12)+i*13;return {time,open:mid-70,high:mid+140,low:mid-130,close:mid+50,volume:300+i};});
const originalFetch=globalThis.fetch;
const bars15=Array.from({length:300},(_,i)=>{const t=Date.now()-((299-i)*900000),mid=50300+800*Math.sin(i/14);return {time:t,open:mid-25,high:mid+150,low:mid-170,close:mid+30,volume:100+i%20};});
let tv=true,upstream=true,pionexSymbolApi=true,monitorUniverse=true,monitorUniversePartial=false;
globalThis.fetch=async(url,options={})=>{
 const u=new URL(url);
 if(u.hostname==='scanner.tradingview.com'){
  if(!tv)return new Response('{}',{status:403});
  const body=JSON.parse(options.body);
  const data=body.symbols.tickers.map(s=>({s,d:[s.split(':')[1],50300,49900,50500,49700]}));
  return new Response(JSON.stringify({data}),{status:200});
 }
 if(u.hostname==='api.pionex.com' && u.pathname==='/api/v1/common/symbols'){
  if(!pionexSymbolApi)return new Response('{}',{status:429});
  const type=u.searchParams.get('type');
  const symbols=type==='PERP'?[{symbol:'BTC_USDT_PERP',baseCurrency:'BTC',quoteCurrency:'USDT',status:'TRADING'},{symbol:'AMDX_USDT_PERP',baseCurrency:'AMDX',quoteCurrency:'USDT',status:'TRADING'},{symbol:'ETH_USDT_PERP',baseCurrency:'ETH',quoteCurrency:'USDT',status:'OFFLINE'},{symbol:'BTC_USDC_PERP',quoteCurrency:'USDC',status:'TRADING'}]:[{symbol:'BTC_USDT',baseCurrency:'BTC',quoteCurrency:'USDT',enable:true},{symbol:'SHIB_USDT',quoteCurrency:'USDT',enable:false}];
  return new Response(JSON.stringify({result:true,timestamp:Date.now(),data:{symbols}}));
 }
 if(u.pathname==='/api/monitor/symbols'){
  if(!monitorUniverse)return new Response('{}',{status:404});
  return new Response(JSON.stringify({symbols:[{symbol:'BTC_USDT_PERP',type:'PERP',base:'BTC',quote:'USDT'},{symbol:'AAPLX_USDT_PERP',type:'PERP',base:'AAPLX',quote:'USDT'},{symbol:'BTC_USDT',type:'SPOT',base:'BTC',quote:'USDT'}],fetched_at:new Date().toISOString(),partial:monitorUniversePartial,source:'Pionex sync to R2'}));
 }
 if(u.pathname==='/api/monitor/klines'){
  if(!upstream)return new Response('{}',{status:502});
  return new Response(JSON.stringify({ok:true,source:'PIONEX_LIVE',fetched_at:new Date().toISOString(),klines:u.searchParams.get('interval')==='15M'?bars15:candles}));
 }
 if(u.hostname==='fapi.coinglass.com')return new Response('{}',{status:403});
 if(u.hostname==='cmc-fear-greed.youjianchonglangshou.workers.dev'){
  const timestamp=Math.floor(Date.now()/1000);
  if(u.pathname==='/api/latest')return new Response(JSON.stringify({data:{timestamp,value:35}}));
  if(u.pathname==='/api/historical')return new Response(JSON.stringify({data:[{timestamp:timestamp-172800,value:12},{timestamp:timestamp-86400,value:31},{timestamp,value:35}]}));
 }
 if(u.pathname==='/api/snapshot')return new Response(JSON.stringify({records:[{symbol:'BTC',api_symbol:'BTC_USDT_PERP',price:1},{symbol:'ETH'}]}));
 if(u.pathname==='/api/monitor/watchlist')return new Response(JSON.stringify({items:[{symbol:'BTC_USDT_PERP'}]}));
 if(u.pathname==='/api/champion/performance')return new Response(JSON.stringify({win_rate:0.52}));
 if(u.pathname==='/api/model/active')return new Response(JSON.stringify({version:'model-test'}));
 throw Error('unexpected URL '+url);
};
const tests=[];
async function check(name,fn){await fn();tests.push(name);console.log('PASS',name);}
async function rpc(method,params={},env={},headers={}){
 const r=await worker.fetch(new Request('https://sstate-mcp.test/mcp',{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})}),env);
 assert.equal(r.status,200);return r.json();
}
try{
 await check('initialize',async()=>{const p=await rpc('initialize',{protocolVersion:'2025-11-25'});assert.equal(p.result.protocolVersion,'2025-11-25');});
 await check('tools list eleven tools',async()=>{const p=await rpc('tools/list');assert.equal(p.result.tools.length,11);assert.ok(p.result.tools.some(t=>t.name==='get_pionex_contracts')); assert.ok(p.result.tools.every(t=>t.annotations.readOnlyHint));assert.ok(p.result.tools.find(x=>x.name==='get_liquidation_bounds'));assert.ok(p.result.tools.find(x=>x.name==='get_fear_greed_today'));});
 await check('Pionex PERP official list filters disabled and non-USDT',async()=>{const p=await rpc('tools/call',{name:'get_pionex_contracts',arguments:{}});const d=p.result.structuredContent;assert.equal(d.source,'PIONEX_OFFICIAL_API');assert.equal(d.total,2);assert.equal(d.partial,false);assert.ok(d.symbols.some(r=>r.symbol==='AMDX_USDT_PERP'));assert.ok(!d.symbols.some(r=>r.symbol==='ETH_USDT_PERP'));});
 await check('Pionex all markets and search',async()=>{const p=await rpc('tools/call',{name:'get_pionex_contracts',arguments:{type:'ALL',query:'BTC'}});const d=p.result.structuredContent;assert.equal(d.total,3);assert.equal(d.matched_total,2);assert.deepEqual(d.symbols.map(r=>r.type).sort(),['PERP','SPOT']);});
 await check('Pionex contract paging',async()=>{const p=await rpc('tools/call',{name:'get_pionex_contracts',arguments:{limit:1,offset:0}});const d=p.result.structuredContent;assert.equal(d.returned,1);assert.equal(d.total,2);assert.equal(d.has_more,true);});
 await check('Pionex direct 429 R2 fallback',async()=>{pionexSymbolApi=false;const p=await rpc('tools/call',{name:'get_pionex_contracts',arguments:{query:'AAPL'}});const d=p.result.structuredContent;assert.equal(d.source,'SSTATE_MONITOR_R2');assert.equal(d.matched_total,1);assert.ok(d.warnings.some(w=>w.includes('429')));pionexSymbolApi=true;});
 await check('Pionex monitor partial is disclosed',async()=>{pionexSymbolApi=false;monitorUniversePartial=true;const p=await rpc('tools/call',{name:'get_pionex_contracts',arguments:{}});assert.equal(p.result.structuredContent.partial,true);monitorUniversePartial=false;pionexSymbolApi=true;});
 await check('Pionex both sources unavailable returns MCP error',async()=>{pionexSymbolApi=false;monitorUniverse=false;const p=await rpc('tools/call',{name:'get_pionex_contracts',arguments:{}});assert.equal(p.result.isError,true);pionexSymbolApi=true;monitorUniverse=true;});
 await check('Pionex invalid search rejected',async()=>{const p=await rpc('tools/call',{name:'get_pionex_contracts',arguments:{query:'BTC&status=ALL'}});assert.equal(p.result.isError,true);});
 await check('indicators identical to original engine',async()=>{const p=await rpc('tools/call',{name:'get_market_states',arguments:{symbols:['BTC','ETH']}});const data=p.result.structuredContent;assert.equal(data.success,2);
  const revised=candles.map(x=>({...x}));revised[179]={...revised[179],time:today,open:49900,high:50500,low:49700,close:50300};
  const a=engine.analyze(revised);const row=data.results[0];assert.equal(row.price,a.price);assert.equal(row.s_state,a.s_state);assert.equal(row.average_k,a.average_k);assert.equal(row.cci_sma,a.cci_sma);assert.deepEqual(row.midline_details,a.midline);});
 await check('details last 30 daily indicators',async()=>{const p=await rpc('tools/call',{name:'get_symbol_detail',arguments:{symbol:'BTC'}});assert.equal(p.result.structuredContent.results[0].chart_30d.length,30);});
 await check('scanner outage fallback marked nonlive',async()=>{tv=false;const p=await rpc('tools/call',{name:'get_market_states',arguments:{symbols:['BTC']}});assert.equal(p.result.structuredContent.results[0].is_live_quote,false);tv=true;});
 await check('no invented indicator when kline missing',async()=>{upstream=false;const p=await rpc('tools/call',{name:'get_market_states',arguments:{symbols:['BTC']}});assert.equal(p.result.structuredContent.success,0);assert.equal(p.result.structuredContent.results[0].available,false);upstream=true;});
 await check('scan filter',async()=>{const p=await rpc('tools/call',{name:'scan_market_states',arguments:{symbols:['BTC','ETH'],average_k:'yellow'}});assert.ok(p.result.structuredContent.filtered_count>=0);});
 await check('find snapshot symbol',async()=>{const p=await rpc('tools/call',{name:'find_symbols',arguments:{query:'BTC'}});assert.equal(p.result.structuredContent.rows.length,1);});
 await check('private watchlist blocked',async()=>{const p=await rpc('tools/call',{name:'get_watchlist',arguments:{}});assert.equal(p.result.isError,true);});
 await check('performance',async()=>{const p=await rpc('tools/call',{name:'get_performance',arguments:{}});assert.equal(p.result.structuredContent.win_rate,.52);});
 await check('model',async()=>{const p=await rpc('tools/call',{name:'get_model',arguments:{}});assert.equal(p.result.structuredContent.version,'model-test');});
 await check('watchlist authorized with bearer',async()=>{const p=await rpc('tools/call',{name:'get_watchlist',arguments:{}},{ENABLE_PRIVATE_WATCHLIST:'true',MCP_READ_TOKEN:'testsecret'},{Authorization:'Bearer testsecret'});assert.equal(p.result.structuredContent.items.length,1);});
 await check('invalid symbol rejected',async()=>{const p=await rpc('tools/call',{name:'get_market_states',arguments:{symbols:['$bad']}});assert.equal(p.result.isError,true);});
 await check('health',async()=>{const r=await worker.fetch(new Request('https://sstate-mcp.test/health'));assert.equal((await r.json()).ok,true);});
 await check('health commit fingerprint',async()=>{const r=await worker.fetch(new Request('https://sstate-mcp.test/health'),{DEPLOY_COMMIT:'0123456789abcdef'});assert.equal((await r.json()).deploy_commit,'0123456789abcdef');});
 await check('CoinGlass upper/lower parser exact radar schema',async()=>{
  const rows=extractCoinGlass({payload:[{symbol:'BTC',maxLongLiquidationPrice:106,maxShortLiquidationPrice:94,maxLongLiquidationLevel:3500,maxShortLiquidationLevel:2800},{symbol:'1000PEPE',maxLongLiquidationPrice:15,maxShortLiquidationPrice:10}]});
  const btc=resolveCoinGlass('BTC',rows),pepe=resolveCoinGlass('PEPE',rows);
  assert.equal(btc.upper,106);assert.equal(btc.lower,94);assert.equal(btc.upAmount,3500);
  assert.equal(pepe.upper,.015);assert.equal(pepe.lower,.01);assert.equal(pepe.unit_factor,1000);
  assert.equal(normalizeSymbol('PIONEX:BTCUSDT.P'),'BTC');
 });
 await check('real CoinGlass 7D preferred when verified',async()=>{
  const p=await getLiquidityBounds('BTC',{coinglass:async()=>({data:{coins:[{symbol:'BTC',maxLongLiquidationPrice:105,maxShortLiquidationPrice:95}]},version:'77'}),priceReader:async()=>({price:100,source:'TEST'}),barsReader:async()=>{throw Error('must not read proxy')}});
  assert.equal(p.source,'COINGLASS_7D');assert.equal(p.range,'7d');assert.equal(p.is_estimate,false);assert.ok(Math.abs(p.upper_pct-5)<1e-8);
 });
 await check('proxy bounds reuse 15M radar algorithm',async()=>{
  const p=await rpc('tools/call',{name:'get_liquidation_bounds',arguments:{symbol:'BTC'}});
  const d=p.result.structuredContent;
  assert.equal(d.available,true);assert.equal(d.is_estimate,true);assert.notEqual(d.source,'COINGLASS_7D');assert.ok(d.upper_zones.length>=1);assert.ok(d.lower_zones.length>=1);
  assert.equal(d.upper_liquidation_amount,null);assert.equal(d.lower_liquidation_amount,null);
  const a=candidateZones(bars15.map(x=>({t:x.time,o:x.open,h:x.high,l:x.low,c:x.close,v:x.volume})),d.proxy_reference_price);
  assert.ok(Math.abs(d.upper-a.upper[0].price)<.00001);
 });
 await check('unknown CoinGlass & unavailable proxy must not invent bounds',async()=>{
  const p=await getLiquidityBounds('UNKNOWNCOIN',{coinglass:async()=>{throw Error('unsupported')},priceReader:async()=>null,barsReader:async()=>{throw Error('blocked')}});
  assert.equal(p.available,false);assert.equal(p.upper,undefined);assert.equal(p.lower,undefined);
 });
 await check('CoinGlass 7D may disable estimated fallback',async()=>{
  const p=await rpc('tools/call',{name:'get_liquidation_bounds',arguments:{symbol:'BTC',allow_proxy:false}});
  assert.equal(p.result.structuredContent.available,false);
 });
 await check('CMC fear and greed latest and semantic direction',async()=>{
  const p=await rpc('tools/call',{name:'get_fear_greed_today',arguments:{}});
  const d=p.result.structuredContent;assert.equal(d.value,35);assert.equal(d.category,'恐懼');
  assert.equal(d.source,'CMC_EXISTING_WORKER');assert.equal(d.semantic_color,'orange');
  assert.equal(d.is_same_taipei_date,true);
 });
 await check('CMC custom purple/yellow trend parity',async()=>{
  assert.equal(classifyCMC([{value:85},{value:50},{value:39}]).at(-1),'purple');
  assert.equal(classifyCMC([{value:15},{value:30},{value:34}]).at(-1),'orange');
 });
 await check('CMC official keyless fallback when original Worker is 404',async()=>{
  const t=Date.now(),time=new Date(t).toISOString();
  const d=await getFearGreedToday({getJSON:async(url)=>{
   if(url.includes('cmc-fear-greed.youjianchonglangshou.workers.dev'))throw Error('HTTP 404');
   if(url.includes('/latest'))return {status:{error_code:0},data:{value:42,update_time:time}};
   if(url.includes('/historical'))return {status:{error_code:0},data:[{timestamp:Math.floor((t-86400000)/1000),value:38}]};
   throw Error('unexpected '+url);
  }});
  assert.equal(d.available,true);assert.equal(d.value,42);assert.equal(d.source,'CMC_OFFICIAL_KEYLESS_API');
  assert.equal(d.semantic_color,'yellow');assert.ok(d.warnings.some(x=>x.includes('Worker unavailable')));
 });
 await check('CMC unavailable stays unavailable, no alternative index',async()=>{
  const p=await getFearGreedToday({getJSON:async()=>{throw Error('outage')}});
  assert.equal(p.available,false);assert.equal(p.value,undefined);
 });
 await check('MCP GET denied',async()=>{const r=await worker.fetch(new Request('https://sstate-mcp.test/mcp'));assert.equal(r.status,405);});
 console.log('TOTAL',tests.length,'PASS');
}finally{globalThis.fetch=originalFetch;}
