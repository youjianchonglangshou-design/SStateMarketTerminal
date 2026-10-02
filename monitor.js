(() => {
  'use strict';

  const cfg = window.SSTATE_CONFIG || {};
  const Engine = window.SStateMonitorEngine;
  const WORKER = String(cfg.workerUrl || '').replace(/\/$/, '');
  const UI_INTERVAL = Number(cfg.monitorUiIntervalMs || 10000);
  const REMOTE_SYNC_INTERVAL = Number(cfg.monitorSyncIntervalMs || 30000);
  const SAVE_DEBOUNCE = Number(cfg.monitorSaveDebounceMs || 3000);
  const TV_SCAN_URL = 'https://scanner.tradingview.com/crypto/scan';
  const TV_SCAN_CHUNK = 200;
  // TradingView Scanner is the primary PERP live source. It exposes current PIONEX close/open/high/low
  // and accepts simple cross-origin POSTs from GitHub Pages without relying on Pionex REST/WebSocket.
  // Pionex/R2 remains the historical warm-up and symbol-universe source.
  // Browser -> Pionex direct WebSocket is rejected with HTTP 403 because browsers always send an Origin header.
  // Route the socket through our Cloudflare Worker; the Worker opens the upstream Pionex socket without a browser Origin.
  const WS_URL = (() => {
    if (!WORKER) return '';
    try {
      const u = new URL(WORKER);
      u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
      u.pathname = '/api/monitor/ws';
      u.search = ''; u.hash = '';
      return u.toString();
    } catch (_) { return ''; }
  })();
  const WS_CHUNK = 100;
  const WS_SUBSCRIBE_GAP_MS = 250; // Pionex limit: max 5 client messages / second / connection.
  const WARM_CONCURRENCY = Math.max(1, Math.min(8, Number(cfg.monitorWarmConcurrency || 4)));
  const WARM_GAP_MS = Math.max(0, Math.min(2000, Number(cfg.monitorWarmGapMs ?? 180)));
  const WARM_START_STAGGER_MS = 60;
  const LOCAL_KEY = 'sstate-monitor-watchlist-v1';
  const CLIENT_KEY = 'sstate-monitor-client-id';

  const $ = (sel) => document.querySelector(sel);
  const els = {
    cryptoBody: $('#crypto-monitor-body'), rwaBody: $('#rwa-monitor-body'),
    cryptoEmpty: $('#crypto-empty'), rwaEmpty: $('#rwa-empty'),
    cryptoTable: $('#crypto-monitor-table'), rwaTable: $('#rwa-monitor-table'),
    cryptoCount: $('#crypto-count'), rwaCount: $('#rwa-count'), add: $('#add-symbol'),
    modal: $('#symbol-modal'), modalClose: $('#modal-close'), query: $('#symbol-query'), results: $('#symbol-results'),
    search: $('#table-search'), clearSort: $('#clear-sort'), refreshAll: $('#refresh-all'),
    r2: $('#r2-status'), ws: $('#ws-status'), save: $('#save-status'), count: $('#symbol-count'), last: $('#last-update'),
    toast: $('#toast')
  };

  const state = {
    items: [], records: new Map(), universe: [], sort: { key: 'order', dir: 'asc' },
    version: 0, remoteUpdatedAt: null, localDirty: false, saveTimer: null, search: '', marketFilter: 'ALL',
    sockets: [], dirtySymbols: new Set(), warming: new Set(), universeLoaded: false, universePartial: false, universeSource: '', lastUiAt: 0,
    tickerPollInFlight: false, tickerPollOkAt: 0, tvLastOkAt: 0, tvLastCount: 0,
    rwaSymbols: new Set(), rwaLoaded: false
  };

  const clientId = (() => {
    let id = localStorage.getItem(CLIENT_KEY);
    if (!id) { id = (crypto.randomUUID ? crypto.randomUUID() : `client-${Date.now()}-${Math.random()}`); localStorage.setItem(CLIENT_KEY, id); }
    return id;
  })();

  function setChip(el, text, cls = '') {
    if (!el) return;
    el.classList.remove('ok', 'bad', 'waiting');
    if (cls) el.classList.add(cls);
    const i = el.querySelector('i');
    el.textContent = text;
    if (i) el.prepend(i);
  }

  function toast(message, isError = false) {
    els.toast.textContent = message;
    els.toast.classList.toggle('error', isError);
    els.toast.classList.remove('hidden');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => els.toast.classList.add('hidden'), 2600);
  }

  async function api(path, options = {}) {
    if (!WORKER) throw new Error('config.js 尚未設定 workerUrl');
    const res = await fetch(`${WORKER}${path}`, {
      cache: 'no-store',
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
    let body = null;
    try { body = await res.json(); } catch (_) {}
    if (!res.ok) throw new Error(body?.message || body?.error || `HTTP ${res.status}`);
    return body;
  }

  function cleanItem(row, fallbackOrder = 0) {
    const symbol = String(row?.symbol || '').trim().toUpperCase();
    if (!symbol) return null;
    const type = String(row?.type || (symbol.endsWith('_PERP') ? 'PERP' : 'SPOT')).toUpperCase() === 'SPOT' ? 'SPOT' : 'PERP';
    return {
      symbol,
      type,
      note: String(row?.note || '').slice(0, 120),
      order: Number.isFinite(Number(row?.order)) ? Number(row.order) : fallbackOrder
    };
  }

  function persistLocal() {
    const payload = { version: state.version, updated_at: state.remoteUpdatedAt, sort: state.sort, items: state.items };
    localStorage.setItem(LOCAL_KEY, JSON.stringify(payload));
  }

  function loadLocal() {
    try {
      const p = JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null');
      if (!p) return false;
      state.items = (p.items || []).map(cleanItem).filter(Boolean);
      state.sort = normalizeSort(p.sort);
      state.version = Number(p.version || 0);
      state.remoteUpdatedAt = p.updated_at || null;
      return state.items.length > 0;
    } catch (_) { return false; }
  }

  function normalizeSort(s) {
    const allowed = new Set(['order','note','symbol','day_change_pct','s_state','midline','average_k','cci_sma']);
    return { key: allowed.has(s?.key) ? s.key : 'order', dir: s?.dir === 'desc' ? 'desc' : 'asc' };
  }

  async function loadRemoteWatchlist(showToast = false) {
    try {
      const p = await api('/api/monitor/watchlist');
      state.items = (p.items || []).map(cleanItem).filter(Boolean);
      state.sort = normalizeSort(p.sort);
      state.version = Number(p.version || 0);
      state.remoteUpdatedAt = p.updated_at || null;
      state.localDirty = false;
      persistLocal();
      setChip(els.r2, `R2 已同步 · v${state.version}`, 'ok');
      if (showToast) toast('已從 R2 重新同步監控清單');
      return true;
    } catch (err) {
      setChip(els.r2, 'R2 暫時離線 · 本機備援', 'bad');
      loadLocal();
      if (showToast) toast(`R2 同步失敗：${err.message}`, true);
      return false;
    }
  }

  function scheduleSave() {
    state.localDirty = true;
    persistLocal();
    setChip(els.save, '自動儲存等待中', 'waiting');
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(saveRemote, SAVE_DEBOUNCE);
  }

  async function saveRemote() {
    if (!state.localDirty) return;
    clearTimeout(state.saveTimer);
    setChip(els.save, '儲存到 R2…', 'waiting');
    try {
      const p = await api('/api/monitor/watchlist', {
        method: 'PUT',
        body: JSON.stringify({ client_id: clientId, version: state.version, items: state.items, sort: state.sort })
      });
      state.version = Number(p.version || state.version + 1);
      state.remoteUpdatedAt = p.updated_at || new Date().toISOString();
      state.localDirty = false;
      persistLocal();
      setChip(els.r2, `R2 已同步 · v${state.version}`, 'ok');
      setChip(els.save, '已自動儲存', 'ok');
    } catch (err) {
      setChip(els.save, 'R2 儲存失敗 · 已留本機', 'bad');
      toast(`自動儲存失敗：${err.message}`, true);
    }
  }

  async function remoteVersionSync() {
    if (state.localDirty) return;
    try {
      const p = await api('/api/monitor/watchlist');
      const v = Number(p.version || 0);
      setChip(els.r2, `R2 已同步 · v${v}`, 'ok');
      if (v > state.version) {
        state.items = (p.items || []).map(cleanItem).filter(Boolean);
        state.sort = normalizeSort(p.sort);
        state.version = v;
        state.remoteUpdatedAt = p.updated_at || null;
        persistLocal();
        if (!state.rwaLoaded) await loadRwaUniverse();
        reconcileRecords();
        renderAll();
        // New symbols from another computer must warm their historical K first.
        // Otherwise the first TradingView snapshot arrives before r.daily exists and gets discarded.
        await warmMissing();
        await pollTickers();
        toast('偵測到另一台電腦的變更，已同步');
      }
    } catch (_) {
      setChip(els.r2, 'R2 暫時離線 · 本機運作中', 'bad');
    }
  }

  const RWA_FALLBACK_BASES = new Set([
    'AAPLX','TSLAX','INTCX','MSTRX','NVDAX','CRCLX','COINX','HOODX','AMZNX','GOOGLX','CRMX','MUX','EWYX','AMDX','MRVLX','SKHX','SMSN','HYUNDAI','NOWX','METAX','NFLXX','XAG','XAU','XPD','XPT','COPPER','NATGAS','WTI','SP500','NAS100','EURUSD','GBPUSD','USDJPY','ANTHROPIC','OPENAI','SPCX','ORCLX','AVGOX','SNDKX','FETUSDT'
  ]);

  async function loadRwaUniverse() {
    state.rwaSymbols = new Set([...RWA_FALLBACK_BASES].map(x => `${x}_USDT_PERP`));
    try {
      const p = await api('/api/symbols/us-stock');
      for (const base of (p?.symbols || [])) {
        const b = String(base || '').trim().toUpperCase();
        if (b) state.rwaSymbols.add(`${b}_USDT_PERP`);
      }
      for (const value of Object.values(p?.symbol_map || {})) {
        const sym = String(value || '').trim().toUpperCase();
        if (sym) state.rwaSymbols.add(sym);
      }
      for (const row of (p?.active || [])) {
        const sym = String(row?.api_symbol || '').trim().toUpperCase();
        if (sym) state.rwaSymbols.add(sym);
      }
      state.rwaLoaded = true;
    } catch (_) {
      state.rwaLoaded = false;
    }
  }

  function displaySymbol(item) {
    return item.symbol.replace(/_USDT_PERP$/, '').replace(/_USDT$/, '');
  }

  function isRwaItem(item) {
    if (!item) return false;
    const sym = String(item.symbol || '').toUpperCase();
    const base = displaySymbol(item).toUpperCase();
    return state.rwaSymbols.has(sym) || RWA_FALLBACK_BASES.has(base);
  }

  function targetBody(item) { return isRwaItem(item) ? els.rwaBody : els.cryptoBody; }

  function recordFor(item) {
    let r = state.records.get(item.symbol);
    if (!r) {
      r = { item, daily: [], analysis: null, status: 'loading', lastPrice: null, previousPrice: null, lastTradeTs: 0, source: '' };
      state.records.set(item.symbol, r);
    }
    r.item = item;
    return r;
  }

  function reconcileRecords() {
    const keep = new Set(state.items.map(x => x.symbol));
    for (const key of [...state.records.keys()]) if (!keep.has(key)) state.records.delete(key);
    for (const item of state.items) recordFor(item);
  }

  function rowHtml(item) {
    const sym = escapeHtml(displaySymbol(item));
    const market = item.type === 'SPOT' ? 'SPOT' : 'PERP';
    return `<tr data-symbol="${escapeHtml(item.symbol)}">
      <td class="cell-order"><button class="row-remove" type="button" title="移除標的">×</button><span data-field="order"></span></td>
      <td class="note-cell" data-field="note" title="雙擊編輯備註">${escapeHtml(item.note)}</td>
      <td class="symbol-cell"><span class="symbol-main">${sym}</span><span class="market-tag ${market.toLowerCase()}">${market}</span></td>
      <td class="price-cell loading" data-field="price">載入中…</td>
      <td data-field="s_state"><span class="state-pill state-other">…</span></td>
      <td class="loading" data-field="midline">…</td>
      <td class="loading" data-field="average_k">…</td>
      <td class="loading" data-field="cci_sma">…</td>
    </tr>`;
  }

  function ensureRow(item) {
    let tr = document.querySelector(`tr[data-symbol="${cssEscape(item.symbol)}"]`);
    const body = targetBody(item);
    if (!tr) {
      body.insertAdjacentHTML('beforeend', rowHtml(item));
      tr = body.querySelector(`tr[data-symbol="${cssEscape(item.symbol)}"]`);
      bindRow(tr, item.symbol);
    } else if (tr.parentElement !== body) {
      body.appendChild(tr);
    }
    return tr;
  }

  function bindRow(tr, symbol) {
    tr.querySelector('.row-remove')?.addEventListener('click', () => removeSymbol(symbol));
    const note = tr.querySelector('[data-field="note"]');
    note?.addEventListener('dblclick', () => { note.contentEditable = 'true'; note.focus(); selectAll(note); });
    note?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); note.blur(); } if (e.key === 'Escape') { e.preventDefault(); note.textContent = recordFor(state.items.find(x=>x.symbol===symbol)||{}).item.note || ''; note.blur(); } });
    note?.addEventListener('blur', () => {
      if (note.contentEditable !== 'true') return;
      note.contentEditable = 'false';
      const item = state.items.find(x => x.symbol === symbol);
      if (!item) return;
      const next = String(note.textContent || '').trim().slice(0, 120);
      if (item.note !== next) { item.note = next; scheduleSave(); }
      note.textContent = item.note;
    });
  }

  function selectAll(el) {
    const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  }

  function formatPrice(v) {
    const n = Number(v); if (!Number.isFinite(n)) return '—';
    if (Math.abs(n) >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
    if (Math.abs(n) >= 100) return n.toFixed(2);
    if (Math.abs(n) >= 1) return n.toFixed(4).replace(/0+$/,'').replace(/\.$/,'');
    if (Math.abs(n) >= .01) return n.toFixed(5).replace(/0+$/,'').replace(/\.$/,'');
    return n.toFixed(8).replace(/0+$/,'').replace(/\.$/,'');
  }

  function stateClass(s) {
    const k = String(s || '').toUpperCase().replace('.','');
    return ({S3:'state-s3',S05:'state-s05',S1:'state-s1',S2:'state-s2',S0:'state-s0'}[k] || 'state-other');
  }

  function midText(mid) {
    const s = mid?.state;
    if (s === 'rising') return ['↑ 上斜','mid-up'];
    if (s === 'flat') return ['→ 平緩','mid-flat'];
    if (s === 'flattening') return ['↘ 下降走平中','mid-flattening'];
    if (s === 'falling') return ['↓ 下斜','mid-down'];
    return ['—','loading'];
  }

  function toneText(v) {
    if (v === 'yellow') return ['黃','tone-yellow'];
    if (v === 'purple') return ['紫','tone-purple'];
    return ['—','tone-gray'];
  }

  function patchRow(record, force = false) {
    const item = record.item;
    const tr = ensureRow(item);
    tr.querySelector('[data-field="note"]').textContent = item.note || '';
    if (record.status === 'error' || record.status === 'waiting') {
      tr.querySelector('[data-field="price"]').className = `price-cell ${record.status === 'error' ? 'error' : 'waiting'}`;
      tr.querySelector('[data-field="price"]').textContent = record.status === 'error' ? '資料讀取失敗' : '等待 K 線快取';
      return;
    }
    if (!record.analysis) return;
    const a = record.analysis;
    const priceCell = tr.querySelector('[data-field="price"]');
    const old = Number(priceCell.dataset.price);
    const pct = Number(a.day_change_pct || 0);
    priceCell.className = `price-cell ${pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat'}`;
    priceCell.innerHTML = `<span class="price">${escapeHtml(formatPrice(a.price))}</span><span class="pct">${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%</span>`;
    priceCell.dataset.price = String(a.price);
    if (!force && Number.isFinite(old) && old !== Number(a.price)) {
      priceCell.classList.remove('cell-flash-up','cell-flash-down'); void priceCell.offsetWidth;
      priceCell.classList.add(Number(a.price) > old ? 'cell-flash-up' : 'cell-flash-down');
    }
    const stateCell = tr.querySelector('[data-field="s_state"]');
    stateCell.innerHTML = `<span class="state-pill ${stateClass(a.s_state)}">${escapeHtml(String(a.s_state || 'OTHER'))}</span>`;
    const [mt,mc] = midText(a.midline); setCell(tr,'midline',mt,mc);
    const [ht,hc] = toneText(a.average_k); setCell(tr,'average_k',ht,hc);
    const [ct,cc] = toneText(a.cci_sma); setCell(tr,'cci_sma',ct,cc);
  }

  function setCell(tr, field, text, cls) {
    const td = tr.querySelector(`[data-field="${field}"]`); td.className = cls; td.textContent = text;
  }

  function renderAll() {
    reconcileRecords();
    const wanted = new Set(state.items.map(x => x.symbol));
    for (const body of [els.cryptoBody, els.rwaBody]) {
      for (const tr of [...body.querySelectorAll('tr[data-symbol]')]) if (!wanted.has(tr.dataset.symbol)) tr.remove();
    }
    state.items.forEach(item => patchRow(recordFor(item), true));
    applyOrderAndFilter();
    updateSummary();
    updateSortMarks();
  }

  function rankState(s) { return ({S3:60,S2:50,S1:40,'S0.5':30,S0:20,OTHER:0}[String(s||'OTHER').toUpperCase()] ?? 0); }
  function rankMid(m) { return ({rising:4,flat:3,flattening:2,falling:1}[m?.state] ?? 0); }
  function rankTone(v) { return ({yellow:2,purple:1,gray:0}[v] ?? 0); }

  function sortValue(item, key) {
    const r = state.records.get(item.symbol), a = r?.analysis;
    if (key === 'order') return Number(item.order || 0);
    if (key === 'note') return item.note || '';
    if (key === 'symbol') return displaySymbol(item);
    if (key === 'day_change_pct') return Number(a?.day_change_pct ?? -Infinity);
    if (key === 's_state') return rankState(a?.s_state);
    if (key === 'midline') return rankMid(a?.midline);
    if (key === 'average_k') return rankTone(a?.average_k);
    if (key === 'cci_sma') return rankTone(a?.cci_sma);
    return 0;
  }

  function sortedItems() {
    const dir = state.sort.dir === 'desc' ? -1 : 1, key = state.sort.key;
    return [...state.items].sort((a,b) => {
      const av=sortValue(a,key), bv=sortValue(b,key);
      if (typeof av === 'string' || typeof bv === 'string') return String(av).localeCompare(String(bv),'zh-Hant') * dir;
      const d = (Number(av) - Number(bv));
      return (Number.isFinite(d) && d !== 0 ? d * dir : Number(a.order||0)-Number(b.order||0));
    });
  }

  function applyOrderAndFilter() {
    const q = state.search.trim().toUpperCase();
    const rows = sortedItems();
    const crypto = rows.filter(x => !isRwaItem(x));
    const rwa = rows.filter(isRwaItem);
    const place = (items, body) => items.forEach((item, idx) => {
      const tr = ensureRow(item);
      body.appendChild(tr); // move existing nodes only; no table rebuild / no flash
      const visible = !q || displaySymbol(item).toUpperCase().includes(q) || String(item.note||'').toUpperCase().includes(q);
      tr.hidden = !visible;
      tr.querySelector('[data-field="order"]').textContent = String(idx + 1);
    });
    place(crypto, els.cryptoBody);
    place(rwa, els.rwaBody);
    els.cryptoEmpty.classList.toggle('show', crypto.length === 0);
    els.rwaEmpty.classList.toggle('show', rwa.length === 0);
    els.cryptoCount.textContent = String(crypto.length);
    els.rwaCount.textContent = String(rwa.length);
  }

  function updateSortMarks() {
    document.querySelectorAll('th[data-sort]').forEach(th => {
      const span = th.querySelector('.sort-mark');
      span.textContent = th.dataset.sort === state.sort.key ? (state.sort.dir === 'asc' ? '▲' : '▼') : '⇅';
    });
  }

  function updateSummary() {
    const rwa = state.items.filter(isRwaItem).length;
    const crypto = state.items.length - rwa;
    els.count.textContent = `${state.items.length} 標的 · C${crypto}/R${rwa}`;
    if (els.cryptoCount) els.cryptoCount.textContent = String(crypto);
    if (els.rwaCount) els.rwaCount.textContent = String(rwa);
  }

  async function warmSymbol(item, force = false) {
    const r = recordFor(item);
    if (state.warming.has(item.symbol)) return;
    if (!force && r.daily.length >= 40) return;
    state.warming.add(item.symbol); r.status = 'loading'; patchRow(r, true);
    try {
      const p = await api(`/api/monitor/klines?symbol=${encodeURIComponent(item.symbol)}&interval=1D&limit=180`);
      r.daily = Engine.normalizeKlines(p.klines || p.data || []);
      if (r.daily.length < 30) throw new Error(`歷史日K不足：${r.daily.length}`);
      r.analysis = Engine.analyze(r.daily);
      r.lastPrice = r.analysis.price; r.previousPrice = r.analysis.price; r.status = 'ok'; r.source = p.source || '';
      patchRow(r, true);
    } catch (err) {
      r.status = /rate-limit|429|temporarily/i.test(String(err?.message||'')) ? 'waiting' : 'error';
      r.error = err.message; patchRow(r, true);
    } finally { state.warming.delete(item.symbol); }
  }

  async function warmMissing(force = false) {
    const queue = state.items.filter(item => force || (recordFor(item).daily.length < 40 && !state.warming.has(item.symbol)));
    if (!queue.length) return;
    let cursor = 0;
    const workerCount = Math.min(WARM_CONCURRENCY, queue.length);
    const worker = async (workerIndex) => {
      // Stagger the first requests slightly so 4 workers do not hit the Worker/Pionex path on the exact same millisecond.
      if (workerIndex > 0 && WARM_START_STAGGER_MS > 0) await sleep(workerIndex * WARM_START_STAGGER_MS);
      while (cursor < queue.length) {
        const item = queue[cursor++];
        await warmSymbol(item, force);
        // R2-prewarmed klines can be read in parallel. Keep only a short gap as a safety throttle
        // for cache misses that need the Pionex fallback, instead of the old fixed 1100ms per symbol.
        if (cursor < queue.length && WARM_GAP_MS > 0) await sleep(WARM_GAP_MS);
      }
    };
    await Promise.all(Array.from({length: workerCount}, (_, i) => worker(i)));
    applyOrderAndFilter();
  }

  function closeSockets() {
    state.sockets.forEach(x => { try { x.intentional = true; x.ws.close(); } catch (_) {} });
    state.sockets = [];
  }

  function rebuildSockets() {
    // v0.3.06 primary live feed: TradingView Scanner PIONEX PERP snapshot every 10 seconds.
    // This avoids the Pionex REST/WebSocket path that repeatedly stalled in browser/Worker environments.
    closeSockets();
    if (!state.items.length) { setChip(els.ws,'TradingView Scan · 無標的',''); return; }
    setChip(els.ws,'TradingView Scan 連線中','waiting');
    pollTickers();
  }

  function tvTickerFor(item) {
    if (!item || item.type !== 'PERP') return '';
    const base = String(item.symbol || '').replace(/_USDT_PERP$/,'');
    return base ? `PIONEX:${base}USDT.P` : '';
  }

  function applyLiveSnapshot(symbol, snapshot, ts = Date.now()) {
    const r = state.records.get(String(symbol || '').toUpperCase());
    if (!r || !r.daily.length) return false;
    const close = Number(snapshot?.close), open = Number(snapshot?.open), high = Number(snapshot?.high), low = Number(snapshot?.low);
    if (![close,open,high,low].every(Number.isFinite) || close <= 0 || open <= 0 || high <= 0 || low <= 0) return false;
    const stamp = Number.isFinite(Number(ts)) ? Number(ts) : Date.now();
    const dayStart = Math.floor(stamp / 86400000) * 86400000; // TradingView/Pionex crypto daily reset = UTC 00:00 = Taiwan 08:00.
    const data = Engine.normalizeKlines(r.daily).map(x => ({...x}));
    let last = data[data.length - 1];
    const candle = { time: dayStart, open, high: Math.max(high,open,close), low: Math.min(low,open,close), close, volume: Number(last?.time===dayStart ? last.volume || 0 : 0) };
    if (!last || last.time < dayStart) data.push(candle);
    else if (last.time === dayStart) data[data.length - 1] = candle;
    else return false;
    r.lastTradeTs = stamp;
    r.previousPrice = r.lastPrice;
    r.lastPrice = close;
    r.daily = data;
    r.source = 'TRADINGVIEW_PIONEX_SCAN';
    state.dirtySymbols.add(r.item.symbol);
    return true;
  }

  function applyLivePrice(symbol, price, ts = Date.now()) {
    // SPOT fallback only. TradingView's PIONEX crypto scanner currently exposes PIONEX USDT.P PERP rows,
    // not PIONEX spot rows. Keep the existing Worker ticker fallback for SPOT without affecting PERP.
    const r = state.records.get(String(symbol || '').toUpperCase());
    if (!r || !r.daily.length || !Number.isFinite(Number(price)) || Number(price) <= 0) return false;
    const stamp = Number.isFinite(Number(ts)) ? (Number(ts) < 1e12 ? Number(ts) * 1000 : Number(ts)) : Date.now();
    r.lastTradeTs = stamp || Date.now();
    r.previousPrice = r.lastPrice;
    r.lastPrice = Number(price);
    r.daily = Engine.updateLiveCandle(r.daily, Number(price), r.lastTradeTs, '1D');
    r.source = 'PIONEX_SPOT_FALLBACK';
    state.dirtySymbols.add(r.item.symbol);
    return true;
  }

  async function tradingViewScan(items) {
    const rows = items.map(item => ({ item, ticker: tvTickerFor(item) })).filter(x => x.ticker);
    if (!rows.length) return new Map();
    const out = new Map();
    for (let i = 0; i < rows.length; i += TV_SCAN_CHUNK) {
      const chunk = rows.slice(i, i + TV_SCAN_CHUNK);
      const body = {
        filter: [],
        options: { lang: 'en' },
        symbols: { query: { types: [] }, tickers: chunk.map(x => x.ticker) },
        columns: ['name','close','open','high','low'],
        range: [0, Math.max(50, chunk.length + 10)]
      };
      // text/plain keeps this a CORS "simple request"; TradingView accepts the JSON body and returns
      // Access-Control-Allow-Origin for the GitHub Pages origin, avoiding a Content-Type preflight.
      const res = await fetch(TV_SCAN_URL, {
        method: 'POST',
        mode: 'cors',
        cache: 'no-store',
        headers: { 'Accept': 'application/json', 'Content-Type': 'text/plain' },
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error(`TradingView Scanner HTTP ${res.status}`);
      const payload = await res.json();
      const byTv = new Map(chunk.map(x => [x.ticker, x.item.symbol]));
      for (const row of (payload?.data || [])) {
        const tvSymbol = String(row?.s || '').toUpperCase();
        const symbol = byTv.get(tvSymbol);
        const d = row?.d || [];
        if (!symbol || d.length < 5) continue;
        out.set(symbol, { close:Number(d[1]), open:Number(d[2]), high:Number(d[3]), low:Number(d[4]) });
      }
    }
    return out;
  }

  async function pollTickers() {
    if (state.tickerPollInFlight || !state.items.length) return;
    state.tickerPollInFlight = true;
    let tvOk = false, tvCount = 0, spotOk = true, spotCount = 0;
    try {
      const perpItems = state.items.filter(x => x.type !== 'SPOT');
      if (perpItems.length) {
        try {
          const tv = await tradingViewScan(perpItems);
          const now = Date.now();
          for (const item of perpItems) {
            const snap = tv.get(item.symbol);
            if (snap && applyLiveSnapshot(item.symbol, snap, now)) tvCount++;
          }
          tvOk = true;
          state.tvLastOkAt = now;
          state.tvLastCount = tvCount;
        } catch (err) {
          tvOk = false;
          console.warn('TradingView Scanner poll failed', err);
        }
      } else tvOk = true;

      // TradingView PIONEX scanner currently contains only .P perpetual rows. SPOT remains a best-effort fallback.
      const spotItems = state.items.filter(x => x.type === 'SPOT');
      if (spotItems.length) {
        try {
          const p = await api('/api/monitor/tickers?type=SPOT');
          const map = new Map((p.tickers || []).map(t => [String(t.symbol || '').toUpperCase(), t]));
          for (const item of spotItems) {
            const t = map.get(item.symbol);
            if (t && applyLivePrice(item.symbol, Number(t.price), Number(t.time || Date.now()))) spotCount++;
          }
        } catch (err) {
          spotOk = false;
          console.warn('Pionex SPOT fallback poll failed', err);
        }
      }

      flushLive();
      state.tickerPollOkAt = Date.now();
      if (tvOk) {
        const suffix = spotItems.length ? ` · PERP ${tvCount}/${perpItems.length} · SPOT ${spotCount}/${spotItems.length}` : ` · ${tvCount}/${perpItems.length} 標的`;
        setChip(els.ws, `TradingView Scan · 10秒更新${suffix}`, 'ok');
      } else {
        setChip(els.ws, `TradingView Scan 重試中`, 'waiting');
      }
    } finally {
      state.tickerPollInFlight = false;
    }
  }

  async function handleWsMessage(raw) {
    try {
      if (typeof Blob !== 'undefined' && raw instanceof Blob) raw = await raw.text();
      else if (raw instanceof ArrayBuffer) raw = new TextDecoder().decode(raw);
    } catch (_) { return; }
    let m; try { m = JSON.parse(raw); } catch (_) { return; }
    if (String(m?.op || '').toUpperCase() === 'PING') {
      // The Worker proxy already answers the upstream heartbeat. Keep this as a harmless fallback
      // and echo Pionex's timestamp as required by the current WebSocket specification.
      const pong = {op:'PONG'};
      if (Number.isFinite(Number(m?.timestamp))) pong.timestamp = Number(m.timestamp);
      state.sockets.forEach(x => { try { if (x.ws.readyState === WebSocket.OPEN) x.ws.send(JSON.stringify(pong)); } catch (_) {} });
      return;
    }
    if (String(m?.topic || '').toUpperCase() !== 'TRADE') return;
    const symbol = String(m.symbol || '').toUpperCase();
    const r = state.records.get(symbol); if (!r || !r.daily.length) return;
    const trades = Array.isArray(m.data) ? m.data : (m.data ? [m.data] : []);
    if (!trades.length) return;
    const newest = trades.reduce((best,x) => tradeTs(x,m) > tradeTs(best,m) ? x : best, trades[0]);
    const price = tradePrice(newest); if (!Number.isFinite(price) || price <= 0) return;
    const ts = tradeTs(newest,m);
    if (ts && ts < r.lastTradeTs) return;
    applyLivePrice(symbol, price, ts || Date.now());
  }

  function tradePrice(x) {
    for (const k of ['price','p','tradePrice','trade_price']) { const n=Number(x?.[k]); if (Number.isFinite(n)) return n; }
    return NaN;
  }
  function tradeTs(x,m) {
    for (const k of ['timestamp','time','ts','t']) { const n=Number(x?.[k]); if (Number.isFinite(n) && n>0) return n < 1e12 ? n*1000 : n; }
    const n=Number(m?.timestamp); return Number.isFinite(n) ? n : Date.now();
  }

  function flushLive() {
    const dirty = [...state.dirtySymbols]; state.dirtySymbols.clear();
    dirty.forEach(symbol => {
      const r=state.records.get(symbol); if (!r?.daily.length) return;
      try { r.analysis=Engine.analyze(r.daily); r.status='ok'; patchRow(r,false); } catch (_) {}
    });
    if (dirty.length) {
      state.lastUiAt = Date.now();
      els.last.textContent = `最後更新 ${formatTime(state.lastUiAt)} · ${dirty.length} 變動`;
      if (state.sort.key !== 'order' && state.sort.key !== 'note' && state.sort.key !== 'symbol') applyOrderAndFilter();
    }
  }

  function formatTime(ms) { return new Intl.DateTimeFormat('zh-TW',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false,timeZone:'Asia/Taipei'}).format(new Date(ms)); }

  async function loadUniverse(force = false) {
    if (state.universeLoaded && !force) return;
    els.results.innerHTML='<div class="symbol-loading">讀取 Pionex 最新可交易清單...</div>';
    try {
      const p = await api('/api/monitor/symbols');
      state.universe = (p.symbols || []).map(x => ({
        symbol:String(x.symbol||'').toUpperCase(), type:String(x.type||'').toUpperCase(), base:String(x.base||'').toUpperCase(), quote:String(x.quote||'USDT').toUpperCase()
      })).filter(x=>x.symbol && (x.type==='PERP'||x.type==='SPOT'));
      state.universeLoaded = true;
      state.universePartial = Boolean(p.partial);
      state.universeSource = String(p.source || '');
      renderSymbolResults();
    } catch (err) {
      // Dialog must remain usable even when the universe endpoint itself is unavailable.
      state.universe = [];
      state.universeLoaded = true;
      state.universePartial = true;
      state.universeSource = 'offline-manual';
      renderSymbolResults(`清單暫時無法同步：${err.message}`);
    }
  }

  function typedCandidates() {
    const raw=String(els.query.value||'').trim().toUpperCase();
    if(!raw) return [];
    const q=raw.replace(/^PIONEX:/,'').replace(/\.P$/,'').replace(/[^A-Z0-9._\-]/g,'');
    if(!q) return [];
    let base=q.replace(/_USDT_PERP$/,'').replace(/_USDT$/,'');
    if(!base) return [];
    const rows=[];
    if(state.marketFilter==='ALL'||state.marketFilter==='PERP') rows.push({symbol:`${base}_USDT_PERP`,type:'PERP',base,direct:true});
    if(state.marketFilter==='ALL'||state.marketFilter==='SPOT') rows.push({symbol:`${base}_USDT`,type:'SPOT',base,direct:true});
    return rows;
  }

  function renderSymbolResults(errorHint = '') {
    const q=String(els.query.value||'').trim().toUpperCase(); const filter=state.marketFilter;
    const existing=new Set(state.items.map(x=>x.symbol));
    let rows=state.universe.filter(x => (filter==='ALL'||x.type===filter) && (!q || x.symbol.includes(q) || x.base.includes(q))).slice(0,120);
    const known=new Set(rows.map(x=>x.symbol));
    for(const x of typedCandidates()) if(!known.has(x.symbol)){rows.unshift(x);known.add(x.symbol);}
    const notice = errorHint
      ? `<div class="symbol-notice warn">${escapeHtml(errorHint)}。仍可直接輸入幣種並加入，K 線暖機會再驗證。</div>`
      : state.universePartial
        ? `<div class="symbol-notice">目前顯示 R2 尚未完成完整同步時的備援清單；你仍可直接輸入任意 Pionex 幣種加入。</div>`
        : '';
    if(!rows.length){els.results.innerHTML=notice+'<div class="symbol-empty">找不到符合的標的；可直接輸入例如 EIGEN、ETHFI、BTC。</div>';return;}
    els.results.innerHTML=notice+rows.map(x=>{
      const used=existing.has(x.symbol); const label=x.base || displaySymbol(x);
      const direct=x.direct ? '<small>直接加入候選；以 K 線暖機驗證</small>' : `<small>${escapeHtml(x.symbol)}</small>`;
      return `<button class="symbol-option ${used?'already':''}" type="button" data-symbol="${escapeHtml(x.symbol)}" data-type="${x.type}" ${used?'disabled':''}>
        <span><strong>${escapeHtml(label)}</strong>${direct}</span><span class="market-tag ${x.type.toLowerCase()}">${x.type}</span>
      </button>`;
    }).join('');
    els.results.querySelectorAll('.symbol-option:not(.already)').forEach(btn=>btn.addEventListener('click',()=>addSymbol(btn.dataset.symbol,btn.dataset.type)));
  }

  async function addSymbol(symbol, typeHint = '') {
    const meta=state.universe.find(x=>x.symbol===symbol) || {symbol,type:typeHint || (symbol.endsWith('_PERP')?'PERP':'SPOT')};
    if(state.items.some(x=>x.symbol===symbol)) return;
    const item=cleanItem({symbol, type:meta.type, note:'', order:Math.max(0,...state.items.map(x=>Number(x.order)||0))+1});
    state.items.push(item); recordFor(item); scheduleSave(); closeModal(); renderAll();
    // Warm history first, then immediately fetch the current TradingView price/OHLC.
    // This prevents a newly added symbol from showing the stale R2 candle until the next 10s timer.
    await warmSymbol(item,false);
    await pollTickers();
    applyOrderAndFilter();
    const rec=recordFor(item);
    if(rec.status==='error') toast(`${displaySymbol(item)} 暖機失敗：${rec.error || '無法取得 Pionex K 線'}`,true);
  }

  function removeSymbol(symbol) {
    const item=state.items.find(x=>x.symbol===symbol); if(!item) return;
    if(!confirm(`移除 ${displaySymbol(item)}？`)) return;
    state.items=state.items.filter(x=>x.symbol!==symbol); state.records.delete(symbol); state.dirtySymbols.delete(symbol); scheduleSave(); renderAll(); rebuildSockets();
  }

  function openModal() { els.modal.classList.remove('hidden'); els.modal.setAttribute('aria-hidden','false'); els.query.value=''; state.marketFilter='ALL'; updateMarketTabs(); loadUniverse(false); setTimeout(()=>els.query.focus(),30); }
  function closeModal() { els.modal.classList.add('hidden'); els.modal.setAttribute('aria-hidden','true'); }
  function updateMarketTabs(){document.querySelectorAll('[data-market-filter]').forEach(b=>b.classList.toggle('active',b.dataset.marketFilter===state.marketFilter));renderSymbolResults();}

  function bindUi() {
    els.add.addEventListener('click',openModal); els.modalClose.addEventListener('click',closeModal);
    els.modal.addEventListener('click',e=>{if(e.target.dataset.closeModal)closeModal();});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!els.modal.classList.contains('hidden'))closeModal();});
    els.query.addEventListener('input',renderSymbolResults);
    document.querySelectorAll('[data-market-filter]').forEach(b=>b.addEventListener('click',()=>{state.marketFilter=b.dataset.marketFilter;updateMarketTabs();}));
    els.search.addEventListener('input',()=>{state.search=els.search.value;applyOrderAndFilter();});
    document.querySelectorAll('.monitor-table th[data-sort]').forEach(th=>th.addEventListener('click',()=>{
      const key=th.dataset.sort; state.sort = state.sort.key===key ? {key,dir:state.sort.dir==='asc'?'desc':'asc'} : {key,dir:key==='order'||key==='symbol'||key==='note'?'asc':'desc'};
      updateSortMarks(); applyOrderAndFilter(); scheduleSave();
    }));
    els.clearSort.addEventListener('click',()=>{state.sort={key:'order',dir:'asc'};updateSortMarks();applyOrderAndFilter();scheduleSave();});
    els.refreshAll.addEventListener('click',async()=>{
      setChip(els.save,'強制同步中…','waiting'); await loadRemoteWatchlist(true); await loadRwaUniverse(); reconcileRecords(); renderAll(); await loadUniverse(true); await warmMissing(true); await pollTickers(); setChip(els.save,'同步完成','ok');
    });
    window.addEventListener('beforeunload',()=>{persistLocal();closeSockets();});
  }

  async function init() {
    if (!Engine) { toast('monitor-engine.js 載入失敗',true); return; }
    bindUi(); setChip(els.r2,'R2 連線中','waiting'); setChip(els.ws,'TradingView Scan 連線中','waiting');
    await Promise.all([loadRemoteWatchlist(false), loadRwaUniverse()]); reconcileRecords(); renderAll();
    // v0.3.09: RWA classification is loaded before rendering so crypto stays left and tokenized assets stay right.
    // Historical K must be ready before the first live snapshot is applied.
    // In v0.3.07 rebuildSockets() called pollTickers() first, but applyLiveSnapshot() rejects
    // snapshots while r.daily is empty. The UI then showed the cached R2 close until the next 10s poll.
    await warmMissing(false);
    await pollTickers();
    setInterval(pollTickers,UI_INTERVAL); setInterval(remoteVersionSync,REMOTE_SYNC_INTERVAL);
    setInterval(()=>{ if(!state.localDirty && state.items.length) warmMissing(false); }, 120000);
  }

  function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
  function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function cssEscape(v){return window.CSS?.escape ? CSS.escape(v) : String(v).replace(/([ #;?%&,.+*~\':"!^$[\]()=>|\/@])/g,'\\$1');}

  init();
})();
