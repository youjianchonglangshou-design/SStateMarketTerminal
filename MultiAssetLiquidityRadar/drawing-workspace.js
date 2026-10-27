/* MultiAssetLiquidityRadar v2.0.0 — per-symbol drawings, UTC/log coordinates, local+R2 revision sync.
 * View-only: market calculations, RR and Signal Spotlight are never modified here.
 */
(function(root){'use strict';
const NS='http://www.w3.org/2000/svg',CFG={fib:[0,.5,.618,.786,1,1.236,1.5,1.572,1.618,2]};
const rootUrl=String(root.SSTATE_CONFIG?.workerUrl||'https://white-meadow-16bc.youjianchonglangshou.workers.dev').replace(/\/$/,'');
const API=rootUrl+'/api/monitor/radar/drawings',LOCAL='SStateLiquidityRadar.drawings.v2.';
const documents=new Map(),subscribers=new Set(),controllers=new WeakMap();
const undoHistory=new Map(),MAX_UNDO=60;
function remember(symbol,action){const key=symbolKey(symbol),items=undoHistory.get(key)||[];items.push(action);if(items.length>MAX_UNDO)items.shift();undoHistory.set(key,items);}
const good=p=>Number.isFinite(p)&&p>0,validTime=t=>Number.isSafeInteger(t)&&t>0;
const color={green:'#27dc9c',red:'#ff6676',yellow:'#eace47'};
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const numeric=n=>Number(n),money=n=>Number.isFinite(n)?n.toLocaleString('en-US',{maximumFractionDigits:n>=100?2:Math.abs(n)>=1?4:8}):'—';
const symbolKey=s=>String(s||'').toUpperCase().replace(/_USDT_PERP$/,'')+'_USDT_PERP';
function clean(d){return {schemaVersion:1,symbol:d.symbol,revision:Math.max(0,Number(d.revision)||0),updatedAt:d.updatedAt||null,
 preferences:{showBollinger:d.preferences?.showBollinger!==false,showHaSteps:d.preferences?.showHaSteps!==false},
 haSelection:validTime(d.haSelection?.dailyTime)?{dailyTime:d.haSelection.dailyTime}:null,preferencesChangedAt:Number(d.preferencesChangedAt)||0,
 drawings:(Array.isArray(d.drawings)?d.drawings:[]).filter(x=>x&&typeof x.id==='string'&&['fibonacci','rectangle','long-position','short-position'].includes(x.type)).slice(0,200),
 tombstones:d.tombstones&&typeof d.tombstones==='object'?d.tombstones:{}};}
function snapshot(symbol){const s=symbolKey(symbol);if(documents.has(s))return documents.get(s);
 let raw=null;try{raw=JSON.parse(localStorage.getItem(LOCAL+s)||'null');}catch(_){}
 const d=clean({...raw,symbol:s});d.dirty=Boolean(raw?.dirty);d.loaded=false;d.timer=0;d.saving=false;d.localSeq=0;documents.set(s,d);void load(s);return d;}
function localSave(d){try{localStorage.setItem(LOCAL+d.symbol,JSON.stringify({...d,dirty:d.dirty,timer:undefined,saving:undefined}));}catch(_){}}
function notify(s){for(const fn of subscribers)try{fn(s);}catch(e){console.warn('[Drawings subscriber]',e);}}
function mutate(symbol,change){const d=snapshot(symbol);change(d);d.localSeq=(d.localSeq||0)+1;d.dirty=true;d.updatedAt=new Date().toISOString();localSave(d);notify(d.symbol);
 clearTimeout(d.timer);d.timer=setTimeout(()=>void push(d.symbol),950);}
function merge(remote,local){const out=clean({...remote,symbol:local.symbol});
 const removed={...remote.tombstones,...local.tombstones};for(const [id,t] of Object.entries(removed))removed[id]=Math.max(Number(remote.tombstones?.[id])||0,Number(local.tombstones?.[id])||0);
 const entries=new Map();for(const item of [...(remote.drawings||[]),...(local.drawings||[])]){
   const prior=entries.get(item.id);if(!prior||Number(item.modifiedAt||0)>=Number(prior.modifiedAt||0))entries.set(item.id,item);
 }
 out.drawings=[...entries.values()].filter(x=>!(Number(removed[x.id])>=Number(x.modifiedAt||0))).slice(0,200);
 out.tombstones=removed;
 if(Number(local.preferencesChangedAt||0)>=Number(remote.preferencesChangedAt||0)){
   out.preferences={...local.preferences};out.preferencesChangedAt=local.preferencesChangedAt||0;
   out.haSelection=local.haSelection;
 }
 return out;
}
async function request(url,init={}){const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),6500);try{
 const r=await fetch(url,{cache:'no-store',...init,signal:ctrl.signal});const data=await r.json();if(!r.ok){const err=Error(data.error||'HTTP '+r.status);err.status=r.status;throw err;}return data;
 }finally{clearTimeout(timer);}}
