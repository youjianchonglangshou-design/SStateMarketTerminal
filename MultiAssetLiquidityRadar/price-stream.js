/* MultiAssetLiquidityRadar v2.1.13 — Pionex TRADE over existing SState Worker relay.
 * One connection per page; no price polling; dynamically tracks the active PERP watchlist.
 * The owning app decides source priority and price freshness. */
(function(root){'use strict';
 const ENDPOINT='wss://white-meadow-16bc.youjianchonglangshou.workers.dev/api/monitor/ws';
 const PACE=350, STALL=90000, COOLDOWN=35000;
 const validSymbol=s=>/^[A-Z0-9]{1,24}_USDT_PERP$/.test(s);
 let socket=null,seq=0,shouldRun=false,connectedAt=0,lastTradeAt=0,lastRecoveryAt=0;
 let reconnectTimer=null,handshakeTimer=null,sendTimer=null,healthTimer=null,resumeTimer=null;
 let reconnectCount=0,handshakeFailures=0,attempt=0,sentCount=0,tickCount=0;
 let desired=new Set(),subscribed=new Set(),failed=new Map(),received=new Set(),pending=[],lastEventTime=new Map();
 let status='idle',onQuote=()=>{},onState=()=>{},lastReportedAt=0;
 let quoteBatch=new Map(),quoteTimer=null;
 const now=()=>Date.now();
 const clearTimer=(h)=>{if(h)clearTimeout(h);};
 const validPrice=n=>Number.isFinite(n)&&n>0;
 const ms=t=>{const x=Number(t);if(!Number.isFinite(x)||x<=0)return null;return x<1e12?Math.round(x*1000):Math.round(x);};
 function snapshot(){return {state:status,desired:desired.size,subscribed:subscribed.size,received:received.size,failed:Object.fromEntries(failed),connectedAt,lastTradeAt,tickCount,reconnectCount,handshakeFailures,readyState:socket?.readyState??3};}
 function emit(s){status=s;onState(snapshot());}
 function purgeTimers(){for(const t of [handshakeTimer,reconnectTimer,sendTimer,resumeTimer,quoteTimer])clearTimer(t);handshakeTimer=reconnectTimer=sendTimer=resumeTimer=quoteTimer=null;quoteBatch.clear();}
 function flushQuotes(){quoteTimer=null;for(const q of quoteBatch.values())onQuote(q);quoteBatch.clear();}
 function bufferQuote(q){const old=quoteBatch.get(q.symbol);if(old){
   quoteBatch.set(q.symbol,{...q,high:Math.max(old.high,q.high),low:Math.min(old.low,q.low)});
  }else quoteBatch.set(q.symbol,{...q,high:q.high??q.price,low:q.low??q.price});
  if(!quoteTimer)quoteTimer=setTimeout(flushQuotes,250);
 }
 function closeSocket(){if(!socket)return;const old=socket;socket=null;old.onopen=old.onclose=old.onerror=old.onmessage=null;try{old.close(1000,'replace');}catch(_){}}
 function schedule(){if(!shouldRun||reconnectTimer)return;
  emit('retry');const delay=Math.min(30000,1600*Math.pow(2,Math.min(5,attempt++)));
  reconnectTimer=setTimeout(()=>{reconnectTimer=null;connect();},delay);
 }
 function pump(){if(sendTimer||!shouldRun)return;
  const run=()=>{sendTimer=null;if(!socket||socket.readyState!==1||!shouldRun)return;
   const job=pending.shift();if(!job)return;
   if(job.op==='SUBSCRIBE'&&!desired.has(job.symbol)) {sendTimer=setTimeout(run,PACE);return;}
   if(job.op==='UNSUBSCRIBE'&&desired.has(job.symbol)) {sendTimer=setTimeout(run,PACE);return;}
   try{socket.send(JSON.stringify({op:job.op,topic:'TRADE',symbol:job.symbol}));sentCount++;}
   catch(_){failed.set(job.symbol,'send failed');onState(snapshot());}
   if(pending.length)sendTimer=setTimeout(run,PACE);
  };sendTimer=setTimeout(run,PACE);
 }
 function sync(list){const next=new Set((Array.isArray(list)?list:[]).map(x=>String(typeof x==='string'?x:x?.pionex||'').toUpperCase()).filter(validSymbol));
  const added=[...next].filter(x=>!desired.has(x)),removed=[...desired].filter(x=>!next.has(x)); desired=next;
  for(const symbol of removed){subscribed.delete(symbol);failed.delete(symbol);received.delete(symbol);lastEventTime.delete(symbol);pending=pending.filter(x=>x.symbol!==symbol);if(socket?.readyState===1)pending.push({op:'UNSUBSCRIBE',symbol});}
  for(const symbol of added)if(socket?.readyState===1)pending.push({op:'SUBSCRIBE',symbol});
  if(removed.length||added.length){onState(snapshot());pump();}
 }
 function trades(msg){const arr=Array.isArray(msg.data)?msg.data:msg.data&&typeof msg.data==='object'?[msg.data]:[];
  const newest=new Map();for(const e of arr){const symbol=String(e?.symbol||msg.symbol||'').toUpperCase(),price=Number(e?.price);if(!desired.has(symbol)||!validPrice(price))continue;
   const tradeAt=ms(e?.timestamp??msg.timestamp)??now();if(tradeAt>now()+60000)continue;
   const prev=newest.get(symbol);if(tradeAt<(lastEventTime.get(symbol)||0))continue;
   if(!prev)newest.set(symbol,{symbol,price,tradeAt,high:price,low:price});
   else{prev.high=Math.max(prev.high,price);prev.low=Math.min(prev.low,price);if(tradeAt>=prev.tradeAt){prev.price=price;prev.tradeAt=tradeAt;}}
  }
  for(const q of newest.values()){
   if(q.tradeAt<(lastEventTime.get(q.symbol)||0))continue;
   lastEventTime.set(q.symbol,q.tradeAt);lastTradeAt=now();received.add(q.symbol);failed.delete(q.symbol);tickCount++;
   bufferQuote({...q,receivedAt:lastTradeAt,source:'Pionex WebSocket'});
  }
  if(newest.size&&now()-lastReportedAt>=2000){lastReportedAt=now();onState(snapshot());}
 }
 function message(evt,gen){if(gen!==seq)return;
  if(typeof evt.data!=='string'){
   if(evt.data instanceof ArrayBuffer){message({data:new TextDecoder().decode(evt.data)},gen);return;}
   if(typeof Blob!=='undefined'&&evt.data instanceof Blob){evt.data.text().then(data=>message({data},gen)).catch(()=>{});}return;
  }
  let p;try{p=JSON.parse(evt.data);}catch(_){return;}
  if(Array.isArray(p)){p.forEach(x=>message({data:JSON.stringify(x)},gen));return;}
  if(!p||typeof p!=='object')return;const op=String(p.op||p.type||'').toUpperCase();
  if(op==='PING'){
   // Worker relay already answers upstream PING. Browser PONG is swallowed by relay.
   try{if(socket?.readyState===1)socket.send(JSON.stringify({op:'PONG',timestamp:p.timestamp??now()}));}catch(_){}return;
  }
  if(op==='SUBSCRIBED'){const sym=String(p.symbol||'').toUpperCase();if(desired.has(sym)){subscribed.add(sym);failed.delete(sym);onState(snapshot());}return;}
  if(op==='ERROR'||op==='SUBSCRIBE_ERROR'||p.error){const sym=String(p.symbol||'').toUpperCase();if(desired.has(sym)){failed.set(sym,String(p.message||p.msg||p.error||p.code||'subscription error'));subscribed.delete(sym);onState(snapshot());}return;}
  if(String(p.topic||'').toUpperCase()==='TRADE')trades(p);
 }
 function connect(){if(!shouldRun)return;purgeTimers();closeSocket();const gen=++seq;emit('connecting');connectedAt=0;subscribed.clear();failed.clear();received.clear();pending=[];sentCount=0;onState(snapshot());
  let ws;try{ws=new WebSocket(ENDPOINT);}catch(_){handshakeFailures++;schedule();return;}socket=ws;
  handshakeTimer=setTimeout(()=>{if(gen!==seq||ws.readyState===1)return;try{ws.close();}catch(_){}},12000);
  ws.onopen=()=>{if(gen!==seq)return;clearTimer(handshakeTimer);handshakeTimer=null;attempt=0;handshakeFailures=0;connectedAt=now();emit('connected');
   // BTC is prioritized for aggregate stream-health diagnostics.
   const names=[...desired].sort((a,b)=>(a.startsWith('BTC_')?-1:0)-(b.startsWith('BTC_')?-1:0));
   pending=names.map(symbol=>({op:'SUBSCRIBE',symbol}));pump();
  };
  ws.onmessage=e=>message(e,gen);
  ws.onerror=()=>{if(gen===seq)onState(snapshot());};
  ws.onclose=()=>{if(gen!==seq)return;clearTimer(handshakeTimer);handshakeTimer=null;socket=null;subscribed.clear();onState(snapshot());if(!connectedAt)handshakeFailures++;if(shouldRun){reconnectCount++;schedule();}};
 }
 function check(force=false){if(!shouldRun)return;const t=now(),rs=socket?.readyState;
  if(rs===1){const baseline=Math.max(connectedAt,lastTradeAt);if(connectedAt&&t-baseline>STALL&&t-lastRecoveryAt>COOLDOWN){lastRecoveryAt=t;reconnectCount++;connect();}}
  else if(rs===0){/* handshake timeout handles slow connects */}
  else if(force&&!reconnectTimer&&t-lastRecoveryAt>COOLDOWN){lastRecoveryAt=t;connect();}
 }
 function resume(){clearTimer(resumeTimer);resumeTimer=setTimeout(()=>check(true),1800);}
 function start(config){if(shouldRun)return;onQuote=config?.onQuote||onQuote;onState=config?.onState||onState;shouldRun=true;sync(config?.symbols||[]);connect();
  healthTimer=setInterval(()=>check(false),15000);
  document.addEventListener('visibilitychange',visibility);root.addEventListener('focus',resume);root.addEventListener('pageshow',pageShow);root.addEventListener('online',resume);
 }
 function visibility(){if(!document.hidden)resume();}
 function pageShow(e){if(e.persisted)resume();}
 function stop(){shouldRun=false;seq++;purgeTimers();clearTimer(healthTimer);healthTimer=null;closeSocket();document.removeEventListener('visibilitychange',visibility);root.removeEventListener('focus',resume);root.removeEventListener('pageshow',pageShow);root.removeEventListener('online',resume);emit('stopped');}
 root.LIQ_PRICE_STREAM=Object.freeze({start,stop,sync,inspect:snapshot,check,endpoint:ENDPOINT});
})(window);
