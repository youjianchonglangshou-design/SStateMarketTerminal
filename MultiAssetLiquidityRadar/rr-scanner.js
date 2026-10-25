/* MultiAssetLiquidityRadar v1.8.5 — 7D RR with current 1D HA color confirmation.
 * No R2 persistence, added polling, or separate indicator calculations.
 */
(function(root){'use strict';
  const config=root.LIQ_RR_CONFIG||{};
  const threshold=Number(config.THRESHOLD);
  const validThreshold=Number.isFinite(threshold)&&threshold>=1;
  function evaluate(snapshot){
    if(!validThreshold||!snapshot)return null;
    const {price:p,upper:u,lower:l,source,updatedAt,haColor}=snapshot;
    if(![p,u,l].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>0))return null;
    if(!(l<p&&p<u))return null;
    const longRR=(u-p)/(p-l),shortRR=(p-l)/(u-p);
    if(![longRR,shortRR].every(Number.isFinite))return null;
    // A stale day/invalid HA is NOT confirmation. Never recycle yesterday's color.
    const currentHA=(snapshot.dayKey===undefined||snapshot.haDayKey===undefined||snapshot.dayKey===snapshot.haDayKey)
      ? haColor : null;
    // Ignore only IEEE-754 subtraction noise at exact ratios (e.g. 0.3 / 0.2).
    // This is NOT a display-rounding rule or a widened trading threshold.
    const meets=ratio=>ratio>=threshold||(threshold-ratio)<=1e-12*Math.max(1,threshold);
    const direction=currentHA==='黃'&&meets(longRR)?'long'
      :currentHA==='紫'&&meets(shortRR)?'short':'none';
    return {direction,longRR,shortRR,threshold,haColor:currentHA||null,price:p,upper:u,lower:l,source,updatedAt};
  }
  root.LIQ_RR_SCANNER=Object.freeze({evaluate,threshold});
})(window);