async function load(symbol,force=false){const d=snapshot(symbol);if(d.loaded&&!force)return d;
 const startingSeq=d.localSeq||0;
 try{const remote=await request(API+'?symbol='+encodeURIComponent(d.symbol));const before=d.dirty||(d.localSeq||0)!==startingSeq;const next=before?merge(remote,d):clean({...remote,symbol:d.symbol});
 Object.assign(d,next,{revision:Number(remote.revision)||0,loaded:true,dirty:before});localSave(d);notify(d.symbol);
 if(before)void push(d.symbol);
 }catch(e){d.loaded=true;d.syncError=String(e.message||e);notify(d.symbol);}return d;}
async function push(symbol){const d=snapshot(symbol);if(!d.dirty||d.saving)return false;d.saving=true;
 try{for(let retry=0;retry<3;retry++){
    const savedAt=Number(d.updatedAt&&Date.parse(d.updatedAt))||0;
    try{const output=await request(API+'?symbol='+encodeURIComponent(d.symbol),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({expected_revision:d.revision,preferences:d.preferences,preferencesChangedAt:d.preferencesChangedAt||0,haSelection:d.haSelection,drawings:d.drawings,tombstones:d.tombstones})});
       d.revision=output.revision;if(savedAt===(Date.parse(d.updatedAt)||0))d.dirty=false;d.syncError='';localSave(d);notify(d.symbol);return true;
    }catch(e){if(e.status!==409){d.syncError=e.message;return false;}
       const remote=await request(API+'?symbol='+encodeURIComponent(d.symbol));Object.assign(d,merge(remote,d));d.revision=remote.revision;
    }
 }return false;
 }catch(e){d.syncError=String(e.message||e);return false;}finally{d.saving=false;if(d.dirty){clearTimeout(d.timer);d.timer=setTimeout(()=>void push(symbol),10000);}localSave(d);}}
function subscribe(fn){subscribers.add(fn);return ()=>subscribers.delete(fn);}
function add(symbol,item){const id=(item.type==='long-position'?'L':item.type==='short-position'?'S':'D')+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);const value={...item,id,modifiedAt:Date.now()};mutate(symbol,d=>d.drawings.push(value));remember(symbol,{type:'add',id});return value;}
function change(symbol,id,update,recordUndo=true){const prev=snapshot(symbol).drawings.find(x=>x.id===id);if(!prev)return;
 if(recordUndo)remember(symbol,{type:'restore',value:structuredClone(prev)});
 mutate(symbol,d=>{const old=d.drawings.find(x=>x.id===id);if(old){Object.assign(old,update,{modifiedAt:Date.now()});}});}
function remove(symbol,id){const prior=snapshot(symbol).drawings.find(x=>x.id===id);if(!prior)return;
 remember(symbol,{type:'restore',value:structuredClone(prior)});mutate(symbol,d=>{d.drawings=d.drawings.filter(x=>x.id!==id);d.tombstones[id]=Date.now();});}
function undo(symbol){const key=symbolKey(symbol),stack=undoHistory.get(key);if(!stack?.length)return false;const action=stack.pop();
 mutate(symbol,d=>{if(action.type==='add'){d.drawings=d.drawings.filter(x=>x.id!==action.id);d.tombstones[action.id]=Date.now();}
 else if(action.type==='restore'){const item={...structuredClone(action.value),modifiedAt:Date.now()};delete d.tombstones[item.id];const idx=d.drawings.findIndex(x=>x.id===item.id);if(idx>=0)d.drawings[idx]=item;else d.drawings.push(item);}});return true;}
