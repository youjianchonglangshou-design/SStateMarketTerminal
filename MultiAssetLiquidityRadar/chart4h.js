/* MultiAssetLiquidityRadar v1.2.3
 * ONLY the actual OHLC candlesticks are 4H. BB(20,2), HA stair levels,
 * S-state/midline regime and CCI-SMA are 1D (UTC 00:00 = Asia/Taipei 08:00).
 * BB algorithm is shared with the original SState monitor-engine.js.
 */
(function(root){'use strict';
 const H4=14400000,DAY=86400000,BLANK_CANDLES=3;
 // Selection follows the clicked daily HA stair only while the pointer stays near that stair; never persists on hover-away.
 const interactions=new WeakMap();
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
 function series(bars,daily,now,nowTime){
   const all=normalized(bars);
   const liveStart=Math.floor(nowTime/H4)*H4;
   if(valid(now)){
     // Only update an unfinished 4H bar, not any completed historical candle.
     const last=all.at(-1);
     if(last?.t===liveStart){last.c=now;last.h=Math.max(last.h,now);last.l=Math.min(last.l,now);}
   }
   const days=normalized(daily),ha=dailyHA(days),bb=bollinger(days),bbByDay=new Map();
   days.forEach((d,i)=>{const band=bb[i];if(Number.isFinite(band?.mid))bbByDay.set(dayOf(d.t),band);});
   return all.map(b=>({...b,bb:bbByDay.get(dayOf(b.t))||null,ha:ha.get(dayOf(b.t))||null}));
 }
 function render(target,{bars=[],daily=[],price=null,upper=null,lower=null,updatedAt=Date.now()}={}){
   if(!target)return;
   if(bars.length<21){target.innerHTML='<div class="radar-chart-wait">等待真正的 4H K 線資料…</div>';return;}
   const rows=series(bars,daily,price,updatedAt).slice(-84);
   if(rows.length<21){target.innerHTML='<div class="radar-chart-wait">4H K 線歷史不足</div>';return;}
   const W=1200,H=370,L=16,R=146,T=20,B=35,plotR=W-R,plotB=H-B,pw=plotR-L,ph=plotB-T;
   const stride=pw/(rows.length+BLANK_CANDLES),x=i=>L+(i+.5)*stride;
   const vals=[];
   for(const r of rows){vals.push(r.h,r.l);if(r.bb)vals.push(r.bb.upper,r.bb.lower);if(r.ha)vals.push(r.ha.price);}
   for(const v of [price,upper,lower])if(valid(v))vals.push(v);
   let min=Math.min(...vals),max=Math.max(...vals),span=Math.max(max-min,min*.005);
   min-=span*.085;max+=span*.085;
   const y=n=>T+(max-n)/(max-min)*ph;
   const fmt=n=>Number.isFinite(n)?n.toFixed(2):'0';
   const svg=[];
   svg.push(`<svg class="radar-chart-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="4H 真實 K 線，日線布林帶(20,2)、日線平均 K 階梯，清算上下界及 NOW 價格">`);
   // Price labels are exclusively on the right side; no currency symbol.
   for(let i=0;i<=5;i++){
     const v=min+(max-min)*i/5,yy=y(v);
     svg.push(`<line class="rc-grid-h" x1="${L}" x2="${plotR}" y1="${fmt(yy)}" y2="${fmt(yy)}"/><text class="rc-axis-text" x="${plotR+7}" y="${fmt(yy+4)}">${esc(money(v))}</text>`);
   }
   // Taiwan trading day begins 08:00, only show dates to prevent axis clutter.
   rows.forEach((r,i)=>{
     if(i!==0&&dayOf(r.t)!==dayOf(rows[i-1].t)){
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
   svg.push('<g class="rc-boll">');
   for(const [key,cls] of [['upper','rc-bb'],['mid','rc-middle'],['lower','rc-bb']]){
     let d='',active=false,prevDate=null;
     for(const day of daysShown){
       if(!day.bb||!valid(day.bb[key])){active=false;continue;}
       const xx=(x(day.first)+x(day.last))/2;
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
   rows.forEach((r,i)=>{
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
   rows.forEach((r,i)=>{
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
     svg.push(`<line class="rc-level rc-level-${kind}" x1="${L}" x2="${plotR}" y1="${fmt(yy)}" y2="${fmt(yy)}"/>`);
     labels.push({kind,real:yy,yy,text:(kind==='now'?'NOW ':'')+money(value)});
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
   // Moving only shows the time crosshair. HA extension is an explicit click action.
   svg.push(`<g class="rc-cursor" visibility="hidden" pointer-events="none"><line class="rc-hover-v" x1="0" x2="0" y1="${T}" y2="${plotB}"/><line class="rc-hover-h" x1="${L}" x2="${plotR}" y1="0" y2="0"/><rect class="rc-hover-time-box" x="0" y="${plotB+2}" width="122" height="19" rx="3"/><text class="rc-hover-time" x="0" y="${plotB+16}" text-anchor="middle">—</text></g>`);
   svg.push(`<g class="rc-ha-selection" visibility="hidden" pointer-events="none"><line class="rc-selected-guide" x1="0" x2="${plotR}" y1="0" y2="0"/><circle class="rc-selected-dot" cx="0" cy="0" r="4"/><rect class="rc-selected-price-box" x="${plotR+3}" y="0" width="${R-7}" height="19" rx="3"/><text class="rc-selected-price" x="${plotR+9}" y="0">—</text></g>`);
   svg.push(`<rect class="rc-hit" x="${L}" y="${T}" width="${pw}" height="${ph}" fill="transparent"/></svg>`);
   target.innerHTML=svg.join('');
   target.dataset.candles='4H';target.dataset.indicators='1D';target.dataset.trailingSlots=String(BLANK_CANDLES);
   const element=target.querySelector('svg'),hit=element.querySelector('.rc-hit');
   const cursor=element.querySelector('.rc-cursor'),selected=element.querySelector('.rc-ha-selection');
   let state=interactions.get(target);
   if(!state){
     state={selectedTimestamp:null,inside:false};interactions.set(target,state);
     // Delegate to the stable host: refreshes replace SVG children every 10 seconds.
     // Hide immediately on leaving the plotting area, including the price-axis region.
     const clear=()=>{
       state.inside=false;state.selectedTimestamp=null;
       target.querySelector('.rc-cursor')?.setAttribute('visibility','hidden');
       target.querySelector('.rc-ha-selection')?.setAttribute('visibility','hidden');
     };
     target.addEventListener('pointerleave',clear);
     target.addEventListener('mouseleave',clear);
     // Some browsers do not deliver pointerleave when the SVG is replaced mid-hover.
     // A document-level pointer movement outside the chart must still clear it.
     document.addEventListener('pointermove',ev=>{
       if(state.selectedTimestamp!==null&&(!target.isConnected||!target.contains(ev.target)))clear();
     },{passive:true});
   }
   function paintSelected(){
     const i=rows.findIndex(r=>r.t===state.selectedTimestamp),r=rows[i];
     if(!state.inside||i<0||!r?.ha||r.ha.color==='gray'){
       selected.setAttribute('visibility','hidden');return;
     }
     const xx=x(i),py=y(r.ha.price);
     selected.setAttribute('visibility','visible');
     selected.classList.toggle('is-ha-yellow',r.ha.color==='yellow');
     selected.classList.toggle('is-ha-purple',r.ha.color==='purple');
     const guide=selected.querySelector('.rc-selected-guide');
     guide.setAttribute('x1',xx);guide.setAttribute('y1',py);guide.setAttribute('y2',py);
     const dot=selected.querySelector('.rc-selected-dot');dot.setAttribute('cx',xx);dot.setAttribute('cy',py);
     // Actual line always uses the true HA price; only the tag may need visual offset.
     const ytag=clamp(py-9,T,plotB-19);
     selected.querySelector('.rc-selected-price-box').setAttribute('y',ytag);
     const label=selected.querySelector('.rc-selected-price');label.setAttribute('y',ytag+13);
     label.textContent=money(r.ha.price);
   }
   function locate(ev){
     const rect=element.getBoundingClientRect();if(!rect.width||!rect.height)return null;
     const xx=(ev.clientX-rect.left)/rect.width*W,yy=(ev.clientY-rect.top)/rect.height*H;
     const i=Math.floor((xx-L)/stride);
     // Last three blank slots cannot select the latest real candle.
     if(i<0||i>=rows.length)return null;
     return {i,xx,yy,r:rows[i]};
   }
   hit.addEventListener('pointermove',ev=>{
     state.inside=true;
     const pos=locate(ev);
     if(!pos){cursor.setAttribute('visibility','hidden');state.selectedTimestamp=null;selected.setAttribute('visibility','hidden');return;}
     const {i,yy,r}=pos,xx=x(i),cx=clamp(xx,L+61,plotR-61);
     // Click-to-inspect, NOT click-to-lock: leaving the clicked 1D HA stair
     // (in price OR in date) immediately dismisses its extension and badge.
     if(state.selectedTimestamp!==null){
       const picked=rows.find(q=>q.t===state.selectedTimestamp);
       if(!picked?.ha||!r.ha||dayOf(r.t)!==dayOf(picked.t)||Math.abs(yy-y(picked.ha.price))>14){
         state.selectedTimestamp=null;selected.setAttribute('visibility','hidden');
       }
     }
     cursor.setAttribute('visibility','visible');
     const vLine=cursor.querySelector('.rc-hover-v');vLine.setAttribute('x1',xx);vLine.setAttribute('x2',xx);
     const hLine=cursor.querySelector('.rc-hover-h');hLine.setAttribute('y1',yy);hLine.setAttribute('y2',yy);
     cursor.querySelector('.rc-hover-time-box').setAttribute('x',cx-61);
     const time=cursor.querySelector('.rc-hover-time');time.setAttribute('x',cx);time.textContent=clock(r.t);
   });
   hit.addEventListener('pointerleave',()=>{
     state.inside=false;state.selectedTimestamp=null;
     cursor.setAttribute('visibility','hidden');selected.setAttribute('visibility','hidden');
   });
   hit.addEventListener('mouseleave',()=>{
     state.inside=false;state.selectedTimestamp=null;
     cursor.setAttribute('visibility','hidden');selected.setAttribute('visibility','hidden');
   });
   hit.addEventListener('click',ev=>{
     const pos=locate(ev);if(!pos)return;
     state.inside=true;
     const {r,yy}=pos,h=r.ha;
     // Clicking close to an actual daily HA horizontal stair segment selects it.
     // Clicking elsewhere cancels; moving alone NEVER shows an HA price label.
     state.selectedTimestamp=h&&h.color!=='gray'&&Math.abs(yy-y(h.price))<=12?r.t:null;
     paintSelected();
   });
   // A pending click-selected HA price survives live redraw while pointer is inside.
   paintSelected();
 }
 root.LiqRadar4H={render,series,dailyHA,bollinger,dayOf,money};
})(window);
