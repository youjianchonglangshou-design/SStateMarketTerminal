/* Pionex WebSocket live prices proof-of-concept v1.0.1.
 * Sources: live symbols.js (GitHub Pages, with bundled fallback), Pionex PUBLIC futures TRADE WS.
 * NO polling, NO fabricated quotations, NO API credentials.
 */
(()=>{'use strict';
const ENDPOINT='wss://ws.pionex.com/wsPub';
const REMOTE_SYMBOLS='https://youjianchonglangshou-design.github.io/SStateMarketTerminal/MultiAssetLiquidityRadar/symbols.js';
const PACE_MS=340; // under published <=5 outgoing messages / second connection limit (and PONG headroom)
const STALE_MS=30000;
const $=id=>document.getElementById(id);
const nowTime=ms=>new Date(ms).toLocaleTimeString('zh-TW',{timeZone:'Asia/Taipei',hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'});
let symbols=[], rows=new Map(), prices=new Map(), socket=null, manualStop=false, reconnectTimer=null, subscribeTimer=null;
let generation=0, retryCount=0, connectedAt=0, successful=new Set(), subs=new Set(), failures=new Map();
let tickCount=0, lastPushed=0, logCount=0, flushTimer=null, pendingRender=new Set(), sourceName='';
let connectionMode='connecting', connectMode='all', openedThisAttempt=false, handshakeFailures=0, handshakeTimer=null;
function isLocal(){return location.protocol==='file:';}
function clearHandshakeTimer(){if(handshakeTimer){clearTimeout(handshakeTimer);handshakeTimer=null;}}
function originHelp(){
 const n=$('originNotice');if(!n)return;
 if(isLocal()){
  n.className='origin-note caution';
  n.innerHTML='<strong>目前使用本機 file:// 開啟</strong>：若 WebSocket 連續出現 1006，請再以 GitHub Pages HTTPS 開啟相同網頁對照。1006 不能單獨證明是 file:// 導致。<span>Chrome 按 F12 → Network → WS → 選 wsPub 查看握手回應；若沒有 101 Switching Protocols，表示尚未建立連線。</span>';
 }else{
  n.className='origin-note';
  n.textContent='目前來源：'+location.origin+'。若連線失敗，使用 F12 → Network → WS 查找 wsPub 的握手 HTTP 狀態，可能是交易所連線策略、網路或瀏覽器限制。';
 }
}

function log(message,level='info'){
 const entry=document.createElement('div');entry.className=level==='error'?'bad':level==='ok'?'ok':'';
 entry.textContent=`[${nowTime(Date.now())}] ${message}`;$('logs').prepend(entry);
 while($('logs').children.length>80)$('logs').lastElementChild.remove();
 if(level==='error')$('errorCount').textContent=String(++logCount);
}
function status(state,detail){
 connectionMode=state;
 const t={connecting:'連線中',connected:'已連線',retry:'等待重連',offline:'已停止',error:'連線中斷'};
 $('connState').textContent=t[state]||state;$('connDetail').textContent=detail||'';
 $('connDot').className='conn-dot '+(state==='connected'?'connected':state==='connecting'||state==='retry'?'connecting':'offline');
}
function formatPrice(raw){
 const n=Number(raw);if(!Number.isFinite(n)||n<=0)return '—';
 const text=String(raw);let decimals=(text.includes('.')?text.split('.')[1].replace(/0+$/,'').length:0);
 if(n<0.001)decimals=Math.max(decimals,8);
 decimals=Math.min(12,Math.max(decimals,n>=1000?2:n>=1?3:n>=0.01?5:6));
 return n.toLocaleString('en-US',{minimumFractionDigits:n>=1?2:0,maximumFractionDigits:decimals});
}
function isSymbolValid(entry){return entry&&/^[A-Z0-9]{1,20}_USDT_PERP$/.test(entry.pionex)&&/^[A-Z0-9]{1,20}$/.test(entry.id);}
function makeRow(s){
 const row=document.createElement('div');row.className='coin-row';row.dataset.symbol=s.id;
 const coin=document.createElement('div');coin.className='ticker';
 const name=document.createElement('div');name.innerHTML=`<span class="ticker-symbol"></span><small></small>`;
 name.querySelector('.ticker-symbol').textContent=s.id;name.querySelector('small').textContent=s.pionex;
 coin.append(name);
 const price=document.createElement('div');price.className='price';price.textContent='—';
 const last=document.createElement('div');last.className='last-seen';last.innerHTML='<span><i class="dot idle"></i>—</span><small>等待訂閱</small>';
 row.append(coin,price,last);
 rows.set(s.pionex,{row,price,last});
 return row;
}
function build(){
 rows.clear();const crypto=document.createDocumentFragment(),stock=document.createDocumentFragment();
 for(const s of symbols){const node=makeRow(s);(s.group==='crypto'?crypto:stock).appendChild(node);}
 $('cryptoRows').replaceChildren(crypto);$('stockRows').replaceChildren(stock);
 $('cryptoCount').textContent=String(symbols.filter(s=>s.group==='crypto').length);
 $('stockCount').textContent=String(symbols.filter(s=>s.group!=='crypto').length);
 $('totalCount').textContent=String(symbols.length);
 $('subCount').textContent=`0 / ${symbols.length}`;
 $('quoteCount').textContent=`0 / ${symbols.length}`;
 $('listSource').textContent=sourceName;
 filterRows();
}
function filterRows(){const q=$('filter').value.trim().toUpperCase();
 for(const s of symbols){const item=rows.get(s.pionex);if(item)item.row.hidden=!!q&&!(`${s.id} ${s.pionex}`.includes(q));}}
function updateNumbers(){
 $('subCount').textContent=`${subs.size} / ${symbols.length}`;
 $('quoteCount').textContent=`${successful.size} / ${symbols.length}`;
 $('tickCount').textContent=tickCount.toLocaleString('en-US');
 $('lastPush').textContent=lastPushed?nowTime(lastPushed):'—';
 $('lastPushInfo').textContent=lastPushed?`接收於 ${nowTime(lastPushed)}（台北）`:'等待第一筆成交';
}
function refreshRow(symbol){
 const ui=rows.get(symbol);if(!ui)return;
 const val=prices.get(symbol);const age=val?Date.now()-val.received:Infinity;
 let description='等待訂閱',time='—',state='idle';
 if(failures.has(symbol)){description='訂閱失敗';state='error';}
 else if(val){
   time=nowTime(val.tradeTime||val.received);
   if(age<STALE_MS&&connectionMode==='connected'){description='剛更新';state='live';}
   else {description=connectionMode==='connected'?'暫無新成交':'等待恢復連線';state='idle';}
 } else if(subs.has(symbol))description='已訂閱・待成交';
 else if(connectionMode==='connected')description='正在訂閱';
 else if(connectionMode==='retry'||connectionMode==='error')description='等待重連';
 const small=ui.last.querySelector('small');
 const line=ui.last.querySelector('span');
 line.replaceChildren();const dot=document.createElement('i');dot.className='dot '+state;line.append(dot,document.createTextNode(time));
 small.textContent=description;
 if(val){ui.price.textContent=formatPrice(val.raw);ui.price.classList.toggle('positive',val.direction>0);ui.price.classList.toggle('negative',val.direction<0);}
}
function scheduleDraw(symbol){if(symbol)pendingRender.add(symbol);if(flushTimer)return;
 flushTimer=setTimeout(()=>{flushTimer=null;for(const s of pendingRender)refreshRow(s);pendingRender.clear();updateNumbers();},125);
}
function refreshAll(){for(const s of symbols)refreshRow(s.pionex);updateNumbers();}
function tradeMessage(msg){
 const arr=Array.isArray(msg.data)?msg.data:msg.data&&typeof msg.data==='object'?[msg.data]:[];
 const valid=arr.filter(t=>t&&Number.isFinite(Number(t.price))&&Number(t.price)>0);
 if(!valid.length)return;
 // Exchange documentation says batch may contain newest-first trades. Pick max timestamp, not last element.
 const bySymbol=new Map();
 for(const entry of valid){
  const sym=String(entry.symbol||msg.symbol||'').toUpperCase();if(!rows.has(sym))continue;
  tickCount++;
  const t=Number(entry.timestamp||msg.timestamp||Date.now());const time=Number.isFinite(t)&&t>0?t:Date.now();
  const existing=bySymbol.get(sym);if(!existing||time>existing.time)bySymbol.set(sym,{entry,time});
 }
 for(const [sym,{entry,time}] of bySymbol){
  const prev=prices.get(sym);
  if(prev&&time<prev.tradeTime)continue; // avoid reversing prices on out-of-order batches
  const n=Number(entry.price);const direction=prev?Math.sign(n-prev.num):0;
  prices.set(sym,{raw:String(entry.price),num:n,tradeTime:time,received:Date.now(),direction});
  successful.add(sym);failures.delete(sym);
  lastPushed=Date.now();
  scheduleDraw(sym);
 }
}
function handleMessage(evt,gen){
 if(gen!==generation)return;
 let parsed;
 try{
  if(typeof evt.data!=='string'){if(evt.data instanceof Blob){evt.data.text().then(data=>handleMessage({data},gen)).catch(()=>{});return;}
   if(evt.data instanceof ArrayBuffer){handleMessage({data:new TextDecoder().decode(evt.data)},gen);return;}}
  parsed=JSON.parse(evt.data);
 }catch(_){return;}
 if(Array.isArray(parsed)){for(const p of parsed)handleMessage({data:JSON.stringify(p)},gen);return;}
 if(!parsed||typeof parsed!=='object')return;
 const op=String(parsed.op||parsed.type||'').toUpperCase();
 if(op==='PING'){
  if(socket&&socket.readyState===WebSocket.OPEN){
   try{socket.send(JSON.stringify({op:'PONG',timestamp:parsed.timestamp??Date.now()}));}catch(e){log('PONG 發送失敗：'+e.message,'error');}
  }
  return;
 }
 if(op==='SUBSCRIBED'){
  const s=String(parsed.symbol||'').toUpperCase();if(rows.has(s)){subs.add(s);failures.delete(s);scheduleDraw(s);}return;
 }
 if(op==='ERROR'||op==='SUBSCRIBE_ERROR'||parsed.error){
  const symbol=String(parsed.symbol||'').toUpperCase();const msg=String(parsed.message||parsed.msg||parsed.error||parsed.code||'訂閱出錯');
  if(rows.has(symbol)){failures.set(symbol,msg);scheduleDraw(symbol);}
  log((symbol||'WS')+'：'+msg,'error');return;
 }
 if(String(parsed.topic||'').toUpperCase()==='TRADE')tradeMessage(parsed);
}
function cancelSubs(){if(subscribeTimer){clearInterval(subscribeTimer);subscribeTimer=null;}}
function cancelRetry(){if(reconnectTimer){clearTimeout(reconnectTimer);reconnectTimer=null;}}
function closeOld(){cancelSubs();clearHandshakeTimer();if(socket){const prev=socket;socket=null;prev.onclose=null;prev.onmessage=null;prev.onerror=null;prev.onopen=null;try{prev.close(1000,'replace');}catch(_){}}}
function start(mode=connectMode){
 connectMode=mode;manualStop=false;cancelRetry();closeOld();const gen=++generation;
 subs=new Set();failures=new Map();openedThisAttempt=false;connectedAt=0;
 status('connecting','先測試 BTC WebSocket 握手…');refreshAll();
 log(`連線階段：${isLocal()?'file://':'HTTPS'} · ${connectMode==='btc'?'僅 BTC':'BTC 成功後擴展所有合約'} · ${ENDPOINT}`);
 try{socket=new WebSocket(ENDPOINT);}catch(e){log('WebSocket 無法建立：'+e.message,'error');onConnectFail(gen);return;}
 const ws=socket;
 handshakeTimer=setTimeout(()=>{
  if(gen!==generation||openedThisAttempt||ws.readyState===WebSocket.OPEN)return;
  log('等待 WebSocket 開啟超過 12 秒，診斷為握手逾時；無法確認交易所是否收到請求。','error');
  try{ws.close();}catch(_){onConnectFail(gen);}
 },12000);
 ws.onopen=()=>{
  if(gen!==generation)return;
  openedThisAttempt=true;clearHandshakeTimer();handshakeFailures=0;connectedAt=Date.now();
  status('connected',connectMode==='btc'?'BTC 測試：連線建立成功':'握手成功，先訂閱 BTC 再擴展清單');
  log('WebSocket 握手成功 (OPEN)，開始訂閱 '+(connectMode==='btc'?'BTC':'全部 '+symbols.length+' 檔'),'ok');refreshAll();
  const btc=symbols.find(s=>s.id==='BTC')||symbols[0];
  const queue=connectMode==='btc'?[btc]:[btc,...symbols.filter(s=>s.pionex!==btc.pionex)];
  let index=0;
  function sendNext(){
   if(gen!==generation||ws.readyState!==WebSocket.OPEN){cancelSubs();return;}
   if(index>=queue.length){cancelSubs();status('connected',`已送出 ${index}/${queue.length} 檔訂閱，等待真實成交`);return;}
   const sym=queue[index++];
   try{ws.send(JSON.stringify({op:'SUBSCRIBE',topic:'TRADE',symbol:sym.pionex}));}
   catch(e){log(sym.id+' 訂閱失敗：'+e.message,'error');}
   if(index===queue.length){cancelSubs();status('connected',`已送出 ${index}/${queue.length} 檔訂閱`);}
  }
  sendNext();
  if(index<queue.length){
   // Give the BTC test a moment to receive either an acknowledgement or a live trade.
   subscribeTimer=setTimeout(()=>{
    subscribeTimer=null;
    if(gen!==generation||ws.readyState!==WebSocket.OPEN)return;
    log('BTC 握手已成功，繼續訂閱其他 '+(queue.length-1)+' 檔','ok');
    sendNext();if(index<queue.length)subscribeTimer=setInterval(sendNext,PACE_MS);
   },1800);
  }
 };
 ws.onmessage=e=>handleMessage(e,gen);
 ws.onerror=()=>{if(gen===generation)log('瀏覽器收到 WebSocket error，但 JS 無法讀取 HTTP 握手失敗原因；請用 F12 → Network → WS 檢查。','error');};
 ws.onclose=e=>{
  if(gen!==generation)return;
  clearHandshakeTimer();cancelSubs();socket=null;
  if(manualStop){status('offline','已手動停止');refreshAll();return;}
  if(!openedThisAttempt){
   handshakeFailures++;
   log(`握手未成功：code ${e.code}、wasClean=${e.wasClean}。這不是「沒有成交」，而是 WebSocket 尚未建立。`,'error');
   if(handshakeFailures>=2){
    status('error','握手連續失敗，已停止自動重試；請看下方診斷。');
    log('已停止重連，避免反覆敲擊派網伺服器。請比較 HTTPS GitHub Pages 與 file://，並檢查 F12 → Network → WS 的回應碼。','error');
    $('diagnostics').open=true;refreshAll();return;
   }
  }else{
   handshakeFailures=0;
   log(`已連上後斷線：code ${e.code}${e.reason?'，'+e.reason:''}`,'error');
  }
  scheduleRetry(gen);
 };
}
function onConnectFail(gen){handshakeFailures++;if(handshakeFailures>=2){status('error','無法建立 WebSocket，已停止自動重試');$('diagnostics').open=true;return;}scheduleRetry(gen);}
function scheduleRetry(gen){
 if(gen!==generation||manualStop)return;
 const delay=Math.min(30000,1800*Math.pow(2,Math.min(4,retryCount++)));
 status('retry',`約 ${Math.ceil(delay/1000)} 秒後重連 (${handshakeFailures}/2 次握手失敗)`);refreshAll();
 reconnectTimer=setTimeout(()=>{reconnectTimer=null;if(gen===generation&&!manualStop)start(connectMode);},delay);
}
function stop(){manualStop=true;generation++;cancelRetry();closeOld();status('offline','使用者已停止連線');refreshAll();log('已手動停止，不會自動重連');}
function loadScript(url,timeout=6500){return new Promise((resolve,reject)=>{
 const sc=document.createElement('script');let finished=false;
 const timer=setTimeout(()=>finish(false),timeout);
 function finish(ok){if(finished)return;finished=true;clearTimeout(timer);sc.onload=null;sc.onerror=null;if(!ok)sc.remove();ok?resolve():reject(new Error('載入失敗或逾時'));}
 sc.src=url;sc.async=true;sc.onload=()=>finish(true);sc.onerror=()=>finish(false);document.head.append(sc);
});}
async function boot(){
 $('connectBtn').addEventListener('click',()=>{retryCount=0;handshakeFailures=0;start('all');});
 $('probeBtn').addEventListener('click',()=>{retryCount=0;handshakeFailures=0;start('btc');});
 originHelp();
 $('stopBtn').addEventListener('click',stop);
 $('filter').addEventListener('input',filterRows);
 const remote=REMOTE_SYMBOLS+'?cache='+Math.floor(Date.now()/300000);
 try{await loadScript(remote);sourceName='GitHub Pages symbols.js（最新清單）';}
 catch(e){
  log('遠端清單無法載入，改用附帶的 symbols.js','error');
  if(Array.isArray(window.LIQ_SYMBOLS)&&window.LIQ_SYMBOLS.length){sourceName='單檔內附 symbols.js（備援）';}
  else {try{await loadScript('./symbols.js');sourceName='ZIP 內附 symbols.js（備援）';}
   catch(err){status('error','無法載入 symbols.js');log('本地清單載入失敗：'+err.message,'error');return;}}
 }
 const seen=new Set();symbols=(window.LIQ_SYMBOLS||[]).filter(s=>{
  if(!isSymbolValid(s)||seen.has(s.pionex))return false;seen.add(s.pionex);return true;
 });
 if(!symbols.length){status('error','清單不存在或沒有可用合約');log('symbols.js 沒有合法的 USDT_PERP 資料','error');return;}
 log(`成功載入 ${symbols.length} 檔：加密 ${symbols.filter(x=>x.group==='crypto').length}、美股商品 ${symbols.filter(x=>x.group!=='crypto').length}`,'ok');
 build();start('all');
 setInterval(()=>{if(!symbols.length)return;refreshAll();},3000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshAll();});
 window.PIONEX_WS_DEMO={inspect:()=>({connectionMode,openedThisAttempt,handshakeFailures,connectMode,total:symbols.length,subscriptions:[...subs],received:[...successful],ticks:tickCount,errors:Object.fromEntries(failures),lastPushed,source:sourceName})};
}
boot();
})();
