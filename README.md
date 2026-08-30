# SState Market Terminal

**Current version:** `TERMINAL v0.1.59｜ADX-STEP-DOMINANCE`

## Current runtime

```text
GitHub Pages
  ├─ latest Crypto / US-stock snapshot ← Cloudflare R2
  ├─ Full Analysis → Cloudflare Worker → GitHub Actions → Python S-state engine → R2
  └─ US-stock S3 / S0.5 / S1 news click
       → Cloudflare Worker
       → reviewed 122-symbol asset identity
       → Tavily Search + Answer
       → R2 24H research cache
       → research modal
```

US-stock news is on-demand only. Full Analysis and Auto Batch do not automatically search news.

## US-stock identity

`engine/us_stock_aliases.py` is the reviewed maintenance dictionary. Each Pionex/RWA symbol records real ticker, exchange, qualified ticker, English name, Traditional-Chinese name, asset type and aliases. The live Worker carries the synchronized runtime copy and resolves exact reviewed identity before the unknown-symbol fallback.

```text
ONX   → NASDAQ:ON   → onsemi → 安森美半導體
MSFTX → NASDAQ:MSFT → Microsoft Corporation → 微軟
PAYPX → NASDAQ:PAYP → PayPay Corporation
DRAMX → CBOE:DRAM   → Roundhill Memory ETF
XYZX  → NYSE:XYZ    → Block, Inc.
```

## News provider

The live news runtime uses Tavily Search + Answer only. No second-layer model binding is required.

```text
R2 binding: JSON_BUCKET
Secrets: GITHUB_TOKEN, CALLBACK_TOKEN, TAVILY_API_KEY
Variables: GITHUB_REPOSITORY, GITHUB_BRANCH, ALLOWED_ORIGIN
```

Tavily request: `search_depth=basic`, `topic=news`, `time_range=week`, `max_results=20`, `include_answer=advanced`.

Pipeline: `tavily-answer-direct-zhtw-v9-asset-identity`. Both frontend and Worker require this exact pipeline for a 24H hit. Expired or previous-pipeline entries are pruned on the next successful research write.


## ADX step dominance display (v0.1.59)

The existing Pine-equivalent ADX values from `engine/analysis_core.py` are now rendered in the 30-day DMI panel as a stepline. Rising ADX segments use `#26A69A`, falling segments use `#EF5350`, and flat segments use neutral gray. The live/hover capsule combines DI controller and ADX direction into four states: bullish control + strengthening, bullish control + weakening, bearish control + strengthening, bearish control + weakening. DI+ remains yellow, DI- remains purple, and the white dashed 20 line remains a reference only. No Python formula changed in v0.1.59.

## Challenger schema-upgrade policy (v0.1.57)

`cloudflare/worker.js` now allows the current shadow Challenger to be replaced **only when the latest Candidate has a strictly newer model schema** (for example schema v2 -> schema v3 DMI Expert). The superseded Challenger is archived with status `SUPERSEDED_SCHEMA_UPGRADE`; the Active Champion is never changed by this operation. Daily Candidates with the same schema version do not replace the Challenger, so the future OOS evaluation window can continue accumulating normally. HistoricalTraining already calls `/api/internal/model/challenger/ensure` after uploading each Candidate, therefore the next ensure call immediately performs any pending schema upgrade.

## Protected in v0.1.56

v0.1.56 changes only the live probability-consumption path around the existing model: `engine/probability_reader.py` now consumes HistoricalTraining schema v3 DMI Expert, while `engine/analysis_core.py` supplies the matching live 4H DMI relation age. S-state scoring, `engine/pattern_options.py`, Pionex market logic, Full Analysis, Auto Batch, Daily Learning, Champion/Challenger validation, Worker/R2 routes, and research modal visual design are unchanged.

## R2 keys

```text
latest/crypto/snapshot_ai.json
latest/us-stock/snapshot_us_stock_ai.json
runs/<run_id>/status.json
runs/<run_id>/snapshot_ai.json
runs/<run_id>/snapshot_us_stock_ai.json
models/active/probability_model.json
research/us-stock/cache.json
research/us-stock/latest.json
automation/latest/status.json
```
