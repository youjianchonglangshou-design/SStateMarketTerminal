# SStateMarketTerminal v0.3.15 — 08:01 每日學習排程

## 最終排程（台灣時間）

- 00:01：Crypto + 美股分析
- 04:01：Crypto + 美股分析
- 08:01：Crypto + 美股分析 → 兩邊成功後執行 HistoricalTraining K 線學習
- 12:01：Crypto + 美股分析
- 16:01：Crypto + 美股分析
- 20:01：Crypto + 美股分析
- 21:31：單純美股完整分析 + 板塊資金羅盤，不執行學習
- 每分鐘：檢查一次性 Telegram 價格提醒，即使 monitor.html 關閉仍運作

## 已取消

- 舊的台灣時間 08:25 正式 Champion / 學習排程已從 Worker 邏輯移除。
- Cloudflare Dashboard 仍需手動刪除 Cron `25 0 * * *`；程式碼無法替 Dashboard 自動刪除已存在的 Trigger。

## 08:01 學習流程

1. `1 */4 * * *` 在 00:01 UTC 觸發，也就是台灣 08:01。
2. Worker 將這一輪標記為正式每日 checkpoint。
3. `auto-batch.yml` 依序跑 Crypto → 美股。
4. 兩邊成功後，既有 `RUN_LEARNING_AFTER=true` 流程呼叫 `/api/internal/learning/start`。
5. HistoricalTraining 開始每日 K 線學習。

`auto-batch.yml` 原本的「Crypto + 美股都成功才觸發學習」條件已符合需求，因此不必修改。


## v0.3.15 · MultiAssetLiquidityRadar 清算監控整合

- 主站右上角「清算監控」：在新分頁開啟 `./MultiAssetLiquidityRadar/index.html`。
- 「更多 ⋯」保留原即時監控入口：`./monitor.html`，與原先同樣新分頁開啟。
- 子資料夾沿用 MultiAssetLiquidityRadar v1.1.3 的清單、CoinGlass 上下界、平均K、CCI-SMA、S 狀態、中軌斜率、BTC 機率參考。
- S 狀態與中軌共用根目錄 `monitor-engine.js`，不再跨網域引用自己主站的引擎。
- 此功能不改動根目錄正式快照分析、monitor.html、Worker、R2、訓練或排程。
- 新資料夾的任何推送更新會觸發現有 GitHub Pages 部署工作流程；不增加額外定時任務。
- 清算解碼與 BTC 機率仍引用 `BTC_iquidation` 網站的既有公開腳本，當外部腳本不可用時，依子頁面原本行為顯示資料缺失。


## v0.3.16｜清算監控共用 Telegram 價格提醒

`MultiAssetLiquidityRadar/` v1.1.4 在每個幣種名稱旁新增一次性到價鈴鐺；直接使用 `monitor.html` 相同的 Cloudflare Worker API、R2 儲存與 Telegram 設定，不另建密鑰。GitHub Pages 上傳會更新鈴鐺介面；為了讓 WTI 警報與即時監控共用 `WTI_USDT_PERP`，還需將附帶的 `cloudflare/worker.js` 修正版重新部署至既有 SState Worker。


## v0.3.21｜主頁 OTHER-UP／OTHER-DN（尚未研究 7D 機率）
- 原始 S 狀態保留在 `opportunity_long.market_state_id`，本次僅在主頁用 `monitor-engine.js` 的 `classifyOtherExtension()` 細分展示。
- OTHER-UP：最新日線 HA 黃色、布林位置 ≥0.85、最近 3 日至少 2 日貼上軌，且 HA 收盤較兩日前上升。
- OTHER-DN：最新日線 HA 紫色、布林位置 ≤0.15、最近 3 日至少 2 日貼下軌，且 HA 收盤較兩日前下降。
- 其餘 OTHER 仍保持 OTHER；不更改 Champion 訓練分類、72H 機率、R2／Worker 與清算雷達。
- 主頁篩選、卡片與 SIGNAL MATRIX 使用細分類；建立 7D 回測時，可直接沿用此純函式重現判斷。
- 上述 0.85／0.15、2/3 是起始定義，**並非已回測有效門檻**。
