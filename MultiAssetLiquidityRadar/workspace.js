/* MultiAssetLiquidityRadar v2.0.0 — four independent floating 4H/1D charts.
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
 let riskDefaults={riskAmount1:1000,riskAmount2:100};
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
   try{localStorage.setItem(KEY,JSON.stringify({activeId,riskDefaults,windows:windows.map(w=>({id:w.id,symbol:w.symbol,geom:w.geom,toolbarPos:w.toolbarPos,locked:w.locked,minimized:w.minimized,priceScale:w.priceScale,pricePan:w.pricePan,maximized:w.maximized,haSelected:w.haSelected,behindCrypto:w.behindCrypto,timeframe:w.timeframe,displayMode:w.displayMode,viewCount:w.viewCount,viewOffset:w.viewOffset}))}));window.LIQ_SHARED_STATE?.changed?.();}catch(_){/* private mode */}
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
   if(w.maximized){
     Object.assign(w.el.style,{left:'4px',top:'4px',width:Math.max(320,innerWidth-8)+'px',height:Math.max(220,innerHeight-53)+'px',right:'auto',bottom:'auto'});
     w.el.classList.add('is-maximized');w.applyToolbarPos?.();return;
   }
   w.el.classList.remove('is-maximized');
   w.geom=constrain(w.geom);
   const g=w.geom;
   Object.assign(w.el.style,{left:g.x+'px',top:g.y+'px',width:g.w+'px',height:g.h+'px',right:'auto',bottom:'auto'});w.applyToolbarPos?.();
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
   w.onDrawingChangedPrice?.();
   w.timeframeLabel.textContent=w.timeframe+' · '+(w.displayMode==='line'?'折線':'K線');
   const drawing=window.DrawingWorkspace,doc=drawing?.snapshot(w.symbol),prefs=doc?.preferences||{};
   // One-time migration of v1.9 per-window HA guide into per-symbol persistent drawing JSON.
   if(drawing&&doc?.loaded&&Number.isFinite(w.haSelected)&&w.haSelected>0&&!w.migratedHa){
     w.migratedHa=true;if(!doc.haSelection)drawing.setHa(w.symbol,w.haSelected);
   }
   // Semantic capsules live in the status strip (never inside the SVG overlay).
   w.indicator.replaceChildren();
   for(const item of (d.capsules||[])){
     const cap=document.createElement('span');cap.className='chart-semantic '+item.kind+' '+item.tone;
     cap.textContent=item.text;cap.title=item.title||item.text;
     if(item.kind==='cci')cap.dataset.cciHover=w.symbol;
     if(item.kind==='s'||item.kind==='ha'){
       const key=item.kind==='s'?'showBollinger':'showHaSteps';
       cap.setAttribute('role','button');cap.tabIndex=0;cap.dataset.dwToggle=key;
       if(prefs[key]===false)cap.classList.add('dw-indicator-hidden');
       cap.title+='｜點擊切換'+(key==='showBollinger'?'布林帶':'平均 K 階梯')+'顯示';
       const toggle=()=>{drawing.setPrefs(w.symbol,{[key]:prefs[key]===false});w.dirty=true;schedule(w,0);};
       cap.addEventListener('click',ev=>{ev.stopPropagation();toggle();});
       cap.addEventListener('keydown',ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();toggle();}});
     }
     w.indicator.append(cap);
   }
   w.source.textContent=d.source;
   if(window.LiqRadar4H)window.LiqRadar4H.render(w.plot,{
     ...d.chart,priceScale:w.priceScale,pricePan:w.pricePan,
     timeframe:w.timeframe,displayMode:w.displayMode,viewCount:w.viewCount,viewOffset:w.viewOffset,
     showBB:prefs.showBollinger!==false,showHA:prefs.showHaSteps!==false,
     onPriceScaleChange:scale=>{w.priceScale=scale;w.dirty=true;schedule(w,0);},
     onPriceScaleCommit:()=>save(),
     selectedTimestamp:doc?.haSelection?.dailyTime??null,
     onSelectionChange:t=>{drawing?.setHa(w.symbol,t);w.haSelected=t;save();}
   });
   else w.plot.textContent='4H 圖表模組尚未載入';
   drawing?.render(w);
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
   w.tab.textContent='▧ '+w.symbol+' '+w.timeframe+(w.minimized?' ↥':'');
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
 function editPosition(w){
   const c=w.dwController,obj=c?.getSelected();
   if(!obj?.type?.endsWith('-position')){announce('請先點選圖表中的做多／做空部位');return;}
   const modal=$('dwPositionModal');if(!modal)return;
   modal.hidden=false;modal.dataset.window=w.id;modal.dataset.drawing=obj.id;
   $('dwPositionTitle').textContent=(obj.type==='long-position'?'做多':'做空')+'部位 · '+w.symbol;
   for(const [id,key] of [['dwStop','stop'],['dwTarget','target'],['dwLimitPrice','entry'],['dwRisk1','riskAmount1'],['dwRisk2','riskAmount2']])$(id).value=obj[key];
   $('dwUseLimit').checked=Boolean(obj.limitEnabled);
   const summary=$('dwPositionCalc');
   const update=()=>{const local={...obj,entry:Number($('dwLimitPrice').value),stop:Number($('dwStop').value),target:Number($('dwTarget').value),riskAmount1:Number($('dwRisk1').value),riskAmount2:Number($('dwRisk2').value),limitEnabled:$('dwUseLimit').checked};
     const price=api.getData(w.symbol)?.chart?.price,calc=window.DrawingWorkspace.calcPosition(local,price);
     summary.textContent=calc?'RR '+calc.rr.toFixed(2)+'｜止損幅 '+(calc.stopPct*100).toFixed(3)+'%｜名義1 '+window.DrawingWorkspace.money(calc.nominal1)+'｜名義2 '+window.DrawingWorkspace.money(calc.nominal2):'價格方向無效／缺少即時價';
     return {local,calc};
   };
   for(const id of ['dwStop','dwTarget','dwLimitPrice','dwRisk1','dwRisk2','dwUseLimit'])$(id).oninput=update;
   $('dwPositionSave').onclick=()=>{const {local,calc}=update();if(!calc){summary.textContent='請確認進場／止損／目標方向正確';return;}
     local.anchors=[{...obj.anchors[0],price:local.entry},{...obj.anchors[1],price:local.stop}];
     window.DrawingWorkspace.change(w.symbol,obj.id,local);modal.hidden=true;w.onDrawingChanged?.();};
   $('dwPositionCancel').onclick=()=>{modal.hidden=true;};update();
 }
 function create(symbol,{geom=null,toolbarPos=null,locked=false,minimized=false,id=null,quiet=false,priceScale=1,pricePan=0,maximized=false,haSelected=null,behindCrypto=false,timeframe='4H',displayMode='candles',viewCount=84,viewOffset=0}={}){
   if(windows.length>=LIMIT){announce('最多只能開啟 4 張圖表');return null;}
   if(!api.hasSymbol(symbol))return null;
   const uid=id||'chart-'+(++serial);
   serial=Math.max(serial,Number(uid.replace(/^chart-/,''))||serial);
   const el=document.createElement('main');el.className='floating-chart';el.dataset.chartWindow=uid;
   el.setAttribute('role','region');el.setAttribute('aria-label',symbol+' 浮動 4H 圖表');
   const head=document.createElement('header');head.className='chart-titlebar';head.title='拖曳標題列移動圖表';
   const label=document.createElement('div');label.className='chart-head-label';
   const title=document.createElement('strong');title.textContent=symbol;
   const timeframeSpan=document.createElement('span');timeframeSpan.className='chart-timeframe';timeframeSpan.textContent='4H · 即時行情';
   const price=document.createElement('span');price.className='chart-head-price';price.textContent='--';
   label.append(title,timeframeSpan,price);
   const buttons=document.createElement('div');buttons.className='chart-head-buttons';
   const w={id:uid,symbol,timeframe:timeframe==='1D'?'1D':'4H',displayMode:displayMode==='line'?'line':'candles',viewCount:clamp(Number(viewCount)||84,21,270),viewOffset:Number(viewOffset)||0,pricePan:Number(pricePan)||0,maximized:!!maximized,timeframeLabel:timeframe,locked:!!locked,minimized:!!minimized,priceScale:clamp(Number(priceScale)||1,.25,16),haSelected:Number.isFinite(Number(haSelected))&&haSelected!==null?Number(haSelected):null,behindCrypto:!!behindCrypto,toolbarPos:toolbarPos&&Number.isFinite(toolbarPos.x)&&Number.isFinite(toolbarPos.y)?{x:toolbarPos.x,y:toolbarPos.y}:{x:9,y:68},geom:constrain(geom||defaults(windows.length)),el,head,title,price,tab:null,lockButton:null,backButton:null,plot:null,indicator:null,source:null,dirty:true,timer:0,renderCount:0};
   w.timeframeLabel=timeframeSpan;
   w.lockButton=makeButton('chart-lock',w.locked?'🔒':'🔓','鎖定／解除鎖定圖表',()=>{w.locked=!w.locked;updateTabs();save();});
   w.backButton=makeButton('chart-send-back','⇤','置於左側加密清單後方',()=>sendBack(w));
   w.backButton.setAttribute('aria-pressed',String(w.behindCrypto));
   w.maximizeButton=makeButton('chart-maximize','⛶','最大化圖表',()=>{
     w.maximized=!w.maximized;
     w.maximizeButton.title=w.maximized?'還原最大化前的尺寸':'最大化圖表';
     w.maximizeButton.setAttribute('aria-label',w.maximizeButton.title);
     w.maximizeButton.textContent=w.maximized?'❐':'⛶';
     paint(w);w.dirty=true;schedule(w,0);save();
   });
   if(w.maximized){w.maximizeButton.textContent='❐';w.maximizeButton.title='還原最大化前的尺寸';}
   buttons.append(w.lockButton,w.backButton,w.maximizeButton,
     makeButton('chart-reset','▣','還原此圖表預設尺寸',()=>{w.maximized=false;w.maximizeButton.textContent='⛶';w.geom=defaults(Math.max(0,windows.indexOf(w)));paint(w);w.dirty=true;schedule(w,50);activate(w);}),
     makeButton('chart-minimize','−','最小化此圖表（資料持續更新）',()=>minimize(w)),
     makeButton('chart-close','×','關閉此圖表視窗',()=>close(w)));
   w.indicator=document.createElement('span');w.indicator.className='chart-indicator-strip chart-inline-capsules';w.indicator.textContent='日線 S · 中軌 · HA · CCI';
   w.source=document.createElement('span');w.source.className='chart-source';
   head.append(label,w.indicator,buttons);
   w.plot=document.createElement('div');w.plot.className='radar-area radar-area-4h';w.plot.dataset.chartPlot=uid;
   el.append(head,w.plot);
   // One persistent table per floating window. It is a VIEW of the selected
   // position only; the drawings/R2 document schema is unchanged. Keep it
   // outside the plot so 10-second SVG redraws do not destroy or flash it.
   const nominalBox=document.createElement('aside');
   nominalBox.className='dw-nominal-table';
   nominalBox.setAttribute('aria-label','選取部位名義價值換算');
   nominalBox.hidden=true;
   const nominalGrid=document.createElement('table');
   const hdr=document.createElement('thead'),headRow=document.createElement('tr');
   const body=document.createElement('tbody'),valueRow=document.createElement('tr');
   const nominalValues=[];
   for(const [i,titleText] of ['名義價值①','名義價值②'].entries()){
     const th=document.createElement('th');th.scope='col';th.textContent=titleText;headRow.append(th);
     const td=document.createElement('td');td.dataset.nominalColumn=String(i);
     td.textContent='—';valueRow.append(td);nominalValues.push(td);
   }
   hdr.append(headRow);body.append(valueRow);nominalGrid.append(hdr,body);
   nominalBox.append(nominalGrid);el.append(nominalBox);
   w.nominalBox=nominalBox;

   const toolbar=document.createElement('div');toolbar.className='dw-toolbar';
   // Independent grab bar: dragging this control never pans the chart or moves its window.
   const grip=document.createElement('span');grip.className='dw-toolbar-grip';grip.textContent='⠿';grip.title='按住拖曳整排繪圖工具';grip.setAttribute('role','img');grip.setAttribute('aria-label','拖曳工具列');
   toolbar.append(grip);
   const setToolbarPos=()=>{const width=el.clientWidth||w.geom.w,height=el.clientHeight||w.geom.h;w.toolbarPos.x=clamp(w.toolbarPos.x,0,Math.max(0,width-Math.min(toolbar.offsetWidth||450,width)));w.toolbarPos.y=clamp(w.toolbarPos.y,32,Math.max(32,height-35));toolbar.style.left=w.toolbarPos.x+'px';toolbar.style.top=w.toolbarPos.y+'px';};
   let grab=null;grip.addEventListener('pointerdown',ev=>{if(ev.button!==0)return;ev.preventDefault();ev.stopPropagation();grab={id:ev.pointerId,x:ev.clientX,y:ev.clientY,px:w.toolbarPos.x,py:w.toolbarPos.y};grip.setPointerCapture(ev.pointerId);});
   grip.addEventListener('pointermove',ev=>{if(!grab||grab.id!==ev.pointerId)return;w.toolbarPos.x=grab.px+ev.clientX-grab.x;w.toolbarPos.y=grab.py+ev.clientY-grab.y;setToolbarPos();});
   const finishGrip=ev=>{if(!grab||grab.id!==ev.pointerId)return;grab=null;try{grip.releasePointerCapture(ev.pointerId);}catch(_){}save();};
   grip.addEventListener('pointerup',finishGrip);grip.addEventListener('pointercancel',finishGrip);
   const period=document.createElement('select');period.title='圖表 K 線週期';period.setAttribute('aria-label','圖表週期');
   for(const [value,txt] of [['4H','4H'],['1D','1D']]){const opt=document.createElement('option');opt.value=value;opt.textContent=txt;period.append(opt);}period.value=w.timeframe;
   period.addEventListener('change',()=>{activate(w);w.timeframe=period.value;w.viewCount=w.timeframe==='1D'?45:84;w.viewOffset=0;w.dirty=true;schedule(w,0);updateTabs();save();});
   const mode=document.createElement('select');mode.title='K 線或收盤價折線';mode.setAttribute('aria-label','圖表型態');
   for(const [value,txt] of [['candles','K線'],['line','折線']]){const opt=document.createElement('option');opt.value=value;opt.textContent=txt;mode.append(opt);}mode.value=w.displayMode;
   mode.addEventListener('change',()=>{activate(w);w.displayMode=mode.value;w.dirty=true;schedule(w,0);save();});
   toolbar.append(period,mode);
   let controller;
   const tools=[['select','↖','瀏覽／移動'],['fib','Fib','對數斐波那契'],['green','▣綠','綠色矩形'],['red','▣紅','紅色矩形'],['yellow','▣黃','黃色矩形'],['long','多','做多部位'],['short','空','做空部位']];
   const toolButtons=new Map(),orderDefaults={long:false,short:false};
   const selectTool=key=>{controller?.setTool(key);for(const [name,btn] of toolButtons)btn.classList.toggle('active',key===name);};
   for(const [key,txt,titleTxt] of tools){const b=document.createElement('button');b.type='button';b.textContent=txt;b.title=titleTxt+'｜CTRL 吸附 OHLC';b.dataset.tool=key;b.className=key==='select'?'active':'';
     b.addEventListener('click',ev=>{ev.stopPropagation();activate(w);selectTool(key);});toolbar.append(b);toolButtons.set(key,b);
     if(key==='long'||key==='short'){
       const wrap=document.createElement('label');wrap.className='dw-order-default';wrap.title=(key==='long'?'做多':'做空')+'預設掛單（建立下一張部位時生效）';
       const cb=document.createElement('input');cb.type='checkbox';cb.dataset.orderDefault=key;cb.addEventListener('change',()=>{orderDefaults[key]=cb.checked;});
       wrap.append(cb,document.createTextNode('掛'));toolbar.append(wrap);
     }
   }
   const settings=document.createElement('button');settings.textContent='⚙ 部位';settings.title='編輯目前選取的多單／空單';settings.addEventListener('click',()=>{activate(w);editPosition(w);});toolbar.append(settings);
   const magnet=document.createElement('span');magnet.className='dw-magnet-indicator';magnet.textContent='🧲';magnet.title='按住 CTRL 磁鐵吸附 OHLC';toolbar.insertBefore(magnet,toolButtons.get('fib'));
   const note=document.createElement('span');note.className='dw-tools-hint';note.textContent='左鍵平移 · 滾輪縮放 · CTRL 磁鐵';toolbar.append(note);
   el.append(toolbar);w.applyToolbarPos=setToolbarPos;setToolbarPos();
   // Selected position only: reusing the unchanged DrawingWorkspace formula.
   // This updater is used on selection, mouse drag, edited settings and live
   // price changes. It does not issue requests or mutate saved drawings.
   const nominalText=value=>Number.isFinite(value)&&value>0
     ?value.toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:2}):'—';
   const updatePosition=()=>{
     const selected=controller?.getSelected?.();
     if(!selected?.type?.endsWith('-position')){
       nominalBox.hidden=true;nominalBox.removeAttribute('data-dw-position-id');return;
     }
     const marketPrice=Number(api.getData(w.symbol)?.chart?.price);
     const calc=window.DrawingWorkspace?.calcPosition(selected,marketPrice)||null;
     nominalBox.dataset.dwSide=selected.type==='long-position'?'long':'short';
     nominalBox.dataset.dwPositionId=selected.id;
     const fields=[nominalText(calc?.nominal1),nominalText(calc?.nominal2)];
     for(let i=0;i<nominalValues.length;i++){
       if(nominalValues[i].textContent!==fields[i])nominalValues[i].textContent=fields[i];
       nominalValues[i].title=['名義價值①','名義價值②'][i]+'：'+fields[i];
     }
     nominalBox.hidden=false;
   };
   w.onDrawingChanged=()=>{updatePosition();w.dirty=true;schedule(w,0);};
   controller=window.DrawingWorkspace?.attach(w,{livePrice:()=>window.LIQ_CHART_API?.getData(w.symbol)?.chart?.price,
     refreshHeader:updatePosition,setTool:selectTool,setMagnet:on=>{const b=toolButtons.get('select');if(b)b.textContent=on?'🧲':'↖';},
     getDefaultLimit:key=>orderDefaults[key],getDefaultRisk:()=>({...riskDefaults}),
     getOffset:()=>w.viewOffset,getCount:()=>w.viewCount,getTimeframe:()=>w.timeframe,getPricePan:()=>w.pricePan,
     setPricePan:n=>{if(Number.isFinite(n)&&n!==w.pricePan){w.pricePan=n;w.dirty=true;schedule(w,0);}},
     commitView:()=>save(),
     setOffset:n=>{if(n!==w.viewOffset){w.viewOffset=n;w.dirty=true;schedule(w,0);}},
     setView:(count,offset)=>{w.viewCount=count;w.viewOffset=offset;w.dirty=true;schedule(w,0);save();},
     moreHistory:()=>window.LIQ_CHART_API?.loadExtra4H?.(w.symbol)
   });
   w.onDrawingChangedPrice=updatePosition;
   w.dwController=controller;w.dwPeriod=period;w.dwMode=mode;w.dwToolButtons=toolButtons;
   updatePosition();

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
     if(width!==ow||height!==oh){ow=width;oh=height;w.applyToolbarPos?.();w.dirty=true;schedule(w,85);}
   });w.observer.observe(w.plot);}
   if(minimized){el.hidden=true;w.plot.replaceChildren();}else if(!quiet)activate(w);
   updateTabs();if(!quiet)save();return w;
 }
 function close(w){
   if(!w)return;
   clearTimeout(w.timer);w.observer?.disconnect();w.dwController?.dispose?.();
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
   if(w.symbol!==symbol){w.dwController?.reset();w.dwToolButtons?.forEach((b,k)=>b.classList.toggle('active',k==='select'));
     w.haSelected=null;w.symbol=symbol;w.viewOffset=0;w.viewCount=w.timeframe==='1D'?45:84;
     w.onDrawingChanged?.();w.el.setAttribute('aria-label',symbol+' 浮動 '+w.timeframe+' 圖表');w.dirty=true;}
   // Deep 4H history remains fully on demand: never fetch 300 bars on a plain list click.
   activate(w);return true;
 }
 function refreshSymbol(symbol){for(const w of windows){if(w.symbol!==symbol)continue;w.dirty=true;const d=api.getData(symbol);if(d){w.price.textContent=d.priceText;w.source.textContent=d.source;}
   // Rendering for minimized or totally covered charts is deferred until user restores/focuses.
   schedule(w,90);
 }}
 function start(e,w,kind,dir){
   if(e.button!==0||w.maximized||e.target.closest('button,select,a,[data-dw-toggle]'))return;
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
   for(const k of ['riskAmount1','riskAmount2'])if(Number.isFinite(Number(stored?.riskDefaults?.[k]))&&Number(stored.riskDefaults[k])>0)riskDefaults[k]=Number(stored.riskDefaults[k]);
   if(stored&&Array.isArray(stored.windows)){
     const used=new Set();
     initial=stored.windows.slice(0,LIMIT).filter(x=>x&&typeof x.id==='string'&&!used.has(x.id)&&used.add(x.id)&&api.hasSymbol(x.symbol));
   }else{
     const legacy=storageGet(LEGACY);
     const candidate=(()=>{try{return localStorage.getItem('liq-v140-active-symbol');}catch(_){return null;}})();
     const symbol=api.hasSymbol(candidate)?candidate:(api.hasSymbol('BTC')?'BTC':null);
     if(symbol)initial=[{symbol,id:'chart-1',geom:legacy,locked:false,minimized:false}];
   }
   for(const s of initial)create(s.symbol,{id:s.id,geom:s.geom,toolbarPos:s.toolbarPos,locked:s.locked,minimized:s.minimized,priceScale:s.priceScale,pricePan:s.pricePan,maximized:s.maximized,haSelected:s.haSelected,behindCrypto:s.behindCrypto,timeframe:s.timeframe,displayMode:s.displayMode,viewCount:s.viewCount,viewOffset:s.viewOffset,quiet:true});
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
   getDefaultRisk:()=>({...riskDefaults}),setDefaultRisk:values=>{for(const k of ['riskAmount1','riskAmount2']){const n=Number(values[k]);if(!Number.isFinite(n)||n<=0)return false;}riskDefaults={riskAmount1:Number(values.riskAmount1),riskAmount2:Number(values.riskAmount2)};save();return true;},
   getActiveWindow(){return byId(activeId)||null;},
   getWindows(){return windows.map(w=>({id:w.id,symbol:w.symbol,locked:w.locked,minimized:w.minimized,behindCrypto:w.behindCrypto,timeframe:w.timeframe,displayMode:w.displayMode,viewCount:w.viewCount,viewOffset:w.viewOffset,haSelected:w.haSelected,bounds:{...w.geom},renderCount:w.renderCount,dirty:w.dirty,priceScale:w.priceScale,pricePan:w.pricePan,maximized:w.maximized}));},
   addWindow(symbol){return create(api.hasSymbol(symbol)?symbol:(byId(activeId)?.symbol||'BTC'))?.id||null;},
   focusWindow:uid=>activate(byId(uid)),sendBackWindow:uid=>sendBack(byId(uid)),tileWindows,closeWindow:uid=>close(byId(uid)),minimizeWindow:uid=>minimize(byId(uid))};
 window.DrawingWorkspace?.subscribe(symbol=>{for(const w of windows)if(window.DrawingWorkspace.symbolKey(w.symbol)===symbol){w.dirty=true;schedule(w,0);w.onDrawingChangedPrice?.();}});
 bootstrap();
 }
 boot().catch(e=>console.error('[Radar workspace]',e));
})();
