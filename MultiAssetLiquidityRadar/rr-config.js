/* Real-time RR / daily HA confirmation settings — v1.8.5.
 * Change THRESHOLD only to test (e.g. 1.50, 1.70, 2.00).
 * Long: RR >= THRESHOLD AND current daily HA yellow (黃).
 * Short: RR >= THRESHOLD AND current daily HA purple (紫).
 * No percent-return minimum, CCI, S state or midline filters.
 */
window.LIQ_RR_CONFIG=Object.freeze({
  THRESHOLD: 1.20 // ← 共用門檻，只需修改這個數字
});
