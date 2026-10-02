# v0.3.06｜LIVE-MONITOR TRADINGVIEW SCAN FIX

本版將 **PERP 即時價格/當日日線 OHLC** 從 Pionex 即時通道切換為 TradingView Crypto Scanner。

## 核心資料流

- 標的清單：Pionex 最新可交易清單 / R2
- 歷史日 K：Pionex Kline / R2 cache
- PERP 盤中 OHLC：`https://scanner.tradingview.com/crypto/scan`
- Watchlist / 備註 / 排序：R2

每 10 秒對目前監控中的 PERP 只送一次 TradingView Scanner 請求，抓 `close / open / high / low`，重建當前 UTC 日 K（台灣 08:00 換日），再立即重新計算：

- S-State
- 中軌斜率
- 平均K黃/紫
- CCI-SMA黃/紫

畫面採局部 cell patch，不 reload。

## 為何改用 TradingView Scanner

實測 `PIONEX:BTCUSDT.P` 可由 Scanner 直接取得目前 close/open/high/low，且回應允許 GitHub Pages origin。為避免 JSON `Content-Type` 觸發 CORS preflight，前端使用 `text/plain` 傳送 JSON body。

## SPOT

TradingView 的 PIONEX crypto scanner目前掃到的 PIONEX rows皆為 `.P` PERP，因此 SPOT 仍保留原 Pionex ticker fallback。
