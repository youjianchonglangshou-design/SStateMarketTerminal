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

export async function getPionexContracts(args = {}, { getJSON, monitorOrigin } = {}) {
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
    if (!monitorOrigin) throw Error('Both official Pionex API and monitor R2 fallback unavailable: ' + warnings.join('; '));
    try {
      const payload = await getJSON(monitorOrigin.replace(/\/$/, '') + '/api/monitor/symbols');
      if (!Array.isArray(payload?.symbols) || payload.symbols.length === 0) throw Error('monitor returned empty universe');
      for (const t of types) {
        const typeRows = payload.symbols.filter(row => String(row.type || '').toUpperCase() === t);
        if (!typeRows.length) throw Error(`monitor lacks ${t} symbols`);
        rows.push(...cleanRows(typeRows, t));
      }
      source = 'SSTATE_MONITOR_R2';
      fetchedAt = payload.fetched_at || null;
      partial = payload.partial === true || !fetchedAt;
      if (partial) warnings.push('Monitor symbols are a partial fallback; cannot guarantee complete listing');
      if (fetchedAt && Date.now() - Date.parse(fetchedAt) > 8 * 60 * 60 * 1000) warnings.push('Monitor symbols cache is more than 8 hours old');
    } catch (e) {
      throw Error('Both official Pionex API and monitor R2 fallback unavailable: ' + warnings.join('; ') + '; monitor: ' + String(e.message || e));
    }
  }
  const unique = [...new Map(rows.map(row => [row.type + ':' + row.symbol, row])).values()];
  unique.sort((a, b) => a.symbol.localeCompare(b.symbol) || a.type.localeCompare(b.type));
  const matched = query ? unique.filter(row => row.symbol.includes(query) || row.base.includes(query)) : unique;
  const results = matched.slice(offset, limit === null ? undefined : offset + limit);
  return {
    type, quote: 'USDT', total: unique.length, matched_total: matched.length,
    returned: results.length, offset, has_more: offset + results.length < matched.length,
    partial, source, fetched_at: fetchedAt, api_timestamp: apiTimestamp,
    symbols: results, warnings,
    source_note: source === 'PIONEX_OFFICIAL_API'
      ? 'Official Pionex publicly listed active USDT symbols at request time.'
      : 'Shared monitor universe cached in R2, not a live official API confirmation.'
  };
}
