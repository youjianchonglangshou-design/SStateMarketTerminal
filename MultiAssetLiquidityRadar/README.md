# MultiAssetLiquidityRadar v1.2.0 · 4H 實際 K 線監控

## v1.2.0 功能

* 每個自選標的顯示真正 4H OHLC K 線（4H = 240 分鐘），不是日 K 拉伸。圖表讀取 TradingView Pionex 圖表，失效時依序透過既有 Cloudflare Worker、Pionex REST、加密貨幣 Binance 備援；無有效 K 線時顯示等待、不虛構 K 棒。
* 4H 布林帶（收盤價 20 根、2 倍母體標準差）：白色上下軌及藍灰色中軌；實際 4H K 線疊加。
* 黃／紫階梯：**日線平均 K（Heikin-Ashi）的 HA 收盤值**，從與主頁相同的日線 OHLC 推算，依 **Asia/Taipei 08:00** 換日；1 個日階梯最多橫跨 6 根 4H K 線。非 4H HA，請勿混淆。
* 靠近階梯時顯示從所指價位延伸到右側價格軸的虛線、價格標籤、時間垂線；其他圖表區域顯示常規價時十字游標。
* 右側價格刻度，價格橫向虛線；每個台灣 08:00 換日垂直時間虛線；下方有台灣日期與 08:00 刻度。
* 7D CoinGlass 上下界、NOW 即時價皆依價格繪成水平線，右邊獨立標籤；上下界過近時只移動標籤並畫連接線，**不移動實際水平價格線**。保留 15M 代理資料來源顯示與原資料源備援。
* 頂部四個膠囊：S 狀態、中軌斜率、日線平均 K（含前日顏色 → 今日顏色）、CCI-SMA；沿用原來主站的日線引擎及顏色定義。
* 移除原小三線圖、機率卡與不必要的 CCI 下方面板。保留篩選、排序、顏色標記持久化、Telegram 小鈴鐺、CMC 恐懼貪婪卡、7D 清算來源與主站返回連結。

## 資料更新與限制

NOW 報價每 10 秒刷新；CoinGlass 7D 每 60 秒刷新；4H K 線每 4 分鐘嘗試更新；日線歷史每 12 分鐘嘗試更新。非交易所提供的 4H 新 OHLC 不會被編造；若最新一根 4H 與台灣當前 4H 區間一致，NOW 更新該根尚未收線 K 的 close/high/low 僅用於**顯示**，不覆寫抓回的歷史資料。

4H 布林帶、日線平均K 階梯、四個日線膠囊的週期可能不同，圖表標籤已明確區分。若 TradingView / API / Worker / GitHub Pages 因網路、CORS、限流或交易對不支援而無資料，對應欄位保留等待或錯誤，不顯示虛假行情。官方 CoinGlass 資料缺失時，代理值不冒充官方。

## 覆蓋檔案（只有 MultiAssetLiquidityRadar 子目錄）

- `MultiAssetLiquidityRadar/index.html`
- `MultiAssetLiquidityRadar/style.css`
- `MultiAssetLiquidityRadar/app.js`
- `MultiAssetLiquidityRadar/chart4h.js`（新增）
- `MultiAssetLiquidityRadar/VERSION.json`
- `MultiAssetLiquidityRadar/README.md`

不需要更動根目錄主頁、Cloudflare Worker、monitor-engine.js、symbols.js、alerts.js、color-marks.js 或恐懼貪婪頁。
