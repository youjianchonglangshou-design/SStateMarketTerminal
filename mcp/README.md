# SStateMarketTerminal MCP v0.2.5

An isolated, read-only Cloudflare Worker exposing the existing SStateMarketTerminal daily indicator engine through eight remote MCP tools.

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
- The workflow uses the **exact commit that triggered the run**, executes **16 local MCP checks**, independently deploys Cloudflare Worker `sstate-mcp`, then checks the remote `/health` response for matching `deploy_commit` and the eight MCP tools.
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

## MCP tools

- `get_market_states`: current technical signals for supplied symbols.
- `scan_market_states`: filter and sort supplied symbols.
- `get_symbol_detail`: one instrument and last 30 days of indicator data.
- `get_watchlist`: private watchlist, **disabled** unless bearer secret is configured.
- `get_snapshot`: scheduled analysis snapshot (not live).
- `find_symbols`: lookup symbols within snapshot.
- `get_performance`: Champion statistics.
- `get_model`: active probability model metadata.

**Scope**: Does **not** expose CoinGlass liquidation bands or BTC first-sweep probabilities yet; no claim that those analyses are present in this MCP implementation.

## Validation

The GitHub Actions deploy pipeline is the definitive remote deployment/check result. Do not assume the endpoint is live merely because the source has been committed. Its required smoke tests compare `/health.deploy_commit` with the triggering Git commit and verify MCP `tools/list`. The live market-data probe is best-effort.
