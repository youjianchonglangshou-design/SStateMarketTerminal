# v0.3.01｜LIVE-MONITOR 429 FIX

本版修正即時監控新增標的視窗的 Pionex 清單 403 / 429 問題。

## 核心修正

瀏覽器開啟「新增 Pionex 標的」時，Cloudflare Worker **不再即時向 Pionex 抓完整 SPOT / PERP 清單**。
完整 Universe 改成：

`GitHub Actions → Pionex common/symbols → Cloudflare Worker internal API → R2 → monitor.html`

因此 GitHub Pages 只讀自己的 Worker / R2，不會因 Cloudflare egress 被 Pionex 限流而讓整個新增視窗失效。

- 完整 Pionex 清單每 6 小時同步一次，也可手動 Run workflow。
- R2 還沒有完整清單時，頁面仍會顯示備援清單。
- 搜尋框可直接輸入 BTC / ETHFI / EIGEN 等，產生 PERP / SPOT 直接加入候選。
- 新增後仍透過 Kline warm-up 驗證與計算 S-State / 中軌 / 平均K / CCI-SMA。
- 10 秒更新仍採局部 cell patch，不 reload 整頁。

## 第一次部署

1. 先部署 `cloudflare/worker.js`。
2. GitHub 覆蓋前端檔案，並新增 `engine/pionex_monitor_symbols_sync.py` 與 `.github/workflows/monitor-symbol-sync.yml`。
3. 到 Actions 手動執行一次 **Pionex Monitor Symbol Sync**。
4. 之後每 6 小時自動更新 R2 Universe。

完整檔案清單見 `OVERWRITE_THESE.txt`。
