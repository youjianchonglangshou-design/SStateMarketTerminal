/* MultiAssetLiquidityRadar v1.8.4 — pure browser-only RR evaluator.
 * No R2 persistence, no added polling, and no extra market-data requests.
 */
(function(root){'use strict';
  const config=root.LIQ_RR_CONFIG||{};
  const threshold=Number(config.THRESHOLD);
  const validThreshold=Number.isFinite(threshold)&&threshold>=1;
  function evaluate(snapshot){
    if(!validThreshold||!snapshot)return null;
    const {price:p,upper:u,lower:l,source,updatedAt}=snapshot;
    if(![p,u,l].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>0))return null;
    if(!(l<p&&p<u))return null;
    const longRR=(u-p)/(p-l),shortRR=(p-l)/(u-p);
    if(![longRR,shortRR].every(Number.isFinite))return null;
    const direction=longRR>=threshold?'long':shortRR>=threshold?'short':'none';
    return {direction,longRR,shortRR,threshold,price:p,upper:u,lower:l,source,updatedAt};
  }
  root.LIQ_RR_SCANNER=Object.freeze({evaluate,threshold});
})(window);
