# v0.3.07｜UI CLEANUP + LIVE MONITOR

本版依目前使用流程精簡 SStateMarketTerminal 首頁。

## 已移除

- 首頁頂部 R2 備忘錄跑馬燈
- 右側 MEMO 備忘錄按鈕 / 抽屜
- 美股 FLOW RADAR / 板塊資金流向區塊
- 首頁對 sector-flow 的背景輪詢

## 保留

- 📡 即時監控（SState Live Monitor）
- TradingView Crypto Scanner 每 10 秒更新 PERP 現價 / 當日日線 OHLC
- SIGNAL MATRIX
- 完整分析
- 加密貨幣 / 美股代幣切換
- 原有 S-State、平均K、CCI-SMA、圖表與研究功能

本版沒有修改 Cloudflare Worker，也沒有改動 monitor 的計算邏輯。

## 排程清理

請刪除 `.github/workflows/sector-flow.yml`，避免已移除的 FLOW RADAR 繼續佔用 GitHub Actions。
