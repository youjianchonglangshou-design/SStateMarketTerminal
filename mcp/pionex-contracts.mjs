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
async function loadR2Universe(bucket){
 if(!bucket||typeof bucket.get!=='function')throw Error('R2 JSON_BUCKET binding unavailable');
 const object=await bucket.get(R2_UNIVERSE_KEY);
 if(!object)throw Error('R2 universe missing: '+R2_UNIVERSE_KEY);
 const data=JSON.parse(await object.text());
 if(!Array.isArray(data?.symbols)||!data.symbols.length)throw Error('R2 universe invalid or empty');
 return data;
}
// A second Pionex-sourced R2 directory covers tokenized US stocks independently
// of the all-contract universe mirror. Do not consult TradingView or other exchanges.
async function loadR2StockUniverse(bucket){
 if(!bucket || typeof bucket.get!=='function')throw Error('R2 JSON_BUCKET binding unavailable');
 const object=await bucket.get('pionex/symbols/us_stock_symbols.json');
 if(!object)throw Error('Pionex US-stock R2 directory missing');
 const payload=JSON.parse(await object.text());
 if(!Array.isArray(payload?.symbols)||!payload?.symbol_map)throw Error('Invalid Pionex US-stock R2 directory');
 const symbols=payload.symbols.map(base=>({symbol:payload.symbol_map[base],base,quote:'USDT',type:'PERP',status:'TRADING'}));
 return {symbols,fetched_at:payload.generated_at,partial:true,schema_version:payload.schema_version};
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
    if(!rows.length && type==='PERP'){
      try{
        const payload=await loadR2StockUniverse(bucket);
        rows=cleanRows(payload.symbols,'PERP');source='PIONEX_US_STOCK_R2_ONLY';fetchedAt=payload.fetched_at||null;partial=true;
        warnings.push('Only Pionex US-stock directory was available; full PERP universe unavailable (partial).');
      }catch(e){problems.push('PIONEX_US_STOCK_R2: '+String(e.message||e));}
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
      : source === 'PIONEX_US_STOCK_R2_ONLY'
        ? 'Pionex-sourced stock directory from R2; partial PERP coverage (stocks only), no other exchange.'
        : 'Shared monitor universe from R2; complete only as of its fetched_at timestamp, not a live official API confirmation.'
  };
}
