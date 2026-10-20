/* v1.1.12 — per-symbol TradingView-style color flags, local persistence + optional existing R2 Worker sync. */
(()=>{'use strict';
  const worker=String(window.SSTATE_CONFIG?.workerUrl||'').replace(/\/$/,'');
  const ENDPOINT='/api/monitor/radar/marks';
  const LOCAL_KEY='SStateLiquidityRadar.colorMarks.v1';
  const PENDING_KEY='SStateLiquidityRadar.colorMarksPending.v1';
  const COLORS=Object.freeze({red:'紅',orange:'橘',yellow:'黃',green:'綠',blue:'藍',purple:'紫'});
  const palette=document.getElementById('liq-mark-palette');
  const title=document.getElementById('liqMarkTitle');
  const body=document.getElementById('radarBody');
  if(!palette||!body)return;

  function readStored(key){try{const data=JSON.parse(localStorage.getItem(key)||'{}');return data&&typeof data==='object'&&!Array.isArray(data)?data:{};}catch(_){return {};}}
  function cleanMarks(data,allowNull=false){
    const out={};
    for(const [symbol,color] of Object.entries(data||{})){
      if(!/^[A-Z0-9_:.\-]{1,80}$/.test(symbol))continue;
      if(Object.hasOwn(COLORS,color))out[symbol]=color;
      else if(allowNull&&color===null)out[symbol]=null;
    }
    return out;
  }
  let marks=cleanMarks(readStored(LOCAL_KEY));
  let pending=cleanMarks(readStored(PENDING_KEY),true);
  let active=null;
  let syncing=false;
  let serverAvailable=false;
  let lastError='';
  const saveLocal=()=>{
    try{localStorage.setItem(LOCAL_KEY,JSON.stringify(marks));localStorage.setItem(PENDING_KEY,JSON.stringify(pending));}
    catch(e){console.warn('[Color Marks] 無法寫入瀏覽器儲存空間',e);}
  };
  function refreshRows(){
    body.querySelectorAll('.liq-mark-trigger').forEach(btn=>{
      const symbol=btn.dataset.markSymbol;
      const color=marks[symbol]||null;
      const td=btn.closest('.row-index');
      if(color)td.dataset.markColor=color;
      else td.removeAttribute('data-mark-color');
      const label=`${btn.dataset.radarId}（編號 ${btn.textContent.trim()}）${color?'：'+COLORS[color]+'色標記':'：未標記'}；點擊選擇或清除註記`;
      btn.title=label;
      btn.setAttribute('aria-label',label);
      btn.setAttribute('aria-haspopup','dialog');
      btn.setAttribute('aria-expanded',String(active===btn&&!palette.hidden));
    });
  }
  function refreshPalette(){
    const current=active?marks[active.dataset.markSymbol]||null:null;
    palette.querySelectorAll('button[data-color]').forEach(btn=>{
      btn.setAttribute('aria-pressed',String(btn.dataset.color===current));
    });
  }
  function closePalette(){
    palette.hidden=true;
    if(active)active.setAttribute('aria-expanded','false');
    active=null;
  }
  function positionPalette(){
    if(!active||palette.hidden)return;
    const a=active.getBoundingClientRect();
    const pw=palette.offsetWidth,ph=palette.offsetHeight;
    const roomBelow=window.innerHeight-a.bottom;
    let top=roomBelow>=ph+10?a.bottom+6:a.top-ph-6;
    top=Math.max(6,Math.min(top,window.innerHeight-ph-6));
    let left=a.left+15;
    left=Math.max(6,Math.min(left,window.innerWidth-pw-6));
    palette.style.left=`${Math.round(left)}px`;
    palette.style.top=`${Math.round(top)}px`;
  }
  function openPalette(btn){
    if(active===btn&&!palette.hidden){closePalette();return;}
    if(active)active.setAttribute('aria-expanded','false');
    active=btn;
    title.textContent=`${btn.dataset.radarId} · 編號 ${btn.textContent.trim()} · 顏色註記`;
    palette.hidden=false;
    btn.setAttribute('aria-expanded','true');
    refreshPalette();positionPalette();
  }
  function note(text){
    let el=document.getElementById('liq-mark-status');
    if(!el){el=document.createElement('div');el.id='liq-mark-status';el.setAttribute('role','status');document.body.append(el);}
    el.textContent=text;el.hidden=false;
    clearTimeout(note.timer);
    note.timer=setTimeout(()=>{el.hidden=true;},3300);
  }
  async function call(path,options={}){
    if(!worker)throw Error('未設定 Cloudflare Worker');
    const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),6500);
    try{
      const response=await fetch(worker+path,{cache:'no-store',...options,signal:ctrl.signal,headers:{'Content-Type':'application/json'}});
      if(!response.ok)throw Error('HTTP '+response.status);
      const json=await response.json();
      if(json?.ok!==true)throw Error(json?.error||'API 回傳格式錯誤');
      return json;
    }finally{clearTimeout(timer);}
  }
  async function syncPending(){
    if(syncing||!serverAvailable)return;
    syncing=true;
    try{
      // Drain changes added while a previous save is still in flight.
      // The safety cap prevents a malicious/misconfigured server from looping forever.
      let saved=0;
      while(Object.keys(pending).length&&saved<500){
        const [symbol,color]=Object.entries(pending)[0];
        const response=await call(ENDPOINT,{method:'POST',body:JSON.stringify({symbol,color})});
        if(response?.symbol!==symbol||response?.color!==color)throw Error('Worker 回傳不符');
        // The user may have selected a different color while this request was pending.
        if(Object.hasOwn(pending,symbol)&&pending[symbol]===color)delete pending[symbol];
        saveLocal();saved++;
      }
      lastError='';
    }catch(e){lastError=String(e?.message||e);serverAvailable=false;console.warn('[Color Marks] R2 同步暫停，保留本機標記',lastError);}
    finally{syncing=false;}
  }
  async function refreshCloud(){
    if(!worker)return;
    try{
      const response=await call(ENDPOINT);
      serverAvailable=true;
      const remote=cleanMarks(response.marks);
      // Unsynced local changes win until R2 confirms them, including explicit clears.
      for(const [symbol,color] of Object.entries(pending)){
        if(color===null)delete remote[symbol];
        else remote[symbol]=color;
      }
      marks=remote;
      saveLocal();refreshRows();refreshPalette();
      await syncPending();
    }catch(e){serverAvailable=false;lastError=String(e?.message||e);}
  }
  function setMark(symbol,color){
    if(color&& !Object.hasOwn(COLORS,color))return;
    if(color)marks[symbol]=color;
    else delete marks[symbol];
    pending[symbol]=color;
    saveLocal();refreshRows();refreshPalette();
    if(serverAvailable){void syncPending();}
    else{note('顏色已儲存於此瀏覽器；跨裝置同步需更新 Cloudflare Worker');}
  }
  body.addEventListener('click',event=>{
    const btn=event.target.closest('.liq-mark-trigger');
    if(!btn)return;
    event.preventDefault();event.stopPropagation();openPalette(btn);
  });
  palette.addEventListener('click',event=>{
    const btn=event.target.closest('button[data-color]');
    if(!btn||!active)return;
    const symbol=active.dataset.markSymbol;
    const color=btn.dataset.color;
    const next=color==='clear'||marks[symbol]===color?null:color;
    setMark(symbol,next);
    closePalette();
  });
  document.addEventListener('pointerdown',event=>{
    if(!palette.hidden&&!palette.contains(event.target)&&!event.target.closest('.liq-mark-trigger'))closePalette();
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&!palette.hidden){event.preventDefault();const btn=active;closePalette();btn?.focus();}
  });
  window.addEventListener('resize',()=>{if(!palette.hidden)positionPalette();});
  window.addEventListener('scroll',()=>{if(!palette.hidden)closePalette();},true);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refreshCloud();});
  window.addEventListener('storage',event=>{
    if(event.key!==LOCAL_KEY&&event.key!==PENDING_KEY)return;
    marks=cleanMarks(readStored(LOCAL_KEY));
    pending=cleanMarks(readStored(PENDING_KEY),true);
    refreshRows();refreshPalette();
  });
  refreshRows();
  void refreshCloud();
  window.LIQ_MARK_TEST={getMarks:()=>({...marks}),getPending:()=>({...pending}),setMark,refreshRows,refreshCloud,closePalette};
})();
