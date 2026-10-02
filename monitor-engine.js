(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SStateMonitorEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const C = Object.freeze({
    BB_PERIOD: 20,
    CCI_LENGTH: 20,
    CCI_SMOOTHING_LENGTH: 14,
    MIDLINE_RISING_SLOPE_PCT_PER_DAY: 0.12,
    MIDLINE_FLAT_FLOOR_PCT_PER_DAY: -0.25,
    MIDLINE_FLATTENING_MAX_FALL_PCT_PER_DAY: -0.65,
    MIDLINE_FLATTENING_IMPROVEMENT_MIN: 0.12,
    MIDLINE_NEAR_BANDPOS_DISTANCE: 0.18,
    MIDLINE_SWEET_UPPER_BANDPOS: 0.68,
    S1_ACTIVE_MAX_BANDPOS: 0.75,
    S2_ACTIVE_MAX_BANDPOS: 0.78,
    S3_ACTIVE_MAX_BANDPOS: 0.75,
    S2_BREAKDOWN_FLOOR_BANDPOS: 0.38,
    S2_FIRST_WAVE_PEAK_MIN_BANDPOS: 0.62,
    BASE_BRIDGE_MIN_BANDPOS_LIFT: 0.08,
    FIB_CUP_RIGHT_MAX: 0.618,
    FIB_W_RIGHT_MIN: 1.0,
    FIB_W_RIGHT_MAX: 1.236,
    FIB_W_GENERATION_MAX: 1.236,
    STRUCT_UPPER_ZONE_BANDPOS: 0.58,
    STRUCT_LOWER_ZONE_BANDPOS: 0.42,
    PURPLE2_RULE_VERSION: 'DP2-v11-state-scoped-30d',
    ENGINE_VERSION: 'monitor-live-v0.3.05'
  });

  function num(v, d = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : Number(d);
  }
  function finite(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  function round(v, n = 6) {
    const x = Number(v);
    if (!Number.isFinite(x)) return null;
    const p = 10 ** n;
    return Math.round((x + Number.EPSILON) * p) / p;
  }
  function clampIndex(i, len) { return Math.max(0, Math.min(len - 1, Number(i) || 0)); }
  function fmtDate(ms) {
    const d = new Date(Number(ms));
    if (!Number.isFinite(d.getTime())) return '';
    return `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}`;
  }

  function normalizeKlines(rows) {
    const out = (Array.isArray(rows) ? rows : []).map(row => ({
      time: Number(row.time),
      open: num(row.open), high: num(row.high), low: num(row.low), close: num(row.close), volume: num(row.volume)
    })).filter(x => Number.isFinite(x.time) && x.open > 0 && x.high > 0 && x.low > 0 && x.close > 0);
    out.sort((a, b) => a.time - b.time);
    return out;
  }

  function calculateHeikinAshi(rows) {
    const data = normalizeKlines(rows);
    const out = [];
    let prevOpen = null, prevClose = null;
    data.forEach((c, i) => {
      const hc = (c.open + c.high + c.low + c.close) / 4;
      const ho = i === 0 ? (c.open + c.close) / 2 : (prevOpen + prevClose) / 2;
      const item = { time: c.time, open: ho, high: Math.max(c.high, ho, hc), low: Math.min(c.low, ho, hc), close: hc };
      out.push(item); prevOpen = ho; prevClose = hc;
    });
    return out;
  }

  function rollingBollinger(rows, period = C.BB_PERIOD) {
    const data = normalizeKlines(rows);
    const out = new Array(data.length).fill(null).map(() => ({ mid: null, upper: null, lower: null }));
    for (let i = period - 1; i < data.length; i++) {
      const xs = data.slice(i - period + 1, i + 1).map(x => x.close);
      const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
      const variance = xs.reduce((s, x) => s + ((x - mean) ** 2), 0) / xs.length;
      const sd = Math.sqrt(variance);
      out[i] = { mid: mean, upper: mean + 2 * sd, lower: mean - 2 * sd };
    }
    return out;
  }

  function calculateCciSma(rows, length = C.CCI_LENGTH, smoothingLength = C.CCI_SMOOTHING_LENGTH) {
    const data = normalizeKlines(rows);
    const tp = data.map(x => (x.high + x.low + x.close) / 3);
    const cci = new Array(data.length).fill(null);
    for (let i = length - 1; i < data.length; i++) {
      const xs = tp.slice(i - length + 1, i + 1);
      const mean = xs.reduce((a, b) => a + b, 0) / length;
      const dev = xs.reduce((s, x) => s + Math.abs(x - mean), 0) / length;
      if (dev > 0) cci[i] = (tp[i] - mean) / (0.015 * dev);
    }
    const sma = new Array(data.length).fill(null);
    for (let i = smoothingLength - 1; i < data.length; i++) {
      const xs = cci.slice(i - smoothingLength + 1, i + 1);
      if (xs.every(Number.isFinite)) sma[i] = xs.reduce((a, b) => a + b, 0) / smoothingLength;
    }
    return data.map((x, i) => {
      const cur = sma[i], prev = i > 0 ? sma[i - 1] : null;
      const color = !Number.isFinite(cur) || !Number.isFinite(prev) ? 'gray' : cur > prev ? 'yellow' : cur < prev ? 'purple' : 'gray';
      return { time: x.time, cci: cci[i], smoothing_ma: cur, smoothing_color: color };
    });
  }

  function buildChart30d(rows) {
    const raw = normalizeKlines(rows);
    if (!raw.length) return [];
    const ha = calculateHeikinAshi(raw);
    const bb = rollingBollinger(raw);
    const cci = calculateCciSma(raw);
    const start = Math.max(0, raw.length - 30);
    const out = [];
    for (let i = start; i < raw.length; i++) {
      const h = ha[i], b = bb[i] || {}, r = raw[i], cc = cci[i] || {};
      if (!Number.isFinite(b.mid) || !Number.isFinite(b.upper) || !Number.isFinite(b.lower)) continue;
      const pct = Math.abs(b.mid) > 1e-18 ? (h.close - b.mid) / b.mid * 100 : 0;
      const width = Math.abs(b.mid) > 1e-18 ? (b.upper - b.lower) / Math.abs(b.mid) * 100 : 0;
      const pos = Math.abs(b.upper - b.lower) > 1e-18 ? (h.close - b.lower) / (b.upper - b.lower) : 0.5;
      out.push({
        index: out.length, date: fmtDate(r.time),
        ha_open: h.open, ha_close: h.close, ha_color: h.close > h.open ? 'yellow' : h.close < h.open ? 'purple' : 'flat',
        bb_upper: b.upper, bb_midline: b.mid, bb_lower: b.lower,
        ha_vs_midline_pct: pct, band_width_pct: width, ha_band_position: pos,
        real_open: r.open, real_high: r.high, real_low: r.low, real_close: r.close,
        cci: cc.cci, cci_smoothing_ma: cc.smoothing_ma, cci_smoothing_color: cc.smoothing_color
      });
    }
    return out;
  }

  function opportunityPoints(record) {
    const existing = record?.chart_30d || record?.chart_20d || [];
    return existing.slice(-30).map((p, idx) => ({
      index: idx, date: String(p?.date ?? idx), open: num(p?.ha_open), close: num(p?.ha_close), color: String(p?.ha_color || 'unknown'),
      pct: num(p?.ha_vs_midline_pct), mid: num(p?.bb_midline), upper: num(p?.bb_upper), lower: num(p?.bb_lower), width: num(p?.band_width_pct),
      band_pos: num(p?.ha_band_position, 0.5), real_open: finite(p?.real_open), real_high: finite(p?.real_high), real_low: finite(p?.real_low), real_close: finite(p?.real_close)
    }));
  }

  function slopePctPerDay(values) {
    const vals = values.map(v => num(v));
    if (vals.length < 2) return 0;
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    if (Math.abs(mean) < 1e-18) return 0;
    const n = vals.length, xm = (n - 1) / 2;
    let den = 0, top = 0;
    for (let i = 0; i < n; i++) { den += (i - xm) ** 2; top += (i - xm) * (vals[i] - mean); }
    return den > 0 ? (top / den) / Math.abs(mean) * 100 : 0;
  }

  function midlineRegime(points) {
    const mids = points.map(p => num(p.mid));
    const recent = mids.slice(-5), previous = mids.length >= 10 ? mids.slice(-10, -5) : mids.slice(0, -5);
    const recentSlope = slopePctPerDay(recent);
    const prevSlope = previous.length >= 2 ? slopePctPerDay(previous) : recentSlope;
    const improvement = recentSlope - prevSlope;
    let state, symbol, label;
    if (recentSlope >= C.MIDLINE_RISING_SLOPE_PCT_PER_DAY) [state, symbol, label] = ['rising', '↑', '上斜'];
    else if (recentSlope > C.MIDLINE_FLAT_FLOOR_PCT_PER_DAY) [state, symbol, label] = ['flat', '→', '平緩'];
    else if (recentSlope >= C.MIDLINE_FLATTENING_MAX_FALL_PCT_PER_DAY && improvement >= C.MIDLINE_FLATTENING_IMPROVEMENT_MIN) [state, symbol, label] = ['flattening', '↘', '下降走平中'];
    else [state, symbol, label] = ['falling', '↓', '下斜'];
    return { state, symbol, label, recent_5d_slope_pct_per_day: round(recentSlope), previous_5d_slope_pct_per_day: round(prevSlope), slope_improvement_pct_per_day: round(improvement), long_friendly: ['rising','flat','flattening'].includes(state) };
  }

  function runStart(points, endIdx) {
    if (!points.length || endIdx < 0) return 0;
    const color = points[endIdx]?.color; let i = endIdx;
    while (i > 0 && points[i - 1]?.color === color) i--;
    return i;
  }
  function nearMidline(point) { return Math.abs(num(point?.band_pos, 0.5) - 0.5) <= C.MIDLINE_NEAR_BANDPOS_DISTANCE; }

  function purpleRuns(points) {
    const runs = []; let i = 0, runId = 0;
    while (i < points.length) {
      if (points[i]?.color !== 'purple') { i++; continue; }
      const start = i; while (i + 1 < points.length && points[i + 1]?.color === 'purple') i++;
      const end = i; let lowIdx = start;
      for (let j = start + 1; j <= end; j++) if (num(points[j]?.close) < num(points[lowIdx]?.close)) lowIdx = j;
      const p2 = lowIdx > start && points[lowIdx - 1]?.color === 'purple' ? lowIdx - 1 : null;
      runs.push({ run_id: runId++, start, end, length: end - start + 1, low_idx: lowIdx, low_price: num(points[lowIdx]?.close), low_pct: num(points[lowIdx]?.pct), purple2_idx: p2, eligible_purple2: p2 !== null });
      i++;
    }
    return runs;
  }

  function activePurpleRunId(points, runs) {
    if (!runs.length) return null;
    const latest = points.length - 1;
    if (points[latest]?.color === 'purple') {
      for (let i = runs.length - 1; i >= 0; i--) if (runs[i].end === latest) return Number(runs[i].run_id);
    }
    if (points[latest]?.color === 'yellow') {
      const ys = runStart(points, latest);
      for (let i = runs.length - 1; i >= 0; i--) if (runs[i].end < ys) return Number(runs[i].run_id);
    }
    return Number(runs[runs.length - 1].run_id);
  }

  function pointRef(points, idx) {
    if (idx === null || idx === undefined || idx < 0 || idx >= points.length) return null;
    const p = points[idx];
    return { date: p?.date, index: Number(idx), ha_price: round(p?.close, 10), pct_vs_midline: round(p?.pct, 6), band_position: round(p?.band_pos, 6) };
  }

  function runRealLow(points, run) {
    const xs = [];
    for (let i = Number(run?.start || 0); i <= Number(run?.end ?? -1); i++) { const x = finite(points[i]?.real_low); if (x !== null) xs.push(x); }
    return xs.length ? Math.min(...xs) : null;
  }

  function bridgeMetrics(points, leftRun, rightRun) {
    const indices = []; for (let i = Number(leftRun?.low_idx || 0) + 1; i < Number(rightRun?.start || 0); i++) indices.push(i);
    const yellow = indices.filter(i => points[i]?.color === 'yellow');
    let bridgeHighIdx = null;
    yellow.forEach(i => { if (bridgeHighIdx === null || num(points[i]?.close) > num(points[bridgeHighIdx]?.close)) bridgeHighIdx = i; });
    const bridgeHigh = bridgeHighIdx === null ? null : num(points[bridgeHighIdx]?.close);
    let realHigh = null, realHighIdx = null;
    indices.forEach(i => { const x = finite(points[i]?.real_high); if (x !== null && (realHigh === null || x > realHigh)) { realHigh = x; realHighIdx = i; } });
    const lp2i = leftRun?.purple2_idx;
    const lp2 = lp2i === null || lp2i === undefined ? null : num(points[Number(lp2i)]?.close);
    const beats = bridgeHigh !== null && lp2 !== null && bridgeHigh >= lp2;
    return { yellow_indices: yellow, yellow_days: yellow.length, bridge_high_idx: bridgeHighIdx, bridge_high: bridgeHigh, real_bridge_high_idx: realHighIdx, real_bridge_high: realHigh, bridge_beats_left_purple2: beats, bridge_qualified: Boolean(yellow.length && beats) };
  }

  function pairFibMetrics(points, leftRun, rightRun, bridge) {
    const leftLow = num(leftRun?.low_price), rightLow = num(rightRun?.low_price), bh = finite(bridge?.bridge_high);
    let haFib = null; if (bh !== null && bh > leftLow + 1e-18) haFib = (bh - rightLow) / (bh - leftLow);
    const lrl = runRealLow(points, leftRun), rrl = runRealLow(points, rightRun), rbh = finite(bridge?.real_bridge_high);
    let realFib = null; if (lrl !== null && rrl !== null && rbh !== null && rbh > lrl + 1e-18) realFib = (rbh - rrl) / (rbh - lrl);
    const avail = [haFib, realFib].filter(Number.isFinite);
    return { ha_fib_retracement: haFib, real_kline_fib_retracement: realFib, structural_extension_ratio: avail.length ? Math.max(...avail) : null, left_real_low: lrl, right_real_low: rrl };
  }

  function fibRoleZone(v) {
    if (!Number.isFinite(v)) return 'unavailable';
    if (v < 0) return 'above_swing_high';
    if (v <= C.FIB_CUP_RIGHT_MAX) return 'higher_low_R_0_0_618';
    if (v < C.FIB_W_RIGHT_MIN) return 'middle_0_618_1_0_new_L';
    if (v <= C.FIB_W_RIGHT_MAX) return 'W_R_1_0_1_236';
    return 'generation_break_gt_1_236';
  }

  function upwardMidlineGenerationReset(points, leftRun, rightRun, bridge) {
    const li = Number(leftRun?.low_idx || 0), ri = Number(rightRun?.low_idx || 0), bhi = bridge?.bridge_high_idx;
    if (bhi === null || bhi === undefined) return false;
    const lbp = num(points[li]?.band_pos, 0.5), rbp = num(points[ri]?.band_pos, 0.5), hbp = num(points[Number(bhi)]?.band_pos, 0.5);
    return lbp < 0.5 && hbp >= C.STRUCT_UPPER_ZONE_BANDPOS && rbp >= 0.5 && Boolean(bridge?.bridge_qualified);
  }

  function dynamicPurpleStructure(points) {
    let runs = purpleRuns(points);
    const activeId = activePurpleRunId(points, runs);
    if (!runs.length || activeId === null) return { engine_rule:C.PURPLE2_RULE_VERSION, active_purple2:null, anchor_side:null, anchor_reason:'no_purple_run', anchor_source:'none', fib_retracement:null, self_audit:{integrity_ok:true,violations:[]} };
    let activeRun = runs.find(r => Number(r.run_id) === Number(activeId)) || runs[runs.length - 1];
    const activeIdx = Number(activeRun.run_id);
    runs = runs.filter(r => Number(r.run_id) <= activeIdx);
    const purpleIdx = points.map((p,i)=>p?.color==='purple'?i:null).filter(i=>i!==null);
    let structuralLowIdx = null;
    purpleIdx.forEach(i => { if (structuralLowIdx === null || num(points[i]?.close) < num(points[structuralLowIdx]?.close)) structuralLowIdx = i; });

    function buildP2(chosen, quality) {
      if (!chosen || chosen.purple2_idx === null || chosen.purple2_idx === undefined) return null;
      const p2 = pointRef(points, Number(chosen.purple2_idx));
      if (p2) Object.assign(p2,{reference_quality:quality,purple_run_length:Number(chosen.length||0),anchor_run_id:Number(chosen.run_id??-1)});
      return p2;
    }

    const eligible = runs.filter(r => r.eligible_purple2);
    if (!eligible.length) return { engine_rule:C.PURPLE2_RULE_VERSION, structural_low:pointRef(points,structuralLowIdx), active_swing_low:pointRef(points,Number(activeRun.low_idx||0)), active_purple2:null, anchor_side:null, anchor_source:'none', anchor_reason:'no_v_has_own_purple2', fib_retracement:null, self_audit:{integrity_ok:true,violations:[]} };

    let anchor = eligible[0], anchorSide='L', anchorReason='first_valid_v_is_left', relation='single_left_v';
    let lastBridge=null,lastFib=null; const generationResets=[], pairHistory=[];
    for (const curr of eligible.slice(1)) {
      const pairLeftRunId=Number(anchor.run_id??-1);
      const bridge=bridgeMetrics(points,anchor,curr), fibm=pairFibMetrics(points,anchor,curr,bridge);
      const leftBp=num(points[Number(anchor.low_idx||0)]?.band_pos,0.5), rightBp=num(points[Number(curr.low_idx||0)]?.band_pos,0.5);
      const crossMidline = leftBp >= C.STRUCT_UPPER_ZONE_BANDPOS && rightBp <= C.STRUCT_LOWER_ZONE_BANDPOS;
      const extension=fibm.structural_extension_ratio, extensionBreak=Number.isFinite(extension)&&extension>C.FIB_W_GENERATION_MAX;
      const rightLow=num(curr.low_price), leftLow=num(anchor.low_price), haFib=fibm.ha_fib_retracement;
      let decision='keep_left';
      const upward=upwardMidlineGenerationReset(points,anchor,curr,bridge), zone=fibRoleZone(haFib);
      if (crossMidline) { anchor=curr;anchorSide='L';relation='new_generation_midline_break_down';anchorReason='downward_midline_generation_reset_as_new_left';decision='reset_L_midline_down';generationResets.push({run_id:Number(curr.run_id),reason:'midline_break_down'}); }
      else if (upward) { anchor=curr;anchorSide='L';relation='new_generation_midline_break_up';anchorReason='upward_midline_generation_reset_as_new_left';decision='reset_L_midline_up';generationResets.push({run_id:Number(curr.run_id),reason:'midline_break_up'}); }
      else if (extensionBreak) { anchor=curr;anchorSide='L';relation='new_generation_beyond_1_236';anchorReason='right_leg_beyond_1_236_reset_as_new_left';decision='reset_L_1.236';generationResets.push({run_id:Number(curr.run_id),reason:'fib_gt_1_236'}); }
      else if (!bridge.bridge_qualified) {
        if (rightLow < leftLow) { anchor=curr;anchorSide='L';relation='downtrend_continuation_new_left';anchorReason='bridge_failed_purple2_and_new_low_reset_left';decision='reset_L_failed_bridge'; }
        else { anchorSide='L';relation='unqualified_bridge_keep_left';anchorReason='bridge_did_not_beat_left_purple2_keep_left';decision='keep_L_failed_bridge'; }
      } else if (zone==='higher_low_R_0_0_618') { anchor=curr;anchorSide='R';relation='higher_low_right_v';anchorReason='valid_higher_low_right_v_fib_0_to_0_618';decision='use_R_higher_low_0.0_0.618'; }
      else if (zone==='W_R_1_0_1_236') { anchor=curr;anchorSide='R';relation='w_right_v_1_0_to_1_236';anchorReason='valid_w_right_v_fib_1_0_to_1_236';decision='use_R_W_1.0_1.236'; }
      else { anchor=curr;anchorSide='L';relation=zone;anchorReason=`fib_zone_${zone}_reset_as_new_left`;decision='reset_L_non_R_fib_zone'; }
      pairHistory.push({from_run_id:pairLeftRunId,candidate_run_id:Number(curr.run_id??-1),decision,upward_midline_generation_reset:Boolean(upward),fib_role_zone:zone,bridge_yellow_days:Number(bridge.yellow_days||0),bridge_beats_left_purple2:Boolean(bridge.bridge_beats_left_purple2),ha_fib_retracement:round(fibm.ha_fib_retracement,6),real_kline_fib_retracement:round(fibm.real_kline_fib_retracement,6),structural_extension_ratio:round(extension,6)});
      lastBridge=bridge;lastFib=fibm;
    }
    if (Number(activeRun.run_id??-1)!==Number(anchor.run_id??-1) && !activeRun.eligible_purple2) { anchorSide='L';relation='active_right_has_no_own_purple2';anchorReason='active_right_has_no_own_purple2_fallback_anchor'; }
    const p2=buildP2(anchor,'dynamic_purple2_v5'), activeIsAnchor=Number(anchor.run_id??-1)===Number(activeRun.run_id??-1);
    const violations=[];
    if (anchorSide==='R') {
      if (!anchor.eligible_purple2) violations.push('R_without_own_purple2');
      if (lastFib && Number.isFinite(lastFib.structural_extension_ratio) && lastFib.structural_extension_ratio>C.FIB_W_GENERATION_MAX) violations.push('R_beyond_1_236');
      if (lastBridge && !lastBridge.bridge_qualified) violations.push('R_without_qualified_bridge');
      const role=fibRoleZone(lastFib?lastFib.ha_fib_retracement:null); if (!['higher_low_R_0_0_618','W_R_1_0_1_236'].includes(role)) violations.push('R_outside_allowed_fib_windows');
    }
    if (violations.length) { anchorSide='L';relation='self_audit_forced_left';anchorReason='self_audit_violation_forced_left'; }
    const haFib=lastFib?.ha_fib_retracement ?? null, realFib=lastFib?.real_kline_fib_retracement ?? null, extension=lastFib?.structural_extension_ratio ?? null;
    return {
      engine_rule:C.PURPLE2_RULE_VERSION,structural_low:pointRef(points,structuralLowIdx),left_structural_v_low:pointRef(points,Number(eligible[0].low_idx||0)),active_swing_low:pointRef(points,Number(activeRun.low_idx||0)),anchor_low:pointRef(points,Number(anchor.low_idx||0)),active_purple2:p2,
      anchor_side:anchorSide,anchor_source:activeIsAnchor?'active_generation_anchor':'prior_generation_anchor',anchor_reason:anchorReason,active_right_run_id:Number(activeRun.run_id??-1),active_right_purple_count:Number(activeRun.length||0),active_right_has_own_purple2:Boolean(activeRun.eligible_purple2),low_relation:relation,
      fib_retracement:round(haFib,6),ha_fib_retracement:round(haFib,6),real_kline_fib_retracement:round(realFib,6),structural_extension_ratio:round(extension,6),fib_zone:fibRoleZone(haFib),bridge_yellow_days:lastBridge?Number(lastBridge.yellow_days||0):0,bridge_high_price:lastBridge?round(lastBridge.bridge_high,10):null,bridge_high_index:lastBridge?.bridge_high_idx??null,bridge_beats_left_purple2:Boolean(lastBridge?.bridge_beats_left_purple2),left_run_id:Number(eligible[0].run_id??-1),right_run_id:eligible.length>1?Number(activeRun.run_id??-1):null,generation_resets:generationResets,pair_history:pairHistory,self_audit:{integrity_ok:!violations.length,violations},all_purple_runs:runs.map(x=>({run_id:Number(x.run_id),start:Number(x.start),end:Number(x.end),length:Number(x.length),low:pointRef(points,Number(x.low_idx)),purple2:pointRef(points,x.purple2_idx),real_low:round(runRealLow(points,x),10)}))
    };
  }

  function belowMidlineBaseQuality(points) {
    if (!points.length) return {qualified:false,shape:'none',reason:'no_points'};
    const candidates=purpleRuns(points).filter(run=>{const i=Number(run.low_idx??run.start??0);return i>=0&&i<points.length&&num(points[i]?.band_pos,0.5)<0.5;});
    if (candidates.length<2) return {qualified:false,shape:'single_leg',reason:'only_one_below_midline_valley'};
    const active=candidates[candidates.length-1];
    for (let z=candidates.length-2;z>=0;z--) {
      const prev=candidates[z], bridgePoints=points.slice(Number(prev.end)+1,Number(active.start)), yellow=bridgePoints.filter(x=>x.color==='yellow');
      if (!yellow.length) continue;
      const li=Number(prev.low_idx),ri=Number(active.low_idx),leftLow=num(points[li]?.close),rightLow=num(points[ri]?.close);
      let highPoint=yellow[0];yellow.forEach(x=>{if(num(x.close)>num(highPoint.close)) highPoint=x;});
      const bridgeHigh=num(highPoint.close); if(bridgeHigh<=Math.max(leftLow,rightLow))continue;
      const den=bridgeHigh-leftLow;if(den<=1e-18)continue;const fib=(bridgeHigh-rightLow)/den;
      const leftBp=num(points[li]?.band_pos,0.5),rightBp=num(points[ri]?.band_pos,0.5),peak=Math.max(...yellow.map(x=>num(x.band_pos,0.5))),lift=peak-Math.min(leftBp,rightBp);
      if(lift<C.BASE_BRIDGE_MIN_BANDPOS_LIFT)continue;if(fib<0||fib>C.FIB_W_GENERATION_MAX)continue;
      const shape=fib<=0.618?'higher_low_or_cup':fib<1?'raised_or_deep_second_leg':fib<=1.08?'double_bottom':'w_slight_undercut';
      return {qualified:true,shape,reason:'multi_leg_bottom_structure',left_low:pointRef(points,li),right_low:pointRef(points,ri),bridge_high:pointRef(points,Number(highPoint.index||0)),bridge_yellow_days:yellow.length,bridge_lift_bandpos:round(lift,6),fib_retracement:round(fib,6),right_low_above_left:rightLow>leftLow};
    }
    return {qualified:false,shape:'single_leg',reason:'no_valid_second_leg'};
  }

  function colorRuns(points,color,endIdx=null){if(!points.length)return[];const last=endIdx===null?points.length-1:Math.min(Number(endIdx),points.length-1),runs=[];let i=0;while(i<=last){if(points[i]?.color!==color){i++;continue;}let j=i;while(j+1<=last&&points[j+1]?.color===color)j++;runs.push({start:i,end:j,length:j-i+1});i=j+1;}return runs;}
  function purple2FromRun(points,pStart,pEnd){pStart=Number(pStart);pEnd=Number(pEnd);if(pStart<0||pEnd<pStart||pEnd>=points.length)return{qualified:false,reason:'invalid_purple_run'};let low=pStart;for(let i=pStart+1;i<=pEnd;i++)if(num(points[i]?.close)<num(points[low]?.close))low=i;const p2i=low>pStart&&points[low-1]?.color==='purple'?low-1:null,p2=p2i===null?null:pointRef(points,p2i);if(p2)Object.assign(p2,{reference_quality:'state_scoped_purple2',purple_run_length:pEnd-pStart+1,anchor_run_id:-2});return{qualified:Boolean(p2),purple_start:pStart,purple_end:pEnd,purple_run_length:pEnd-pStart+1,purple_low_index:low,purple_low:pointRef(points,low),purple2:p2};}
  function yellowRunWave1Candidate(points,ys,ye){const run=points.slice(ys,ye+1);if(!run.length)return{qualified:false};const before=ys>0?num(points[ys-1]?.band_pos,0.5):0.5,minPos=Math.min(...run.map(p=>num(p.band_pos,0.5))),peak=Math.max(...run.map(p=>num(p.band_pos,0.5)));const origin=minPos<0.5||before<0.5,inferred=!origin&&run.length>=2&&peak>=0.85,cross=run.some(p=>num(p.band_pos,0.5)>=0.5),qualified=cross&&((origin&&peak>=C.S2_FIRST_WAVE_PEAK_MIN_BANDPOS)||inferred);return{qualified,yellow_start:ys,yellow_end:ye,yellow_days:run.length,originated_from_below:origin,inferred_visible_wave:inferred,before_yellow_band_position:round(before,6),yellow_min_band_position:round(minPos,6),peak_band_position:round(peak,6)};}
  function findWave1Before(points,beforeIdx){if(beforeIdx<0)return{qualified:false};const runs=colorRuns(points,'yellow',beforeIdx);for(let i=runs.length-1;i>=0;i--){const c=yellowRunWave1Candidate(points,runs[i].start,runs[i].end);if(c.qualified)return c;}return{qualified:false};}

  function wave2PullbackContext(points,yellowStart=null){
    if(!points.length)return{qualified:false};let pEnd,pStart,live;
    if(yellowStart===null){pEnd=points.length-1;if(points[pEnd]?.color!=='purple')return{qualified:false};pStart=runStart(points,pEnd);live=true;}
    else{pEnd=Number(yellowStart)-1;if(pEnd<0||points[pEnd]?.color!=='purple')return{qualified:false};pStart=runStart(points,pEnd);live=false;}
    const pctx=purple2FromRun(points,pStart,pEnd),wave1=findWave1Before(points,pStart-1);if(!wave1.qualified)return{...pctx,qualified:false,reason:'no_valid_first_wave_before_pullback'};
    const w1End=Number(wave1.yellow_end??-1),cycle=points.slice(w1End+1,pEnd+1),cycleMin=cycle.length?Math.min(...cycle.map(p=>num(p.band_pos,0.5))):0.5,purpleMin=Math.min(...points.slice(pStart,pEnd+1).map(p=>num(p.band_pos,0.5))),endPos=num(points[pEnd]?.band_pos,0.5);
    const intact=cycleMin>=C.S2_BREAKDOWN_FLOOR_BANDPOS,qualified=live?(intact&&endPos>=0.5&&endPos<=C.S2_ACTIVE_MAX_BANDPOS):(intact&&Number(pctx.purple_run_length||0)>=2);
    const phase=endPos>C.MIDLINE_SWEET_UPPER_BANDPOS?'early_upper_pullback':endPos>=0.5?'midline_retest_zone':'minor_midline_undercut';
    return{...pctx,qualified,generation_intact:intact,cycle_min_band_position:round(cycleMin,6),pullback_phase:phase,pullback_low_band_position:round(purpleMin,6),pullback_end_band_position:round(endPos,6),first_wave:wave1};
  }

  function yellowRunOriginBelowMidline(points,yellowStart){
    if(yellowStart<=0||points[yellowStart]?.color!=='yellow')return{qualified:false};const pEnd=yellowStart-1;if(points[pEnd]?.color!=='purple')return{qualified:false};const pStart=runStart(points,pEnd),prev=purple2FromRun(points,pStart,pEnd);let p2=prev.purple2,pstruct;
    if(!p2){pstruct=dynamicPurpleStructure(points.slice(0,yellowStart));p2=pstruct.active_purple2;}else pstruct={engine_rule:C.PURPLE2_RULE_VERSION,scope:'immediate_pre_yellow_purple_run',anchor_side:'LOCAL',active_purple2:p2};
    const base=belowMidlineBaseQuality(points.slice(0,yellowStart)),prevLow=Math.min(...points.slice(pStart,pEnd+1).map(p=>num(p.band_pos,0.5)));
    if(prevLow>=0.5)return{qualified:false,reason:'current_yellow_did_not_originate_from_below_midline',purple_structure:pstruct,purple2:p2,base_quality:base};
    if(!p2)return{qualified:false,reason:'no_purple2',purple_structure:pstruct,base_quality:base};
    const ref=num(p2.ha_price);let trigger=null,cross=null;
    for(let i=yellowStart;i<points.length;i++){if(points[i]?.color!=='yellow')break;const bp=num(points[i]?.band_pos,0.5);if(trigger===null&&num(points[i]?.close)>=ref)trigger=i;if(cross===null&&bp>=0.5)cross=i;}
    if(trigger===null||cross===null)return{qualified:false,reason:'yellow_run_has_not_completed_p2_and_midline_cross',purple_structure:pstruct,purple2:p2,base_quality:base,trigger_index:trigger,cross_index:cross};
    const prefix=points.slice(0,trigger+1),mid=prefix.length>=5?midlineRegime(prefix):midlineRegime(points),origin=['rising','flat','flattening'].includes(mid.state)||base.qualified?'S0.5':'S0';
    return{qualified:true,trigger_index:trigger,cross_index:cross,origin_state:origin,origin_midline:mid,base_quality:base,purple_structure:pstruct,purple2:p2};
  }

  function p2WithGap(points,p2){if(!p2||!points.length)return[p2,false,null,null];const latest=points[points.length-1],ref=num(p2.ha_price),refPct=num(p2.pct_vs_midline);const gap=Math.abs(ref)>1e-18?(num(latest.close)-ref)/Math.abs(ref)*100:null,gapRel=num(latest.pct)-refPct,passed=Number.isFinite(gap)&&gap>=0;return[{...p2,current_gap_price_pct:round(gap,6),current_gap_relative_points:round(gapRel,6),passed_by_actual_ha_price:passed,passed_by_midline_relative_pct:gapRel>=0},passed,gap,gapRel];}

  function buildLongOpportunity(record){
    const points=opportunityPoints(record);if(points.length<6)return{market_state_id:'OTHER',market_state_name:'資料不足',midline:{state:'unknown',symbol:'?',label:'未知'},current:{},structure_state:'30日幾何資料不足'};
    const latest=points[points.length-1],latestIdx=points.length-1,latestColor=String(latest.color||'unknown'),latestPos=num(latest.band_pos,0.5),latestPct=num(latest.pct),below=latestPos<0.5,mid=midlineRegime(points),currentStart=runStart(points,latestIdx),runLength=latestIdx-currentStart+1;
    let state='OTHER',name='其他｜略過',order=99,structure='目前不是快速機會',purple2=null,pstruct={},trigger=null,consumed=false;
    if(latestColor==='yellow'){
      const w=wave2PullbackContext(points,currentStart);if(w.qualified){let local=w.purple2;let pass;[local,pass]=p2WithGap(points,local);if(local){const ref=num(local.ha_price);for(let i=currentStart;i<=latestIdx;i++)if(points[i]?.color==='yellow'&&num(points[i]?.close)>=ref){trigger=i;break;}if(pass&&latestPos>=0.5){consumed=true;if(latestPos<=C.S3_ACTIVE_MAX_BANDPOS){state='S3';name='3浪啟動';order=0;structure='2浪回踩完成｜轉黃勝 Purple-2';purple2=local;pstruct={engine_rule:C.PURPLE2_RULE_VERSION,scope:'wave2_pullback_only',anchor_side:'S2',active_purple2:local,wave2_pullback:w};}else{structure='S3 已發動但已走到上軌側｜不追';purple2=local;}}else if(!pass&&latestPos>=0.5){consumed=true;state='S2';name='2浪回踩';order=2;structure='2浪已轉黃｜等待勝 Purple-2';purple2=local;pstruct={engine_rule:C.PURPLE2_RULE_VERSION,scope:'wave2_pullback_only',anchor_side:'S2',active_purple2:local,wave2_pullback:w};}}}
    }
    if(state==='OTHER'&&!consumed&&latestColor==='yellow'&&latestPos>=0.5){const origin=yellowRunOriginBelowMidline(points,currentStart);if(origin.qualified&&origin.cross_index!==null&&origin.cross_index!==undefined){if(latestPos<=C.S1_ACTIVE_MAX_BANDPOS){state='S1';name='1浪突破';order=2;structure=`${origin.origin_state||'S0'} → 黃階自然突破中軌`;[purple2]=p2WithGap(points,origin.purple2);pstruct={...(origin.purple_structure||{}),active_purple2:purple2,scope:'state0_origin_for_state1',origin_base_quality:origin.base_quality};trigger=origin.trigger_index;}else structure='1浪已離開中軌甜蜜區｜等待2浪';}}
    if(state==='OTHER'&&latestColor==='purple'){const w=wave2PullbackContext(points,null);if(w.qualified){state='S2';name='2浪回踩';order=2;structure='中軌上紫色回踩｜等待轉黃';pstruct={engine_rule:C.PURPLE2_RULE_VERSION,scope:'wave2_live_no_purple2_until_yellow',active_purple2:null,wave2_pullback:w};}}
    if(state==='OTHER'&&latestColor==='yellow'&&below){const prefix=points.slice(0,currentStart),ps=dynamicPurpleStructure(prefix);let dp2=ps.active_purple2,pass;[dp2,pass]=p2WithGap(points,dp2);if(dp2&&pass){const ref=num(dp2.ha_price),ri=Number(dp2.index||0);for(let i=Math.max(ri+1,currentStart);i<=latestIdx;i++)if(points[i]?.color==='yellow'&&num(points[i]?.close)>=ref){trigger=i;break;}if(trigger!==null){purple2=dp2;pstruct={...ps,active_purple2:dp2,scope:'below_midline_state0'};const base=belowMidlineBaseQuality(prefix);pstruct.base_quality=base;if(['rising','flat','flattening'].includes(mid.state)||base.qualified){state='S0.5';name='優質反轉';order=1;structure=base.qualified?'中軌下勝 Purple-2｜底部已有第二隻腳':'中軌下勝 Purple-2｜中軌平緩/改善';}else{state='S0';name='下殺反彈';order=3;structure='中軌下勝 Purple-2｜單邊紫下殺後反彈';}}}}
    if(purple2)[purple2]=p2WithGap(points,purple2);
    return{market_state_id:state,market_state_name:name,market_state_order:order,structure_state:structure,midline:mid,current:{ha_color:latestColor,ha_price:round(latest.close,10),ha_vs_midline_pct:round(latestPct),ha_band_position:round(latestPos),near_midline:nearMidline(latest),current_color_run_length:runLength},purple2_reference:purple2,purple_structure:pstruct,trigger_index:trigger};
  }

  function analyze(dailyRows, fourHRows=[]) {
    const daily=normalizeKlines(dailyRows);if(!daily.length)return null;const chart=buildChart30d(daily),opp=buildLongOpportunity({chart_30d:chart});const latest=daily[daily.length-1],ha=calculateHeikinAshi(daily),cci=calculateCciSma(daily),latestHa=ha[ha.length-1],latestCci=cci[cci.length-1]||{};
    return {price:latest.close,day_open:latest.open,day_change_pct:latest.open?((latest.close-latest.open)/latest.open*100):0,s_state:opp.market_state_id,midline:opp.midline,average_k:latestHa.close>latestHa.open?'yellow':latestHa.close<latestHa.open?'purple':'gray',cci_sma:latestCci.smoothing_color||'gray',cci:latestCci.cci,cci_sma_value:latestCci.smoothing_ma,chart_30d:chart,opportunity_long:opp};
  }

  function updateLiveCandle(rows, price, ts=Date.now(), interval='1D') {
    const data=normalizeKlines(rows).map(x=>({...x}));if(!data.length||!Number.isFinite(Number(price)))return data;const p=Number(price),bucket=interval==='4H'?4*3600000:86400000,start=Math.floor(Number(ts)/bucket)*bucket;
    let last=data[data.length-1];
    if(last.time<start){data.push({time:start,open:p,high:p,low:p,close:p,volume:0});}
    else{last.high=Math.max(last.high,p);last.low=Math.min(last.low,p);last.close=p;}
    return data;
  }

  return { constants:C,normalizeKlines,calculateHeikinAshi,rollingBollinger,calculateCciSma,buildChart30d,midlineRegime,buildLongOpportunity,analyze,updateLiveCandle };
});
