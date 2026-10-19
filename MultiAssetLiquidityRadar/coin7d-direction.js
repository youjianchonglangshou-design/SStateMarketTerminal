/* v1.2.0 CoinGlass 7D two-sided DIRECTIONAL pressure estimator.
 * P(up directional preference) + P(down directional preference) = 1.
 * NOT P(either CG level actually touched). Distance weights are heuristics,
 * because dated CoinGlass 7D barrier snapshots are not available for fitting.
 * BTC frozen 7D model: 2017-2023 train, 2024 selection, 2025-26 out of sample.
 * Other instruments: transparent price-momentum model, NOT BTC fitted accuracy.
 */
(function(root,factory){const engine=factory();if(typeof module==='object'&&module.exports)module.exports=engine;root.Coin7DDirection=engine;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const sig=z=>1/(1+Math.exp(-clamp(z,-20,20)));
const logit=p=>Math.log(clamp(p,.005,.995)/(1-clamp(p,.005,.995)));
function calculate(o){
 const {price,upper,lower,bars=[],isBTC=false,snapshot=null,source='coinglass'}=o||{};
 if(![price,upper,lower].every(x=>Number.isFinite(x)&&x>0)||upper<=price||lower>=price)
   return {ready:false,reason:'CoinGlass 上下界或現價未有效包住價格'};
 const dUp=(upper/price-1)*100,dDown=(1-lower/price)*100;
 if(!(dUp>0&&dDown>0))return {ready:false,reason:'清算上下界距離無效'};
 // Historical daily bars are source-specific. Never use prices after the quote timestamp.
 const days=bars.filter(x=>[x.o,x.h,x.l,x.c].every(v=>Number.isFinite(v)&&v>0)).sort((a,b)=>a.t-b.t);
 if(days.length<23)return {ready:false,reason:'至少需要 23 根有效日線 K'};
 const recent=days.slice(-14),last=days.at(-1);
 const r7=100*(price/days.at(-8).c-1),r3=100*(price/days.at(-4).c-1);
 const atr7=days.slice(-7).reduce((s,x)=>s+(x.h-x.l)/Math.max(.000001,x.c)*100,0)/7;
 const atr14=recent.reduce((s,x)=>s+(x.h-x.l)/Math.max(.000001,x.c)*100,0)/recent.length;
 const vol=clamp(Math.max(.1,atr7*.65+atr14*.35),.2,25);
 // Cross-asset momentum base: positive 3D and 7D moves favour upside;
 // wave energy is normalized by recent daily range to avoid price-scale bias.
 const momentum=clamp(.48*(r7/(vol*Math.sqrt(7)))+.22*(r3/(vol*Math.sqrt(3))),-1.35,1.35);
 let base=sig(momentum),origin='跨標的價格動能';
 if(isBTC&&snapshot&&Number.isFinite(snapshot.up)){
   base=clamp(snapshot.up,.02,.98);origin='BTC 7D 凍結動態模型';
 }
 // Distances to the *actual displayed* CoinGlass 7D levels.
 // Closer upper -> positive; closer lower -> negative.
 const distancePressure=clamp(Math.log(dDown/dUp),-1.6,1.6)*.76;
 // Easing is explicit; this is NOT a fixed-touch-probability hazard.
 const delta=distancePressure;
 const raw=logit(base)+delta;
 const up=clamp(sig(raw),.10,.90);
 return {ready:true,up,down:1-up,baseUp:base,source:origin,levelSource:source,
  upperDistancePct:dUp,lowerDistancePct:dDown,r7,r3,atr7,atr14,vol,
  distanceLogit:delta,momentumLogit:momentum,
  differencePct:Math.abs(2*up-1)*100,
  explanation:`${origin} ${ (base*100).toFixed(1) }%｜上界 +${dUp.toFixed(2)}% / 下界 −${dDown.toFixed(2)}%｜距離調整 ${delta>=0?'+':''}${delta.toFixed(3)} log-odds｜7D方向優勢估計，非到價機率`,
  caveat:'CoinGlass 僅提供當前上下界；缺乏歷史逐時點 7D 上下界快照，因此距離係數尚未用 CoinGlass 實際先掃樣本校準。'};
}
return {calculate};
});
