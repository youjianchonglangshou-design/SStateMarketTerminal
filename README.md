# v0.3.02｜LIVE-MONITOR KLINE CACHE FIX

本版修正「可以新增 Pionex 標的，但表格顯示資料讀取失敗」的問題。

## 根因

Cloudflare Worker 從 `api.pionex.com/api/v1/market/klines` 即時替新標的暖機時，Cloudflare egress 會被 Pionex 429 限流。瀏覽器的 Pionex WebSocket 本身其實已正常連線，但沒有歷史日 K 就無法先算出 S-State / 中軌 / 平均K / CCI-SMA，所以整列停在失敗狀態。

## v0.3.02 修法

正常監控路徑改為：

`GitHub Actions → Pionex 1D Kline → Worker internal batch API → R2 Kline Cache → monitor.html`

- GitHub Actions 每 6 小時同步目前完整 Pionex SPOT/PERP Universe。
- 同一個 workflow 會依序抓每一個目前可交易 USDT 標的的 180 根日 K，分批寫入 R2。
- `monitor.html` 新增標的後優先直接讀 R2 歷史 K，不再強制讓 Worker 即時打 Pionex。
- R2 Kline cache freshness 改為 12 小時；正常瀏覽不會每 30 秒重新向 Pionex 要歷史 K。
- 歷史 K 載入後，盤中價格仍由 `wss://ws.pionex.com/wsPub` 直接更新；每 10 秒只 patch 有變化的 cell，不 reload 整頁。
- 如果 R2 還沒完成第一次 Kline 預熱，列會顯示「等待 K 線快取」，而不是假裝已有資料。

## 第一次部署

1. **先部署 `cloudflare/worker.js`**。
2. Push GitHub 檔案。
3. GitHub → Actions → **Pionex Monitor Universe + Kline Sync** → `Run workflow`。
4. 第一次完整同步需要數分鐘；workflow 完成後重新整理 `monitor.html`。
5. 之後每 6 小時自動更新 Universe + 1D Kline cache。

## 需要的既有 Secrets

沿用原本已經用來同步 Universe 的：

- `WORKER_BASE_URL`
- `WORKER_CALLBACK_TOKEN`

不需要新增 Pionex API Key，全部使用公開市場資料。
