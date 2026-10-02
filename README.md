# v0.3.08｜FIRST-PAINT CURRENT PRICE FIX

修正 Live Monitor 首次載入時短暫顯示 R2 歷史日 K 最後 close，而不是當下 TradingView Scanner 現價的問題。

## 原因

v0.3.07 的啟動順序是：

1. 先呼叫 TradingView Scanner
2. 但此時歷史日 K 尚未 warm-up，`applyLiveSnapshot()` 因 `r.daily` 為空而丟棄第一次現價
3. 接著 R2 歷史 K 載入，畫面顯示歷史快取 close
4. 要等下一個 10 秒 timer 才套用真正現價

## v0.3.08

改成：

1. 載入 R2 watchlist
2. warm-up 歷史日 K
3. **立即**呼叫 TradingView Scanner
4. 用最新 close/open/high/low 重建當前日 K
5. 立即重新計算 S-State / 中軌 / 平均K / CCI-SMA
6. 之後維持每 10 秒更新

新增標的與另一台電腦同步新增標的也套用相同順序。
