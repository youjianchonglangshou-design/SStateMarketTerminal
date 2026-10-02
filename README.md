# v0.3.09｜LIVE MONITOR SPLIT RWA LAYOUT

本版只調整 SState Live Monitor 排版與 RWA 分流：

- 頂部狀態 chips 移到標題右側。
- 新增標的改成右側固定漂浮 `+`。
- 主監控區改成左右雙欄：左側 CRYPTO、右側 RWA / 美股代幣。
- RWA 分類直接讀現有 Worker `/api/symbols/us-stock`（R2 動態清單），不以名稱尾碼猜測。
- 兩邊維持相同欄位：項次｜備註｜幣種｜現價+今日%｜S｜中軌｜平均K｜CCI。
- 仍使用 TradingView Scanner 每 10 秒更新 PERP 當日日線 OHLC，並保留 v0.3.08 首次載入即抓現價的修正。
- 兩欄共用排序與搜尋；各欄項次獨立從 1 開始。
