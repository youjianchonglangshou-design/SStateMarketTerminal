/* MultiAssetLiquidityRadar v1.2.1
 * ONLY the actual OHLC candlesticks are 4H. BB(20,2), HA stair levels,
 * S-state/midline regime and CCI-SMA are 1D (UTC 00:00 = Asia/Taipei 08:00).
 * BB algorithm is shared with the original SState monitor-engine.js.
 */
(function(root){'use strict';
 const H4=14400000,DAY=86400000,BLANK_CANDLES=3;
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
   // Actual 4H candles: quieter than daily HA steps and liquidation levels.
   const w=clamp(stride*.60,3.2,10);
   rows.forEach((r,i)=>{
     const xx=x(i),c=r.c>=r.o?'rc-up':'rc-down';
     svg.push(`<line class="rc-wick ${c}" x1="${fmt(xx)}" x2="${fmt(xx)}" y1="${fmt(y(r.h))}" y2="${fmt(y(r.l))}"/>`);
     svg.push(`<rect class="rc-candle ${c}" x="${fmt(xx-w/2)}" y="${fmt(y(Math.max(r.o,r.c)))}" width="${fmt(w)}" height="${fmt(Math.max(1.4,Math.abs(y(r.o)-y(r.c))))}"/>`);
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
   svg.push(`<g class="rc-hover" visibility="hidden" pointer-events="none"><line class="rc-hover-v" x1="0" x2="0" y1="${T}" y2="${plotB}"/><line class="rc-hover-h" x1="${L}" x2="${plotR}" y1="0" y2="0"/><rect class="rc-hover-price-box" x="${plotR+3}" y="0" width="${R-7}" height="19" rx="3"/><text class="rc-hover-price" x="${plotR+9}" y="0">—</text><rect class="rc-hover-time-box" x="0" y="${plotB+2}" width="122" height="19" rx="3"/><text class="rc-hover-time" x="0" y="${plotB+16}" text-anchor="middle">—</text><circle class="rc-hover-dot" cx="0" cy="0" r="5"/></g>`);
   svg.push(`<rect class="rc-hit" x="${L}" y="${T}" width="${pw}" height="${ph}" fill="transparent"/></svg>`);
   target.innerHTML=svg.join('');
   target.dataset.candles='4H';target.dataset.indicators='1D';target.dataset.trailingSlots=String(BLANK_CANDLES);
   const element=target.querySelector('svg'),hit=element.querySelector('.rc-hit'),g=element.querySelector('.rc-hover');
   hit.addEventListener('pointermove',ev=>{
     const rect=element.getBoundingClientRect();if(!rect.width||!rect.height)return;
     const xx=(ev.clientX-rect.left)/rect.width*W,yy=(ev.clientY-rect.top)/rect.height*H;
     const i=clamp(Math.floor((xx-L)/stride),0,rows.length-1),r=rows[i];
     const h=r.ha,near=h&&h.color!=='gray'&&Math.abs(yy-y(h.price))<13;
     const actual=near?h.price:min+(max-min)*(plotB-yy)/ph,py=near?y(h.price):yy;
     const vx=x(i),cx=clamp(vx,L+61,plotR-61);
     g.setAttribute('visibility','visible');
     const vLine=g.querySelector('.rc-hover-v');vLine.setAttribute('x1',vx);vLine.setAttribute('x2',vx);
     const hLine=g.querySelector('.rc-hover-h');hLine.setAttribute('x1',near?vx:L);hLine.setAttribute('y1',py);hLine.setAttribute('y2',py);
     const ytag=clamp(py-9,T,plotB-19),tag=g.querySelector('.rc-hover-price-box');tag.setAttribute('y',ytag);
     const priceTag=g.querySelector('.rc-hover-price');priceTag.setAttribute('y',ytag+13);priceTag.textContent=(near?'HA ':'')+money(actual);
     g.querySelector('.rc-hover-time-box').setAttribute('x',cx-61);
     const time=g.querySelector('.rc-hover-time');time.setAttribute('x',cx);time.textContent=clock(r.t)+(near?' 平均K':'');
     const dot=g.querySelector('.rc-hover-dot');dot.setAttribute('cx',vx);dot.setAttribute('cy',py);dot.setAttribute('visibility',near?'visible':'hidden');
     g.classList.toggle('is-ha-yellow',Boolean(near&&h.color==='yellow'));
     g.classList.toggle('is-ha-purple',Boolean(near&&h.color==='purple'));
   });
   hit.addEventListener('pointerleave',()=>g.setAttribute('visibility','hidden'));
 }
 root.LiqRadar4H={render,series,dailyHA,bollinger,dayOf,money};
})(window);
