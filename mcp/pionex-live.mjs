/**
 * Pionex-only quote snapshot for stateless MCP calls.
 * Uses the SAME SState /api/monitor/ws relay and Pionex TRADE topic as
 * MultiAssetLiquidityRadar/price-stream.js. No TradingView or other exchanges.
 * A call subscribes temporarily; Cloudflare MCP workers cannot read a browser's
 * existing WebSocket session. When a trade does not arrive during this call,
 * same-exchange Pionex tickers are the only fallback (clearly tagged REST).
 */
const symbolOk = s => /^[A-Z0-9]{1,35}_USDT_PERP$/.test(s);
const nowIso = () => new Date().toISOString();
const ms = t => {const n=Number(t);return Number.isFinite(n)&&n>0?(n<1e12?n*1000:n):null;};
function eventQuotes(msg,desired){
 if(String(msg?.topic||'').toUpperCase()!=='TRADE')return [];
 const data=Array.isArray(msg.data)?msg.data:msg.data&&typeof msg.data==='object'?[msg.data]:[];
 const out=[];
 for(const d of data){const symbol=String(d?.symbol||msg.symbol||'').toUpperCase(),price=Number(d?.price),at=ms(d?.timestamp??msg.timestamp);
   if(!desired.has(symbol)||!Number.isFinite(price)||price<=0||!at||at>Date.now()+60000||Date.now()-at>90000)continue;
   out.push({symbol,price,trade_at:new Date(at).toISOString(),fetched_at:nowIso(),source:'PIONEX_WEBSOCKET_TRADE',is_live_quote:true});
 }
 return out;
}
export async function websocketQuotes(symbols,{relay,fetcher=fetch,waitMs=7500}={}){
 const wanted=[...new Set(symbols.map(x=>String(x).toUpperCase()).filter(symbolOk))];
 if(!wanted.length)return {quotes:new Map(),warnings:[]};
 const messages=[],quotes=new Map();let socket=null,settled=false,timer=null,paceTimer=null;
 try{
   const url=new URL('/api/monitor/ws',relay);
   const response=await fetcher(url.toString(),{headers:{Upgrade:'websocket'}});
   if(response.status!==101||!response.webSocket)throw Error('Pionex WS relay upgrade unavailable ('+response.status+')');
   socket=response.webSocket;socket.accept();
   return await new Promise(resolve=>{
     const finish=(warning='')=>{if(settled)return;settled=true;clearTimeout(timer);clearInterval(paceTimer);try{socket.close(1000,'snapshot complete')}catch(_){}resolve({quotes,warnings:warning?[warning]:[]});};
     const queue=[...wanted];
     const subscribe=()=>{
       if(!queue.length){clearInterval(paceTimer);paceTimer=null;return;}
       try{socket.send(JSON.stringify({op:'SUBSCRIBE',topic:'TRADE',symbol:queue.shift()}));}
       catch(e){finish('Pionex WS subscribe: '+String(e?.message||e));}
     };
     socket.addEventListener('message',event=>{
       let raw;try{raw=typeof event.data==='string'?JSON.parse(event.data):JSON.parse(String(event.data));}catch{return;}
       const parts=Array.isArray(raw)?raw:[raw];
       for(const msg of parts){
         if(String(msg?.op||'').toUpperCase()==='PING')continue; // Relay answers PIONEX upstream PING.
         if(['ERROR','SUBSCRIBE_ERROR'].includes(String(msg?.op||'').toUpperCase())){messages.push('Pionex WS '+String(msg.symbol||'')+': '+String(msg.message||msg.error||'subscription error'));continue;}
         for(const row of eventQuotes(msg,new Set(wanted))){const prior=quotes.get(row.symbol);if(!prior||Date.parse(row.trade_at)>=Date.parse(prior.trade_at))quotes.set(row.symbol,row);}
       }
       if(quotes.size===wanted.length)finish(messages.join(' | '));
     });
     socket.addEventListener('close',()=>finish('Pionex WS closed before full snapshot'));
     socket.addEventListener('error',()=>finish('Pionex WS connection error'));
     subscribe();
     if(queue.length)paceTimer=setInterval(subscribe,320); // <= 4 client messages/sec
     timer=setTimeout(()=>finish(messages.join(' | ') || `Pionex WS window elapsed; trades for ${quotes.size}/${wanted.length} symbols`),Math.max(1500,Math.min(14000,Math.max(waitMs,wanted.length*340+1800))));
   });
 }catch(e){try{socket?.close()}catch(_){}return {quotes,warnings:['Pionex WebSocket unavailable: '+String(e?.message||e)]};}
}
export async function officialTickerQuotes(symbols,{relay,fetchJson}={}){
 const wanted=new Set(symbols),quotes=new Map(),warnings=[];
 if(!wanted.size)return {quotes,warnings};
 const endpoints=[new URL('/api/monitor/tickers?type=PERP',relay).toString(),'https://api.pionex.com/api/v1/market/tickers?type=PERP'];
 for(const url of endpoints){
  try{
    const data=await fetchJson(url);
    const rows=data?.tickers||data?.data?.tickers;
    if(!Array.isArray(rows))throw Error('no Pionex ticker array');
    const source=url.includes('/api/monitor/tickers')?'PIONEX_WORKER_TICKERS':'PIONEX_OFFICIAL_TICKERS';
    for(const row of rows){const symbol=String(row?.symbol||'').toUpperCase(),price=Number(row.price??row.close);if(!wanted.has(symbol)||!Number.isFinite(price)||price<=0)continue;
      const t=ms(row.time)||Date.parse(data.fetched_at||'')||Date.now();
      quotes.set(symbol,{symbol,price,trade_at:new Date(t).toISOString(),fetched_at:nowIso(),source,is_live_quote:false});
    }
    if(quotes.size===wanted.size)break;
  }catch(e){warnings.push('Pionex same-exchange ticker: '+String(e?.message||e));}
 }
 return {quotes,warnings};
}
export async function getPionexQuotes(symbols,{relay,fetcher=fetch,fetchJson,waitMs=7500}={}){
 const wanted=[...new Set(symbols.map(x=>String(x).toUpperCase()).filter(symbolOk))];
 const ws=await websocketQuotes(wanted,{relay,fetcher,waitMs});
 const missing=wanted.filter(x=>!ws.quotes.has(x));
 const res=missing.length?await officialTickerQuotes(missing,{relay,fetchJson}):{quotes:new Map(),warnings:[]};
 return {quotes:new Map([...res.quotes,...ws.quotes]),warnings:[...ws.warnings,...res.warnings],
  received_ws:ws.quotes.size,received_pionex_rest:res.quotes.size,missing:wanted.filter(x=>!ws.quotes.has(x)&&!res.quotes.has(x))};
}
