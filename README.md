# v0.3.04｜LIVE-MONITOR KLINE RESUME FIX

本版修正 `Pionex Monitor Universe + Kline Sync` 在 35 分鐘被 GitHub Actions 取消的問題。

## 修正內容

- Workflow timeout：35 分鐘 → 90 分鐘。
- 新增 R2 快取狀態檢查：重新執行時直接跳過 10 小時內已有的 K 線，不再從頭重抓。
- 目前 monitor watchlist 內的標的優先處理；即使完整 universe 還沒跑完，正在監看的幣會先有資料。
- 新上架而日 K 少於 30 根的標的不再重試 3 次，直接記錄為暫不可計算。
- Pionex 請求間隔調整為 0.85 秒，降低 429；429 仍會自動等待後重試。
- 已取消的 v0.3.02 執行若已寫入部分 R2，本版會直接接續缺少的部分。

## 必須覆蓋

1. `cloudflare/worker.js`
2. `engine/pionex_monitor_symbols_sync.py`
3. `.github/workflows/monitor-symbol-sync.yml`
4. `VERSION.json`

前端版本字串也已更新，因此建議一併覆蓋 `index.html`、`monitor.html`、`config.js`、`app.js`、`monitor-engine.js`。

部署順序：先更新 Cloudflare Worker，再更新 GitHub，最後手動執行 `Pionex Monitor Universe + Kline Sync`。


## v0.3.04 WS PROXY FIX
瀏覽器直接連 Pionex wsPub 會因 Origin 被 403；即時監控改由 Cloudflare Worker `/api/monitor/ws` 代理。前端仍每 10 秒只更新變動 cell，並以即時成交價更新當前日 K 後重算 S-State／中軌／平均K／CCI-SMA。

另新增每小時只刷新目前 R2 watchlist 的日 K 快取，避免重新開頁時從過舊的盤中 OHLC 開始。
