# Multi-Asset Liquidity Radar v1.1.4

## 變更

- 在「日線平均 K」的左側依序加入「S 狀態」及「中軌斜率」。
- 來源是 SStateMarketTerminal 原版 `monitor-engine.js`（`SStateMonitorEngine.analyze`），不是自行近似的 S 判斷。
- 原版引擎使用同份日線 OHLC，包含 S0/S0.5/S1/S2/S3、OTHER，以及最近 5 天中軌斜率與前 5 天趨勢差。
- 表頭可依 S 狀態、中軌斜率升降排序。平均 K 黃色優先時，先比黃黃／黃紫，再比中軌上斜方向與 S 狀態。
- **S 狀態、中軌斜率、CCI-SMA 均不參與 BTC 39 特徵模型的機率計算。**
- 無可用日線或無法載入原版引擎時顯示 `--`，不編造 S 訊號。

## 覆蓋安裝

將覆蓋包的 `index.html`、`app.js`、`style.css`、`VERSION.json` 解壓覆蓋。`symbols.js` 完全不需要改。

## 注意

`index.html` 與原版本一樣需連到外部腳本；本版額外引用 `../monitor-engine.js`。若網路或 GitHub Pages 失效，S 狀態／中軌將顯示缺值，其他欄可繼續更新。SState 原版引擎如日後更新判斷規則，本版也會跟著更新。

歷史日線在背景取得，初次開啟時可能暫時顯示 `--`。若有超過 90 秒未更新的即時價格，不顯示過期行情為即時。


## SStateMarketTerminal 整合方式

- 本資料夾位於 SStateMarketTerminal 專案根目錄。主站的「清算監控」按鈕在新分頁開啟 `./MultiAssetLiquidityRadar/index.html`。
- S 狀態／中軌斜率從上一層 `../monitor-engine.js` 載入，直接共用主站引擎。
- 請在 `symbols.js` 維護自選清單，原先使用者的清單與演算核心均保留。
- 清算／BTC 39 特徵模型仍沿用 BTC_iquidation 公開腳本（網路存取必要）。
- 10 秒行情掃描、CoinGlass 7D（1週） 資料與滾動機率不凍結、不結算，並未併入 SState 的 72H 正式分析結果。


## v1.1.4｜價格提醒小鈴鐺（SState 共用）

- 每個幣種名稱右側顯示小鈴鐺；點擊輸入觸發價，上破／下破方向由 Worker 依現價決定。
- 可透過小鈴鐺重新開啟編輯或刪除。提醒由現有 `/api/monitor/alerts` 儲存在 R2，與主站 `monitor.html` 是同一份，不需要另設 Telegram Bot Token 或 Chat ID。
- 開著網頁時每 10 秒呼叫 `/api/monitor/alerts/check`（有提醒時）；關閉網頁後由既有 Cloudflare `* * * * *` 定時工作繼續檢查；僅 Telegram 發送成功後才從 R2 刪除該提醒。
- **WTI 重要設定**：為讓雷達 WTI 和 `monitor.html` 共用 `WTI_USDT_PERP`，Cloudflare Worker 需改用 `PIONEX:CLUSDT.P` 查詢 WTI 的 TradingView 行情。相關後端修正另附 Worker 覆蓋包，**GitHub Pages 部署本身不會更新 Cloudflare Worker**。
- `symbols.js` 保留原樣；新增提醒不會改動清算上下界、BTC 機率或 S 狀態／中軌等演算法。
- 離線 JS 模擬測試確認建立、編輯、重開網頁狀態同步、刪除及模擬 Worker 到價回應；實際 Telegram 發送需部署後用既有 Worker 自行測試。


## v1.1.6｜CoinGlass 清算上下界改為一週
- `fetchCoinGlass('7d')` 改抓一週最大痛點清算上下界，不是沿用 24H 資料只換標題。
- 表頭、資料來源、診斷與註解都改為 7D / 1週。
- 仍每 60 秒嘗試更新；價格依舊每 10 秒嘗試更新。
- BTC 39 特徵短時窗機率不變；它**不是七日先掃機率**，與七日上下界需分開解讀。
- 沒有 CoinGlass 一週資料時，原本 15M 代理價帶仍會以「代理」標示，不能視為 7D CoinGlass 資料。
- 未修改 Cloudflare Worker、Telegram 鈴鐺、SState 分析引擎或自訂 `symbols.js`。


## v1.1.7｜OTHER-UP／OTHER-DN 即時分類
共用上層 `monitor-engine.js` 的延續判斷，不變動正式原始 S 狀態。窄欄顯示 OT-UP／OT-DN，並提供完整 tooltip；排序也納入新分類。


## v1.1.8 CMC 恐懼與貪婪懸浮卡

- 在「← SState 主站」右側新增「恐懼與貪婪」膠囊。滑鼠移入開啟中型一年線圖卡片，離開卡片立即關閉；觸控裝置點擊膠囊開啟、點擊外部關閉。
- 直接移植 CMC_Fear_Greed_GitHub_v1.6.0 的六種固定顏色、起漲黃／起跌紫識別與游標資訊列語意底色。
- 移除 BTC 價格與 BTC 交易量線／圖例／API，亦移除原版多餘說明，保留 CMC 一年線圖、最新值、日期、互動資料列、手動更新與來源/錯誤顯示。
- 使用原有專屬 CMC Cloudflare Worker；卡片第一次開啟才載入，一直開著不會新增任何排程、R2 寫入或自動更新。
- 新增 `fear-greed.html` 與 `fear-greed-popover.js`，更新 `index.html`、`style.css` 與 `VERSION.json`，清算雷達本身的其他功能不變。


## v1.1.9｜恐懼與貪婪卡片放大且不超出表格邊界
- 桌面版懸浮卡改為維持原比例放大，視可用空間自動擴展。
- 卡片定位不再寫死，會依「清算表格」容器動態計算左右邊界，避免超出右側或左側。
- 視窗縮放、捲動或重新打開卡片時，會即時重新計算尺寸與位置。
- 手機版原本的固定彈窗行為維持不變。
