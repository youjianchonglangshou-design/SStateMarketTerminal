# SStateMarketTerminal

Streamlit 脫殼 Stage 1：GitHub Pages 靜態 HTML/JS/CSS + Cloudflare Worker/R2 + GitHub Actions Python 引擎。

**版本：`TERMINAL v0.1.30｜NEWS-ONLY-RUN`**

## 已完成的資料流

```text
GitHub Pages
  ├─ 開站：只讀 R2 最後一次 snapshot
  ├─ 完整分析：POST Cloudflare Worker → full-analysis.yml → Pionex + S-state + R2
  └─ 新聞分析：POST Cloudflare Worker → us-stock-research.yml
                                      ↓
                         只讀 R2 最新美股 snapshot
                                      ↓
                         GPT-OSS 120B 新聞分析
                                      ↓
                         24H Cache + research R2
```

Stage 1 **不使用 D1**。Runtime 最新 JSON 以 R2 為唯一 source of truth；GitHub 只負責程式碼與 Actions。

## Repo 主要檔案

- `index.html`：GitHub Pages 主畫面
- `styles.css`：Streamlit 視覺脫殼版
- `app.js`：讀 latest / 完整分析 / polling / JSON 下載 / SVG 圖表
- `config.js`：只需填 Worker URL
- `engine/`：由原 Streamlit 拆出的 headless Python S-state engine
- `.github/workflows/full-analysis.yml`：Cloudflare 呼叫的完整分析
- `.github/workflows/us-stock-research.yml`：只跑美股 GPT-OSS 新聞分析，不重跑市場引擎
- `.github/workflows/deploy-pages.yml`：GitHub Pages
- `cloudflare/worker.js`：R2 + GitHub dispatch 中介層
- `cloudflare/wrangler.toml.example`：R2 binding / Worker vars
- `data/bootstrap/`：R2 尚未設定時的最後一次畫面 fallback

## 第一次部署順序

### 1. 把整包內容上傳到 `SStateMarketTerminal`

保留目錄層級。原本 GitHub 自動建立的 `README.md` 可以直接用本檔覆蓋。

### 2. GitHub Pages

Repository → Settings → Pages → Source 選 **GitHub Actions**。

`Deploy GitHub Pages` workflow 會部署根目錄的 `index.html`。

### 3. Cloudflare 建 R2

建議 bucket：

```text
sstate-market-data
```

Worker 的 R2 binding 固定叫：

```text
JSON_BUCKET
```

### 4. 建 Cloudflare Worker

把 `cloudflare/worker.js` 貼進 Worker，並綁定上面的 R2 bucket。

Worker Variables：

```text
GITHUB_REPOSITORY = youjianchonglangshou-design/SStateMarketTerminal
GITHUB_BRANCH = main
ALLOWED_ORIGIN = https://youjianchonglangshou-design.github.io
```

Worker Secrets：

```text
GITHUB_TOKEN
CALLBACK_TOKEN
```

`GITHUB_TOKEN` 建議用 fine-grained token，只授權此 repo，Repository permissions → **Actions: Read and write**。

`CALLBACK_TOKEN` 自己產生一串長隨機字串，例如 40+ 字元；它只用於 GitHub Actions 回寫 Worker。

### 5. GitHub Actions Secrets

SStateMarketTerminal → Settings → Secrets and variables → Actions：

```text
WORKER_BASE_URL
WORKER_CALLBACK_TOKEN
```

其中：

```text
WORKER_BASE_URL = https://你的-worker.workers.dev
WORKER_CALLBACK_TOKEN = 與 Cloudflare CALLBACK_TOKEN 完全相同
```

### 6. `config.js` 填 Worker URL

```js
window.SSTATE_CONFIG = {
  workerUrl: "https://你的-worker.workers.dev",
  ...
};
```

前端**不放 GitHub Token，也不放 CALLBACK_TOKEN**。

### 7. 第一次 Seed R2（推薦）

Windows PowerShell 在 repo 根目錄：

```powershell
.\tools\seed-r2.ps1 `
  -WorkerUrl "https://你的-worker.workers.dev" `
  -CallbackToken "你的 CALLBACK_TOKEN"
```

會把：

```text
engine/models/probability_model.json
→ models/active/probability_model.json

data/bootstrap/snapshot_ai.json
→ latest/crypto/snapshot_ai.json

data/bootstrap/snapshot_us_stock_ai.json
→ latest/us-stock/snapshot_us_stock_ai.json
```

如果不 seed，網站仍會先讀 repo bootstrap；第一次完整分析成功後，R2 snapshot 會自動建立。Active model 若 R2 尚不存在，Action 會先用 repo 內的模型 fallback。

## 網站行為

### 開啟網站

不抓 Pionex、不跑 Python：

```text
GET /api/snapshot?market=crypto
```

只呈現 R2 最後一次成功資料。

### 按「完整分析」

```text
POST /api/analysis/start
```

Worker 建 `run_id` → 呼叫 `full-analysis.yml` → Python 重新抓 Pionex → S-state → Level 5 → R2。

### 按「📰 新聞分析」

只在「美股代幣」模式顯示：

```text
POST /api/research/us-stock/start
```

Worker 呼叫 `us-stock-research.yml`，直接讀取 R2 目前的 `snapshot_us_stock_ai.json`，只執行 GPT-OSS 新聞／財報研究。**不重新抓 Pionex、不重新計算 K 線、不重跑 S-state / probability engine。**

原本的 24H per-symbol Cache 規則完全保留：24H 內成功結果直接沿用；未快取、已過期或前次失敗未入 Cache 的標的才需要新的模型請求。

### 右上角 JSON

下載的是**目前頁面同一份 R2 latest JSON**，不是 GitHub copy。

## R2 Key v1

```text
latest/crypto/snapshot_ai.json
latest/us-stock/snapshot_us_stock_ai.json
runs/<run_id>/status.json
runs/<run_id>/snapshot_ai.json
runs/<run_id>/snapshot_us_stock_ai.json
models/active/probability_model.json
```

## Stage 2（尚未接）

下一階段才接 `HistoricalTraining`：

```text
Cloudflare Cron
  ↓
Daily S-state Learning
  ↓
Candidate probability model
  ↓
Champion / Challenger evaluation
  ↓
通過 promotion gate
  ↓
R2 models/active/probability_model.json
```

不採用「每天產生新模型就直接覆蓋 active」。
