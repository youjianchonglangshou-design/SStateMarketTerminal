# SStateMarketTerminal v0.1.1 — Cloudflare Bridge

本包只補 Cloudflare Bridge 原始碼，不改目前 GitHub Pages 畫面。

## GitHub 要新增
- cloudflare/worker.js
- cloudflare/wrangler.toml.example

## Cloudflare 建立
R2 bucket:
- sstate-market-data

Worker:
- sstate-market-terminal

R2 binding:
- Variable name: JSON_BUCKET
- Bucket: sstate-market-data

Worker Variables:
- GITHUB_REPOSITORY = youjianchonglangshou-design/SStateMarketTerminal
- GITHUB_BRANCH = main
- ALLOWED_ORIGIN = https://youjianchonglangshou-design.github.io

Worker Secrets:
- GITHUB_TOKEN
- CALLBACK_TOKEN

下一階段取得 Worker URL 後，修改 GitHub 根目錄 config.js:
window.SSTATE_CONFIG.workerUrl = "https://你的-worker.workers.dev"

GitHub Actions Secrets:
- WORKER_BASE_URL = Worker URL
- WORKER_CALLBACK_TOKEN = 與 Cloudflare CALLBACK_TOKEN 完全相同
