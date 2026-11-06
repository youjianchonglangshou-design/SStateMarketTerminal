# SStateMarketTerminal MCP v0.3.3 — Pionex-only market data

## What changed

The original **monitor-engine.js** is imported unchanged. The MCP returns technical indicators **only** when their underlying daily OHLC comes from Pionex (official API, the existing monitor Worker, or the same Pionex-sourced R2 historical cache). It must not calculate Pionex PERP signals using Gate, Binance, OKX, Bybit, other-exchange spot, or synthetic K-lines. When data is unavailable or stale, the response says so.

- `get_market_states` / `get_symbol_detail` / `scan_market_states` use Pionex 1D candles. A Pionex TRADE WebSocket quote is applied to **today's existing Pionex daily candle**, not used to create 180 missing historical candles. Signals include `signal_usable`, `stale_kline`, `kline_source`, `quote_source`, `is_live_quote`, `quote_trade_at`, `cross_exchange_proxy:false`.
- `get_pionex_quotes` (new): temporary same-source WebSocket subscription through the existing `white-meadow-16bc ... /api/monitor/ws` relay. MCP requests are stateless and **cannot borrow another browser's connection**. A one-shot WS may not see a trade for an illiquid token inside the sampling window. The only fallback is Pionex's own ticker REST feed (main Worker `/api/monitor/tickers` first, then Pionex official ticker REST), clearly marked as **non-WebSocket**.
- `find_symbols(market="us-stock")` uses `pionex/symbols/us_stock_symbols.json` from **the existing R2 bucket**, not an unrelated scheduled snapshot. This fixes a prior 404 for searches like NVDA / INTC / MU.
- The exact Pionex directory maps `NVDA -> NVDAX_USDT_PERP`, `INTC -> INTCX_USDT_PERP`, `MU -> MUX_USDT_PERP`, and `CL -> WTI_USDT_PERP`. No guessed proxy instrument is substituted; an unknown base remains unknown.
- `get_pionex_contracts` still prefers official Pionex symbol API. On official rate limits, it uses the Pionex R2 complete universe; if that is also absent, it returns **only** the Pionex R2 stock directory and marks `partial:true`. No TradingView third-party contract scan fallback.
- `get_snapshot(market="us-stock")` when the scheduled snapshot endpoint fails returns the **stock symbol directory only**, clearly NOT market analysis.
- `get_liquidation_bounds`: CoinGlass 7D only by default; requesting `allow_proxy:true` now returns an explicit error. No 15M estimated liquidation bounds.

**Not modified:** MultiAssetLiquidityRadar, Pionex browser WebSocket stream, original SState indicator engine, main Cloudflare Worker, CoinGlass reader, R2 data, or trading rules.

## Architecture

```
ChatGPT -> sstate-mcp Worker
    |-> (same SState relay) /api/monitor/ws -> Pionex TRADE, one-shot
    |-> (same exchange fallback) /api/monitor/tickers -> Pionex tickers
    |-> R2 existing Pionex OHLC: pionex/cache/monitor_klines/1D/<symbol>.json
    |-> (refresh when needed) /api/monitor/klines -> Pionex Klines
    |-> (refresh when needed) official Pionex daily Klines
    |-> Original root monitor-engine.js -> S, midline, HA, CCI-SMA
    |-> R2 stock symbol_map: pionex/symbols/us_stock_symbols.json
```

The quote stream supplies last traded prices, **not historical OHLC**. If no Pionex candles exist, indicators remain unavailable. Cached Pionex candles can be displayed historically, but `scan_market_states` excludes stale signals via `signal_usable=false`. This is deliberate: making up technical indicators from a different market is not allowed.

The existing Radar may also obtain verified `PIONEX:` chart candles through its TradingView chart transport. This MCP edition does not claim that every returned daily candle/indicator is tick-for-tick identical to the browser when the two clients have different update freshness. Check their `last_kline_time`, `kline_fetched_at`, and `quote_trade_at` before comparing.

## Deployment

Requires deploying the **MCP Worker**, not just uploading the main website. Do not deploy the main `cloudflare/worker.js` for this patch.

From the repository root, overwrite `mcp/` files from the ZIP. Keep `monitor-engine.js` unchanged. Existing push-based `Deploy SState MCP` workflow (if configured and enabled) can deploy the new server after pushing; no new scheduled GitHub Actions task is needed. Or use the existing manual `npx wrangler deploy --config mcp/wrangler.toml` with valid Cloudflare access.

Cloudflare binding must stay the same: `JSON_BUCKET = sstate-market-data`. It contains the official Pionex universe and Pionex-generated stock/klines entries. No additional API key or extension.

After deployment check `https://sstate-mcp.youjianchonglangshou.workers.dev/health` for `version:0.3.3`. Refresh/reconnect the ChatGPT SStateMarketTerminal plugin tool definitions to make new `get_pionex_quotes` visible. Existing tools keep their prior arguments and update with the server.

### Suggested real-production validation

1. Call `get_pionex_contracts(type="PERP",query="NVDAX")`: expect actual NVDAX pair with Pionex/R2 provenance.
2. Call `find_symbols(market="us-stock",query="NVDA")`: expect NVDAX_USDT_PERP even when snapshot routes return 404.
3. Call `get_pionex_quotes(symbols=["NVDAX","HOODX"])` while markets are trading: quote sources must be `PIONEX_WEBSOCKET_TRADE` or explicitly `PIONEX_WORKER_TICKERS` / `PIONEX_OFFICIAL_TICKERS`; not an alternative exchange.
4. Call `get_market_states(symbols=["NVDA","HOODX","INTC"],type="PERP",use_live=true)`: check `cross_exchange_proxy=false`, `indicator_market_basis=PIONEX_PERP`, and `signal_usable` before relying on signals.
5. If daily history is unavailable, verify `success:0` / unavailable records instead of fabricated color states.
6. Compare 1D Pionex OHLC and active 4H chart when trading, accounting for Kline update timestamp.

**Testing status:** Node simulation tests are included. Successful production Worker deployment, R2 content freshness, live WebSocket subscriptions and end-to-end indicator parity require real remote checks after deployment; do not mark them passed from mocks.

## Local validation

```
node --check mcp/worker.mjs
node --check mcp/pionex-live.mjs
node --check mcp/pionex-contracts.mjs
node mcp/test.mjs
```
