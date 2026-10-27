/* SStateMarketTerminal — RR geometric pivot-shoulder correction v2.1.3 (spec v2.4).
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
 // Spec v2.4: A shoulder is the DAILY HA CLOSE of the bar immediately
 // BEFORE the most recent confirmed relative trough or peak.
 // ② and ⑥: valley = falling staircase followed by a rising staircase.
 // ③ and ④: peak   = rising staircase followed by a falling staircase.
 // Colors classify one of six states; they NEVER constrain shoulder history.
 // The forming today bar is allowed as confirmation (real-time reversibility),
 // but cannot itself be a confirmed pivot until a later day reverses.
 // Do not search for a higher/lower past stair or use the largest move.
 // Flat plateaus: use their LAST bar as the pivot; the shoulder is literally
 // that bar's previous daily close, even if the two closes are equal.
 function geometricShoulder(rows,kind){
   if(rows.length<3)return null;
   const valley=kind===2||kind===6;
   const rise=valley?1:-1;
   const fall=-rise;
   const current=rows.at(-1);
   // Never choose today's bar as pivot: it has no right-hand confirmation yet.
   for(let i=rows.length-2;i>=1;i--){
     // Today's changing HA is permitted as the RIGHT-HAND confirmation.
     if(cmp(rows[i+1].hc,rows[i].hc)!==rise)continue;
     let plateauStart=i;
     while(plateauStart>0&&cmp(rows[plateauStart].hc,rows[plateauStart-1].hc)===0){
       plateauStart--;
     }
     if(plateauStart<1||cmp(rows[plateauStart].hc,rows[plateauStart-1].hc)!==fall){
       continue;
     }
     const shoulderIndex=i-1; // ALWAYS pivot day minus ONE calendar day.
     return result(rows,shoulderIndex,current,valley?'valley_previous_day':'peak_previous_day',{
       pivotDayKey:rows[i].t,pivotPrice:rows[i].hc,
       plateauDays:i-plateauStart+1,
     });
   }
   return null;
 }
 function shoulderFor(ha,kind){
   if(!validHistory(ha)||![2,3,4,6].includes(kind))return null;
   return geometricShoulder(ha.history,kind);
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
