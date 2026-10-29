# Pionex WebSocket 即時價格測試 v1.1.0 — SState Worker 中繼版

## v1.1.1｜CL → WTI 合約代碼修正

- **根本原因：** 測試頁預設先載入 `MultiAssetLiquidityRadar/symbols.js`，所以只修改 `Pionex_WebSocket/symbols.js` 不會影響正常連線時使用的清單；原本雷達來源 CL 對應 `CL_USDT_PERP`，但派網實際可用合約是 `WTI_USDT_PERP`。
- **修正：** WebSocket 頁在載入任何來源清單後，一律將名稱為 `CL` 或 `WTI` 的項目對應到 `WTI_USDT_PERP`，訂閱、回覆確認、成交推送、搜尋與 UI 皆使用此實際合約 ID。當來源是原雷達清單時，畫面仍顯示 `CL` 以便辨識，同時在下一行顯示 `WTI_USDT_PERP`。
- 本地備援 `symbols.js` 同步映射，正式 `MultiAssetLiquidityRadar/symbols.js`、Worker 與 RR 指標皆不修改。
- 此版本**不能保證** WTI 必然有新成交；確認成功須在部署後看到 `SUBSCRIBED` 和 WTI 真正的 `TRADE` 訊息。

## 已知、已確認的事實

- 瀏覽器直接連 `wss://ws.pionex.com/wsPub` 在使用者環境遭 HTTP 403。
- 使用者已在 Chrome Console 成功連線到既有 Cloudflare Worker `/api/monitor/ws`，收到 `SUBSCRIBED` 與真實 BTC `TRADE` 成交。
- **此版本將 33 檔測試頁的連線端點改為已驗證的 Worker 中繼。** 尚未在使用者環境證明全部 33 檔都能持續收到成交，因此 UI 會分別顯示訂閱數與收到成交數。

## 部署與使用

1. 將 `Pionex_WebSocket/` 下的檔案覆蓋 GitHub 對應資料夾。無須更動 `MultiAssetLiquidityRadar/` 或 Cloudflare Worker 程式。
2. 開啟 `https://youjianchonglangshou-design.github.io/SStateMarketTerminal/Pionex_WebSocket/index.html`，按 Ctrl+F5。
3. 網頁先載入主站的 `MultiAssetLiquidityRadar/symbols.js`；載入失敗才退回 ZIP 內附的 `symbols.js`。目前清單為加密 21、美股／商品 12，合計 33 檔。
4. 預設連線即訂閱全部 33 檔，先送 BTC，之後按 340 ms 間隔逐一訂閱其餘 32 檔；按「只測 BTC 連線」可縮小測試範圍。
5. 觀察「已確認訂閱」「已收到報價」數量、每檔狀態與診斷日誌；沒有成交的檔案仍會等待，不會造假。
6. 可在 Console 執行 `PIONEX_WS_DEMO.inspect()`，確認 `endpoint`、`subscriptions`、`received`、`errors` 等狀態。

## 架構

`Pionex 官方公開 WS (TRADE) → 既有 SState Cloudflare Worker /api/monitor/ws → GitHub Pages 測試網頁`

中繼 URL：`wss://white-meadow-16bc.youjianchonglangshou.workers.dev/api/monitor/ws`

這是 WebSocket 推送，沒有每秒對派網 REST 或 TradingView Scanner 請求。使用現有 Worker，仍可能有連線／用量／服務端限制。

## 價格與時間語意

- 只顯示 `TRADE` 訊息內真實成交價，並非標記價、指數價或清算價。
- 30 秒內收到成交顯示綠色新鮮標記；超過 30 秒只是代表沒有新成交，不等於 WebSocket 斷線。
- 成交時間依交易所 `timestamp` 顯示台灣時間；沒有有效成交推送的商品不顯示假價格。
- 斷線自動重連；若握手連續兩次失敗會停止重試並提示。
- 本次不修改 `MultiAssetLiquidityRadar` 正式行情架構、RR、指標、通知。

## 測試聲明

此交付已進行語法、隔離 WebSocket 模擬訊息、版面及 ZIP 完整性測試。真實 BTC 中繼成功係依使用者於 Chrome 提供的測試紀錄；**在本工作環境無法直接對外連線，沒有宣稱 33 檔實時端對端測試完成。**