function setPrefs(symbol,patch){mutate(symbol,d=>{Object.assign(d.preferences,patch);d.preferencesChangedAt=Date.now();});}
function setHa(symbol,t){mutate(symbol,d=>{d.haSelection=validTime(t)?{dailyTime:Math.floor(t/86400000)*86400000}:null;d.preferencesChangedAt=Date.now();});}
function calcPosition(position,live){const entry=position.limitEnabled?Number(position.entry):Number(live),stop=Number(position.stop),target=Number(position.target);const long=position.type==='long-position';
 if(!good(entry)||!good(stop)||!good(target)||(long?!(target>entry&&entry>stop):!(stop>entry&&entry>target)))return null;
 if(!good(Number(position.riskAmount1))||!good(Number(position.riskAmount2)))return null;
 const stopPct=Math.abs(entry-stop)/entry,rr=long?(target-entry)/(entry-stop):(entry-target)/(stop-entry);
 return {entry,stop,target,stopPct,rr,nominal1:Number(position.riskAmount1)/stopPct,nominal2:Number(position.riskAmount2)/stopPct,direction:long?'long':'short'};
}
function node(parent,tag,attrs={}){const e=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))if(v!=null)e.setAttribute(k,String(v));parent.append(e);return e;}
function label(g,text,x,y,paint){const t=node(g,'text',{x,y,fill:paint||'#dbeafa','font-size':11,'font-weight':650,'pointer-events':'none'});t.textContent=text;return t;}
// Put actual price labels on the log-price axis only while their drawings are selected.
// Tags represent the true y(price): never clamp a price to a misleading tick.
function edgePriceTag(g,proj,price,tone,caption,id){
 if(!good(price))return;
 const yy=proj.y(price);if(yy<proj.T+9||yy>proj.plotB-9)return;
 const bg=node(g,'g',{'data-dw-id':id,class:'dw-price-tag dw-edge-price'});
 node(bg,'rect',{x:proj.plotR+2,y:yy-10,width:Math.max(40,proj.W-proj.plotR-5),height:20,rx:3,fill:'#102535',stroke:tone,'stroke-opacity':'.95'});
 const tx=label(bg,caption+money(price),proj.plotR+7,yy+4,tone);
 tx.setAttribute('font-size','10.5');
}
function signedPct(value,entry){return !good(entry)||!Number.isFinite(value)?'—':(value>=0?'+':'')+value.toFixed(2)+'%';}

