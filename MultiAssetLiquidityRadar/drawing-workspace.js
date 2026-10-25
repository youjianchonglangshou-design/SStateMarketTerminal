/* MultiAssetLiquidityRadar v2.0.0 — per-symbol drawings, UTC/log coordinates, local+R2 revision sync.
 * View-only: market calculations, RR and Signal Spotlight are never modified here.
 */
(function(root){'use strict';
const NS='http://www.w3.org/2000/svg',CFG={fib:[0,.5,.618,.786,1,1.236,1.5,1.572,1.618,2]};
const rootUrl=String(root.SSTATE_CONFIG?.workerUrl||'https://white-meadow-16bc.youjianchonglangshou.workers.dev').replace(/\/$/,'');
const API=rootUrl+'/api/monitor/radar/drawings',LOCAL='SStateLiquidityRadar.drawings.v2.';
const documents=new Map(),subscribers=new Set(),controllers=new WeakMap();
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
 const d=clean({...raw,symbol:s});d.dirty=Boolean(raw?.dirty);d.loaded=false;d.timer=0;d.saving=false;documents.set(s,d);void load(s);return d;}
function localSave(d){try{localStorage.setItem(LOCAL+d.symbol,JSON.stringify({...d,dirty:d.dirty,timer:undefined,saving:undefined}));}catch(_){}}
function notify(s){for(const fn of subscribers)try{fn(s);}catch(e){console.warn('[Drawings subscriber]',e);}}
function mutate(symbol,change){const d=snapshot(symbol);change(d);d.dirty=true;d.updatedAt=new Date().toISOString();localSave(d);notify(d.symbol);
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
 try{const remote=await request(API+'?symbol='+encodeURIComponent(d.symbol));const before=d.dirty;const next=before?merge(remote,d):clean({...remote,symbol:d.symbol});
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
function add(symbol,item){const id=(item.type==='long-position'?'L':item.type==='short-position'?'S':'D')+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);const value={...item,id,modifiedAt:Date.now()};mutate(symbol,d=>d.drawings.push(value));return value;}
function change(symbol,id,update){mutate(symbol,d=>{const old=d.drawings.find(x=>x.id===id);if(old){Object.assign(old,update,{modifiedAt:Date.now()});}});}
function remove(symbol,id){mutate(symbol,d=>{d.drawings=d.drawings.filter(x=>x.id!==id);d.tombstones[id]=Date.now();});}
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
function place(g,obj,proj,selected,live){
 const x=t=>proj.x(t),y=p=>proj.y(p),a=obj.anchors||[],id=obj.id,c= color[obj.color]||'#38d7e8';
 if(!a[0]||!good(a[0].price)||!validTime(a[0].time))return;
 const hit={'data-dw-id':id,class:'dw-hit',cursor:'pointer'};
 if(obj.type==='fibonacci'&&a.length>1){const [p0,p1]=a.map(t=>Number(t.price));if(!good(p1))return;
  const left=Math.min(x(a[0].time),x(a[1].time)),right=proj.plotR;
  for(const r of CFG.fib){const price=p0*Math.pow(p1/p0,r),yy=y(price),tone=[.618,.786,2].includes(r)?'#23cdeb':[1.236,1.5,1.572,1.618].includes(r)?'#f2d34f':'#b6bcca';
   node(g,'line',{...hit,x1:left,x2:right,y1:yy,y2:yy,stroke:tone,'stroke-width':selected?2:1.25,'stroke-dasharray':'5 5'});
   label(g,`${r} (${money(price)})`,Math.max(proj.L,Math.min(right-108,right+5)),yy-3,tone);
  }
 }else if(obj.type==='rectangle'&&a.length>1){const x0=x(a[0].time),x1=x(a[1].time),y0=y(a[0].price),y1=y(a[1].price),left=Math.min(x0,x1),top=Math.min(y0,y1),width=Math.max(2,Math.abs(x1-x0)),height=Math.max(2,Math.abs(y1-y0));
   node(g,'rect',{...hit,x:left,y:top,width,height,stroke:c,fill:c,'fill-opacity':'.09','stroke-width':selected?2.3:1.4});
   const middle=y(Math.sqrt(a[0].price*a[1].price));node(g,'line',{...hit,x1:left,x2:left+width,y1:middle,y2:middle,stroke:c,'stroke-opacity':'.65','stroke-dasharray':'4 4'});
 }else if(obj.type.endsWith('-position')){
    const long=obj.type==='long-position',entry=obj.limitEnabled?Number(obj.entry):Number(live),stop=Number(obj.stop),target=Number(obj.target);
    if(!good(entry)||!good(stop)||!good(target))return;
    const x0=x(a[0].time),x1=x(a[1]?.time||a[0].time+14400000*10),left=Math.min(x0,x1),width=Math.max(25,Math.abs(x1-x0));
    const rect=(lo,hi,clr)=>node(g,'rect',{...hit,x:left,y:Math.min(y(lo),y(hi)),width,height:Math.abs(y(lo)-y(hi)),fill:clr,'fill-opacity':'.16',stroke:clr,'stroke-width':selected?2:1});
    rect(entry,target,'#28d59d');rect(entry,stop,'#e36b7a');
    node(g,'line',{...hit,x1:left,x2:left+width,y1:y(entry),y2:y(entry),stroke:'#e4e9ef','stroke-width':1.8});
    const cc=calcPosition(obj,live);label(g,(long?'做多 ':'做空 ')+(cc?'RR '+cc.rr.toFixed(2):'價格無效'),left+4,y(entry)-5,long?'#28d59d':'#ff7889');
 }
 if(selected){
   const h=(x0,y0,attrs)=>node(g,'circle',{class:'dw-handle','data-dw-id':id,...attrs,cx:x0,cy:y0,r:5.2,stroke:'#fff','stroke-width':1.2,fill:c,cursor:'move'});
   if(obj.type==='rectangle'&&a.length===2){
     for(let ti=0;ti<2;ti++)for(let pi=0;pi<2;pi++)h(x(a[ti].time),y(a[pi].price),{'data-dw-corner':ti+':'+pi});
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
 // Persistent daily HA selection is rendered by chart4h.js, not duplicated in drawing overlay.
}
function snap(proj,pos,ctrl){if(!proj||!pos)return null;const yy=clamp(pos.y,proj.T,proj.plotB),xx=clamp(pos.x,proj.L,proj.plotR),t=proj.time(xx);
 if(!ctrl)return {time:Math.round(t),price:proj.price(yy)};
 let best=null,dist=Infinity;for(const r of proj.rows){const dx=Math.abs(proj.x(r.t)-xx);if(dx>proj.stride*1.5)continue;
 for(const key of ['o','h','l','c']){const dy=Math.abs(proj.y(r[key])-yy),d=dx*.4+dy;if(d<dist){dist=d;best={time:r.t,price:r[key]};}}}
 return best||{time:Math.round(t),price:proj.price(yy)};
}
function attach(w,callbacks){const c={tool:'select',selected:null,draft:null,drag:null,livePrice:callbacks.livePrice};controllers.set(w,c);
 const target=w.plot;
 target.addEventListener('pointerdown',ev=>{
  const proj=target.__liqProjection;if(ev.button!==0||!proj||ev.target.closest?.('.rc-price-axis-hit')||ev.target.closest?.('.dw-toolbar'))return;
  const hit=ev.target.closest?.('[data-dw-id]');const point=snap(proj,proj.fromEvent(ev),ev.ctrlKey);if(!point)return;
  if(hit&&hit.dataset.dwId!=='draft'&&c.tool==='select'){
    c.selected=hit.dataset.dwId;const object=snapshot(w.symbol).drawings.find(d=>d.id===c.selected);
    c.drag={kind:'edit',id:ev.pointerId,start:point,object:object?JSON.parse(JSON.stringify(object)):null,idx:hit.dataset.dwAnchor==null?-1:Number(hit.dataset.dwAnchor),corner:hit.dataset.dwCorner||null,pos:hit.dataset.dwPos||null,moved:false};
    ev.preventDefault();ev.stopPropagation();try{target.setPointerCapture(ev.pointerId);}catch(_){};callbacks.refreshHeader();render(w);return;
  }
  if(c.tool!=='select'){
    if(!c.draft){let type=c.tool;if(type==='long'||type==='short')type=type+'-position';if(type==='fib')type='fibonacci';
      c.draft={type,color:['green','red','yellow'].includes(c.tool)?c.tool:'yellow',anchors:[point]};
      if(['green','red','yellow'].includes(c.tool))c.draft.type='rectangle';
      if(type.endsWith('-position'))Object.assign(c.draft,{entry:point.price,stop:point.price*(type==='long-position'?.98:1.02),target:point.price*(type==='long-position'?1.04:.96),riskAmount1:1000,riskAmount2:100,limitEnabled:false});
    }else{
      const d=c.draft;d.anchors=[d.anchors[0],point];
      if(d.type.endsWith('-position')){d.entry=d.anchors[0].price;d.stop=point.price;d.target=d.entry+(d.entry-d.stop)*(d.type==='long-position'?2:2);if(!(d.type==='long-position'?d.stop<d.entry:d.stop>d.entry))d.stop=d.entry*(d.type==='long-position'?.98:1.02);d.target=d.entry+(d.entry-d.stop)*2;}
      const obj=add(w.symbol,d);c.selected=obj.id;c.draft=null;c.tool='select';callbacks.setTool('select');callbacks.refreshHeader();
    }
    ev.preventDefault();ev.stopPropagation();render(w);return;
  }
  c.selected=null;callbacks.refreshHeader();
  if(ev.target.closest?.('.rc-hit')){
    c.drag={kind:'pan',id:ev.pointerId,startClientX:ev.clientX,startOffset:callbacks.getOffset(),stride:proj.stride};
    try{target.setPointerCapture(ev.pointerId);}catch(_){}
  }
  render(w);
 },true);
 target.addEventListener('pointermove',ev=>{const proj=target.__liqProjection;if(!proj)return;
   if(c.draft){const at=snap(proj,proj.fromEvent(ev),ev.ctrlKey);if(at){c.draft.anchors[1]=at;render(w);}return;}
   const drag=c.drag;if(!drag||drag.id!==ev.pointerId)return;
   if(drag.kind==='pan'){
     const delta=Math.round((ev.clientX-drag.startClientX)/Math.max(2,drag.stride));
     const next=clamp(drag.startOffset+delta,0,Math.max(0,proj.total-21));
     callbacks.setOffset(next);if(callbacks.getTimeframe()==='4H'&&next>proj.total-proj.viewCount-15)callbacks.moreHistory();
   }else if(drag.kind==='edit'&&drag.object){
     const at=snap(proj,proj.fromEvent(ev),ev.ctrlKey);if(!at)return;drag.moved=true;
     const original=drag.object,d={...original,anchors:original.anchors.map(a=>({...a}))};
     if(drag.corner){const [ti,pi]=drag.corner.split(':').map(Number);d.anchors[ti].time=at.time;d.anchors[pi].price=at.price;}
     else if(drag.pos){
       if(drag.pos==='entry'){d.entry=at.price;d.anchors[0].price=at.price;d.limitEnabled=true;}
       if(drag.pos==='stop'){d.stop=at.price;d.anchors[1].price=at.price;}
       if(drag.pos==='target'){d.target=at.price;}
     }
     else if(drag.idx>=0){d.anchors[drag.idx]=at;
       if(d.type.endsWith('-position')&&drag.idx===0){const diff=at.price-original.anchors[0].price;d.entry+=diff;d.stop+=diff;d.target+=diff;}
       else if(d.type.endsWith('-position')&&drag.idx===1){d.stop=at.price;}
     }else{const deltaT=at.time-drag.start.time,priceFactor=at.price/drag.start.price;
       d.anchors=d.anchors.map(a=>({time:Math.round(a.time+deltaT),price:a.price*priceFactor}));
       if(d.type.endsWith('-position')){d.entry*=priceFactor;d.stop*=priceFactor;d.target*=priceFactor;}}
     change(w.symbol,d.id,d);callbacks.refreshHeader();render(w);
   }
 });
 const end=ev=>{if(c.drag?.id!==ev.pointerId)return;c.drag=null;try{target.releasePointerCapture(ev.pointerId);}catch(_){};};
 target.addEventListener('pointerup',end);target.addEventListener('pointercancel',end);
 target.addEventListener('click',ev=>{if(c.tool!=='select'||ev.target.closest?.('.dw-hit,.dw-handle')){ev.stopImmediatePropagation();}},true);
 target.addEventListener('wheel',ev=>{const proj=target.__liqProjection;if(!proj)return;ev.preventDefault();
   const cur=callbacks.getCount(),limit=callbacks.getTimeframe()==='4H'?270:90;
   const next=clamp(Math.round(cur*Math.exp(ev.deltaY*.0015)),21,limit);
   if(next===cur)return;
   const x=proj.fromEvent(ev).x,relative=clamp((x-proj.L)/proj.pw,0,1);
   // Keep the candle below the cursor anchored while enlarging/compressing the view.
   const off=callbacks.getOffset()+Math.round((next-cur)*(1-relative));
   callbacks.setView(next,Math.max(0,off));if(callbacks.getTimeframe()==='4H'&&next>proj.total-callbacks.getOffset()-10)callbacks.moreHistory();
 },{passive:false});
 c.setTool=tool=>{c.tool=tool;c.draft=null;render(w);};
 c.getSelected=()=>snapshot(w.symbol).drawings.find(x=>x.id===c.selected)||null;
 c.setSelected=id=>{c.selected=id;callbacks.refreshHeader();render(w);};
 c.cancel=()=>{c.tool='select';c.draft=null;callbacks.setTool('select');render(w);};
 c.reset=()=>{c.tool='select';c.draft=null;c.selected=null;};
 return c;
}
// Inputs are never hijacked by Delete / Ctrl; four independent windows have separate selections.
document.addEventListener('keydown',ev=>{if(!['Delete','Backspace','Escape'].includes(ev.key))return;
 const focus=document.activeElement;if(focus?.matches?.('input,textarea,select,[contenteditable=true]'))return;
 const active=window.LIQ_WORKSPACE?.getActiveWindow?.();if(!active)return;const c=controllers.get(active);if(!c)return;
 if(ev.key==='Escape'){c.cancel();return;}
 if(c.selected){remove(active.symbol,c.selected);c.selected=null;ev.preventDefault();active.onDrawingChanged?.();}
});
async function listRemote(){let result=[];try{const data=await request(API+'?list=1');result=Array.isArray(data.items)?data.items:[];}catch(e){console.warn('[Drawing manager remote]',e.message);}
 const known=new Map(result.map(r=>[r.symbol,r]));for(const d of documents.values())if(d.drawings.length||d.haSelection)known.set(d.symbol,{symbol:d.symbol,count:d.drawings.length+(d.haSelection?1:0),updatedAt:d.updatedAt,local:true});
 return [...known.values()].sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));}
async function clearSymbol(symbol){const d=snapshot(symbol);mutate(symbol,d=>{for(const x of d.drawings)d.tombstones[x.id]=Date.now();d.drawings=[];d.haSelection=null;});return push(d.symbol);}
window.addEventListener('online',()=>{for(const d of documents.values())if(d.syncError||d.dirty)void load(d.symbol,true);});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)for(const d of documents.values())if(d.syncError||d.dirty)void load(d.symbol,true);});
root.DrawingWorkspace={CFG,attach,render,snapshot,subscribe,add,change,remove,setPrefs,setHa,calcPosition,listRemote,clearSymbol,symbolKey,money,snap,merge};
})(window);
