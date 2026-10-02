# v0.3.13｜LIVE MONITOR FAST WARM-UP

本版加速 Live Monitor 首次載入歷史日 K：

- 舊版：一次只暖機 1 個標的，每個標的後固定等待 1100ms。
- 新版：最多同時暖機 4 個標的。
- 每個 worker 之間只保留 180ms 安全節流，啟動時錯開 60ms，避免瞬間同時撞 API。
- R2 預熱快取仍是主要來源；若快取缺漏才沿用既有 Pionex fallback。
- v0.3.12 的慢速跑馬燈維持不變。
- TradingView Scanner、排序、搜尋、R2 同步與指標計算邏輯不變。
