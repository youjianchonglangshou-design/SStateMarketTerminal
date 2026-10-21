import assert from 'node:assert/strict';
import worker from './worker.mjs';
import '../monitor-engine.js';
const engine=globalThis.SStateMonitorEngine;
const today=Math.floor(Date.now()/86400000)*86400000;
const candles=Array.from({length:180},(_,i)=>{const time=today-(179-i)*86400000;const mid=45000+300*Math.sin(i/12)+i*13;return {time,open:mid-70,high:mid+140,low:mid-130,close:mid+50,volume:300+i};});
const originalFetch=globalThis.fetch;
let tv=true,upstream=true;
globalThis.fetch=async(url,options={})=>{
 const u=new URL(url);
 if(u.hostname==='scanner.tradingview.com'){
  if(!tv)return new Response('{}',{status:403});
  const body=JSON.parse(options.body);
  const data=body.symbols.tickers.map(s=>({s,d:[s.split(':')[1],50300,49900,50500,49700]}));
  return new Response(JSON.stringify({data}),{status:200});
 }
 if(u.pathname==='/api/monitor/klines'){
  if(!upstream)return new Response('{}',{status:502});
  return new Response(JSON.stringify({ok:true,source:'PIONEX_LIVE',fetched_at:new Date().toISOString(),klines:candles}));
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
 await check('tools list eight tools',async()=>{const p=await rpc('tools/list');assert.equal(p.result.tools.length,8);assert.ok(p.result.tools.every(t=>t.annotations.readOnlyHint));});
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
 await check('MCP GET denied',async()=>{const r=await worker.fetch(new Request('https://sstate-mcp.test/mcp'));assert.equal(r.status,405);});
 console.log('TOTAL',tests.length,'PASS');
}finally{globalThis.fetch=originalFetch;}