function place(g,obj,proj,selected,live){
 const x=t=>proj.x(t),y=p=>proj.y(p),a=obj.anchors||[],id=obj.id,c= color[obj.color]||'#38d7e8';
 if(!a[0]||!good(a[0].price)||!validTime(a[0].time))return;
 const hit={'data-dw-id':id,class:'dw-hit',cursor:'pointer'};
 if(obj.type==='fibonacci'&&a.length>1){const [p0,p1]=a.map(t=>Number(t.price));if(!good(p1))return;
  const left=Math.min(x(a[0].time),x(a[1].time)),right=proj.plotR;
  for(const r of CFG.fib){const price=p1*Math.pow(p0/p1,r),yy=y(price),tone=[.618,.786,2].includes(r)?'#23cdeb':[1.236,1.5,1.572,1.618].includes(r)?'#f2d34f':'#b6bcca';
   node(g,'line',{...hit,x1:left,x2:right,y1:yy,y2:yy,stroke:tone,'stroke-width':selected?2:1.25,'stroke-dasharray':'5 5'});
   label(g,`${r} (${money(price)})`,Math.max(proj.L,Math.min(right-108,right+5)),yy-3,tone);
  }
  // Fib 0: a solid, easy-to-select dot just ahead of the thin 0-level dash.
  // The transparent 24px hit target uses the existing drawing ID, so selection,
  // dragging, Delete/Backspace and saved drawing coordinates stay unchanged.
  const y0=y(p1);
  if(Number.isFinite(y0)&&y0>=proj.T&&y0<=proj.plotB&&left<=right-12){
   const dotX=clamp(left-7,proj.L+12,right-12);
   const target=node(g,'circle',{...hit,class:'dw-hit dw-fib-zero-hit',
    cx:dotX,cy:y0,r:12,fill:'transparent',stroke:'none','pointer-events':'all'});
   node(target,'title').textContent='選取斐波那契（按 Delete 刪除）';
   node(g,'circle',{class:'dw-fib-zero-dot',cx:dotX,cy:y0,r:5.2,
    fill:selected?'#80eaff':'#f2f8ff',stroke:'#133044','stroke-width':1.3,'pointer-events':'none'});
  }
 }else if(obj.type==='rectangle'&&a.length>1){const x0=x(a[0].time),x1=x(a[1].time),y0=y(a[0].price),y1=y(a[1].price),left=Math.min(x0,x1),top=Math.min(y0,y1),width=Math.max(2,Math.abs(x1-x0)),height=Math.max(2,Math.abs(y1-y0));
   node(g,'rect',{...hit,x:left,y:top,width,height,stroke:c,fill:c,'fill-opacity':'.09','stroke-width':selected?2.3:1.4});
   const middle=y(Math.sqrt(a[0].price*a[1].price));node(g,'line',{...hit,x1:left,x2:left+width,y1:middle,y2:middle,stroke:c,'stroke-opacity':'.65','stroke-dasharray':'4 4'});
   if(selected){
     // Upper/lower labels track the actual logarithmic price coordinates as handles move.
     const high=Math.max(a[0].price,a[1].price),low=Math.min(a[0].price,a[1].price);
     edgePriceTag(g,proj,high,c,'',id);edgePriceTag(g,proj,low,c,'',id);
   }
 }else if(obj.type.endsWith('-position')){
    const long=obj.type==='long-position',entry=obj.limitEnabled?Number(obj.entry):Number(live),stop=Number(obj.stop),target=Number(obj.target);
    if(!good(entry)||!good(stop)||!good(target))return;
    const x0=x(a[0].time),x1=x(a[1]?.time||a[0].time+14400000*10),left=Math.min(x0,x1),width=Math.max(25,Math.abs(x1-x0));
    const rect=(lo,hi,clr)=>node(g,'rect',{...hit,x:left,y:Math.min(y(lo),y(hi)),width,height:Math.abs(y(lo)-y(hi)),fill:clr,'fill-opacity':'.08',stroke:clr,'stroke-width':selected?2:1});
    rect(entry,target,'#28d59d');rect(entry,stop,'#e36b7a');
    node(g,'line',{...hit,x1:left,x2:left+width,y1:y(entry),y2:y(entry),stroke:'#e4e9ef','stroke-width':1.8});
    // TradingView-like price alignment: while a position is selected (including
    // during target/stop handle drag), project BOTH levels across the whole plot.
    // These guides share exactly the same y(price) as the axis badges and are
    // rebuilt from the current drag values, so a 10-second redraw cannot freeze
    // a stale line.  Neither guide intercepts pointer/handle events.
    if(selected){
      for(const [field,value,tone] of [['target',target,'#28d59d'],['stop',stop,'#f17b89']]){
        const yy=y(value);
        if(!Number.isFinite(yy)||yy<proj.T||yy>proj.plotB)continue;
        node(g,'line',{class:'dw-position-price-guide',
          'data-dw-position-guide':field,'data-dw-guide-id':id,
          x1:proj.L,x2:proj.plotR,y1:yy,y2:yy,stroke:tone,
          'stroke-width':1.15,'stroke-dasharray':'6 5','stroke-opacity':'.85',
          'vector-effect':'non-scaling-stroke','pointer-events':'none'});
      }
    }
    const cc=calcPosition(obj,live);
    // v2.0.8: risk/notional figures are now displayed in each chart window's
    // independent HTML corner table, not as SVG stop-edge capsules. The existing
    // target/stop/entry tags, RR, drag handles and guide lines remain unchanged.
    const description=cc?`${long?'做多':'做空'} · RR ${cc.rr.toFixed(2)} · 進場 ${money(entry)} · 目標 ${money(target)} · 止損 ${money(stop)} · 風險1 ${money(obj.riskAmount1)} · 風險2 ${money(obj.riskAmount2)} · 名義1 ${money(cc.nominal1)} · 名義2 ${money(cc.nominal2)}`:'部位價格無效';
    const tt=node(g,'title');tt.textContent=description;
    label(g,(long?'做多 ':'做空 ')+(cc?'RR '+cc.rr.toFixed(2):'價格無效'),left+4,y(entry)-5,long?'#28d59d':'#ff7889');
    for(const [field,value,tone] of [['target',target,'#28d59d'],['entry',entry,'#d7e6ef'],['stop',stop,'#f17b89']]){
      // All three price badges are inspection details shown only on selection.
      if(!selected)continue;
      const yy=y(value);if(yy<proj.T+9||yy>proj.plotB-9)continue;
      const tag=node(g,'g',{'data-dw-id':id,'data-dw-price':field,class:'dw-price-tag',cursor:'pointer'});
      node(tag,'rect',{x:proj.plotR+2,y:yy-9,width:Math.max(40,proj.W-proj.plotR-5),height:18,rx:3,fill:'#0b2434',stroke:tone,'stroke-opacity':'.85'});
      const pct=good(entry)?(field==='target'?(long?target-entry:entry-target)/entry*100:(field==='stop'?-(long?entry-stop:stop-entry)/entry*100:0)):0;
      const txt=(field==='entry'?'進場 ':field==='target'?'目標 ':'止損 ')+money(value)+(field==='entry'?'':' ('+signedPct(pct,entry)+')');
      label(tag,txt,proj.plotR+7,yy+4,tone);
    }
    // Checkbox is part of EACH drawing, not a single global chart setting.
    const cb=node(g,'g',{'data-dw-order-toggle':id,class:'dw-order-toggle',cursor:'pointer'});
    node(cb,'rect',{x:left+2,y:y(entry)+6,width:50,height:19,fill:'transparent'});
    node(cb,'rect',{x:left+4,y:y(entry)+8,width:12,height:12,rx:2,stroke:long?'#28d59d':'#f17b89',fill:obj.limitEnabled?'#228c78':'#142435'});
    if(obj.limitEnabled)label(cb,'✓',left+5,y(entry)+18,'#fff');
    label(cb,'掛單',left+19,y(entry)+18,'#dce8ef');
 }
 if(selected){
   const h=(x0,y0,attrs)=>node(g,'circle',{class:'dw-handle','data-dw-id':id,...attrs,cx:x0,cy:y0,r:5.2,stroke:'#fff','stroke-width':1.2,fill:c,cursor:'move'});
   if(obj.type==='rectangle'&&a.length===2){
     for(let ti=0;ti<2;ti++)for(let pi=0;pi<2;pi++)h(x(a[ti].time),y(a[pi].price),{'data-dw-corner':ti+':'+pi});
     const xm=(x(a[0].time)+x(a[1].time))/2, ym=y(Math.sqrt(a[0].price*a[1].price));
     for(let ti=0;ti<2;ti++)h(x(a[ti].time),ym,{'data-dw-side':'time:'+ti});
     for(let pi=0;pi<2;pi++)h(xm,y(a[pi].price),{'data-dw-side':'price:'+pi});
   }else if(obj.type.endsWith('-position')){
     h(x(a[0].time),y(obj.limitEnabled?obj.entry:live),{'data-dw-pos':'entry'});
     h(x(a[1]?.time||a[0].time),y(obj.stop),{'data-dw-pos':'stop'});
     h(x(a[1]?.time||a[0].time),y(obj.target),{'data-dw-pos':'target'});
   }else for(let i=0;i<a.length;i++)h(x(a[i].time),y(a[i].price),{'data-dw-anchor':i});
 }
}
function render(w){const proj=w.plot?.__liqProjection;if(!proj)return;const svg=w.plot.querySelector('svg');if(!svg)return;
 svg.querySelector('.dw-layer')?.remove();const g=node(svg,'g',{class:'dw-layer'});
 const ctl=controllers.get(w),doc=snapshot(w.symbol);if(!ctl)return;
 const local=[...doc.drawings];if(ctl.draft?.anchors?.length){local.push({...ctl.draft,id:'draft',modifiedAt:Date.now()});}
 for(const item of local){try{place(g,item,proj,ctl.selected===item.id,ctl.livePrice());}catch(e){console.warn('[Drawings] unable to draw item',e);}}
 // Magnetic ghost shows BEFORE the first click and while editing existing handles.
 if(ctl.ctrl&&ctl.hoverPoint&&((ctl.tool!=='select')||ctl.hoverEditing)){
   const p=ctl.hoverPoint,x=proj.x(p.time),y=proj.y(p.price);
   if(Number.isFinite(x)&&Number.isFinite(y)&&x>=proj.L&&x<=proj.plotR&&y>=proj.T&&y<=proj.plotB){
     const ghost=node(g,'g',{class:'dw-snap-preview','pointer-events':'none'});
     node(ghost,'circle',{cx:x,cy:y,r:9,fill:'#1bdac9','fill-opacity':'.16',stroke:'#69fff1','stroke-width':1.2});
     node(ghost,'circle',{cx:x,cy:y,r:3.1,fill:'#cbfffa'});
     label(ghost,'🧲 '+(p.field||'OHLC')+' '+money(p.price),Math.min(proj.plotR-105,x+11),Math.max(proj.T+15,y-10),'#d6fffa');
   }
 }
 // Persistent daily HA selection is rendered by chart4h.js, not duplicated in drawing overlay.
}
function snap(proj,pos,ctrl){
 if(!proj||!pos)return null;
 const yy=clamp(pos.y,proj.T,proj.plotB),xx=clamp(pos.x,proj.L,proj.plotR),t=proj.time(xx);
 const free={time:Math.round(t),price:proj.price(yy)};
 if(!ctrl)return free;
 let candle=null,horizontal=Infinity;
 for(const r of proj.rows){const dx=Math.abs(proj.x(r.t)-xx);
   if(dx<horizontal){horizontal=dx;candle=r;}}
 // No distant snapping: do not force a price from an unrelated historical bar.
 if(!candle||horizontal>Math.max(10,proj.stride*1.25))return free;
 // In close-price line mode, magnet always snaps to that candle's C.
 // Candlestick mode keeps its existing O/H/L/C proximity behavior.
 if(proj.displayMode==='line')return {time:candle.t,price:candle.c,field:'C',snapped:true};
 let chosen='c',distance=Infinity;
 for(const key of ['o','h','l','c']){const dy=Math.abs(proj.y(candle[key])-yy);
   if(dy<distance){distance=dy;chosen=key;}}
 return {time:candle.t,price:candle[chosen],field:({o:'O',h:'H',l:'L',c:'C'})[chosen],snapped:true};
}

