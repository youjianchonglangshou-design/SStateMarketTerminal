# SState Market Terminal

**Current version:** `TERMINAL v0.1.65｜PROPW-CRM-MATCH`

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



## ADX state pill background boost (v0.1.61)

The ADX/DMI state capsule now separates **direction identity** from **trend-strength change**:

- Capsule yellow = `DI+ > DI-` (bullish controller)
- Capsule purple = `DI- > DI+` (bearish controller)
- Dot green = ADX rising versus the previous displayed day
- Dot red = ADX falling versus the previous displayed day
- Dot gray = ADX flat or unavailable
- Hovering the 30-day DMI panel recomputes the same visual state for the hovered date.

The ADX stepline itself is unchanged: green segments rise, red segments fall. No Python or probability logic changed in this release.

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


## ADX Step live probability features (v0.1.62)

- `engine/probability_reader.py` now mirrors HistoricalTraining `DMI-EXPERT-v2-ADX-STEP` live feature semantics.
- New live fields: `adx_axis_zone`, `adx_step_direction`, `adx_step_age_days`, `adx_step_age_bin`, `adx_turn_event`, `adx_step_delta`, `dmi_adx_regime`.
- The three new model facets (`adx_step_regime`, `adx_step_persistence`, `adx_turn_handover`) can therefore participate in success / survival / true-fail correction when a v2 ADX-Step model is active.
- `adx_turn_handover` keeps the same 4H DI relation-age guard as training; invalid replay age is never replaced with a daily approximation.
- This release does not publish or promote a probability model.


## ADX state arrow visual (v0.1.63)

- ADX rising state text uses `趨勢強度增強 ↗↗`.
- ADX falling state text uses `力量衰退 ↘↘`.
- ADX flat state text uses `力道持平 ←→`.
- DI controller colors, ADX red/green step colors, probability logic, and Python engine are unchanged.

## PropW PW match badge (v0.1.65)

- The old Tradeify / `DX` match list and badge implementation are removed and replaced in place by PropW / `PW`.
- `app.js` keeps one current mapping only: `PROPW_PIONEX_SYMBOL_MAP`.
- A `PW` capsule appears only on the US-stock/RWA page when the current SState/Pionex symbol has a confirmed match in the supplied PropW list.
- `CRMX → CRM` is now a confirmed PropW match and displays the `PW` capsule.
- `CRWD` remains unlabeled because this Terminal build still has no confirmed corresponding SState/Pionex symbol identity.
- No Python engine, Worker, workflow, probability model, ADX/DMI, or S-state logic changes in v0.1.65.
