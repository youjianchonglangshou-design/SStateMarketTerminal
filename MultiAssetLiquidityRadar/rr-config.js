/* RR v2.2.1: global continuation / reversal thresholds, configured from the
 * bottom "⚙ 繪圖" R2 drawing-manager modal and synchronized in workspace JSON.
 * This does not change manually drawn position risk/target calculations.
 */
(function(root){'use strict';
 const DEFAULTS=Object.freeze({continuation:1.50,reversal:1.70});
 let selected={...DEFAULTS};
 const valid=v=>typeof v==='number'&&Number.isFinite(v)&&v>=1&&v<=100;
 function setThresholds(input){
   if(!input||!valid(input.continuation)||!valid(input.reversal))return false;
   selected={continuation:input.continuation,reversal:input.reversal};return true;
 }
 root.LIQ_RR_CONFIG=Object.freeze({DEFAULTS,getThresholds:()=>({...selected}),setThresholds,
   // Compatibility for extensions that read the previous single threshold.
   get THRESHOLD(){return selected.continuation;}
 });
})(window);
