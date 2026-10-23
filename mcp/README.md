# SStateMarketTerminal MCP v0.3.2

An isolated, read-only Cloudflare Worker exposing the existing SStateMarketTerminal daily indicator engine through eleven remote MCP tools.

## Architecture

- The source file `mcp/worker.mjs` directly imports `../monitor-engine.js`. It does not duplicate or alter the original S-state/HA/CCI-SMA/midline formulas.
- The Worker reads market data from the existing SState Cloudflare Worker and optionally refreshes today's daily OHLC via TradingView Scanner.
- The existing website, Worker `white-meadow-16bc`, R2, Telegram and cron schedules are not modified.
- Private watchlist is **disabled** by default. Read-only public market data does not require an API key.
- `get_market_states` handles up to 20 tickers and `scan_market_states` handles up to 30. Return values include source, timestamps and stale/error flags. **No fabricated technical values.**

## Deployment

One-time GitHub repository secrets, under **Settings → Secrets and variables → Actions**:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`, requiring Cloudflare **Workers Scripts: Edit** and relevant account read permissions.

## Automatic synchronization (enabled)

- **Every push to `main`**, including edits to root `monitor-engine.js`, `mcp/worker.mjs`, or any webpage file, starts `Deploy SState MCP` automatically. No schedule and no manual button required.
- The workflow uses the **exact commit that triggered the run**, executes local MCP checks, independently deploys Cloudflare Worker `sstate-mcp`, then checks the remote `/health` response for matching `deploy_commit` and all eleven MCP tools.
- The MCP URL stays unchanged: `https://sstate-mcp.youjianchonglangshou.workers.dev/mcp`.
- S state, BB midline, HA, and CCI-SMA logic is **bundled from the root `monitor-engine.js`**. Updates to that shared engine are reflected in the MCP after a successful deploy.
- The *existing production website Worker*, R2, Telegram, and cron are untouched.
- The MCP only exposes functionality implemented through its own tools. **Adding a new website feature does NOT magically create a new MCP tool**: expose the feature through `mcp/worker.mjs`, push it, and it will be deployed automatically.
- After **adding/removing tools or changing tool input schemas**, manually **refresh the plugin/tool definitions in ChatGPT** (or reconnect the plugin, if necessary). For calculations and data returned by existing tools, the live endpoint updates without recreating the plugin.
- A market data API may occasionally fail even with a successfully deployed MCP. Remote BTC market checks are informational and should not hide a successful deployment. Actual data responses always expose sources and error conditions.

To verify a deployment: open the latest `Deploy SState MCP` workflow run in GitHub Actions, or open the `/health` URL and check `deploy_commit`.

For emergency redeploy: **Actions → Deploy SState MCP → Run workflow**.

Worker URL:

- Health: https://sstate-mcp.youjianchonglangshou.workers.dev/health
- MCP: https://sstate-mcp.youjianchonglangshou.workers.dev/mcp

Use the **/mcp** URL in a ChatGPT workspace that permits adding custom remote MCP servers, selecting no authentication only for the public read-only tools.

## Local tests

```bash
node mcp/test.mjs
```

Deployment source: `mcp/wrangler.toml`. To deploy manually: `npx wrangler deploy --config mcp/wrangler.toml`.

## Pionex complete contract universe (new in MCP v0.3.1)

`get_pionex_contracts` retrieves active USDT pairs directly from the official public endpoint:

- PERP (default): `GET https://api.pionex.com/api/v1/common/symbols?type=PERP&status=TRADING`
- SPOT: `GET https://api.pionex.com/api/v1/common/symbols?type=SPOT`
- `type=ALL`: query both endpoints, merge and deduplicate without hiding any USDT rows.
- Optional `query` matches symbol or base, e.g. `AMDX`, `BTC`, `ETH`. `offset`/`limit` permit paging; omitting `limit` returns the entire matching universe in one MCP call.
- Returns official `source`, `api_timestamp`, request `fetched_at`, `total`, `matched_total`, `has_more`, and `symbols`.
- When Pionex blocks the Cloudflare IP or returns 429, the MCP now reads the **existing R2 object directly** from the same account (`JSON_BUCKET`: `sstate-market-data`, key `pionex/cache/monitor_universe.json`) instead of relying on the previously broken `white-meadow-16bc` intermediary. R2 results have `source: SSTATE_R2_DIRECT`, `fetched_at`, `stale`, and `partial` indicators. If the direct R2 object is missing, it tries the legacy monitor HTTP endpoint, then for PERP only discovers TradingView `PIONEX:` USDT `.P` tickers; TradingView is always marked `partial: true`, never claimed as a verified complete Pionex universe. No fabricated symbols, no API credentials, no new scheduled job. Data source failure is disclosed rather than hidden.
- Read-only; this MCP feature neither modifies the monitor web page nor adds a GitHub Actions schedule. The existing `scan_market_states` is still limited to 30 explicit symbols per call; this new discovery tool alone does not automatically scan the entire exchange.

Example request:

```json
{"name":"get_pionex_contracts","arguments":{"type":"PERP","query":"AMDX"}}
```

## MCP tools

- `get_pionex_contracts`: full active Pionex USDT PERP/spot symbol directory with direct official API and existing monitor-R2 fallback.

- `get_liquidation_bounds`: query **any valid ticker** for CoinGlass 7D maximum-pain liquidation upper/lower bounds, falling back to the radar's 15-minute OHLC synthetic leverage proxy zones when requested. Return source, quote time, freshness, error and `is_estimate`. PEPE/1000PEPE scaling supported.
- `get_fear_greed_today`: today's **CMC** cryptocurrency Fear and Greed value (0–100), classification, date, 6-color transition semantics and freshness using the existing `cmc-fear-greed` Cloudflare Worker with an official keyless CoinMarketCap API fallback if the existing Worker returns 404. Does not substitute Alternative.me.
- `get_market_states`: current technical signals for supplied symbols.
- `scan_market_states`: filter and sort supplied symbols.
- `get_symbol_detail`: one instrument and last 30 days of indicator data.
- `get_watchlist`: private watchlist, **disabled** unless bearer secret is configured.
- `get_snapshot`: scheduled analysis snapshot (not live).
- `find_symbols`: lookup symbols within snapshot.
- `get_performance`: Champion statistics.
- `get_model`: active probability model metadata.

**Scope**: CoinGlass 7D bounds use the same *undocumented* CoinGlass reader as the original radar and can stop working when CoinGlass changes its encryption versions or rate limits requests. In that case the radar's 15m synthetic leverage **proxy** is explicitly marked and does not represent real liquidation/open interest orders. BTC first-sweep probabilities are **not included** and no probability is extrapolated to other coins. CMC official daily data is read from the existing Worker when healthy, or the documented keyless public CoinMarketCap `/public-api/v3/fear-and-greed/*` endpoints when the Worker is unavailable. It can update later than Taiwan midnight; the tool reports source date/time and staleness.

## Validation

The GitHub Actions deploy pipeline is the definitive remote deployment/check result. Do not assume the endpoint is live merely because the source has been committed. Its required smoke tests compare `/health.deploy_commit` with the triggering Git commit and verify MCP `tools/list`. The live market-data probe is best-effort.

## ChatGPT plugin refresh after adding tools

After this deployment, open **ChatGPT → Plugins → SStateMarketTerminal → Refresh / Reconnect tools** as supported by the UI. Because a NEW tool was added (`get_pionex_contracts`), ChatGPT may retain its prior tool schema until refreshed. The MCP server URL and secrets remain unchanged.
