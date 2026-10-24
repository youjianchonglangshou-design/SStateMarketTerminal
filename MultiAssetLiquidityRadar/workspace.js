/* MultiAssetLiquidityRadar v1.8.1 — four independent floating 4H charts.
 * Each view reads the same market records; no second provider connection or price poller.
 * The complete 21/12 watchlists remain fixed and independent of the windows.
 */
(()=>{'use strict';
 async function boot(){await (window.LIQ_SHARED_STATE?.ready||Promise.resolve());
 const $=id=>document.getElementById(id);
 const api=window.LIQ_CHART_API;
 const host=$('chartWindowLayer'),tabs=$('chartWindowTabs'),add=$('chartAddWindow');
 if(!api||!host||!tabs||!add)return;
 const KEY='SStateLiquidityRadar.workspace.v1.5';
 const LEGACY='SStateLiquidityRadar.workspace.v1.4';
 const LIMIT=4;
 const windows=[];
 let activeId=null,serial=0,drag=null,noticeTimer=0,resizeTimer=0,layoutVariant=1;
 const min=(k)=>({w:Math.min(320,Math.max(300,innerWidth-18)),h:Math.min(250,Math.max(220,innerHeight-74))})[k];
 const clamp=(n,lo,hi)=>Math.min(Math.max(n,lo),Math.max(lo,hi));
 const maxW=()=>Math.max(min('w'),innerWidth-8);
 const maxH=()=>Math.max(min('h'),innerHeight-53);
 function defaults(n=0){
   const margin=innerWidth>1200?Math.min(386,Math.max(316,innerWidth*.195))+12:Math.min(316,innerWidth*.3);
   const space=Math.max(470,innerWidth-margin*2-8);
   const w=Math.round(Math.min(1120,Math.max(480,space)));
   const h=Math.round(Math.min(590,Math.max(340,(innerHeight-58)*.64)));
   const stagger=n*34;
   return constrain({x:Math.round((innerWidth-w)/2)+stagger,y:Math.max(8,Math.round((innerHeight-h-53)*.42))+stagger,w,h});
 }
 function constrain(g){
   const w=clamp(Number(g.w)||min('w'),min('w'),maxW());
   const h=clamp(Number(g.h)||min('h'),min('h'),maxH());
   return {x:clamp(Number(g.x)||0,0,Math.max(0,innerWidth-w)),y:clamp(Number(g.y)||0,0,Math.max(0,innerHeight-h-49)),w,h};
 }
 function storageGet(key){try{return JSON.parse(localStorage.getItem(key)||'null');}catch(_){return null;}}
 function save(){
   try{localStorage.setItem(KEY,JSON.stringify({activeId,windows:windows.map(w=>({id:w.id,symbol:w.symbol,geom:w.geom,locked:w.locked,minimized:w.minimized,priceScale:w.priceScale,haSelected:w.haSelected,behindCrypto:w.behindCrypto}))}));window.LIQ_SHARED_STATE?.changed?.();}catch(_){/* private mode */}
 }
 function announce(msg){
   $('chartWindowMessage').textContent=msg;
   clearTimeout(noticeTimer);
   noticeTimer=setTimeout(()=>{$('chartWindowMessage').textContent='';},4000);
 }
 function byId(id){return windows.find(w=>w.id===id);}
 function bySymbol(id){return windows.find(w=>w.symbol===id);}
 function sortStack(){
   // Explicit three-layer market topology: stock < chart (including sent-back)
   // < crypto for sent-back charts only. Foreground charts over both watchlists.
   $('liq-stock-nav').style.zIndex='60';
   $('liq-custom-nav').style.zIndex='60';
   $('liq-crypto-nav').style.zIndex='101';
   windows.forEach((w,i)=>{
     w.el.style.zIndex=String(w.behindCrypto?90+Math.min(i,8):120+i);
     w.el.classList.toggle('is-focused',w.id===activeId&&!w.minimized);
     w.el.classList.toggle('behind-crypto',w.behindCrypto);
   });
 }
 function paint(w){
   w.geom=constrain(w.geom);
   const g=w.geom;
   Object.assign(w.el.style,{left:g.x+'px',top:g.y+'px',width:g.w+'px',height:g.h+'px',right:'auto',bottom:'auto'});
 }
 function isOccluded(w){
   if(w.minimized||!w.el.isConnected||document.hidden)return true;
   const box=w.plot.getBoundingClientRect();
   if(box.width<3||box.height<3)return true;
   let inside=0,visible=0;
   for(const yy of [.2,.5,.8])for(const xx of [.2,.5,.8]){
     const x=box.left+box.width*xx,y=box.top+box.height*yy;
     if(x<0||y<0||x>=innerWidth||y>=innerHeight)continue;
     inside++;
     const top=document.elementFromPoint(x,y);
     if(top&&(top===w.el||w.el.contains(top)))visible++;
   }
   return inside===0||visible===0;
 }
 function render(w,force=false){
   if(!w||!w.dirty&&!force)return;
   if(isOccluded(w))return;
   const d=api.getData(w.symbol);if(!d)return;
   w.title.textContent=d.symbol;
   w.price.textContent=d.priceText;
   // Semantic capsules live in the status strip (never inside the SVG overlay).
   w.indicator.replaceChildren();
   for(const item of (d.capsules||[])){
     const cap=document.createElement('span');cap.className='chart-semantic '+item.kind+' '+item.tone;
     cap.textContent=item.text;cap.title=item.title||item.text;w.indicator.append(cap);
   }
   w.source.textContent=d.source;
   if(window.LiqRadar4H)window.LiqRadar4H.render(w.plot,{
     ...d.chart,priceScale:w.priceScale,
     onPriceScaleChange:scale=>{w.priceScale=scale;w.dirty=true;schedule(w,0);},
     onPriceScaleCommit:()=>save(),
     selectedTimestamp:w.haSelected,
     onSelectionChange:t=>{w.haSelected=t;save();}
   });
   else w.plot.textContent='4H 圖表模組尚未載入';
   w.dirty=false;
   w.renderCount++;
 }
 function schedule(w,delay=0){
   if(!w||w.minimized||document.hidden)return;
   if(w.timer)return;
   // Geometry changes repaint at most ~12fps during mouse dragging; price updates are batched.
   w.timer=setTimeout(()=>{w.timer=0;requestAnimationFrame(()=>render(w));},delay);
 }
 function updateTab(w){
   w.tab.textContent='▧ '+w.symbol+' 4H'+(w.minimized?' ↥':'');
   w.tab.classList.toggle('minimized',w.minimized);
   w.tab.classList.toggle('locked',w.locked);
   w.tab.classList.toggle('active',w.id===activeId&&!w.minimized);
   w.tab.title=w.minimized?'點擊還原 '+w.symbol:w.locked?'已鎖定：點擊帶到前景':'點擊帶到前景 '+w.symbol;
   w.backButton.classList.toggle('is-behind',w.behindCrypto);
   w.backButton.setAttribute('aria-pressed',String(w.behindCrypto));
   w.backButton.title=w.behindCrypto?'置後已啟用：再次點擊恢復前景（或雙擊下方圖表標籤）':'置於左側加密清單後方';
   w.backButton.setAttribute('aria-label',w.backButton.title);
   w.tab.classList.toggle('sent-back',w.behindCrypto);
   w.tab.title=w.behindCrypto?'置後中：點一下選擇，雙擊解除置後':w.tab.title;
   w.lockButton.classList.toggle('is-locked',w.locked);
   w.lockButton.textContent=w.locked?'🔒':'🔓';
   w.lockButton.title=w.locked?'解除鎖定，允許清單換幣':'鎖定目前幣種，防止清單換幣覆蓋';
   $('chartWindowCount').textContent=windows.length+'/'+LIMIT;
   add.disabled=windows.length>=LIMIT;
 }
 function updateTabs(){windows.forEach(updateTab);$('chartWindowCount').textContent=windows.length+'/'+LIMIT;add.disabled=windows.length>=LIMIT;}
 function activate(w,{reveal=true,notify=true}={}){
   if(!w)return;
   if(reveal&&w.minimized){w.minimized=false;w.el.hidden=false;w.dirty=true;}
   activeId=w.id;
   const ix=windows.indexOf(w);if(ix>=0){windows.splice(ix,1);windows.push(w);}
   sortStack();
   updateTabs();
   if(notify)api.updateActiveSelection(w.symbol);
   // Do not invalidate/rebuild an already visible SVG merely to focus the chart.
   // In particular, pointerdown inside the canvas must not replace the hit target
   // before the matching click event can inspect a yellow/purple HA stair.
   if(w.minimized||w.dirty||!w.plot.querySelector('svg')){w.dirty=true;schedule(w);}
   save();
 }
 function focusList(group){ /* Focus never changes the permanent market z-layer rules. */ sortStack(); }
 function sendBack(w){
   if(!w)return;
   w.behindCrypto=!w.behindCrypto;sortStack();updateTabs();save();
 }
 function makeButton(cls,label,title,handler){
   const b=document.createElement('button');b.type='button';b.className=cls;b.textContent=label;b.title=title;b.setAttribute('aria-label',title);
   b.addEventListener('click',e=>{e.stopPropagation();handler();});return b;
 }
 function create(symbol,{geom=null,locked=false,minimized=false,id=null,quiet=false,priceScale=1,haSelected=null,behindCrypto=false}={}){
   if(windows.length>=LIMIT){announce('最多只能開啟 4 張圖表');return null;}
   if(!api.hasSymbol(symbol))return null;
   const uid=id||'chart-'+(++serial);
   serial=Math.max(serial,Number(uid.replace(/^chart-/,''))||serial);
   const el=document.createElement('main');el.className='floating-chart';el.dataset.chartWindow=uid;
   el.setAttribute('role','region');el.setAttribute('aria-label',symbol+' 浮動 4H 圖表');
   const head=document.createElement('header');head.className='chart-titlebar';head.title='拖曳標題列移動圖表';
   const label=document.createElement('div');label.className='chart-head-label';
   const title=document.createElement('strong');title.textContent=symbol;
   const timeframe=document.createElement('span');timeframe.className='chart-timeframe';timeframe.textContent='4H · 即時行情';
   const price=document.createElement('span');price.className='chart-head-price';price.textContent='--';
   label.append(title,timeframe,price);
   const buttons=document.createElement('div');buttons.className='chart-head-buttons';
   const w={id:uid,symbol,locked:!!locked,minimized:!!minimized,priceScale:clamp(Number(priceScale)||1,.25,16),haSelected:Number.isFinite(Number(haSelected))&&haSelected!==null?Number(haSelected):null,behindCrypto:!!behindCrypto,geom:constrain(geom||defaults(windows.length)),el,head,title,price,tab:null,lockButton:null,backButton:null,plot:null,indicator:null,source:null,dirty:true,timer:0,renderCount:0};
   w.lockButton=makeButton('chart-lock',w.locked?'🔒':'🔓','鎖定／解除鎖定圖表',()=>{w.locked=!w.locked;updateTabs();save();});
   w.backButton=makeButton('chart-send-back','⇤','置於左側加密清單後方',()=>sendBack(w));
   w.backButton.setAttribute('aria-pressed',String(w.behindCrypto));
   buttons.append(w.lockButton,w.backButton,
     makeButton('chart-reset','▣','還原此圖表預設尺寸',()=>{w.geom=defaults(Math.max(0,windows.indexOf(w)));paint(w);w.dirty=true;schedule(w,50);activate(w);}),
     makeButton('chart-minimize','−','最小化此圖表（資料持續更新）',()=>minimize(w)),
     makeButton('chart-close','×','關閉此圖表視窗',()=>close(w)));
   w.indicator=document.createElement('span');w.indicator.className='chart-indicator-strip chart-inline-capsules';w.indicator.textContent='日線 S · 中軌 · HA · CCI';
   w.source=document.createElement('span');w.source.className='chart-source';
   head.append(label,w.indicator,buttons);
   w.plot=document.createElement('div');w.plot.className='radar-area radar-area-4h';w.plot.dataset.chartPlot=uid;
   el.append(head,w.plot);
   for(const dir of ['n','s','e','w','ne','nw','se','sw']){
     const handle=document.createElement('div');handle.className='chart-resize '+dir;handle.dataset.resize=dir;
     handle.setAttribute('aria-label','縮放 '+dir);
     handle.addEventListener('pointerdown',e=>start(e,w,'resize',dir));
     handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',end);handle.addEventListener('pointercancel',end);
     el.append(handle);
   }
   head.addEventListener('pointerdown',e=>start(e,w,'move',''));
   head.addEventListener('pointermove',move);head.addEventListener('pointerup',end);head.addEventListener('pointercancel',end);
   el.addEventListener('pointerdown',e=>{
     if(e.target.closest('button,[data-resize]'))return;
     if(activeId!==w.id)activate(w);
   });
   w.tab=makeButton('chart-task-tab',symbol+' 4H','前往 '+symbol+' 圖表',()=>activate(w));
   // Single-click selects/focuses without changing the persistent sent-back state.
   // Double-click on exactly this window's taskbar tab explicitly restores foreground.
   w.tab.addEventListener('dblclick',e=>{e.preventDefault();e.stopPropagation();if(w.behindCrypto){w.behindCrypto=false;activate(w);}else activate(w);});
   windows.push(w);host.append(el);tabs.append(w.tab);paint(w);
   if('ResizeObserver' in window){let ow=0,oh=0;w.observer=new ResizeObserver(entries=>{
     const size=entries[0]?.contentRect;if(!size)return;
     const width=Math.round(size.width),height=Math.round(size.height);
     if(width!==ow||height!==oh){ow=width;oh=height;w.dirty=true;schedule(w,85);}
   });w.observer.observe(w.plot);}
   if(minimized){el.hidden=true;w.plot.replaceChildren();}else if(!quiet)activate(w);
   updateTabs();if(!quiet)save();return w;
 }
 function close(w){
   if(!w)return;
   clearTimeout(w.timer);w.observer?.disconnect();
   const idx=windows.indexOf(w);if(idx>=0)windows.splice(idx,1);
   w.el.remove();w.tab.remove();
   if(activeId===w.id){activeId=null;const next=[...windows].reverse().find(x=>!x.minimized);if(next)activate(next);}
   sortStack();updateTabs();save();
 }
 function minimize(w){
   if(!w||w.minimized)return;
   w.minimized=true;w.el.hidden=true;w.dirty=true;
   // Release large SVG subtree while keeping all historical price/indicator records intact.
   w.plot.replaceChildren();
   if(activeId===w.id){activeId=null;const next=[...windows].reverse().find(x=>!x.minimized);if(next)activate(next);}
   updateTabs();save();
 }
 function selectSymbol(symbol){
   if(!api.hasSymbol(symbol))return false;
   let w=byId(activeId);
   if(w?.locked){
     w=[...windows].reverse().find(x=>!x.locked)||null;
     if(!w){
       const existing=bySymbol(symbol);
       if(existing){activate(existing);return true;}
       w=create(symbol);if(w){activate(w);return true;}
       announce('4 張圖表皆已鎖定，請先解鎖或關閉其中一張');return false;
     }
   }
   if(!w){w=[...windows].reverse().find(x=>!x.locked)||create(symbol);}
   if(!w){announce('請先解鎖或關閉其中一張圖表');return false;}
   if(w.symbol!==symbol){window.LiqRadar4H?.clearSelection(w.plot);w.haSelected=null;w.symbol=symbol;w.el.setAttribute('aria-label',symbol+' 浮動 4H 圖表');w.dirty=true;}
   activate(w);return true;
 }
 function refreshSymbol(symbol){for(const w of windows){if(w.symbol!==symbol)continue;w.dirty=true;const d=api.getData(symbol);if(d){w.price.textContent=d.priceText;w.source.textContent=d.source;}
   // Rendering for minimized or totally covered charts is deferred until user restores/focuses.
   schedule(w,90);
 }}
 function start(e,w,kind,dir){
   if(e.button!==0||e.target.closest('button,select,a'))return;
   e.preventDefault();e.stopPropagation();activate(w);
   drag={pointer:e.pointerId,w,kind,dir,sx:e.clientX,sy:e.clientY,begin:{...w.geom}};
   e.currentTarget.setPointerCapture(e.pointerId);document.body.classList.add('radar-is-manipulating');
 }
 function move(e){
   if(!drag||e.pointerId!==drag.pointer)return;
   const {w,kind,dir,sx,sy,begin}=drag,dx=e.clientX-sx,dy=e.clientY-sy;
   if(kind==='move')w.geom={...begin,x:begin.x+dx,y:begin.y+dy};
   else{
     let {x,y,w:width,h:height}=begin;
     if(dir.includes('e'))width=clamp(begin.w+dx,min('w'),maxW());
     if(dir.includes('s'))height=clamp(begin.h+dy,min('h'),maxH());
     if(dir.includes('w')){width=clamp(begin.w-dx,min('w'),maxW());x=begin.x+begin.w-width;}
     if(dir.includes('n')){height=clamp(begin.h-dy,min('h'),maxH());y=begin.y+begin.h-height;}
     w.geom={x,y,w:width,h:height};
   }
   paint(w);if(kind==='resize'){w.dirty=true;schedule(w,85);}
 }
 function end(e){
   if(!drag||e.pointerId!==drag.pointer)return;
   const w=drag.w,wasResize=drag.kind==='resize';drag=null;document.body.classList.remove('radar-is-manipulating');
   if(wasResize){w.dirty=true;schedule(w,40);}save();
 }
 function reset(){windows.forEach((w,i)=>{w.geom=defaults(i);paint(w);w.dirty=true;schedule(w,60);});if(windows.length){activate(windows.at(-1));}save();}

 function tileWindows(){
   const visible=windows.filter(w=>!w.minimized);
   const n=visible.length;
   if(!n){announce('請先開啟圖表');return;}
   const crypto=$('liq-crypto-nav').getBoundingClientRect();
   const stock=$('liq-stock-nav').getBoundingClientRect();
   const left=Math.ceil(crypto.right+7),right=Math.floor(stock.left-7);
   const top=7,bottom=Math.floor(innerHeight-53);
   const width=Math.max(1,right-left),height=Math.max(1,bottom-top),gap=6;
   const splitW=(width-gap)/2,splitH=(height-gap)/2;
   let regions=[];
   const box=(x,y,ww,hh)=>({x:Math.round(x),y:Math.round(y),w:Math.round(ww),h:Math.round(hh)});
   if(n===1)regions=[box(left,top,width,height)];
   else if(n===2)regions=[box(left,top,width,splitH),box(left,top+splitH+gap,width,splitH)];
   else if(n===3){
     layoutVariant=(layoutVariant+1)%2;
     regions=layoutVariant===0?[
       box(left,top,splitW,splitH),box(left+splitW+gap,top,splitW,splitH),box(left,top+splitH+gap,width,splitH)
     ]:[
       box(left,top,width,splitH),box(left,top+splitH+gap,splitW,splitH),box(left+splitW+gap,top+splitH+gap,splitW,splitH)
     ];
   }else{
     regions=[box(left,top,splitW,splitH),box(left+splitW+gap,top,splitW,splitH),box(left,top+splitH+gap,splitW,splitH),box(left+splitW+gap,top+splitH+gap,splitW,splitH)];
   }
   visible.forEach((w,i)=>{w.geom=constrain(regions[i]);paint(w);w.dirty=true;schedule(w,25);});
   sortStack();save();announce(n===3?'三視窗版型 '+(layoutVariant===0?'A':'B'):'已平均分割 '+n+' 張圖表');
 }
 function bootstrap(){
   const stored=storageGet(KEY);let initial=[];
   if(stored&&Array.isArray(stored.windows)){
     const used=new Set();
     initial=stored.windows.slice(0,LIMIT).filter(x=>x&&typeof x.id==='string'&&!used.has(x.id)&&used.add(x.id)&&api.hasSymbol(x.symbol));
   }else{
     const legacy=storageGet(LEGACY);
     const candidate=(()=>{try{return localStorage.getItem('liq-v140-active-symbol');}catch(_){return null;}})();
     const symbol=api.hasSymbol(candidate)?candidate:(api.hasSymbol('BTC')?'BTC':null);
     if(symbol)initial=[{symbol,id:'chart-1',geom:legacy,locked:false,minimized:false}];
   }
   for(const s of initial)create(s.symbol,{id:s.id,geom:s.geom,locked:s.locked,minimized:s.minimized,priceScale:s.priceScale,haSelected:s.haSelected,behindCrypto:s.behindCrypto,quiet:true});
   const chosen=byId(stored?.activeId)||[...windows].reverse().find(w=>!w.minimized)||null;
   if(chosen&&!chosen.minimized)activate(chosen);else{activeId=null;sortStack();updateTabs();save();}
   // Deliberately allow zero windows after user closes all; taskbar remains to add one.
 }
 $('chartTileWindows')?.addEventListener('click',tileWindows);
 add.addEventListener('click',()=>{
   const selected=byId(activeId)?.symbol||(()=>{try{return localStorage.getItem('liq-v140-active-symbol');}catch(_){return null;}})()||'BTC';
   const w=create(api.hasSymbol(selected)?selected:(api.hasSymbol('BTC')?'BTC':null));
   if(w){activate(w);announce('已新增圖表：點擊清單可切換作用中的未鎖定圖表');}
 });
 // Reset control intentionally removed from the compact footer.
 window.addEventListener('resize',()=>{
   clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{for(const w of windows){paint(w);w.dirty=true;schedule(w,90);}save();},80);
 },{passive:true});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)for(const w of windows){w.dirty=true;schedule(w,100);}});
 window.LIQ_WORKSPACE={selectSymbol,refreshSymbol,focusList,focusChart(){const w=byId(activeId);if(w)activate(w);},sendBack(){sendBack(byId(activeId));},
   reset,getBounds(){return byId(activeId)?{...byId(activeId).geom}:null;},
   getWindows(){return windows.map(w=>({id:w.id,symbol:w.symbol,locked:w.locked,minimized:w.minimized,behindCrypto:w.behindCrypto,haSelected:w.haSelected,bounds:{...w.geom},renderCount:w.renderCount,dirty:w.dirty,priceScale:w.priceScale}));},
   addWindow(symbol){return create(api.hasSymbol(symbol)?symbol:(byId(activeId)?.symbol||'BTC'))?.id||null;},
   focusWindow:uid=>activate(byId(uid)),sendBackWindow:uid=>sendBack(byId(uid)),tileWindows,closeWindow:uid=>close(byId(uid)),minimizeWindow:uid=>minimize(byId(uid))};
 bootstrap();
 }
 boot().catch(e=>console.error('[Radar workspace]',e));
})();
