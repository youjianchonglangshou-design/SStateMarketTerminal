/* MultiAssetLiquidityRadar 4H chart v1.2.0.
 * Pure frontend SVG: real 4H OHLC + 4H Bollinger(20,2) + daily Heikin-Ashi CLOSE
 * held across six 4H candles (UTC day 00:00 = Taiwan 08:00).
 * All values come from real candle series. Missing series are never synthesized.
 */
(function(root){'use strict';
 const H4=14400000, DAY=86400000;
 const valid=n=>Number.isFinite(n)&&n>0;
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const clamp=(n,l,h)=>Math.max(l,Math.min(h,n));
 const money=n=>{if(!valid(n))return '—';const a=Math.abs(n),dp=a>=100?2:a>=1?4:a>=.01?6:a>=.0001?8:Math.min(13,Math.ceil(-Math.log10(a))+4);return '$'+n.toLocaleString('en-US',{maximumFractionDigits:dp,minimumFractionDigits:a>=100?2:0});};
 const clock=t=>new Date(t).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
 const dayText=t=>new Date(t).toLocaleDateString('zh-TW',{timeZone:'Asia/Taipei',month:'2-digit',day:'2-digit'});
 const dayOf=t=>Math.floor(t/DAY)*DAY;
 function dailyHA(days){
   const result=new Map();let po=null,pc=null;
   for(const d of [...days].sort((a,b)=>a.t-b.t)){
     if(![d.o,d.h,d.l,d.c].every(valid))continue;
     const o=po===null?(d.o+d.c)/2:(po+pc)/2,c=(d.o+d.h+d.l+d.c)/4;
     result.set(dayOf(d.t),{price:c,color:c>=o?'yellow':'purple',date:dayOf(d.t)});po=o;pc=c;
   }return result;
 }
 function bollinger(bars){
   const result=bars.map(()=>null);
   for(let i=19;i<bars.length;i++){
     const cs=bars.slice(i-19,i+1).map(b=>b.c);if(!cs.every(valid))continue;
     const mid=cs.reduce((a,b)=>a+b,0)/20,sd=Math.sqrt(cs.reduce((s,x)=>s+(x-mid)**2,0)/20);
     result[i]={mid,upper:mid+2*sd,lower:mid-2*sd};
   }return result;
 }
 function series(bars,daily,now,nowTime){
   // Never overwrite completed candles. The live close may modify only the still-forming 4H candle.
   const source=[...bars].filter(b=>[b.t,b.o,b.h,b.l,b.c].every(Number.isFinite)&&b.o>0&&b.c>0&&b.h>=b.l).sort((a,b)=>a.t-b.t);
   const dedup=new Map(source.map(b=>[b.t,{...b}]));const all=[...dedup.values()].sort((a,b)=>a.t-b.t);
   const liveStart=Math.floor(nowTime/H4)*H4;
   if(valid(now)){
     const last=all.at(-1);
     if(last?.t===liveStart){last.c=now;last.h=Math.max(last.h,now);last.l=Math.min(last.l,now);}
     // If the exchange has not sent this candle, wait for a real 4H opening OHLC.
   }
   const ha=dailyHA(daily),bb=bollinger(all);
   return all.map((b,i)=>({...b,bb:bb[i],ha:ha.get(dayOf(b.t))||null}));
 }
 function render(target,{bars=[],daily=[],price=null,upper=null,lower=null,source='',updatedAt=Date.now()}={}){
   if(!target)return;
   if(bars.length<21){target.innerHTML='<div class="radar-chart-wait">等待真正的 4H K 線資料（至少 21 根）…</div>';return;}
   const rows=series(bars,daily,price,updatedAt).slice(-84);
   if(rows.length<21){target.innerHTML='<div class="radar-chart-wait">4H K 線歷史不足</div>';return;}
   const W=1200,H=370,L=16,R=126,T=20,B=35,plotR=W-R,plotB=H-B,pw=plotR-L,ph=plotB-T;
   const vals=[];for(const r of rows){vals.push(r.h,r.l);if(r.bb)vals.push(r.bb.upper,r.bb.lower);if(r.ha)vals.push(r.ha.price);}
   if(valid(price))vals.push(price);if(valid(upper))vals.push(upper);if(valid(lower))vals.push(lower);
   let min=Math.min(...vals),max=Math.max(...vals),span=Math.max(max-min,min*.005);
   min-=span*.085;max+=span*.085;
   const x=i=>L+(i+.5)*pw/rows.length,y=n=>T+(max-n)/(max-min)*ph;
   const fmt=n=>Number.isFinite(n)?n.toFixed(2):'0';
   const svg=[];
   svg.push(`<svg class="radar-chart-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="4H 實際 K 線、布林帶、中軌、日線平均 K 階梯、CoinGlass 上下界與 NOW 現價">`);
   // Price axis is strictly on the RIGHT, time on the bottom.
   for(let i=0;i<=5;i++){
     const v=min+(max-min)*i/5,yy=y(v);
     svg.push(`<line class="rc-grid-h" x1="${L}" x2="${plotR}" y1="${fmt(yy)}" y2="${fmt(yy)}"/><text class="rc-axis-text" x="${plotR+7}" y="${fmt(yy+4)}">${esc(money(v))}</text>`);
   }
   // Every UTC 00:00 (Taiwan 08:00) is a day boundary; six 4H bars per day.
   rows.forEach((r,i)=>{
     if(i!==0&&dayOf(r.t)!==dayOf(rows[i-1].t)){
       svg.push(`<line class="rc-grid-v" x1="${fmt(x(i)-pw/rows.length/2)}" x2="${fmt(x(i)-pw/rows.length/2)}" y1="${T}" y2="${plotB}"/>`);
       svg.push(`<text class="rc-time-text" x="${fmt(x(i))}" y="${H-10}" text-anchor="middle">${esc(dayText(r.t))} 08:00</text>`);
     }
   });
   svg.push(`<g class="rc-boll">`);
   for(const [key,cls] of [['upper','rc-bb'],['mid','rc-middle'],['lower','rc-bb']]){
     let d='';rows.forEach((r,i)=>{if(!r.bb)return;d+=(d?' L':'M')+fmt(x(i))+','+fmt(y(r.bb[key]));});
     if(d)svg.push(`<path class="${cls}" d="${d}"/>`);
   }
   svg.push('</g>');
   // Real OHLC candles, distinct from daily HA stair lines (not HA candles).
   const w=clamp(pw/rows.length*.62,3.2,10.5);
   rows.forEach((r,i)=>{
     const xx=x(i),bull=r.c>=r.o,c=bull?'rc-up':'rc-down';
     svg.push(`<line class="rc-wick ${c}" x1="${fmt(xx)}" x2="${fmt(xx)}" y1="${fmt(y(r.h))}" y2="${fmt(y(r.l))}"/>`);
     svg.push(`<rect class="rc-candle ${c}" x="${fmt(xx-w/2)}" y="${fmt(y(Math.max(r.o,r.c)))}" width="${fmt(w)}" height="${fmt(Math.max(1.4,Math.abs(y(r.o)-y(r.c))))}"/>`);
   });
   // One daily HA close level across its six 4H bars. Do not connect missing days.
   let prev=null;
   rows.forEach((r,i)=>{
     const h=r.ha;if(!h){prev=null;return;}
     const start=x(i)-pw/rows.length/2,end=x(i)+pw/rows.length/2;
     const stroke=h.color==='yellow'?'rc-ha-yellow':'rc-ha-purple';
     svg.push(`<line class="rc-ha-step ${stroke}" x1="${fmt(start)}" x2="${fmt(end)}" y1="${fmt(y(h.price))}" y2="${fmt(y(h.price))}"/>`);
     if(prev&&prev.date!==h.date){svg.push(`<line class="rc-ha-step ${stroke}" x1="${fmt(start)}" x2="${fmt(start)}" y1="${fmt(y(prev.price))}" y2="${fmt(y(h.price))}"/>`);}
     prev=h;
   });
   // Liquidation boundaries and NOW remain at the true price coordinate.
   const labels=[];
   const levelSource=source.includes('CoinGlass')?'CG 7D':'15M代理';
   for(const [kind,value,label] of [['up',upper,levelSource+' 上'],['down',lower,levelSource+' 下'],['now',price,'NOW']]){
     if(!valid(value))continue;
     const yy=y(value);svg.push(`<line class="rc-level rc-level-${kind}" x1="${L}" x2="${plotR}" y1="${fmt(yy)}" y2="${fmt(yy)}"/>`);
     labels.push({kind,real:yy,yy,text:label+' '+money(value)});
   }
   // Separate text labels if their levels nearly coincide (do NOT shift the underlying lines).
   const sorted=labels.slice().sort((a,b)=>a.yy-b.yy);
   for(let i=1;i<sorted.length;i++)sorted[i].yy=Math.max(sorted[i].yy,sorted[i-1].yy+22);
   const overshoot=sorted.at(-1)?.yy-(plotB-10)||0;
   if(overshoot>0)sorted.forEach(v=>v.yy-=overshoot);
   for(const lab of sorted){
     svg.push(`<path class="rc-label-leader rc-label-${lab.kind}" d="M${plotR},${fmt(lab.real)} L${plotR+4},${fmt(lab.yy)}"/>`);
     svg.push(`<rect class="rc-label-box rc-label-${lab.kind}" x="${plotR+3}" y="${fmt(lab.yy-9)}" width="${R-7}" height="19" rx="4"/>`);
     svg.push(`<text class="rc-label-text rc-label-${lab.kind}" x="${plotR+9}" y="${fmt(lab.yy+4)}">${esc(lab.text)}</text>`);
   }
   svg.push(`<g class="rc-hover" visibility="hidden"><line class="rc-hover-v" x1="0" x2="0" y1="${T}" y2="${plotB}"/><line class="rc-hover-h" x1="${L}" x2="${plotR}" y1="0" y2="0"/><rect class="rc-hover-price-box" x="${plotR+3}" y="0" width="${R-7}" height="19" rx="3"/><text class="rc-hover-price" x="${plotR+9}" y="0">—</text><rect class="rc-hover-time-box" x="0" y="${plotB+2}" width="122" height="19" rx="3"/><text class="rc-hover-time" x="0" y="${plotB+16}" text-anchor="middle">—</text><circle class="rc-hover-dot" cx="0" cy="0" r="5"/></g>`);
   svg.push(`<rect class="rc-hit" x="${L}" y="${T}" width="${pw}" height="${ph}" fill="transparent"/></svg>`);
   target.innerHTML=svg.join('');
   target.dataset.feed=source;
   const element=target.querySelector('svg'),hit=element.querySelector('.rc-hit'),g=element.querySelector('.rc-hover');
   hit.addEventListener('pointermove',ev=>{
     const rect=element.getBoundingClientRect();if(!rect.width||!rect.height)return;
     const xx=(ev.clientX-rect.left)/rect.width*W,yy=(ev.clientY-rect.top)/rect.height*H;
     const i=clamp(Math.floor((xx-L)/pw*rows.length),0,rows.length-1),r=rows[i];
     const a=r.ha,near=a&&Math.abs(yy-y(a.price))<13;
     const actual=near?a.price:min+(max-min)*(plotB-yy)/ph,py=near?y(a.price):yy;
     const vx=x(i),cx=clamp(vx,L+55,plotR-55);
     g.setAttribute('visibility','visible');
     const vLine=g.querySelector('.rc-hover-v');vLine.setAttribute('x1',vx);vLine.setAttribute('x2',vx);
     const hLine=g.querySelector('.rc-hover-h');hLine.setAttribute('x1',near?vx:L);hLine.setAttribute('y1',py);hLine.setAttribute('y2',py);
     const tag=g.querySelector('.rc-hover-price-box');tag.setAttribute('y',clamp(py-9,T,plotB-19));
     const priceTag=g.querySelector('.rc-hover-price');priceTag.setAttribute('y',clamp(py+4,T+13,plotB-6));priceTag.textContent=(near?'HA ':'')+money(actual);
     g.querySelector('.rc-hover-time-box').setAttribute('x',cx-61);
     const time=g.querySelector('.rc-hover-time');time.setAttribute('x',cx);time.textContent=clock(r.t)+(near?' 平均K':'');
     const dot=g.querySelector('.rc-hover-dot');dot.setAttribute('cx',vx);dot.setAttribute('cy',py);dot.setAttribute('visibility',near?'visible':'hidden');
     g.classList.toggle('is-ha',!!near);
   });
   hit.addEventListener('pointerleave',()=>g.setAttribute('visibility','hidden'));
 }
 root.LiqRadar4H={render,series,dailyHA,bollinger,dayOf,money};
})(window);
