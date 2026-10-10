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
