/**
 * Read-only Pionex PERP/SPOT contract universe.
 * Reuses the monitor's R2 symbols endpoint when the official public API is blocked.
 * This module never manufactures a complete list from a seed/watchlist.
 */
const OFFICIAL_URL = 'https://api.pionex.com/api/v1/common/symbols';

function normalizeRow(row, type) {
  if (!row || typeof row !== 'object' || row.active === false || row.enable === false) return null;
  let symbol = String(row.symbol || '').trim().toUpperCase();
  if (!/^[A-Z0-9._-]{3,80}$/.test(symbol)) return null;
  const inferredType = symbol.endsWith('_PERP') ? 'PERP' : 'SPOT';
  if (inferredType !== type) return null;
  const status = String(row.status || row.contract_status || '').trim().toUpperCase();
  if (status && !['TRADING', 'ACTIVE', 'ONLINE'].includes(status)) return null;
  const quote = String(row.quote || row.quoteCurrency || row.quote_currency || (symbol.match(/_([A-Z0-9]+)(?:_PERP)?$/)?.[1] || '')).toUpperCase();
  if (quote !== 'USDT') return null;
  const base = String(row.base || row.baseCurrency || row.base_currency || symbol.replace(/_USDT(?:_PERP)?$/, '')).trim().toUpperCase();
  if (!base) return null;
  return { symbol, type, base, quote: 'USDT' };
}

function cleanRows(rows, type) {
  if (!Array.isArray(rows)) throw Error(`Pionex ${type} symbols payload is not an array`);
  const output = new Map();
  for (const row of rows) {
    const normalized = normalizeRow(row, type);
    if (normalized) output.set(normalized.symbol, normalized);
  }
  if (!output.size) throw Error(`Pionex ${type} has no active USDT symbols`);
  return [...output.values()];
}


const R2_UNIVERSE_KEY = 'pionex/cache/monitor_universe.json';
const TV_SCAN_URL = 'https://scanner.tradingview.com/crypto/scan';

async function loadR2Universe(bucket) {
  if (!bucket || typeof bucket.get !== 'function') throw Error('R2 JSON_BUCKET binding unavailable');
  const object = await bucket.get(R2_UNIVERSE_KEY);
  if (!object) throw Error('R2 universe object is missing: ' + R2_UNIVERSE_KEY);
  const payload = JSON.parse(await object.text());
  if (!Array.isArray(payload?.symbols) || payload.symbols.length === 0) throw Error('R2 universe is empty or invalid');
  return payload;
}

async function loadTradingViewPionexPerps(getJSON) {
  const body = {
    filter: [{ left: 'exchange', operation: 'equal', right: 'PIONEX' }],
    options: { lang: 'en' },
    symbols: { query: { types: [] }, tickers: [] },
    columns: ['name', 'close'],
    range: [0, 5000]
  };
  const payload = await getJSON(TV_SCAN_URL, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!Array.isArray(payload?.data)) throw Error('TradingView screener returned no rows array');
  const rows = [];
  for (const item of payload.data) {
    const ticker = String(item?.s || '').toUpperCase();
    const match = /^PIONEX:([A-Z0-9._-]+)USDT\.P$/.exec(ticker);
    if (!match) continue;
    rows.push({symbol: match[1] + '_USDT_PERP', base: match[1], quote: 'USDT', status: 'TRADING'});
  }
  if (!rows.length) throw Error('TradingView PIONEX USDT perpetual scan is empty');
  return {rows, truncated: Number(payload.totalCount) > payload.data.length};
}

