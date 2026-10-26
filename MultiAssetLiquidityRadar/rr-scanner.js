/* SStateMarketTerminal — six HA structures / ten live RR branches, v2.2.1.
 * No I/O, no independent candle processing, no storage of LED/shoulder state.
 * HA series must be derived from the very same projected 1D candles as the UI.
 */
(function(root){'use strict';
 const positive=v=>typeof v==='number'&&Number.isFinite(v)&&v>0;
 const DATE_MS=86400000;
 function cmp(a,b){
   const tolerance=16*Number.EPSILON*Math.max(Math.abs(a),Math.abs(b));
   return Math.abs(a-b)<=tolerance?0:a>b?1:-1;
 }
 function classify(ha){
   const rows=ha?.history;
   if(!Array.isArray(rows)||rows.length<3)return null;
   const current=rows.at(-1),previous=rows.at(-2);
   if(!current||!previous||current.t-previous.t!==DATE_MS||
      !positive(current.hc)||!positive(previous.hc)||
      !['黃','紫'].includes(current.color)||!['黃','紫'].includes(previous.color))return null;
   const delta=cmp(current.hc,previous.hc);
   if(current.color==='紫'&&previous.color==='紫')return delta<0?1:delta>0?2:null;
   if(current.color==='黃'&&previous.color==='黃')return delta<0?4:delta>0?5:null;
   if(previous.color==='黃'&&current.color==='紫'&&delta<0)return 3;
   if(previous.color==='紫'&&current.color==='黃'&&delta>0)return 6;
   return null;
 }
 function shoulderFor(ha,kind){
   const rows=ha.history,current=rows.at(-1),dir=kind===2?'higher':kind===4?'lower':kind===3?'samePurple':'sameYellow';
   for(let i=rows.length-3;i>=0;i--){
     const row=rows[i];if(!positive(row?.hc)||!Number.isFinite(row.t)||row.t>=current.t)continue;
     const match=dir==='higher'?cmp(row.hc,current.hc)>0:
       dir==='lower'?cmp(row.hc,current.hc)<0:
       dir==='samePurple'?row.color==='紫':row.color==='黃';
     if(match)return {price:row.hc,dayKey:row.t,daysBack:Math.round((current.t-row.t)/DATE_MS)};
   }
   return null;
 }
 function chooseStage(ha,p){
   const kind=classify(ha);if(!kind)return null;
   const sh=[2,3,4,6].includes(kind)?shoulderFor(ha,kind):null;
   let stage=null,direction=null,group=null;
   switch(kind){
     case 1:stage='①';direction='short';group='continuation';break;
     case 2:stage=sh&&p>sh.price?'②-B':'②-A';direction=sh&&p>sh.price?'long':'short';group=direction==='long'?'reversal':'continuation';break;
     case 3:if(!sh)return {kind,stage:null,direction:'none',reason:'missing_same_color_shoulder',shoulder:null};
       stage=p<sh.price?'③-A':'③-B';direction=p<sh.price?'short':'long';group=direction==='short'?'continuation':'reversal';break;
     case 4:stage=sh&&p<sh.price?'④-B':'④-A';direction=sh&&p<sh.price?'short':'long';group=direction==='short'?'reversal':'continuation';break;
     case 5:stage='⑤';direction='long';group='continuation';break;
     case 6:if(!sh)return {kind,stage:null,direction:'none',reason:'missing_same_color_shoulder',shoulder:null};
       stage=p>sh.price?'⑥-A':'⑥-B';direction=p>sh.price?'long':'short';group=direction==='long'?'continuation':'reversal';break;
   }
   return {kind,stage,direction,group,shoulder:sh,reason:null};
 }
 function evaluate(snapshot){
   if(!snapshot)return null;
   const {price:p,upper:u,lower:l,source,updatedAt,ha}=snapshot;
   if(![p,u,l].every(positive)||!(l<p&&p<u))return null;
   const cfg=root.LIQ_RR_CONFIG?.getThresholds?.()||{continuation:1.5,reversal:1.7};
   if(![cfg.continuation,cfg.reversal].every(x=>Number.isFinite(x)&&x>=1))return null;
   const longRR=(u-p)/(p-l),shortRR=(p-l)/(u-p);
   if(![longRR,shortRR].every(Number.isFinite))return null;
   const current=ha?.history?.at(-1);
   if(!current||current.t!==snapshot.dayKey||current.t!==snapshot.haDayKey)return null;
   const picked=chooseStage(ha,p);if(!picked)return null;
   const threshold=picked.group?cfg[picked.group]:null;
   const ratio=picked.direction==='long'?longRR:picked.direction==='short'?shortRR:null;
   const meets=ratio!==null&&threshold!==null&&(ratio>=threshold || threshold-ratio<=1e-12*Math.max(1,threshold));
   return {direction:meets?picked.direction:'none',candidateDirection:picked.direction,
     kind:picked.kind,stage:picked.stage,group:picked.group,shoulder:picked.shoulder,reason:picked.reason,
     longRR,shortRR,threshold,thresholds:cfg,haColor:current.color,
     price:p,upper:u,lower:l,source,updatedAt};
 }
 root.LIQ_RR_SCANNER=Object.freeze({evaluate,classify,shoulderFor,chooseStage,get thresholds(){return root.LIQ_RR_CONFIG?.getThresholds?.();}});
})(window);
