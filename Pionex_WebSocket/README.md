# Pionex WebSocket 價格測試 v1.0.1（握手診斷版）

此次修正使用者實際回報的 `code 1006` 異常，該錯誤不代表「沒有成交」，而是 WebSocket 連線異常；瀏覽器 JavaScript 不能取得確切 HTTP 握手錯誤。

## 使用

1. 解壓縮後直接開啟 `index.html`，或使用「單檔 HTML」開啟。先以 BTC 測試是否能成功建立連線，再自動訂閱清單其餘 32 檔。
2. 若連續兩次未完成 WebSocket 開啟，會停止自動重試並開啟診斷記錄，避免無限制重連。可以手動按「只測 BTC 連線」驗證。
3. 如仍出現 1006，建議將測試 ZIP 內的網頁文件上傳到 GitHub 儲存庫中的新資料夾（例如 `PionexWebSocketTest/`），利用 GitHub Pages `https://.../PionexWebSocketTest/` 開啟。這是用來比較 `file://` Origin 與 HTTPS 網站 Origin，而非保證 HTTPS 一定可連線。
4. 按 `F12` → `Network` → `WS`，點選 `wsPub`，檢查是否回傳 HTTP `101 Switching Protocols`。沒有 101 代表 WebSocket 握手未成功；常見原因包含伺服器拒絕 Origin、網路 DNS/TLS、交易所或 WAF 限制。JS 端無法確定是哪一個。
5. 如果 HTTPS 仍失敗，把 Network/Console 中的握手狀態、錯誤訊息（不要包含個人憑證）提供回來，才能進一步確定原因。

## 官方 API

- URL `wss://ws.pionex.com/wsPub`
- `{ "op":"SUBSCRIBE", "topic":"TRADE", "symbol":"BTC_USDT_PERP" }`
- 伺服器 PING 即時回傳 PONG；所有訂閱限速到約 2.94 則訊息/秒，官方上限 5 則/秒/連線。
- 原始來源：`SStateMarketTerminal/MultiAssetLiquidityRadar/symbols.js`，21 加密 + 12 代幣，合計 33 檔。
- 僅顯示真實 WS 成交資料，沒有假價格、沒有 TradingView 或 REST 回退。

## 限制

截至製作時此執行環境無外網 DNS，無法對 `ws.pionex.com` 進行真實握手測試。因此本版確認的是程式模擬連線、故障分流和介面邏輯；不能保證在使用者網路下派網端點可連線。此修正也不能繞過派網伺服器本身的 Origin/WAF 限制。