export async function getPionexContracts(args = {}, { getJSON, monitorOrigin, bucket } = {}) {
  if (typeof getJSON !== 'function') throw Error('getJSON is required');
  const type = args.type || 'PERP';
  if (!['PERP', 'SPOT', 'ALL'].includes(type)) throw Error('type must be PERP, SPOT or ALL');
  const query = String(args.query || '').trim().toUpperCase();
  if (query.length > 50 || (query && !/^[A-Z0-9._-]+$/.test(query))) throw Error('invalid query');
  const offset = args.offset === undefined ? 0 : Number(args.offset);
  const limit = args.limit === undefined ? null : Number(args.limit);
  if (!Number.isInteger(offset) || offset < 0 || offset > 20000) throw Error('offset must be 0..20000');
  if (limit !== null && (!Number.isInteger(limit) || limit < 1 || limit > 2000)) throw Error('limit must be 1..2000');
  const types = type === 'ALL' ? ['PERP', 'SPOT'] : [type];
  const warnings = [];
  let rows = [], fetchedAt = null, apiTimestamp = null, source = null, partial = false;

  // Prefer live direct official API, not the monitor's periodically updated R2 mirror.
  try {
    for (const t of types) {
      const url = OFFICIAL_URL + `?type=${t}` + (t === 'PERP' ? '&status=TRADING' : '');
      const payload = await getJSON(url);
      if (payload?.result !== true || !Array.isArray(payload?.data?.symbols)) throw Error(`Invalid official ${t} response`);
      rows.push(...cleanRows(payload.data.symbols, t));
      if (Number.isFinite(Number(payload.timestamp)) && Number(payload.timestamp) > 1e12) apiTimestamp = new Date(Number(payload.timestamp)).toISOString();
    }
    source = 'PIONEX_OFFICIAL_API';
    fetchedAt = new Date().toISOString();
  } catch (err) {
    warnings.push('Pionex official API unavailable: ' + String(err.message || err));
    rows = [];
    const problems = [];
    const origins = [
      { name: 'SSTATE_R2_DIRECT', read: () => loadR2Universe(bucket) }
    ];
    if (monitorOrigin) origins.push({
      name: 'SSTATE_MONITOR_R2',
      read: () => getJSON(monitorOrigin.replace(/\/$/, '') + '/api/monitor/symbols')
    });
    for (const candidate of origins) {
      try {
        const payload = await candidate.read();
        if (!Array.isArray(payload?.symbols) || !payload.symbols.length) throw Error('empty symbols universe');
        const found = [];
        for (const t of types) {
          const selection = payload.symbols.filter(row => String(row.type || '').toUpperCase() === t);
          if (!selection.length) throw Error('universe lacks ' + t);
          found.push(...cleanRows(selection, t));
        }
        rows = found;
        source = candidate.name;
        fetchedAt = payload.fetched_at || null;
        partial = payload.partial === true || !fetchedAt || String(payload.schema_version || '').includes('fallback');
        if (partial) warnings.push(candidate.name + ': universe is partial or has no verified source timestamp');
        break;
      } catch (e) {
        problems.push(candidate.name + ': ' + String(e.message || e));
      }
    }
    if (!rows.length && type === 'PERP') {
      try {
        const tv = await loadTradingViewPionexPerps(getJSON);
        rows = cleanRows(tv.rows, 'PERP');
        source = 'TRADINGVIEW_PIONEX_SCAN';
        fetchedAt = new Date().toISOString();
        partial = true;
        warnings.push('TradingView discovery is a third-party fallback; it does not prove the complete official Pionex listing'
          + (tv.truncated ? ' (scan page was truncated)' : ''));
      } catch (e) {
        problems.push('TRADINGVIEW_PIONEX_SCAN: ' + String(e.message || e));
      }
    }
    if (!rows.length) throw Error('All Pionex symbol sources unavailable: ' + [...warnings, ...problems].join('; '));
    if (problems.length) warnings.push(...problems);
  }
  const unique = [...new Map(rows.map(row => [row.type + ':' + row.symbol, row])).values()];
  unique.sort((a, b) => a.symbol.localeCompare(b.symbol) || a.type.localeCompare(b.type));
  const matched = query ? unique.filter(row => row.symbol.includes(query) || row.base.includes(query)) : unique;
  const results = matched.slice(offset, limit === null ? undefined : offset + limit);
  return {
    type, quote: 'USDT', total: unique.length, matched_total: matched.length,
    returned: results.length, offset, has_more: offset + results.length < matched.length,
    partial, stale: !!fetchedAt && (!Number.isFinite(Date.parse(fetchedAt)) || Date.now() - Date.parse(fetchedAt) > 8 * 60 * 60 * 1000), source, fetched_at: fetchedAt, api_timestamp: apiTimestamp,
    symbols: results, warnings,
    source_note: source === 'PIONEX_OFFICIAL_API'
      ? 'Official Pionex publicly listed active USDT symbols at request time.'
      : source === 'TRADINGVIEW_PIONEX_SCAN'
        ? 'TradingView PIONEX perpetual ticker discovery; partial third-party coverage, not an official complete listing.'
        : 'Shared monitor universe from R2; complete only as of its fetched_at timestamp, not a live official API confirmation.'
  };
}
