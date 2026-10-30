/* MultiAssetLiquidityRadar v2.0.0
 * ONLY the actual OHLC candlesticks are 4H. BB(20,2), HA stair levels,
 * S-state/midline regime and CCI-SMA are 1D (UTC 00:00 = Asia/Taipei 08:00).
 * BB algorithm is shared with the original SState monitor-engine.js.
 */
(function(root){'use strict';
 const H4=14400000,DAY=86400000,BLANK_CANDLES=3;
 // Click an HA stair to pin a semantic guide; only another stair or its price badge changes the pin.
 const interactions=new WeakMap();
 const SCALE_MIN=0.25,SCALE_MAX=16;
 let clipIndex=0;
 const valid=n=>Number.isFinite(n)&&n>0;
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const clamp=(n,l,h)=>Math.max(l,Math.min(h,n));
 const money=n=>{if(!valid(n))return '—';const a=Math.abs(n),dp=a>=100?2:a>=1?4:a>=.01?6:a>=.0001?8:Math.min(13,Math.ceil(-Math.log10(a))+4);return n.toLocaleString('en-US',{maximumFractionDigits:dp,minimumFractionDigits:a>=100?2:0});};
 const clock=t=>new Date(t).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
 const dayText=t=>new Date(t).toLocaleDateString('zh-TW',{timeZone:'Asia/Taipei',month:'2-digit',day:'2-digit'});
 const dayOf=t=>Math.floor(t/DAY)*DAY;
 const normalized=rows=>[...new Map((Array.isArray(rows)?rows:[]).filter(b=>Number.isFinite(b?.t)&&[b.o,b.h,b.l,b.c].every(valid)&&b.h>=Math.max(b.o,b.c)&&b.l<=Math.min(b.o,b.c)).map(b=>[b.t,{...b}])).values()].sort((a,b)=>a.t-b.t);
 function dailyHA(days){
   const result=new Map();let po=null,pc=null;
   for(const d of normalized(days)){
     const o=po===null?(d.o+d.c)/2:(po+pc)/2,c=(d.o+d.h+d.l+d.c)/4;
     result.set(dayOf(d.t),{price:c,color:c>o?'yellow':c<o?'purple':'gray',date:dayOf(d.t)});
     po=o;pc=c;
   }return result;
 }
 function bollinger(days){
   // Same population-standard-deviation SMA(close,20),2 sigma as SStateMonitorEngine.
   const rows=normalized(days);
   if(root.SStateMonitorEngine?.rollingBollinger){
     return root.SStateMonitorEngine.rollingBollinger(rows.map(b=>({time:b.t,open:b.o,high:b.h,low:b.l,close:b.c,volume:b.v||0})),20);
   }
   const result=rows.map(()=>({mid:null,upper:null,lower:null}));
   for(let i=19;i<rows.length;i++){
     const cs=rows.slice(i-19,i+1).map(b=>b.c),mid=cs.reduce((a,b)=>a+b,0)/20;
     const sd=Math.sqrt(cs.reduce((s,x)=>s+(x-mid)**2,0)/20);
     result[i]={mid,upper:mid+2*sd,lower:mid-2*sd};
   }return result;
 }
 // Project TODAY's still-forming 1D candle from the actual current UTC-day 4H
 // OHLC stream. Unlike taking 20 recent 4H closes, this keeps BB(20,2) strictly
 // daily while the latest daily close follows each fresh market quote.
 // UTC 00:00 equals Asia/Taipei 08:00; completed daily candles are immutable.
 function projectDaily(daily,bars4h,livePrice,nowTime=Date.now(),scannerDay=null){
   const days=normalized(daily),day=dayOf(nowTime);
   const four=normalized(bars4h).filter(b=>dayOf(b.t)===day&&b.t<=nowTime);
   const d=days.at(-1),existing=d&&dayOf(d.t)===day?d:null;
   const feed=scannerDay&&dayOf(scannerDay.day)===day&&
     [scannerDay.o,scannerDay.h,scannerDay.l,scannerDay.c].every(valid)&&
     scannerDay.h>=Math.max(scannerDay.o,scannerDay.c)&&scannerDay.l<=Math.min(scannerDay.o,scannerDay.c)?scannerDay:null;
   // Do not invent a daily OHLC candle from a close alone when no current-day
   // 1D, 4H or scanner OHLC exists; do not use yesterday as today's open.
   if(!existing&&!four.length&&!feed)return days;
   const first=four[0],last4=four.at(-1);
   const open=existing?.o??feed?.o??first?.o;
   const close=valid(livePrice)?livePrice:(last4?.c??feed?.c??existing?.c);
   if(!valid(open)||!valid(close))return days;
   const highs=[open,close,existing?.h,feed?.h,...four.map(b=>b.h)].filter(valid);
   const lows=[open,close,existing?.l,feed?.l,...four.map(b=>b.l)].filter(valid);
   const row={t:day,o:open,h:Math.max(...highs),l:Math.min(...lows),c:close,
     v:existing?.v??four.reduce((sum,b)=>sum+(Number(b.v)||0),0)};
   if(existing)days[days.length-1]=row;
   else if(!d||dayOf(d.t)<day)days.push(row);
   return days;
 }
 function series(bars,daily,now,nowTime){
   const all=normalized(bars);
   const liveStart=Math.floor(nowTime/H4)*H4;
   if(valid(now)){
     // Only update an unfinished 4H bar, not any completed historical candle.
     const last=all.at(-1);
     if(last?.t===liveStart){last.c=now;last.h=Math.max(last.h,now);last.l=Math.min(last.l,now);}
   }
   const days=projectDaily(daily,all,now,nowTime),ha=dailyHA(days),bb=bollinger(days),bbByDay=new Map();
   days.forEach((d,i)=>{const band=bb[i];if(Number.isFinite(band?.mid))bbByDay.set(dayOf(d.t),band);});
   return all.map(b=>({...b,bb:bbByDay.get(dayOf(b.t))||null,ha:ha.get(dayOf(b.t))||null}));
 }
 function render(target,{bars=[],daily=[],price=null,upper=null,lower=null,updatedAt=Date.now(),priceScale=1,onPriceScaleChange=null,onPriceScaleCommit=null,selectedTimestamp=null,onSelectionChange=null,timeframe='4H',displayMode='candles',viewCount=84,viewOffset=0,pricePan=0,showBB=true,showHA=true}={}){
   if(!target)return;
   const tf=timeframe==='1D'?'1D':'4H';
   const source=tf==='1D'?normalized(projectDaily(daily,bars,price,updatedAt)):normalized(bars);
   if(source.length<21){target.innerHTML='<div class="radar-chart-wait">等待 '+tf+' K 線資料…</div>';target.__liqProjection=null;return;}
   let complete;
   if(tf==='1D'){
     const ha=dailyHA(source),bb=bollinger(source);
     complete=source.map((r,i)=>({...r,ha:ha.get(dayOf(r.t)),bb:bb[i]}));
   }else complete=series(bars,daily,price,updatedAt);
   const n=clamp(Math.round(Number(viewCount)||84),21,tf==='1D'?90:270);
   // Negative offset represents empty FUTURE space to the right of the latest candle.
   // Keep the slot width fixed at viewCount even at a history/future boundary.
   const offset=clamp(Math.round(Number(viewOffset)||0),-Math.floor(n*.5),Math.max(0,complete.length-21));
   const future=Math.max(0,-offset);
   const end=Math.min(complete.length,Math.max(21,complete.length-offset)),begin=Math.max(0,end-n);
   const rows=complete.slice(begin,end);
   if(rows.length<21){target.innerHTML='<div class="radar-chart-wait">4H K 線歷史不足</div>';return;}
   const W=Math.max(320,Math.round(target.clientWidth||1200)),H=Math.max(220,Math.round(target.clientHeight||370));
   const L=16,R=Math.min(146,Math.max(112,Math.round(W*.31))),T=20,B=35,plotR=W-R,plotB=H-B,pw=plotR-L,ph=plotB-T;
   const stride=pw/(n+BLANK_CANDLES),x=i=>L+(i+.5-future)*stride;
   const vals=[];
   for(const r of rows){vals.push(r.h,r.l);if(showBB&&r.bb)vals.push(r.bb.upper,r.bb.lower);if(showHA&&r.ha)vals.push(r.ha.price);}
   for(const v of [price,upper,lower])if(valid(v))vals.push(v);
   // A single logarithmic projection drives the axis, OHLC, Fib, drawings and snap coordinates.
   const clean=vals.filter(valid),rawMin=Math.min(...clean),rawMax=Math.max(...clean);
   const autoLo=Math.log(rawMin),autoHi=Math.log(rawMax),range=Math.max(autoHi-autoLo,.005);
   const mid=(autoHi+autoLo)/2,scale=clamp(Number(priceScale)||1,SCALE_MIN,SCALE_MAX);
   const spanVisible=range*1.17/scale;
   const anchorLog=Math.log(valid(price)?price:rows.at(-1).c);
   const frac=clamp((autoHi-anchorLog)/(autoHi-autoLo||1),0,1);
   // pricePan is the persistent additive log-price translation of the viewport.
   const pan=Number.isFinite(Number(pricePan))?Number(pricePan):0;
   const hi=anchorLog+frac*spanVisible+pan,lo=hi-spanVisible;
   const y=value=>valid(value)?T+(hi-Math.log(value))/(hi-lo)*ph:NaN;
   const priceAtY=yy=>Math.exp(hi-(yy-T)/ph*(hi-lo));
   const clipId='rc-plot-clip-'+(target.dataset.chartPlot||target.id||'single').replace(/[^a-zA-Z0-9_-]/g,'')+'-'+(target.dataset.clipNonce|| (target.dataset.clipNonce=String(++clipIndex)));
   const fmt=n=>Number.isFinite(n)?n.toFixed(2):'0';
   const svg=[];
   svg.push(`<svg class="radar-chart-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMinYMin meet" role="img" aria-label="4H 真實 K 線，日線布林帶(20,2)、日線平均 K 階梯，清算上下界及現價價格">`);
   svg.push(`<defs><clipPath id="${clipId}"><rect x="${L}" y="${T}" width="${pw}" height="${ph}"/></clipPath></defs>`);
   // Price labels are exclusively on the right side; no currency symbol.
   for(let i=0;i<=5;i++){
     const v=Math.exp(lo+(hi-lo)*i/5),yy=y(v);
     svg.push(`<line class="rc-grid-h" x1="${L}" x2="${plotR}" y1="${fmt(yy)}" y2="${fmt(yy)}"/><text class="rc-axis-text" x="${plotR+7}" y="${fmt(yy+4)}">${esc(money(v))}</text>`);
   }
   // Taiwan trading day begins 08:00, only show dates to prevent axis clutter.
   rows.forEach((r,i)=>{
     if(i!==0&&dayOf(r.t)!==dayOf(rows[i-1].t) && (W>=700||i%12<6)){
       const at=x(i)-stride/2;
       svg.push(`<line class="rc-grid-v" x1="${fmt(at)}" x2="${fmt(at)}" y1="${T}" y2="${plotB}"/>`);
       svg.push(`<text class="rc-time-text" x="${fmt(x(i))}" y="${H-10}" text-anchor="middle">${esc(dayText(r.t))}</text>`);
     }
   });
   // DAILY bands, *never* Bollinger on 4H closes. Values repeat across same day's 4H bars.
   // Draw one daily sample near the center of its six candle slots, as on the SState home chart.
   const daysShown=[];
   rows.forEach((r,i)=>{
     const date=dayOf(r.t),entry=daysShown.at(-1);
     if(entry?.date===date){entry.last=i;return;}
     daysShown.push({date,first:i,last:i,bb:r.bb});
   });
   // Clip off-scale candles and historical bands instead of letting them run over
   // the right price axis or title. Grid/axis and price badges stay unclipped.
   svg.push(`<g class="rc-price-plot" clip-path="url(#${clipId})">`);
   svg.push('<g class="rc-boll"'+(showBB?'':' style="display:none"')+'>');
   for(const [key,cls] of [['upper','rc-bb'],['mid','rc-middle'],['lower','rc-bb']]){
     let d='',active=false,prevDate=null;
     for(const day of daysShown){
       if(!day.bb||!valid(day.bb[key])){active=false;continue;}
       // The unfinished today's band is anchored at the LIVE last 4H candle,
       // rather than stopping at the middle of today's six-candle group.
       const xx=day.last===rows.length-1?x(day.last):(x(day.first)+x(day.last))/2;
       // Do not bridge missing dates or a missing 1D BB calculation.
       const contiguous=prevDate===null||day.date-prevDate===DAY;
       d+=`${active&&contiguous?' L':' M'}${fmt(xx)},${fmt(y(day.bb[key]))}`;
       active=true;prevDate=day.date;
     }
     if(d)svg.push(`<path class="${cls}" d="${d.trim()}"/>`);
   }
   svg.push('</g>');
   // TradingView-style hollow OHLC. Two distinct wicks stop at the body edges:
   // neither wick crosses its hollow (transparent) candle body.
   const w=clamp(stride*.60,3.2,10);
   if(displayMode==='line'){
     const pts=rows.map((r,i)=>`${fmt(x(i))},${fmt(y(r.c))}`).join(' ');
     svg.push(`<polyline class="rc-close-line" points="${pts}" fill="none" stroke="#36cde5" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`);
   }else rows.forEach((r,i)=>{
     const xx=x(i),c=r.c>=r.o?'rc-up':'rc-down';
     const top=y(Math.max(r.o,r.c)),bottom=y(Math.min(r.o,r.c));
     const bodyHeight=Math.max(1.4,bottom-top), bodyTop=(top+bottom-bodyHeight)/2;
     const wickTop=y(r.h),wickBottom=y(r.l),bodyBottom=bodyTop+bodyHeight;
     if(wickTop<bodyTop-0.15)svg.push(`<line class="rc-wick ${c}" x1="${fmt(xx)}" x2="${fmt(xx)}" y1="${fmt(wickTop)}" y2="${fmt(bodyTop)}"/>`);
     if(wickBottom>bodyBottom+0.15)svg.push(`<line class="rc-wick ${c}" x1="${fmt(xx)}" x2="${fmt(xx)}" y1="${fmt(bodyBottom)}" y2="${fmt(wickBottom)}"/>`);
     svg.push(`<rect class="rc-candle ${c}" x="${fmt(xx-w/2)}" y="${fmt(bodyTop)}" width="${fmt(w)}" height="${fmt(bodyHeight)}" fill="${r.c>=r.o?'rgba(13,185,175,0.28)':'none'}"/>`);
   });
   // The 1D HA close is held throughout that UTC day, usually six real 4H candles.
   let prev=null;
   if(showHA)rows.forEach((r,i)=>{
     const h=r.ha;if(!h||h.color==='gray'){prev=null;return;}
     const start=x(i)-stride/2,end=x(i)+stride/2,cls=h.color==='yellow'?'rc-ha-yellow':'rc-ha-purple';
     svg.push(`<line class="rc-ha-step ${cls}" x1="${fmt(start)}" x2="${fmt(end)}" y1="${fmt(y(h.price))}" y2="${fmt(y(h.price))}"/>`);
     if(prev&&prev.date!==h.date)svg.push(`<line class="rc-ha-step ${cls}" x1="${fmt(start)}" x2="${fmt(start)}" y1="${fmt(y(prev.price))}" y2="${fmt(y(h.price))}"/>`);
     prev=h;
   });
   // Keep source data for the levels but show only numeric price labels; NOW is explicit.
   const labels=[];
   for(const [kind,value] of [['up',upper],['down',lower],['now',price]]){
     if(!valid(value))continue;
     const yy=y(value);
     // Horizontal values outside a manually zoomed range are not falsely
     // drawn on the nearest border; zoom out or double-click axis to inspect.
     if(yy<T||yy>plotB)continue;
     if(kind==='now')svg.push(`<line class="rc-level rc-level-${kind}" x1="${L}" x2="${plotR}" y1="${fmt(yy)}" y2="${fmt(yy)}"/>`);
     labels.push({kind,real:yy,yy,text:money(value)});
   }
   svg.push('</g>'); // rc-price-plot clip ends before price label badges.
   // Beacon is OUTSIDE clipping group and 17 SVG pixels inward from the price axis.
   // Glow must remain a complete circle rather than being cut in half at the axis.
   if(valid(price) && y(price)>=T && y(price)<=plotB){
     svg.push(`<circle class="rc-now-breathe rc-now-breathe-halo" cx="${plotR-17}" cy="${fmt(y(price))}" r="6" pointer-events="none"/>`);
     svg.push(`<circle class="rc-now-breathe rc-now-breathe-core" cx="${plotR-17}" cy="${fmt(y(price))}" r="3" pointer-events="none"/>`);
   }
   // Offset only the badge, never shift the true-price horizontal line.
   const sorted=labels.slice().sort((a,b)=>a.yy-b.yy);
   for(let i=1;i<sorted.length;i++)sorted[i].yy=Math.max(sorted[i].yy,sorted[i-1].yy+22);
   const overshoot=Math.max(0,(sorted.at(-1)?.yy??0)-(plotB-10));
   if(overshoot>0)sorted.forEach(v=>v.yy-=overshoot);
   for(const lab of sorted){
     svg.push(`<path class="rc-label-leader rc-label-${lab.kind}" d="M${plotR},${fmt(lab.real)} L${plotR+4},${fmt(lab.yy)}"/>`);
     svg.push(`<rect class="rc-label-box rc-label-${lab.kind}" x="${plotR+3}" y="${fmt(lab.yy-9)}" width="${R-7}" height="19" rx="4"/>`);
     svg.push(`<text class="rc-label-text rc-label-${lab.kind}" x="${plotR+9}" y="${fmt(lab.yy+4)}">${esc(lab.text)}</text>`);
   }
   // Keep transparent hit surface beneath both overlays. HA inspection overlays are appended
   // LAST in the SVG, so their opaque semantic price badge always covers NOW/axis/cursor badges.
   svg.push(`<rect class="rc-hit" x="${L}" y="${T}" width="${pw}" height="${ph}" fill="transparent"/>`);
   // Moving only shows the time crosshair. HA extension is an explicit click action.
   svg.push(`<g class="rc-cursor" visibility="hidden" pointer-events="none"><line class="rc-hover-v" x1="0" x2="0" y1="${T}" y2="${plotB}"/><line class="rc-hover-h" x1="${L}" x2="${plotR}" y1="0" y2="0"/><rect class="rc-hover-time-box" x="0" y="${plotB+2}" width="122" height="19" rx="3"/><text class="rc-hover-time" x="0" y="${plotB+16}" text-anchor="middle">—</text><rect class="rc-hover-price-box" x="${plotR+3}" y="0" width="${R-7}" height="19" rx="3"/><text class="rc-hover-price" x="${plotR+9}" y="0">—</text></g>`);
   // Entire right axis is a drag handle. Transparent hit area keeps badges on
   // top visually and is inside the stable plot host's delegated pointer events.
   svg.push(`<rect class="rc-price-axis-hit" x="${plotR}" y="${T}" width="${R}" height="${ph}" fill="transparent"><title>按住左鍵往上拉放大價格間距、往下拉縮小；雙擊恢復自動刻度</title></rect>`);
   svg.push(`<g class="rc-ha-selection" visibility="hidden" pointer-events="none"><line class="rc-selected-guide" x1="0" x2="${plotR}" y1="0" y2="0"/><circle class="rc-selected-dot" cx="0" cy="0" r="4"/><rect class="rc-selected-price-box" x="${plotR+3}" y="0" width="${R-7}" height="19" rx="3" pointer-events="all" style="cursor:pointer"/><text class="rc-selected-price" x="${plotR+9}" y="0">—</text></g>`);
   svg.push('</svg>');
   // Small TradingView-like 4H OHLC strip: show the current candle by default,
   // and temporarily inspect a historical candle only while the pointer is over it.
   const ohlcStrip='<div class="rc-ohlc-overlay" aria-label="4H K線開高低收" aria-live="off">'+
     [['open','開'],['high','高'],['low','低'],['close','收']].map(([key,title])=>
       `<span class="rc-ohlc-field" data-field="${key}"><span class="rc-ohlc-caption">${title}=</span><span class="rc-ohlc-value">—</span></span>`).join('')+'</div>';
   target.innerHTML=svg.join('')+ohlcStrip;
   target.dataset.candles=tf;target.dataset.indicators='1D';target.dataset.trailingSlots=String(BLANK_CANDLES);
   // Projection is replaced on every repaint. Drawing objects hold UTC timestamps and real prices.
   const xAtTime=t=>{
     if(!Number.isFinite(t)||!rows.length)return NaN;
     let idx=rows.findIndex(r=>r.t>=t);
     if(idx<0)return x(rows.length-1)+(t-rows.at(-1).t)/(tf==='1D'?DAY:H4)*stride;
     if(idx===0)return x(0)+(t-rows[0].t)/(tf==='1D'?DAY:H4)*stride;
     const a=rows[idx-1],b=rows[idx];return x(idx-1)+(t-a.t)/(b.t-a.t||1)*stride;
   };
   const timeAtX=xx=>{
     const index=(xx-L)/stride-.5+future,low=Math.floor(index),fraction=index-low;
     if(low<0)return rows[0].t+index*(tf==='1D'?DAY:H4);
     if(low>=rows.length-1)return rows.at(-1).t+(index-rows.length+1)*(tf==='1D'?DAY:H4);
     return rows[low].t+fraction*(rows[low+1].t-rows[low].t);
   };
   target.__liqProjection={W,H,L,T,plotR,plotB,pw,ph,rows,displayMode,total:complete.length,viewOffset:offset,viewCount:n,interval:tf,firstIndex:begin,stride,logSpan:hi-lo,pricePan:pan,future,
     x:xAtTime,time:timeAtX,y,price:priceAtY,money,
     fromEvent(ev){const rect=target.getBoundingClientRect();return {x:(ev.clientX-rect.left)/rect.width*W,y:(ev.clientY-rect.top)/rect.height*H};}
   };
   const element=target.querySelector('svg'),hit=element.querySelector('.rc-hit');
   const strip=target.querySelector('.rc-ohlc-overlay');
   const showOHLC=bar=>{
     if(!bar)return;
     for(const [key,value] of [['open',bar.o],['high',bar.h],['low',bar.l],['close',bar.c]]){
       const field=strip.querySelector(`[data-field="${key}"] .rc-ohlc-value`);
       if(field)field.textContent=money(value);
     }
     strip.classList.toggle('is-rising',bar.c>=bar.o);
     strip.classList.toggle('is-falling',bar.c<bar.o);
     strip.dataset.candleTime=String(bar.t);
   };
   const latestBar=rows.at(-1);
   showOHLC(latestBar);
   const cursor=element.querySelector('.rc-cursor'),selected=element.querySelector('.rc-ha-selection');
   let state=interactions.get(target);
   if(!state){
     state={selectedTimestamp:null,inside:false,pointer:null,axisDrag:null,scale:1};interactions.set(target,state);
     // Delegate to the stable host: refreshes replace SVG children every 10 seconds.
     // Hide only the cursor when the pointer leaves; a pinned HA selection remains.
     const clear=()=>{
       if(state.axisDrag)return;
       state.inside=false;state.pointer=null;
       target.querySelector('.rc-cursor')?.setAttribute('visibility','hidden');
       // Deliberately retain clicked HA selection after pointer leaves the chart.
       state.resetOHLC?.();
     };
     target.addEventListener('pointerleave',clear);
     target.addEventListener('mouseleave',clear);
     // Some browsers do not deliver pointerleave when the SVG is replaced mid-hover.
     // A document-level pointer movement outside the chart must still clear it.
     document.addEventListener('pointermove',ev=>{
       if(!state.inside||state.axisDrag)return;
       const box=target.getBoundingClientRect();
       if(!target.isConnected||ev.clientX<box.left||ev.clientX>box.right||ev.clientY<box.top||ev.clientY>box.bottom)clear();
     },{passive:true});
     // Capture on the stable DIV, not the SVG that is replaced while zooming.
     // A held pointer therefore survives repeated real-time candle redraws.
     target.addEventListener('pointerdown',ev=>{
       if(ev.button!==0||!ev.target.closest?.('.rc-price-axis-hit'))return;
       ev.preventDefault();ev.stopPropagation();
       const now=Date.now(),prior=state.lastAxisPress;
       if(prior&&now-prior.time<420&&Math.abs(prior.x-ev.clientX)<8&&Math.abs(prior.y-ev.clientY)<8){
         state.lastAxisPress=null;
         state.scale=1;state.scaleChange?.(1);state.scaleCommit?.(1);
         return;
       }
       state.lastAxisPress={time:now,x:ev.clientX,y:ev.clientY};
       state.axisDrag={id:ev.pointerId,startY:ev.clientY,initialScale:state.scale};
       state.pointer=null;
       target.classList.add('price-scale-dragging');
       try{target.setPointerCapture(ev.pointerId);}catch(_){/* browser fallback */}
     });
     target.addEventListener('pointermove',ev=>{
       const drag=state.axisDrag;
       if(!drag||ev.pointerId!==drag.id)return;
       ev.preventDefault();ev.stopPropagation();
       // Positive UP distance increases candle spacing; DOWN compresses it.
       const next=clamp(drag.initialScale*Math.exp((drag.startY-ev.clientY)*.008),SCALE_MIN,SCALE_MAX);
       if(Math.abs(next-state.scale)>1e-5){state.scale=next;state.scaleChange?.(next);}
     });
     const finish=ev=>{
       const drag=state.axisDrag;
       if(!drag||ev.pointerId!==drag.id)return;
       ev.preventDefault();ev.stopPropagation();
       if(Math.abs(ev.clientY-drag.startY)>5)state.lastAxisPress=null;
       state.axisDrag=null;target.classList.remove('price-scale-dragging');
       try{if(target.hasPointerCapture(ev.pointerId))target.releasePointerCapture(ev.pointerId);}catch(_){/* no capture */}
       state.scaleCommit?.(state.scale);
       const rect=target.getBoundingClientRect();
       if(ev.clientX<rect.left||ev.clientX>rect.right||ev.clientY<rect.top||ev.clientY>rect.bottom){
         state.inside=false; // No pointer event may clear a pinned HA level.
       }
     };
     target.addEventListener('pointerup',finish);
     target.addEventListener('pointercancel',finish);
     target.addEventListener('lostpointercapture',ev=>{if(state.axisDrag?.id===ev.pointerId)finish(ev);});
     target.addEventListener('dblclick',ev=>{
       const box=target.getBoundingClientRect();
       const inAxis=ev.clientX>=box.left+box.width-(Math.min(146,Math.max(112,Math.round((target.clientWidth||1200)*.31)))/Math.max(320,Math.round(target.clientWidth||1200)))*box.width;
       if(!ev.target.closest?.('.rc-price-axis-hit')&&!inAxis)return;
       ev.preventDefault();ev.stopPropagation();
       state.lastAxisPress=null;
       state.scale=1;state.scaleChange?.(1);state.scaleCommit?.(1);
     });
   }
   // A selection belongs to its WINDOW, not the ephemeral SVG nodes.
   // Restoring from persisted timestamp tolerates a different visible price range.
   if(state.selectedTimestamp!==selectedTimestamp)state.selectedTimestamp=Number.isFinite(Number(selectedTimestamp))&&selectedTimestamp!==null?Number(selectedTimestamp):null;
   state.selectionChange=onSelectionChange;
   state.scale=scale;
   state.scaleChange=onPriceScaleChange;
   state.scaleCommit=onPriceScaleCommit;
   // Refreshes replace SVG nodes; host listeners survive. Each window uses its own
   // target key so selecting another chart does not erase this chart's selection.
   state.resetOHLC=()=>showOHLC(latestBar);
   function paintSelected(){
     const i=rows.findIndex(r=>dayOf(r.t)===dayOf(state.selectedTimestamp)),r=rows[i];
     if(!showHA||i<0||!r?.ha||r.ha.color==='gray'||y(r.ha.price)<T||y(r.ha.price)>plotB){
       selected.setAttribute('visibility','hidden');return;
     }
     const xx=x(i),py=y(r.ha.price);
     selected.setAttribute('visibility','visible');
     selected.classList.toggle('is-ha-yellow',r.ha.color==='yellow');
     selected.classList.toggle('is-ha-purple',r.ha.color==='purple');
     const guide=selected.querySelector('.rc-selected-guide');
     guide.setAttribute('x1',xx);guide.setAttribute('x2',plotR);guide.setAttribute('y1',py);guide.setAttribute('y2',py);
     const dot=selected.querySelector('.rc-selected-dot');dot.setAttribute('cx',xx);dot.setAttribute('cy',py);
     // True HA price is never moved. Only the badge may be kept in the visible chart range.
     const ytag=clamp(py-9,T,plotB-19);
     selected.querySelector('.rc-selected-price-box').setAttribute('y',ytag);
     const label=selected.querySelector('.rc-selected-price');label.setAttribute('y',ytag+13);
     label.textContent=money(r.ha.price);
   }
   // Host pointer capture can retarget the synthetic click to the outer DIV.
   // Explicit selection on pointerup guarantees HA selection survives pan machinery.
   state.selectAt=ev=>{
     if(!showHA)return false;
     const pos=locate(ev);if(!pos||!pos.r?.ha||pos.r.ha.color==='gray')return false;
     if(Math.abs(pos.yy-y(pos.r.ha.price))>12)return false;
     const day=dayOf(pos.r.t);state.selectedTimestamp=day;
     paintSelected();state.selectionChange?.(day);return true;
   };
   function locate(ev){
     const rect=element.getBoundingClientRect();if(!rect.width||!rect.height)return null;
     const xx=(ev.clientX-rect.left)/rect.width*W,yy=(ev.clientY-rect.top)/rect.height*H;
     const i=Math.floor((xx-L)/stride+future);
     if(i<0||i>=rows.length+future+BLANK_CANDLES||yy<T||yy>plotB)return null;
     // Empty future slots have a crosshair price, but no historical OHLC candle.
     const r=rows[i]||null;
     return {i,xx,yy,r,time:r?.t??latestBar.t+(i-rows.length+1)*(tf==='1D'?DAY:H4)};
   }
   function movePointer(ev){
     state.inside=true;
     state.pointer={clientX:ev.clientX,clientY:ev.clientY};
     const pos=locate(ev);
     if(!pos){cursor.setAttribute('visibility','hidden');showOHLC(latestBar);return;}
     const {i,yy,r,time}=pos,xx=x(i),cx=clamp(xx,L+61,plotR-61);
     showOHLC(r||latestBar);
     // Once clicked, keep the HA guide visible while the pointer is anywhere
     // inside this chart. Clicking elsewhere replaces/dismisses the selection.
     cursor.setAttribute('visibility','visible');
     const vLine=cursor.querySelector('.rc-hover-v');vLine.setAttribute('x1',xx);vLine.setAttribute('x2',xx);
     const hLine=cursor.querySelector('.rc-hover-h');hLine.setAttribute('y1',yy);hLine.setAttribute('y2',yy);
     // True cursor Y price (not the nearest candle close or snapped price level).
     const priceAtCursor=priceAtY(yy);
     const hoverPriceY=clamp(yy-9,T,plotB-19);
     cursor.querySelector('.rc-hover-price-box').setAttribute('y',hoverPriceY);
     const hoverPrice=cursor.querySelector('.rc-hover-price');
     hoverPrice.setAttribute('y',hoverPriceY+13);hoverPrice.textContent=money(priceAtCursor);
     cursor.querySelector('.rc-hover-time-box').setAttribute('x',cx-61);
     const timeText=cursor.querySelector('.rc-hover-time');timeText.setAttribute('x',cx);timeText.textContent=clock(time);
   }
   hit.addEventListener('pointermove',movePointer);
   // The axis is part of the chart: traversing to the right-side price badge
   // must NOT dismiss the inspected HA level. Host pointerleave owns clearing.
   hit.addEventListener('pointerleave',()=>cursor.setAttribute('visibility','hidden'));
   hit.addEventListener('click',ev=>{
     const pos=locate(ev);if(!pos)return;
     state.inside=true;
     // Blank clicks never dismiss a pinned HA level.
     state.selectAt?.(ev);
   });
   selected.querySelector('.rc-selected-price-box').addEventListener('click',ev=>{
     ev.preventDefault();ev.stopPropagation();state.selectedTimestamp=null;paintSelected();state.selectionChange?.(null);
   });
   // Restore a crosshair during polling redraw when the pointer has not moved.
   if(state.inside&&state.pointer)movePointer(state.pointer);
   // The clicked HA guide persists across blank clicks, pointer departure and redraw.
   paintSelected();
 }
 function clearSelection(target){const state=interactions.get(target);if(state){state.selectedTimestamp=null;state.selectionChange?.(null);}target?.querySelector('.rc-ha-selection')?.setAttribute('visibility','hidden');}
  // Fast-price path (v2.1.14): reposition ONLY the current-price line,
  // numeric badge, leader and breathing light. Do not rebuild the SVG, HA,
  // Bollinger bands, drawings or the shared price projection on every TRADE.
  function syncLivePrice(target,latest,upper,lower){
    const projection=target?.__liqProjection;
    const svg=target?.querySelector('svg.radar-chart-svg');
    if(!projection||!svg)return false; // chart is still loading; use normal repaint
    const nowNodes={line:svg.querySelector('.rc-level-now'),
      label:svg.querySelector('text.rc-label-now'),
      box:svg.querySelector('rect.rc-label-now'),
      leader:svg.querySelector('path.rc-label-now'),
      halo:svg.querySelector('.rc-now-breathe-halo'),
      core:svg.querySelector('.rc-now-breathe-core')};
    // An initial plot may have been drawn without a valid NOW quote, or with
    // the quote outside the current viewport. Let the next normal repaint
    // create any missing elements rather than destroying user interactions.
    if(Object.values(nowNodes).some(node=>!node))return false;
    const {T,plotB,y,plotR}=projection;
    const active=valid(latest)&&Number.isFinite(y(latest))&&y(latest)>=T&&y(latest)<=plotB;
    const nowPriceY=active?y(latest):NaN;
    for(const node of Object.values(nowNodes))node.style.display=active?'':'none';
    if(!active)return true; // deliberately hide an out-of-scale / stale quote
    const fy=v=>Number(v).toFixed(2);
    nowNodes.line.setAttribute('y1',fy(nowPriceY));
    nowNodes.line.setAttribute('y2',fy(nowPriceY));
    nowNodes.halo.setAttribute('cy',fy(nowPriceY));
    nowNodes.core.setAttribute('cy',fy(nowPriceY));
    nowNodes.label.textContent=money(latest);
    // Reflow the small level badges using the ORIGINAL label-spacing rule,
    // so the fast NOW label cannot obscure a CoinGlass up/down price badge.
    const labels=[];
    for(const [kind,value] of [['up',upper],['down',lower],['now',latest]]){
      const box=kind==='now'?nowNodes.box:svg.querySelector('rect.rc-label-'+kind);
      const text=kind==='now'?nowNodes.label:svg.querySelector('text.rc-label-'+kind);
      const leader=kind==='now'?nowNodes.leader:svg.querySelector('path.rc-label-'+kind);
      if(!box||!text||!leader)continue;
      if(!valid(value)||!Number.isFinite(y(value))||y(value)<T||y(value)>plotB){
        if(kind!=='now')for(const node of [box,text,leader])node.style.display='none';
        continue;
      }
      if(kind!=='now')for(const node of [box,text,leader])node.style.display='';
      labels.push({kind,real:y(value),yy:y(value),box,text,leader});
    }
    labels.sort((a,b)=>a.yy-b.yy);
    for(let i=1;i<labels.length;i++)labels[i].yy=Math.max(labels[i].yy,labels[i-1].yy+22);
    const overshoot=Math.max(0,(labels.at(-1)?.yy??0)-(plotB-10));
    if(overshoot>0)for(const p of labels)p.yy-=overshoot;
    for(const p of labels){
      p.leader.setAttribute('d',`M${plotR},${fy(p.real)} L${plotR+4},${fy(p.yy)}`);
      p.box.setAttribute('y',fy(p.yy-9));
      p.text.setAttribute('y',fy(p.yy+4));
    }
    return true;
  }

 root.LiqRadar4H={render,syncLivePrice,series,projectDaily,dailyHA,bollinger,dayOf,money,clearSelection,
  selectHaAt(target,ev){return Boolean(interactions.get(target)?.selectAt?.(ev));}};
})(window);
