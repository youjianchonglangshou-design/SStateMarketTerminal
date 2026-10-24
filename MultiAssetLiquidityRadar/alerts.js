/* Multi-Asset Liquidity Radar v1.1.5 · SState Monitor shared Telegram price alerts.
 * No credentials or Telegram endpoints are stored in this browser script.
 * All persistence, Cron checks, Telegram delivery and one-shot deletion
 * remain in the existing SStateMarketTerminal Cloudflare Worker.
 */
(()=>{'use strict';
 const $=id=>document.getElementById(id);
 const ctx=window.LIQ_RADAR_ALERT_CONTEXT;
 const worker=String(window.SSTATE_CONFIG?.workerUrl||'').replace(/\/$/,'');
 const state={alerts:new Map(),telegramConfigured:null,activeSymbol:'',busy:false,refreshing:false,checking:false,toastTimer:null};
 const records=Array.isArray(ctx?.records)?ctx.records:[];
 const bySymbol=new Map(records.map(r=>[String(r.s.pionex||'').toUpperCase(),r]));
 const formatPrice=n=>{
   const x=Number(n); if(!Number.isFinite(x)||x<=0)return '—';
   if(x>=100)return x.toLocaleString('en-US',{maximumFractionDigits:4});
   if(x>=1)return x.toLocaleString('en-US',{maximumFractionDigits:6});
   if(x>=.001)return x.toLocaleString('en-US',{maximumFractionDigits:9});
   return x.toLocaleString('en-US',{maximumFractionDigits:15});
 };
 function toast(message,error=false){const el=$('liq-alert-toast');if(!el)return;el.textContent=message;el.classList.toggle('error',error);el.hidden=false;clearTimeout(state.toastTimer);state.toastTimer=setTimeout(()=>el.hidden=true,4200);}
 async function api(path,options={}){
   if(!worker)throw Error('SState config.js 尚未設定 Cloudflare Worker');
   const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),15000);
   try{
     const res=await fetch(worker+path,{cache:'no-store',...options,signal:ctrl.signal,headers:{'Content-Type':'application/json',...(options.headers||{})}});
     let body=null;try{body=await res.json();}catch(_){/* Some failures are not JSON */}
     if(!res.ok||body?.ok===false)throw Error(body?.error||body?.message||'HTTP '+res.status);
     return body||{};
   }finally{clearTimeout(timer);}
 }
 function normalizeAlert(row){
   const symbol=String(row?.symbol||'').trim().toUpperCase(),price=Number(row?.target_price);
   if(!symbol||!Number.isFinite(price)||price<=0)return null;
   return {id:String(row.id||''),symbol,type:row.type==='SPOT'?'SPOT':'PERP',target_price:price,direction:String(row.direction||'').toUpperCase()==='BELOW'?'BELOW':'ABOVE',armed:row.armed===true,last_price:Number(row.last_price)||null};
 }
 function setAlerts(rows){state.alerts=new Map((Array.isArray(rows)?rows:[]).map(normalizeAlert).filter(Boolean).map(x=>[x.symbol,x]));refreshBells();}
 function refreshBells(){
   for(const r of records){
     const bell=r.dom?.tr?.querySelector('.liq-alert-bell');if(!bell)continue;
     const symbol=String(r.s.pionex||'').toUpperCase(),alert=state.alerts.get(symbol);
     bell.classList.toggle('active',Boolean(alert));
     const label=alert?`${r.id} 已設定 ${alert.direction==='BELOW'?'≤':'≥'} ${formatPrice(alert.target_price)}，點擊修改或取消`:`設定 ${r.id} Telegram 價格提醒`;
     bell.title=label;bell.setAttribute('aria-label',label);
   }
 }
 function serviceStatus(msg,error=false){const el=$('liq-alert-service');el.textContent=msg;el.classList.toggle('error',error);}
 async function refreshAlerts(silent=true){
   if(state.refreshing)return;
   state.refreshing=true;
   try{
     const out=await api('/api/monitor/alerts');setAlerts(out.alerts||[]);
     state.telegramConfigured=out.telegram_configured!==false;
     if(!state.telegramConfigured){serviceStatus('Worker 尚未讀取到 Telegram Token 或 Chat ID',true);if(!silent)toast('Telegram 尚未配置',true);}
     else serviceStatus('已連線 SState 原有 Cloudflare／R2 提醒系統');
   }catch(e){serviceStatus('提醒同步失敗：'+e.message,true);if(!silent)toast('提醒同步失敗：'+e.message,true);}
   finally{state.refreshing=false;}
 }
 function currentPrice(symbol){const n=Number(ctx?.getCurrentPrice?.(symbol));return Number.isFinite(n)&&n>0?n:null;}
 function updateHint(){
   const price=currentPrice(state.activeSymbol),target=Number($('liq-alert-target').value),direction=$('liq-alert-direction').value;
   const hint=$('liq-alert-hint');
   if(!Number.isFinite(target)||target<=0){hint.textContent='輸入目標價格，並明確選擇上破／下破；不會自動猜方向。';return;}
   if(direction!=='ABOVE'&&direction!=='BELOW'){hint.textContent='請選擇穿越方向：上破＝先在下方再往上；下破＝先在上方再往下。';return;}
   const isAbove=direction==='ABOVE';
   const base=isAbove?`上破 ${formatPrice(target)}：必須先低於目標，再上穿 ≥ ${formatPrice(target)} 才提醒。`:`下破 ${formatPrice(target)}：必須先高於目標，再跌破 ≤ ${formatPrice(target)} 才提醒。`;
   if(!price){hint.textContent=base+' 現價尚未取得；雲端將自行確認起始位置。';return;}
   const ready=isAbove?price<target:price>target;
   hint.textContent=base+(ready?' 畫面現價位於起始側；以 Worker 最新報價確認是否啟動。':' 畫面現價已在觸發側，將等待返回起始側後再次穿越，不會立刻誤報。');
 }
 function openModal(symbol){
   const r=bySymbol.get(symbol);if(!r)return;
   state.activeSymbol=symbol;
   const alert=state.alerts.get(symbol),price=currentPrice(symbol);
   $('liq-alert-symbol').textContent=r.id;
   $('liq-alert-current').textContent=price?'現價 '+formatPrice(price):'現價尚未就緒';
   $('liq-alert-target').value=alert?String(alert.target_price):'';
   $('liq-alert-direction').value=alert?alert.direction:'';
   $('liq-alert-delete').hidden=!alert;
   $('liq-alert-modal').hidden=false;$('liq-alert-modal').setAttribute('aria-hidden','false');
   updateHint();setTimeout(()=>$('liq-alert-target').focus(),20);
 }
 function closeModal(){state.activeSymbol='';$('liq-alert-modal').hidden=true;$('liq-alert-modal').setAttribute('aria-hidden','true');}
 async function saveAlert(){
   if(state.busy)return;
   const symbol=state.activeSymbol,r=bySymbol.get(symbol);if(!r)return;
   const price=currentPrice(symbol),target=Number($('liq-alert-target').value),direction=$('liq-alert-direction').value;
   if(!price){toast('即時現價尚未載入或已過期，請稍候再試',true);return;}
   if(!Number.isFinite(target)||target<=0){toast('請輸入大於 0 的觸發價格',true);$('liq-alert-target').focus();return;}
   if(!['ABOVE','BELOW'].includes(direction)){toast('請明確選擇上破或下破方向',true);$('liq-alert-direction').focus();return;}
   state.busy=true;$('liq-alert-save').disabled=true;$('liq-alert-delete').disabled=true;
   try{
     const out=await api('/api/monitor/alerts',{method:'POST',body:JSON.stringify({symbol,type:'PERP',target_price:target,current_price:price,direction})});
     const alert=normalizeAlert(out.alert);if(!alert)throw Error('Worker 沒有回傳有效的提醒紀錄');
     state.alerts.set(symbol,alert);state.telegramConfigured=out.telegram_configured!==false;
     refreshBells();closeModal();
     if(!state.telegramConfigured)toast(`${r.id} 提醒已儲存，但 Cloudflare 尚未有 Telegram 設定`,true);
     else toast(`${r.id} 已設定${alert.direction==='BELOW'?'下破':'上破'} ${formatPrice(target)} · ${alert.armed?'等待穿越':'等待回到起始側'} · 關閉網頁仍會監控`);
   }catch(e){toast('提醒儲存失敗：'+e.message,true);}
   finally{state.busy=false;$('liq-alert-save').disabled=false;$('liq-alert-delete').disabled=false;}
 }
 async function deleteAlert(){
   if(state.busy)return;
   const symbol=state.activeSymbol,alert=state.alerts.get(symbol),r=bySymbol.get(symbol);
   if(!alert)return;
   state.busy=true;$('liq-alert-delete').disabled=true;$('liq-alert-save').disabled=true;
   try{
     await api('/api/monitor/alerts',{method:'DELETE',body:JSON.stringify({symbol,id:alert.id})});
     state.alerts.delete(symbol);refreshBells();closeModal();toast(`${r?.id||symbol} 價格提醒已刪除`);
   }catch(e){toast('刪除提醒失敗：'+e.message,true);}
   finally{state.busy=false;$('liq-alert-delete').disabled=false;$('liq-alert-save').disabled=false;}
 }
 async function checkAlerts(){
   // The Cloudflare Cron continues without this page. Avoid unnecessary client
   // requests when the page is hidden; browser-side checks match monitor.html.
   if(document.hidden||state.checking||!state.alerts.size)return;
   state.checking=true;
   try{
     const out=await api('/api/monitor/alerts/check',{method:'POST',body:'{}'});
     if(Array.isArray(out.alerts))setAlerts(out.alerts);
     if(out.triggered?.length){
       const labels=out.triggered.map(x=>bySymbol.get(String(x.symbol).toUpperCase())?.id||String(x.symbol).replace(/_USDT_PERP$/,'')).join('、');
       toast(labels+' 價格提醒已觸發 Telegram，並自動取消監控');
     }
   }catch(e){/* Cron continues watching in Cloudflare even when a browser check fails. */console.warn('[Radar Price Alert]',e.message);}
   finally{state.checking=false;}
 }
 function setup(){
   if(!ctx){console.warn('Radar context unavailable');return;}
   document.addEventListener('click',e=>{
     const btn=e.target.closest('.liq-alert-bell');if(!btn)return;
     e.preventDefault();e.stopPropagation();openModal(String(btn.dataset.alertSymbol||'').toUpperCase());
   });
   $('liq-alert-close').addEventListener('click',closeModal);
   $('liq-alert-cancel').addEventListener('click',closeModal);
   $('liq-alert-modal').addEventListener('click',e=>{if(e.target.dataset.closeLiqAlert)closeModal();});
   $('liq-alert-target').addEventListener('input',updateHint);
   $('liq-alert-direction').addEventListener('change',updateHint);
   $('liq-alert-target').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();saveAlert();}});
   $('liq-alert-save').addEventListener('click',saveAlert);
   $('liq-alert-delete').addEventListener('click',deleteAlert);
   document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('liq-alert-modal').hidden)closeModal();});
   refreshAlerts();
   // Same intervals as the original SState monitor; checking is optional in tab,
   // whereas Worker Cron handles continuous 1-minute checks when the tab is closed.
   setInterval(()=>{if(!document.hidden)refreshAlerts();},30000);
   setInterval(checkAlerts,10000);
   document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshAlerts();});
   window.LIQ_ALERT_TEST={state,normalizeAlert,setAlerts,refreshBells,updateHint,openModal,closeModal,saveAlert,deleteAlert,checkAlerts,currentPrice};
 }
 setup();
})();
