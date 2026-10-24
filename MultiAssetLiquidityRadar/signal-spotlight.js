/* Signal Spotlight v1.8.0 — daily matrix detector, independent of DOM and network.
   SState calculations are delegated to the same authoritative monitor-engine.js.
   UTC 00:00 is exactly Asia/Taipei 08:00. No future bars enter historical as-of states. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.SignalSpotlightCore=api;})(typeof globalThis==='object'?globalThis:this,function(){'use strict';
 const DAY=86400000;
 const RULES=[
 // below midline: slope
 [1,'below','mid','falling','flattening',60,'WATCH',false,'下斜 → 下降走平中'],
 [2,'below','mid','falling','flat',75,'NEW',false,'下斜 → 平緩'],
 [3,'below','mid','flattening','flattening',45,'HOLD',false,'下降走平延續'],
 [4,'below','mid','flattening','flat',85,'NEW',true,'下降走平 → 平緩'],
 [5,'below','mid','flat','flat',56,'HOLD',true,'中軌維持平緩'],
 [6,'below','mid','rising','rising',20,'CAUTION',false,'中軌仍上斜、價格卻在下方'],
 [7,'below','s','OTHER-DN','S0',62,'NEW',false,'OT-DN → S0'],
 [8,'below','s','OTHER-DN','S0.5',67,'NEW',false,'OT-DN → S0.5'],
 [10,'below','s','OTHER','S0',45,'NEW',false,'OTHER → S0'],
 [11,'below','s','OTHER','S0.5',87,'NEW',true,'OTHER → S0.5'],
 [13,'below','s','S0.5','S0.5',58,'HOLD',true,'S0.5 穩定延續'],
 [16,'below','ha','purple','yellow',40,'WATCH',false,'平均K 紫 → 黃（觀察）'],
 [17,'below','ha','yellow','yellow',97,'NEW',true,'紫 → 黃 → 黃（三日確認）'],
 [18,'below','ha','yellow','yellow',62,'REFINE',true,'雙黃、HA 收盤再抬高'],
 [19,'below','cci','purple','yellow',70,'NEW',false,'CCI 紫轉黃並站回 -100'],
 [20,'below','cci','yellow','yellow',82,'NEW',false,'CCI 黃色首次站回 -100'],
 [21,'below','cci','purple','yellow',64,'NEW',false,'CCI -100 上方轉黃'],
 [22,'below','cci','yellow','yellow',57,'HOLD',true,'CCI 黃色動能延續'],
 [23,'below','cci','yellow','yellow',72,'REFINE',true,'CCI 黃色可見階梯抬高'],
 // above midline: slope, S, HA, CCI
 [24,'above','mid','flat','flat',45,'HOLD',false,'中軌平緩延續'],
 [25,'above','mid','flat','rising',92,'NEW',true,'中軌平緩 → 上斜'],
 [26,'above','mid','rising','rising',57,'HOLD',true,'中軌上斜延續'],
 [27,'above','s','S2','S3',90,'NEW',true,'S2 → S3 第三浪'],
 [28,'above','s','S3','S3',45,'HOLD',false,'S3 第三浪延續'],
 [29,'above','s','S3','OTHER-UP',32,'CAUTION',false,'S3 → OT-UP（追高警惕）'],
 [14,'above','s','S0.5','S1',91,'NEW',true,'S0.5 → S1'],
 [15,'above','s','S1','S1',43,'HOLD',false,'S1 延續'],
 [9,'above','s','OTHER-DN','S1',70,'NEW',false,'OT-DN → S1'],
 [12,'above','s','OTHER','S1',86,'NEW',true,'OTHER → S1'],
 [30,'above','ha','purple','yellow',94,'NEW',true,'中軌上平均K 紫 → 黃'],
 [31,'above','ha','yellow','yellow',46,'HOLD',false,'中軌上平均K 黃色延續'],
 [32,'above','ha','yellow','yellow',40,'REFINE',false,'中軌上 HA 收盤抬高'],
 [33,'above','cci','purple','yellow',72,'NEW',false,'CCI 紫轉黃並站回 -100'],
 [34,'above','cci','yellow','yellow',83,'NEW',false,'CCI 黃色首次站回 -100'],
 [35,'above','cci','purple','yellow',85,'NEW',true,'CCI -100 上方紫 → 黃'],
 [36,'above','cci','yellow','yellow',55,'HOLD',true,'CCI 黃色動能延續'],
 [37,'above','cci','yellow','yellow',72,'REFINE',true,'CCI 黃色可見階梯抬高']
 ].map(([id,region,axis,from,to,score,type,favorite,title])=>Object.freeze({id,region,axis,from,to,score,type,favorite,title}));
 const AXES={mid:'中軌斜率',s:'S 狀態',ha:'日線平均K',cci:'CCI-SMA'};
 const byId=new Map(RULES.map(r=>[r.id,r]));
 const num=x=>typeof x==='number'&&Number.isFinite(x);
 const utcDay=t=>new Date(t).toISOString().slice(0,10);
 function normalizeState(s){return s==='OTHER-UP'?'OTHER-UP':s==='OTHER-DN'?'OTHER-DN':s;}
 function snapshot(rows,engine){
  if(!Array.isArray(rows)||rows.length<40||!engine?.analyze||!engine?.calculateHeikinAshi||!engine?.calculateCciSma)return null;
  const source=rows.map(r=>({time:r.t,open:r.o,high:r.h,low:r.l,close:r.c,volume:r.v||0}));
  let analysis,ha,cci;
  try{analysis=engine.analyze(source);ha=engine.calculateHeikinAshi(source);cci=engine.calculateCciSma(source);}catch(_){return null;}
  const h=ha.at(-1),cs=cci.at(-1),row=analysis?.chart_30d?.at(-1);
  if(!analysis?.midline?.state||!analysis?.s_state||!h||!row||!cs||!num(cs.smoothing_ma)||!num(row.ha_band_position))return null;
  const raw=String(analysis.s_state);
  const ext=engine.classifyOtherExtension?.(analysis.chart_30d,raw);
  const sc=num(h.close)&&num(h.open)?h.close>h.open?'yellow':h.close<h.open?'purple':null:null;
  const cColor=cs.smoothing_color==='yellow'||cs.smoothing_color==='purple'?cs.smoothing_color:null;
  if(!sc||!cColor)return null;
  return {dayKey:utcDay(source.at(-1).time),time:source.at(-1).time,region:row.ha_band_position<0.5?'below':'above',mid:analysis.midline.state,s:normalizeState(ext?.state||raw),ha:sc,haClose:h.close,cci:cColor,cciValue:cs.smoothing_ma,source:'daily OHLC + SStateMonitorEngine'};
 }
 function compare(prev2,prev,cur){
  if(!prev||!cur)return {region:cur?.region||null,rules:[],reason:'insufficient_history'};
  const matches=[];
  for(const r of RULES){
   if(r.region!==cur.region||prev[r.axis]!==r.from||cur[r.axis]!==r.to)continue;
   let ok=true;
   switch(r.id){
    case 17:ok=prev2?.ha==='purple';break;
    case 18:case 32:ok=num(cur.haClose)&&num(prev.haClose)&&cur.haClose>prev.haClose;break;
    case 19:case 33:ok=num(prev.cciValue)&&num(cur.cciValue)&&prev.cciValue<=-100&&cur.cciValue>-100;break;
    case 20:case 34:ok=num(prev.cciValue)&&num(cur.cciValue)&&prev.cciValue<=-100&&cur.cciValue>-100;break;
    case 21:case 35:ok=num(prev.cciValue)&&num(cur.cciValue)&&prev.cciValue>-100&&cur.cciValue>-100;break;
    case 22:case 36:ok=num(prev.cciValue)&&num(cur.cciValue)&&prev.cciValue>-100&&cur.cciValue>-100;break;
    case 23:case 37:ok=num(prev.cciValue)&&num(cur.cciValue)&&prev.cciValue>-100&&cur.cciValue>-100&&Math.round(cur.cciValue)>Math.round(prev.cciValue);break;
   }
   if(ok)matches.push(r);
  }
  return {region:cur.region,rules:matches};
 }
 function evaluateSnapshots(prev2,prev,cur,{provisional=true,threshold=80}={}){
  const {region,rules,reason}=compare(prev2,prev,cur);
  if(reason)return {region,rules:[],primary:null,attentionScore:null,notify:false,reason};
  const candidates=rules.filter(x=>x.favorite&&x.type==='NEW');
  // Main event must be fresh and favored. Context and HOLD remain visible without waking radar.
  const primary=[...candidates].sort((a,b)=>b.score-a.score)[0]||null;
  if(!primary)return {region,rules,primary:null,attentionScore:null,notify:false,reason:'context_only'};
  const group=rules.filter(r=>r.axis===primary.axis&&r.type==='REFINE');
  const sameAxisBonus=group.length?3:0;
  const freshAxes=new Set(rules.filter(r=>r.type==='NEW'&&r.axis!==primary.axis).map(r=>r.axis));
  const crossAxisBonus=Math.min(10,5*freshAxes.size);
  const attentionScore=Math.min(100,Math.max(0,primary.score+sameAxisBonus+crossAxisBonus-(provisional?8:0)));
  return {region,rules,primary,attentionScore,notify:attentionScore>=threshold,baseScore:primary.score,sameAxisBonus,crossAxisBonus,provisional};
 }
 function evaluateHistory(rows,engine,asOfIndex,opts={}){
  if(!Array.isArray(rows)||rows.length<43)return {reason:'insufficient_history',rules:[]};
  const n=asOfIndex===undefined?rows.length-1:asOfIndex;
  if(n<42||n>=rows.length)return {reason:'insufficient_history',rules:[]};
  const s0=snapshot(rows.slice(0,n-1),engine),s1=snapshot(rows.slice(0,n),engine),s2=snapshot(rows.slice(0,n+1),engine);
  if(!s0||!s1||!s2)return {reason:'insufficient_history',rules:[]};
  if(s0.time+DAY!==s1.time||s1.time+DAY!==s2.time)return {reason:'missing_daily_candle',rules:[]};
  return {...evaluateSnapshots(s0,s1,s2,opts),snapshots:[s0,s1,s2],signalDayKey:s2.dayKey};
 }
 function eventId(symbol,ruleId,date){return `${symbol}|R${String(ruleId).padStart(2,'0')}|${date}`;}
 return Object.freeze({RULES,AXES,byId,snapshot,compare,evaluateSnapshots,evaluateHistory,eventId,utcDay,DAY});
});
