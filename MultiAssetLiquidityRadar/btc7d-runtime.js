/* v0.6.0 research-only browser/Node predictor. Frozen model is supplied by model.js.
 * No mutation of SStateMarketTerminal or its production probability.
 */
(function(root, factory){
  const obj=factory();
  if(typeof module==='object'&&module.exports)module.exports=obj;
  root.BTC128Runtime=obj;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function decodeBase64(s){
    if(typeof Buffer!=='undefined')return Uint8Array.from(Buffer.from(s,'base64'));
    const str=atob(s),out=new Uint8Array(str.length);
    for(let i=0;i<str.length;i++)out[i]=str.charCodeAt(i);
    return out;
  }
  function deserialize(cfg){
    const bytes=decodeBase64(cfg.encoded);
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    let cursor=0;
    function read(){
      if(cursor+5>bytes.length)throw new Error('模型樹資料損壞');
      const id=view.getUint8(cursor++),value=view.getFloat32(cursor,true);cursor+=4;
      if(id===255)return {leaf:value};
      if(id>=cfg.features.length)throw new Error('模型欄位超出索引');
      return {key:cfg.features[id],threshold:value,left:read(),right:read()};
    }
    const trees=[];
    while(cursor<bytes.length)trees.push(read());
    if(trees.length!==60)throw new Error('模型必須為 60 棵固定決策樹');
    return trees;
  }
  function forecastFromFeatures(features,config){
    if(!config||!config.encoded)throw new Error('缺少凍結模型權重');
    const trees=deserialize(config);
    let score=Math.log(config.base/(1-config.base));
    for(const tree of trees){
      let node=tree;
      while(node.leaf===undefined){
        const x=Number(features[node.key]);
        if(!Number.isFinite(x))throw new Error('缺少特徵 '+node.key);
        node=x<=node.threshold?node.left:node.right;
      }
      score+=node.leaf;
    }
    const up=1/(1+Math.exp(-Math.max(-30,Math.min(30,score))));
    return {up,down:1-up,treeCount:trees.length};
  }
  function parseDailyCsv(csv){
    const lines=csv.replace(/^\uFEFF/,'').trim().split(/\r?\n/);
    const rows=[];
    for(const line of lines.slice(1)){
      const d=line.split(',');
      if(d.length<5||!/^20\d\d-\d\d-\d\d$/.test(d[0]))continue;
      const r={date:d[0],time:Date.parse(d[0]+'T00:00:00Z'),open:+d[1],high:+d[2],low:+d[3],close:+d[4],volume:+(d[5]||0)};
      if([r.open,r.high,r.low,r.close].every(Number.isFinite)&&r.close>0)rows.push(r);
    }
    rows.sort((a,b)=>a.time-b.time);
    if(rows.length<135)throw new Error('完整歷史日 K 不足 135 根');
    for(let i=1;i<rows.length;i++)if(rows[i].time-rows[i-1].time!==86400000)throw new Error('歷史日 K 中斷／重複：'+rows[i].date);
    return rows;
  }
  function makeSnapshot(all,asof=Date.now()){
    const model=typeof window!=='undefined'?window.SStateMonitorEngine:require('./monitor-engine.js');
    const complete=all.filter(x=>x.time+86400000<=asof);
    if(complete.length<135)throw new Error('完整日 K 不足');
    const latest=complete.at(-1),p=complete.at(-2);
    const z=model.analyze(complete.slice(-121)),prev=model.analyze(complete.slice(-122,-1));
    if(!z?.chart_30d?.length||!prev?.chart_30d?.length)throw new Error('SState 引擎資料不完整');
    if(!['yellow','purple'].includes(z.average_k)||!['yellow','purple'].includes(z.cci_sma))throw new Error('HA／CCI 尚未確認');
    const state=model.classifyOtherExtension(z.chart_30d,z.s_state).state,priorState=model.classifyOtherExtension(prev.chart_30d,prev.s_state).state;
    const mid=z.midline.state,ha=z.average_k,cci=z.cci_sma;
    const recentColors=z.chart_30d.map(x=>x.ha_color).reverse();
    const run=recentColors.findIndex(x=>x!==ha);
    const close=latest.close,n=complete.length-1;
    const ret=days=>100*(close/complete[n-days].close-1);
    const f={
      S0:+(state==='S0'),S05:+(state==='S0.5'),S1:+(state==='S1'),S2:+(state==='S2'),S3:+(state==='S3'),OUP:+(state==='OTHER-UP'),ODN:+(state==='OTHER-DN'),
      rising:+(mid==='rising'),flat:+(mid==='flat'),flattening:+(mid==='flattening'),falling:+(mid==='falling'),haY:+(ha==='yellow'),cciY:+(cci==='yellow'),
      slope:z.midline.recent_5d_slope_pct_per_day,delta:z.midline.slope_improvement_pct_per_day,band:z.chart_30d.at(-1).ha_band_position,haRun:run<0?30:run,
      change3:ret(3),change7:ret(7),change14:ret(14),dailyRange:100*(latest.high-latest.low)/close,
      atr7:complete.slice(-7).reduce((s,x)=>s+100*(x.high-x.low)/x.close,0)/7,
      haFlip:+(prev.average_k!==ha),cciFlip:+(prev.cci_sma!==cci),midFlip:+(prev.midline.state!==mid),SFlip:+(priorState!==state),
      ccixmidFall:+(cci==='yellow'&&mid==='falling'),haCci:+(ha==='yellow'&&cci==='yellow'),S05Cci:+(state==='S0.5'&&cci==='yellow'),S1Cci:+(state==='S1'&&cci==='yellow'),
      S05MidFall:+(state==='S0.5'&&mid==='falling'),S1MidFall:+(state==='S1'&&mid==='falling')
    };
    return {date:latest.date,close,state,mid,ha,cci,features:f,ageDays:(asof-(latest.time+86400000))/86400000};
  }
  function predictionFromDaily(rows,cfg,asof){const snapshot=makeSnapshot(rows,asof);return {...snapshot,...forecastFromFeatures(snapshot.features,cfg)};}
  return {deserialize,forecastFromFeatures,parseDailyCsv,makeSnapshot,predictionFromDaily};
});
