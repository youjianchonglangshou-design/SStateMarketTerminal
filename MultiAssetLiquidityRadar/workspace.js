/* MultiAssetLiquidityRadar v1.4.0 — draggable/resizable single-chart workspace.
 * Coordinates and dimensions are screen pixels, stored separately from sector mark settings.
 * Resizing re-runs LiqRadar4H on actual chart element dimensions (never SVG stretching).
 */
(()=>{'use strict';
 const win=document.getElementById('floatingChart');
 const plot=document.getElementById('singleRadarPlot');
 const grip=document.getElementById('chartTitlebar');
 if(!win||!plot||!grip)return;
 const KEY='SStateLiquidityRadar.workspace.v1.4';
 const $=id=>document.getElementById(id);
 const bound=(n,min,max)=>Math.min(Math.max(n,min),Math.max(max,min));
 let raf=0,change=null,geometry=null;
 const minimum=()=>({w:Math.min(480,Math.max(340,innerWidth-18)),h:Math.min(285,Math.max(240,innerHeight-74))});
 function defaults(){
   const gap=innerWidth>1200?Math.min(386,Math.max(316,innerWidth*.195))+12:Math.min(316,innerWidth*.3);
   const available=Math.max(470,innerWidth-gap*2-8);
   const w=Math.round(Math.min(1120,Math.max(480,available))),h=Math.round(Math.min(590,Math.max(340,(innerHeight-58)*.64)));
   return {x:Math.round((innerWidth-w)/2),y:Math.max(8,Math.round((innerHeight-h-53)*.42)),w,h};
 }
 function load(){try{const x=JSON.parse(localStorage.getItem(KEY)||'null');return x&&['x','y','w','h'].every(k=>Number.isFinite(x[k]))?x:null;}catch(_){return null;}}
 function save(){try{localStorage.setItem(KEY,JSON.stringify(geometry));}catch(_){/* privacy settings */}}
 function constrain(g){
   const min=minimum();
   const w=bound(g.w,min.w,Math.max(min.w,innerWidth-8));
   const h=bound(g.h,min.h,Math.max(min.h,innerHeight-53));
   return {x:bound(g.x,0,Math.max(0,innerWidth-w)),y:bound(g.y,0,Math.max(0,innerHeight-h-49)),w,h};
 }
 function paint(replot=false){
   geometry=constrain(geometry||defaults());
   Object.assign(win.style,{left:geometry.x+'px',top:geometry.y+'px',width:geometry.w+'px',height:geometry.h+'px',right:'auto',bottom:'auto'});
   if(replot)redraw();
 }
 function redraw(){
   if(raf)return;
   raf=requestAnimationFrame(()=>{raf=0;window.LIQ_TEST?.renderActiveChart?.();});
 }
 function focusChart(){win.style.zIndex='95';$('liq-crypto-nav').style.zIndex='62';$('liq-stock-nav').style.zIndex='62';}
 function focusList(group){win.style.zIndex='55';$('liq-crypto-nav').style.zIndex=group==='crypto'?'96':'65';$('liq-stock-nav').style.zIndex=group==='stock'?'96':'65';}
 function sendBack(){win.style.zIndex='15';$('liq-crypto-nav').style.zIndex='75';$('liq-stock-nav').style.zIndex='75';}
 function start(e,kind,dir){
   if(e.button!==0)return;
   if(e.target.closest('button,select,a'))return;
   e.preventDefault();e.stopPropagation();focusChart();
   geometry=constrain(geometry);
   change={id:e.pointerId,kind,dir,sx:e.clientX,sy:e.clientY,begin:{...geometry}};
   e.currentTarget.setPointerCapture(e.pointerId);
   document.body.classList.add('radar-is-manipulating');
 }
 function move(e){
   if(!change||e.pointerId!==change.id)return;
   const {kind,dir,sx,sy,begin}=change,dx=e.clientX-sx,dy=e.clientY-sy;
   if(kind==='move')geometry={...begin,x:begin.x+dx,y:begin.y+dy};
   else{
     const min=minimum();let {x,y,w,h}=begin;
     if(dir.includes('e'))w=bound(begin.w+dx,min.w,innerWidth-8);
     if(dir.includes('s'))h=bound(begin.h+dy,min.h,innerHeight-53);
     if(dir.includes('w')){w=bound(begin.w-dx,min.w,innerWidth-8);x=begin.x+begin.w-w;}
     if(dir.includes('n')){h=bound(begin.h-dy,min.h,innerHeight-53);y=begin.y+begin.h-h;}
     geometry={x,y,w,h};
   }
   paint(true);
 }
 function end(e){
   if(!change||e.pointerId!==change.id)return;
   change=null;document.body.classList.remove('radar-is-manipulating');save();redraw();
 }
 grip.addEventListener('pointerdown',e=>start(e,'move',''));
 for(const node of win.querySelectorAll('[data-resize]'))node.addEventListener('pointerdown',e=>start(e,'resize',node.dataset.resize));
 for(const el of [grip,...win.querySelectorAll('[data-resize]')]){
   el.addEventListener('pointermove',move);el.addEventListener('pointerup',end);el.addEventListener('pointercancel',end);
 }
 win.addEventListener('pointerdown',e=>{if(!e.target.closest('[data-resize]')&&!e.target.closest('button'))focusChart();});
 $('chartSendBack').addEventListener('click',sendBack);
 $('chartResetSize').addEventListener('click',()=>{geometry=defaults();paint(true);save();focusChart();});
 $('resetLayoutBtn').addEventListener('click',()=>{geometry=defaults();paint(true);save();sendBack();});
 window.addEventListener('resize',()=>{paint(true);save();},{passive:true});
 if('ResizeObserver' in window){let ow=0,oh=0;new ResizeObserver(entries=>{
   const r=entries[0]?.contentRect;if(!r)return;
   const w=Math.round(r.width),h=Math.round(r.height);
   if(w!==ow||h!==oh){ow=w;oh=h;redraw();}
 }).observe(plot);}
 window.LIQ_WORKSPACE={focusChart,focusList,sendBack,reset(){geometry=defaults();paint(true);save();},getBounds:()=>({...geometry})};
 geometry=load()||defaults();paint();sendBack();redraw();
})();