function attach(w,callbacks){const c={tool:'select',selected:null,draft:null,livePrice:callbacks.livePrice,ctrl:false,hoverPoint:null,hoverEditing:false,lastPointer:null};controllers.set(w,c);
 const target=w.plot;
 const magnetAllowed=()=>c.tool!=='select'||Boolean(c.selected)||c.drag?.kind==='edit';
 const syncSnapUI=()=>{const snapOn=c.ctrl&&magnetAllowed();w.el.classList.toggle('dw-magnet-on',snapOn);callbacks.setMagnet?.(snapOn);};
 const updateGhost=ev=>{if(ev)c.lastPointer={clientX:ev.clientX,clientY:ev.clientY};
   const proj=target.__liqProjection;const last=c.lastPointer;
   if(!proj||!last||!c.ctrl){c.hoverPoint=null;c.hoverEditing=false;return;}
   const rect=target.getBoundingClientRect();const px=proj.fromEvent(last);
   c.hoverEditing=c.drag?.kind==='edit'||(c.tool==='select'&&!!document.elementFromPoint(last.clientX,last.clientY)?.closest?.('.dw-hit,.dw-handle'));
   c.hoverPoint=(c.tool!=='select'||c.hoverEditing)&&px.x>=proj.L&&px.x<=proj.plotR&&px.y>=proj.T&&px.y<=proj.plotB?snap(proj,px,true):null;
 };
 const controlKey=ev=>{if(ev.key!=='Control')return;c.ctrl=ev.type==='keydown';updateGhost();syncSnapUI();render(w);};
 document.addEventListener('keydown',controlKey);document.addEventListener('keyup',controlKey);
 const blur=()=>{c.ctrl=false;updateGhost();syncSnapUI();render(w);};window.addEventListener('blur',blur);
 target.addEventListener('pointerdown',ev=>{
  c.ctrl=Boolean(ev.ctrlKey||c.ctrl);syncSnapUI();
  const proj=target.__liqProjection;if(ev.button!==0||!proj||ev.target.closest?.('.rc-price-axis-hit,.rc-selected-price-box')||ev.target.closest?.('.dw-toolbar'))return;
  const toggle=ev.target.closest?.('[data-dw-order-toggle]');
  if(toggle){const id=toggle.dataset.dwOrderToggle,obj=snapshot(w.symbol).drawings.find(d=>d.id===id);
    if(obj?.type?.endsWith('-position')){
      const entering=!obj.limitEnabled,price=entering?(c.livePrice()||obj.entry):obj.entry;
      change(w.symbol,id,{limitEnabled:entering,entry:price});c.selected=id;callbacks.refreshHeader();render(w);
    }ev.preventDefault();ev.stopPropagation();return;
  }
  const hit=ev.target.closest?.('[data-dw-id]');const point=snap(proj,proj.fromEvent(ev),Boolean(ev.ctrlKey||c.ctrl));if(!point)return;
  if(hit&&hit.dataset.dwId!=='draft'&&c.tool==='select'){
    c.selected=hit.dataset.dwId;syncSnapUI();const object=snapshot(w.symbol).drawings.find(d=>d.id===c.selected);
    c.drag={kind:'edit',id:ev.pointerId,start:point,object:object?JSON.parse(JSON.stringify(object)):null,idx:hit.dataset.dwAnchor==null?-1:Number(hit.dataset.dwAnchor),corner:hit.dataset.dwCorner||null,side:hit.dataset.dwSide||null,pos:hit.dataset.dwPos||null,moved:false};
    ev.preventDefault();ev.stopPropagation();try{target.setPointerCapture(ev.pointerId);}catch(_){};callbacks.refreshHeader();render(w);return;
  }
  if(c.tool!=='select'){
    if(!c.draft){let type=c.tool;if(type==='long'||type==='short')type=type+'-position';if(type==='fib')type='fibonacci';
      const base={type,color:['green','red','yellow'].includes(c.tool)?c.tool:'yellow',anchors:[point]};
      if(['green','red','yellow'].includes(c.tool))base.type='rectangle';
      if(type.endsWith('-position')){
        // First click immediately creates an executable long/short layout with valid risk and target.
        const long=type==='long-position',limitEnabled=Boolean(callbacks.getDefaultLimit?.(long?'long':'short'));
        const entry=limitEnabled?point.price:(good(Number(c.livePrice()))?Number(c.livePrice()):point.price);
        const step=proj.interval==='1D'?86400000:14400000;
        Object.assign(base,{entry,stop:entry*(long?.98:1.02),target:entry*(long?1.04:.96),riskAmount1:callbacks.getDefaultRisk?.()?.riskAmount1||1000,riskAmount2:callbacks.getDefaultRisk?.()?.riskAmount2||100,limitEnabled,
          anchors:[{time:point.time,price:entry},{time:Math.round(point.time+step*12),price:entry*(long?.98:1.02)}]});
        const obj=add(w.symbol,base);c.selected=obj.id;c.draft=null;c.tool='select';callbacks.setTool('select');callbacks.refreshHeader();syncSnapUI();
      }else c.draft=base;
    }else{
      const d=c.draft;d.anchors=[d.anchors[0],point];
      const obj=add(w.symbol,d);c.selected=obj.id;c.draft=null;c.tool='select';callbacks.setTool('select');callbacks.refreshHeader();syncSnapUI();
    }
    ev.preventDefault();ev.stopPropagation();render(w);return;
  }
  c.selected=null;syncSnapUI();callbacks.refreshHeader();
  if(ev.target.closest?.('.rc-hit')){
    c.drag={kind:'pan',id:ev.pointerId,startClientX:ev.clientX,startClientY:ev.clientY,startOffset:callbacks.getOffset(),
      startPricePan:callbacks.getPricePan(),stride:proj.stride,ph:proj.ph,logSpan:proj.logSpan,moved:false};
    target.classList.add('dw-pan-ready');
    try{target.setPointerCapture(ev.pointerId);}catch(_){}
  }
  render(w);
 },true);
 target.addEventListener('pointermove',ev=>{const proj=target.__liqProjection;if(!proj)return;
   c.ctrl=Boolean(ev.ctrlKey||c.ctrl);updateGhost(ev);syncSnapUI();
   if(c.draft){const at=snap(proj,proj.fromEvent(ev),Boolean(ev.ctrlKey||c.ctrl));if(at){c.draft.anchors[1]=at;render(w);}return;}
   const drag=c.drag;
   if(!drag||drag.id!==ev.pointerId){if(c.ctrl&&magnetAllowed())render(w);return;}
   if(drag.kind==='pan'){
     const dx=ev.clientX-drag.startClientX,dy=ev.clientY-drag.startClientY;
     if(Math.hypot(dx,dy)>4){drag.moved=true;target.classList.add('dw-is-panning');}
     if(!drag.moved)return;
     // Fixed slot width means no wheel-style density change during panning.
     const delta=Math.round(dx/Math.max(2,drag.stride));
     const next=clamp(drag.startOffset+delta,-Math.floor(proj.viewCount*.5),Math.max(0,proj.total-21));
     callbacks.setOffset(next);
     callbacks.setPricePan(drag.startPricePan+dy/Math.max(20,drag.ph)*drag.logSpan);
     if(callbacks.getTimeframe()==='4H'&&next>proj.total-proj.viewCount-15)callbacks.moreHistory();
   }else if(drag.kind==='edit'&&drag.object){
     const at=snap(proj,proj.fromEvent(ev),Boolean(ev.ctrlKey||c.ctrl));if(!at)return;drag.moved=true;
     const original=drag.object,d={...original,anchors:original.anchors.map(a=>({...a}))};
     if(drag.corner){const [ti,pi]=drag.corner.split(':').map(Number);d.anchors[ti].time=at.time;d.anchors[pi].price=at.price;}
     else if(drag.side){const [axis,index]=drag.side.split(':');if(axis==='time')d.anchors[Number(index)].time=at.time;
        else d.anchors[Number(index)].price=at.price;}
     else if(drag.pos){
       if(drag.pos==='entry'&&d.limitEnabled){d.entry=at.price;d.anchors[0].price=at.price;}
       if(drag.pos==='stop'){d.stop=at.price;d.anchors[1].price=at.price;}
       if(drag.pos==='target'){d.target=at.price;}
     }
     else if(drag.idx>=0){d.anchors[drag.idx]=at;
       if(d.type.endsWith('-position')&&drag.idx===0){const diff=at.price-original.anchors[0].price;d.entry+=diff;d.stop+=diff;d.target+=diff;}
       else if(d.type.endsWith('-position')&&drag.idx===1){d.stop=at.price;}
     }else{const deltaT=at.time-drag.start.time,priceFactor=at.price/drag.start.price;
       d.anchors=d.anchors.map(a=>({time:Math.round(a.time+deltaT),price:a.price*priceFactor}));
       if(d.type.endsWith('-position')){d.entry*=priceFactor;d.stop*=priceFactor;d.target*=priceFactor;}}
     change(w.symbol,d.id,d,!drag.undoRecorded);drag.undoRecorded=true;callbacks.refreshHeader();render(w);
   }
 });
 // TradingView-like: right-click cancels a partially placed Fib/rectangle.
 target.addEventListener('contextmenu',ev=>{if(!c.draft)return;ev.preventDefault();ev.stopPropagation();c.draft=null;c.hoverPoint=null;c.tool='select';callbacks.setTool('select');syncSnapUI();render(w);});
 const end=ev=>{if(c.drag?.id!==ev.pointerId)return;
    const drag=c.drag;c.drag=null;target.classList.remove('dw-pan-ready','dw-is-panning');
    if(drag.kind==='pan'){
      if(!drag.moved)window.LiqRadar4H?.selectHaAt?.(target,ev);
      else callbacks.commitView?.();
    }
    try{target.releasePointerCapture(ev.pointerId);}catch(_){};
    updateGhost(ev);syncSnapUI();render(w);
  };
 target.addEventListener('pointerup',end);target.addEventListener('pointercancel',end);
 target.addEventListener('click',ev=>{if(c.tool!=='select'||ev.target.closest?.('.dw-hit,.dw-handle')){ev.stopImmediatePropagation();}},true);
 target.addEventListener('wheel',ev=>{const proj=target.__liqProjection;if(!proj)return;ev.preventDefault();
   const cur=callbacks.getCount(),limit=callbacks.getTimeframe()==='4H'?270:90;
   const next=clamp(Math.round(cur*Math.exp(ev.deltaY*.0015)),21,limit);
   if(next===cur)return;
   const x=proj.fromEvent(ev).x,relative=clamp((x-proj.L)/proj.pw,0,1);
   // Keep the candle below the cursor anchored while enlarging/compressing the view.
   const off=callbacks.getOffset()+Math.round((next-cur)*(1-relative));
   callbacks.setView(next,clamp(off,-Math.floor(next*.5),Math.max(0,proj.total-21)));if(callbacks.getTimeframe()==='4H'&&next>proj.total-callbacks.getOffset()-10)callbacks.moreHistory();
 },{passive:false});
 c.setTool=tool=>{c.tool=tool;c.draft=null;updateGhost();syncSnapUI();render(w);};
 c.getSelected=()=>snapshot(w.symbol).drawings.find(x=>x.id===c.selected)||null;
 c.setSelected=id=>{c.selected=id;syncSnapUI();callbacks.refreshHeader();render(w);};
 c.cancel=()=>{c.tool='select';c.draft=null;c.hoverPoint=null;callbacks.setTool('select');syncSnapUI();render(w);};
 c.reset=()=>{c.tool='select';c.draft=null;c.selected=null;c.hoverPoint=null;syncSnapUI();};
 c.dispose=()=>{document.removeEventListener('keydown',controlKey);document.removeEventListener('keyup',controlKey);window.removeEventListener('blur',blur);};
 return c;
}
// Inputs are never hijacked by Delete / Ctrl; four independent windows have separate selections.
document.addEventListener('keydown',ev=>{const isUndo=ev.key.toLowerCase()==='z'&&(ev.ctrlKey||ev.metaKey)&&!ev.altKey;
 if(!isUndo&&!['Delete','Backspace','Escape'].includes(ev.key))return;
 const focus=document.activeElement;if(focus?.matches?.('input,textarea,select,[contenteditable=true]'))return;
 const active=window.LIQ_WORKSPACE?.getActiveWindow?.();if(!active)return;const c=controllers.get(active);if(!c)return;
 if(isUndo){if(undo(active.symbol)){ev.preventDefault();c.setSelected(null);active.onDrawingChanged?.();}return;}
 if(ev.key==='Escape'){c.cancel();return;}
 if(c.selected){remove(active.symbol,c.selected);c.selected=null;ev.preventDefault();active.onDrawingChanged?.();}
});
async function listRemote(){let result=[];try{const data=await request(API+'?list=1');result=Array.isArray(data.items)?data.items:[];}catch(e){console.warn('[Drawing manager remote]',e.message);}
 const known=new Map(result.map(r=>[r.symbol,r]));for(const d of documents.values())if(d.drawings.length||d.haSelection)known.set(d.symbol,{symbol:d.symbol,count:d.drawings.length+(d.haSelection?1:0),updatedAt:d.updatedAt,local:true});
 return [...known.values()].sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));}
async function clearSymbol(symbol){const d=snapshot(symbol);mutate(symbol,d=>{for(const x of d.drawings)d.tombstones[x.id]=Date.now();d.drawings=[];d.haSelection=null;});return push(d.symbol);}
window.addEventListener('online',()=>{for(const d of documents.values())if(d.syncError||d.dirty)void load(d.symbol,true);});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)for(const d of documents.values())if(d.syncError||d.dirty)void load(d.symbol,true);});
root.DrawingWorkspace={CFG,attach,render,snapshot,subscribe,add,change,remove,undo,setPrefs,setHa,calcPosition,listRemote,clearSymbol,symbolKey,money,snap,merge};
})(window);
