/* SStateMarketTerminal — RR structural-shoulder correction v2.1.1.
 * Inputs are the SAME projected daily HA candles as the list and chart.
 * The historical shoulder is selected by the preceding stair structure,
 * never by blindly searching for today's yellow/purple HA color.
 * Pure/deterministic: no fetch, timers, state, or stored signal history.
 */
(function(root){'use strict';
 const DAY=86400000;
 const positive=x=>typeof x==='number'&&Number.isFinite(x)&&x>0;
 const haColor=c=>c==='黃'||c==='紫';
 function cmp(a,b){
   if(!Number.isFinite(a)||!Number.isFinite(b))return NaN;
   const eps=16*Number.EPSILON*Math.max(Math.abs(a),Math.abs(b));
   return Math.abs(a-b)<=eps?0:a>b?1:-1;
 }
 function validHistory(ha){
   const rows=ha?.history;
   if(!Array.isArray(rows)||rows.length<3)return false;
   // Reject discontinuous / duplicated daily history: index-based backtracking
   // otherwise silently points to the wrong date after a source failover.
   for(let i=0;i<rows.length;i++){
     const r=rows[i];if(!r||!positive(r.hc)||!haColor(r.color)||!Number.isFinite(r.t))return false;
     if(i&&r.t-rows[i-1].t!==DAY)return false;
   }
   return true;
 }
 function classify(ha){
   if(!validHistory(ha))return null;
   const rows=ha.history,c=rows.at(-1),p=rows.at(-2);
   const delta=cmp(c.hc,p.hc);
   if(c.color==='紫'&&p.color==='紫')return delta<0?1:delta>0?2:null;
   if(c.color==='黃'&&p.color==='黃')return delta<0?4:delta>0?5:null;
   if(p.color==='黃'&&c.color==='紫'&&delta<0)return 3;
   if(p.color==='紫'&&c.color==='黃'&&delta>0)return 6;
   return null;
 }
 function result(rows,index,current,method,leg){
   const r=rows[index];return {price:r.hc,dayKey:r.t,color:r.color,
     daysBack:Math.round((current.t-r.t)/DAY),method,leg};
 }
 // ②/④: exact user-defined dynamic HA stair search. Start at the day before
 // yesterday and continue left through already-closed daily candles.
 function scanBeyondToday(rows,kind){
   const c=rows.at(-1),sign=kind===2?1:-1;
   for(let i=rows.length-3;i>=0;i--){
     if(cmp(rows[i].hc,c.hc)===sign){
       return result(rows,i,c,kind===2?'nearest_higher_stair':'nearest_lower_stair','backtrack');
     }
   }
   return null;
 }
 // ③/⑥: choose the left shoulder of the most recent opposite-price leg.
 // Operates solely on HA_Close stair GEOMETRY — no historical color filter.
 // ⑥ searches the latest trough and its earlier falling leg.
 // ③ mirrors this via the latest peak and its earlier rising leg.
 // With a multi-step fall (or rise), anchor the FIRST step after the earlier
 // high (low) plateau; do not substitute a much older, higher yellow (purple)
 // peak. Example: INTCX 10/21 high 93.1825, 10/22 first falling stair
 // 88.0725, 10/23 trough, and a rebound into 10/26 => 10/22 is the shoulder.
 // A one-step V / inverted-V uses the earlier plateau as the left shoulder.
 function swingShoulder(rows,kind){
   const current=rows.at(-1),closed=rows.slice(0,-1),n=closed.length;
   const sign=kind===6?-1:1; // direction of leg before the turning point
   // Search the latest confirmed change of HA staircase slope, excluding the
   // forming daily candle. A pivot at the last closed bar is allowed.
   let pivot=-1;
   for(let j=n-1;j>=1;j--){
     const prior=cmp(closed[j].hc,closed[j-1].hc);
     if(prior!==sign)continue;
     if(j===n-1){pivot=j;break;} // extremum immediately before current turn
     // At j, subsequent step must be opposite (flat steps can intervene).
     let k=j+1;while(k<n&&cmp(closed[k].hc,closed[k-1].hc)===0)k++;
     if(k<n && cmp(closed[k].hc,closed[k-1].hc)===-sign){pivot=j;break;}
   }
   if(pivot<1)return null;
   let start=pivot;
   while(start>0){
     const step=cmp(closed[start].hc,closed[start-1].hc);
     if(step===sign){start--;continue;}
     if(step===0){start--;continue;}
     break;
   }
   // Multi-step legs: anchor at the first occurrence of the DOMINANT
   // downward/upward step of this swing. This locates the meaningful first
   // breakdown staircase rather than an older shallow price drift preceding it.
   // Example 94 -> 93.1825 -> 88.0725 -> 85.8: 10/22 (88.0725), NOT
   // the preceding 10/21 93.1825. With a single step, keep its left plateau.
   const steps=pivot-start;
   if(steps<=0)return null;
   let chosen=start;
   if(steps>=2){
     let magnitude=-Infinity;
     for(let j=start+1;j<=pivot;j++){
       const movement=Math.abs(closed[j].hc-closed[j-1].hc);
       if(movement>magnitude){magnitude=movement;chosen=j;}
     }
   }
   if(chosen<0||chosen>=n)return null;
   return result(rows,chosen,current,kind===6?'dominant_falling_stair':'dominant_rising_stair',
     {pivotDayKey:closed[pivot].t,pivotPrice:closed[pivot].hc,steps});
 }
 function shoulderFor(ha,kind){
   if(!validHistory(ha)||![2,3,4,6].includes(kind))return null;
   return kind===2||kind===4?scanBeyondToday(ha.history,kind):swingShoulder(ha.history,kind);
 }
 function chooseStage(ha,p){
   const kind=classify(ha);
   if(!kind)return null;
   if(!positive(p))return {kind,stage:null,direction:'none',group:null,shoulder:null,reason:'invalid_price'};
   const sh=[2,3,4,6].includes(kind)?shoulderFor(ha,kind):null;
   if([2,3,4,6].includes(kind)&&!sh){
     return {kind,stage:null,direction:'none',group:null,shoulder:null,reason:'missing_structural_shoulder'};
   }
   let stage,direction,group;
   switch(kind){
     case 1:stage='①';direction='short';group='continuation';break;
     case 2:direction=p>sh.price?'long':'short';stage=direction==='long'?'②-B':'②-A';group=direction==='long'?'reversal':'continuation';break;
     case 3:direction=p<sh.price?'short':'long';stage=direction==='short'?'③-A':'③-B';group=direction==='short'?'continuation':'reversal';break;
     case 4:direction=p<sh.price?'short':'long';stage=direction==='short'?'④-B':'④-A';group=direction==='short'?'reversal':'continuation';break;
     case 5:stage='⑤';direction='long';group='continuation';break;
     case 6:direction=p>sh.price?'long':'short';stage=direction==='long'?'⑥-A':'⑥-B';group=direction==='long'?'continuation':'reversal';break;
   }
   return {kind,stage,direction,group,shoulder:sh,reason:null};
 }
 function evaluate(snapshot){
   if(!snapshot)return null;
   const {price:p,upper:u,lower:l,source,updatedAt,ha}=snapshot;
   if(![p,u,l].every(positive)||!(l<p&&p<u))return null;
   const cfg=root.LIQ_RR_CONFIG?.getThresholds?.()||{continuation:1.5,reversal:1.7};
   if(![cfg.continuation,cfg.reversal].every(x=>Number.isFinite(x)&&x>=1))return null;
   const current=ha?.history?.at(-1);
   if(!current||current.t!==snapshot.dayKey||current.t!==snapshot.haDayKey)return null;
   const picked=chooseStage(ha,p);
   if(!picked)return null;
   const longRR=(u-p)/(p-l),shortRR=(p-l)/(u-p);
   if(![longRR,shortRR].every(Number.isFinite))return null;
   const threshold=picked.group?cfg[picked.group]:null;
   const ratio=picked.direction==='long'?longRR:picked.direction==='short'?shortRR:null;
   const meets=ratio!==null&&threshold!==null&&(ratio>=threshold||threshold-ratio<=16*Number.EPSILON*Math.max(1,threshold));
   return {direction:meets?picked.direction:'none',candidateDirection:picked.direction,
     kind:picked.kind,stage:picked.stage,group:picked.group,shoulder:picked.shoulder,reason:picked.reason,
     longRR,shortRR,threshold,thresholds:cfg,haColor:current.color,
     price:p,upper:u,lower:l,source,updatedAt};
 }
 root.LIQ_RR_SCANNER=Object.freeze({evaluate,classify,shoulderFor,chooseStage,validHistory});
})(window);
