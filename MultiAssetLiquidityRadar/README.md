## v2.1.19 — 自由清單新增即查 CoinGlass 7D（2026-10-30）

- **固定清單不再是 CoinGlass 唯一更新對象**：右下「自由清單」新增派網 USDT PERP 後，立即以已解密的 CoinGlass 7D 全市場資料比對並顯示上下界；同時強制啟動一次原有的 `fetchCG(true)` 更新（內部仍以 `fetchCoinGlass('7d')` 取數），不需重開頁面或等下一次 60 秒排程。
- 所有新增幣種與原本固定幣種共用同一份 CoinGlass 7D 資料，不對每個幣種新增獨立 API，也不改六版本 V0/V1/V2/V55/V66/V77 解密器。
- 動態幣種支援原始名稱優先，必要時對應去除尾部 X 的美股代幣代號（如 `GOOGLX` → `GOOGL`），並延伸原有 `1000` 單位換算給自由清單。
- 移除自由清單幣種後，原有的動態監控集合立即移除該幣種；不會因此刪除其他幣種資料或 Telegram 已設提醒。
- **若 CoinGlass 7D 原始清單本身沒有該幣種的有效上下界，僅顯示無資料；絕不產生 15M 代理清算價。**
- 僅需覆蓋 `app.js`、`index.html`、`VERSION.json`、`README.md`，其他檔案、Cloudflare Worker 均不變。

## v2.1.15 — CoinGlass 7D 界限唯一來源（2026-10-30）

- **上界／下界只使用 CoinGlass 7D**，BTC 等標的即使觸碰、跌破下界或突破上界，仍顯示 CoinGlass 原始清算界限，不得切換 15M 價格代理估算。
- 禁止自動排程 15M 代理 K 線來製造清算上下界；保留原本 4H、1D 歷史 K 線、平均 K、CCI-SMA、布林帶與 S 狀態的原有演算法。
- CoinGlass 暫時無法更新時，保留**最後成功取得的真實 7D 界限**，明確顯示「資料過期」，暫停 RR 訊號／通知；取得新的有效 CoinGlass 7D 後恢復。
- **RR 只使用新鮮的 CoinGlass 7D 界限**。即時價若不在 `(下界, 上界)` 內，RR 暫停判定，絕不改寫清算上下界。
- 現價、圖表現價標籤／水平線／呼吸光點維持 v2.1.14 的 WebSocket 約 300ms 同步；CL 顯示、CoinGlass CL、派網 WTI_USDT_PERP 映射不變。
- 僅需覆蓋 `app.js`、`index.html`、`VERSION.json`、`README.md`，不修改 Worker、R2、Pionex_WebSocket。

## v2.1.12 — Signal Spotlight 台灣午夜每日歸零（2026-10-28）

- 每天台灣時間 **00:00** 清空 Signal Spotlight 昨日事件卡片、未讀與事件數，今日重新累積；使用瀏覽器 `Intl.DateTimeFormat(Asia/Taipei)`，不增加 API 或 Cloudflare／R2。
- 使用獨立 `taipeiDate` 記錄每日事件歸屬，**與原本日線 K 08:00 換日互不干涉**。
- 清空前將既有事件 ID 轉為精簡的三日去重紀錄（不是歷史事件）；同一日線事件在重新整理、00:00 或多分頁同步時不會重生；日線形成中訊號的隔日確認不會補成新事件。
- 舊版 35 天雷達歷史在首次升級時不會轉入今日卡片；既有雷達分數門檻保留，當日不再以舊 240 筆上限無聲截斷。
- 前端會排程下一次台灣午夜檢查，同時每 15 秒補查；切回分頁、視窗焦點恢復、pageshow、掃描與寫入前均會核對台灣日期，睡眠與關閉期間則在恢復後補做。
- `localStorage` 同日期合併、跨日阻止舊狀態覆寫；保留 RR／通知 7 日統計和其他前端設定。若本機儲存失敗會在雷達訊息區提示。
- 僅覆蓋 `signal-spotlight-ui.js`、`index.html`、`VERSION.json`、`README.md`，不改任何其他程式、CSS、Worker。

## v2.1.11 — S 狀態膠囊與 SStateMarketTerminal 主站配色同步（2026-10-28）

- 修正雷達清單的 S3 原顯示綠色，與主站不一致；現在按照主站 `monitor.css` 對照，S3 黃金色、S2 綠色、S1 藍色、S0.5 紫色、S0 淺白色，OTHER 灰色、OTHER-UP 綠色、OTHER-DN 紅色。
- 採用與主站相同的膠囊前景色、底色和邊框色；適用左右監控清單與自由清單。
- 僅修改呈現用 CSS、頁面樣式快取版號和版本說明；S 狀態判定、圖表、繪圖、RR、通知、智慧雷達與 R2 均不變。
- 覆蓋 `index.html`、`style.css`、`VERSION.json`、`README.md`，不需更新 Cloudflare Worker。

## v2.1.6 — 通知與雷達移至恐懼貪婪左側（2026-10-27）

- 將底部圖表工作列原有「🔔 通知」及「◎ 雷達」按鈕**整組移動**到右側工具區、緊鄰「恐懼與貪婪」左側，順序為「通知｜雷達｜恐懼與貪婪」。
- 完全沿用原按鈕 ID、事件監聽、通知權限、LocalStorage 設定、雷達未讀徽章；無須重新授權。
- 更新浮動通知／雷達面板位置與底部圖表工作列的空間配置；原「⚙ 繪圖」、「▦ 均分」及多圖切換維持不變。
- 只需覆蓋 `index.html`、`style.css`、`VERSION.json`、`README.md`，不修改 Worker、R2、行情、RR、Signal Spotlight 運算或任何 JavaScript 功能。

## v2.1.4 — 工作台操作改善（2026-10-27）

- R2 繪圖記憶：新增逐幣核取方塊、「全選」、一次確認後順序清除多幣（不移除監控清單）。
- 自由清單上限 8→9；**必須先部署 `cloudflare/worker.js`**，否則舊 Worker 將拒絕九檔跨裝置同步。
- 折線圖 CTRL 磁鐵只吸 K 線收盤價；原 K 線 OHLC 吸附完全保留。
- 恐懼貪婪指數頁加入「直接前往」CoinMarketCap 按鈕，開啟新分頁；原 API 與重新讀取保持不變。
- 雷達刪除自由清單標的後清理其舊事件；去除「觀察中／延續條件」UI；只有四張均鎖定才顯示該提示。
- 既有 RR 六態幾何、10 秒行情、37 項矩陣、R2 設定與繪圖、HA/CCI 等運作不變。

## v2.1.3 — RR 幾何左肩膀修復（規則書 v2.4 / 2026-10-27）

- **①連降紫、⑤連升黃完全照舊**：不搜尋肩膀；分別直接檢查空方/多方延續 RR。
- **②連紫抬高、⑥紫轉黃**：由相鄰 HA 收盤價找最近有效谷底（日階梯先跌後升），左肩膀固定是**谷底日的前一天**，不管黃／紫。
- **③黃轉紫、④連黃降低**：找最近有效峰頂（先升後跌），左肩膀固定是**峰頂日的前一天**，不管黃／紫。
- 有多個轉折時取**最近一個**，可以用當天正在形成的 HA 確認昨天的轉折；不可用未來資料。持平底／頂以回升／回落前最後一天作轉折日；沒有有效轉折就不亮 RR 燈。
- RR 十階段、多空 1.50／1.70 可調設定、10 秒行情及 08:00 換日、R2 繪圖和設定記憶不變；**不新增行情請求**。
- 回歸案例：AVAX (2026/10/27) 最近谷底 10/25=8.91775，肩膀 10/24=8.94875，截圖現價 8.968、界 10.082/8.5716 → ②-B RR≈2.81 綠燈；舊版錯選 10/23=9.093。

## v2.0.7 — HA 語意圓點一律靠左修正（2026-10-26）

- 修正 v2.0.6 對黃色方塊誤用右上／右下定位的 BUG：**所有小圓點固定在左側**，點的顏色仍代表昨天，今日方塊底色仍代表今天。
- **今天 HA 收盤價比昨天低 → 左上；今天比昨天高 → 左下；相等 → 左中**，使用未四捨五入的 HA 收盤價。
- 正常六種狀態：紫→紫降低（紫左上）、紫→紫抬高（紫左下）、黃→紫（黃左上）、**黃→黃降低（黃左上）**、黃→黃抬高（黃左下）、紫→黃（紫左下）。
- 特別修復 HOLO 這類黃→黃、今日 HA 收盤價比昨日低時的定位；不變更指標資料、計算、既有更新、R2 或 API。
- 只覆蓋 `MultiAssetLiquidityRadar/app.js`、`style.css`、`index.html`、`VERSION.json`、`README.md`；不須更新 Cloudflare Worker。

## v2.0.6 — 平均 K 語意小圓點（2026-10-26）

- 大方塊仍代表今日 HA 黃／紫，小圓點顏色仍代表昨日 HA 黃／紫；小圓點改依 **HA 收盤價** 高低移動。
- 今天紫 → 小圓點在左側；今天黃 → 小圓點在右側。**今天 HA 收盤價提高 → 昨天的點在下方；今天降低 → 昨天的點在上方。**
- 六種情境：紫紫降低（紫左上）、紫紫抬高（紫左下）、黃轉紫（黃左上）、黃黃降低（黃右上）、黃黃抬高（黃右下）、紫轉黃（紫右下）。
- 收盤價持平使用同側中央點；資料缺失、兩日不連續或 HA 數學矛盾時不顯示小圓點，保留今日方塊與現有原始指標。
- 完整使用既有 1D OHLC、原始精度與每 10 秒更新；小價幣以相對誤差避免誤判。完全不增加 API、R2、排程或欄位寬度。
- 僅覆蓋 `MultiAssetLiquidityRadar/app.js`、`style.css`、`index.html`、`VERSION.json`、`README.md`；不需部署 Worker。

## v2.0.2 — 繪圖交互手感與標籤修正（2026-10-26）

- 修正左鍵水平平移反向：左拖 K 線往左，右拖 K 線往右；滾輪仍僅控制時間密度。
- CTRL 磁鐵在第一次點選繪圖端點前顯示 OHLC 吸附預覽；選取既有繪圖後，調整錨點同樣可按住 CTRL 吸附。
- 矩形選取時，在右側對數價格軸上顯示上、下邊界價格標籤，錨點移動時即時更新。
- 做多／做空選取時顯示進場價格標籤，以及目標、止損百分比；名義價值與市價/掛單邏輯不變。
- 跟隨滑鼠的十字虛線恢復高對比白色；原有 HA 延伸線、4H/1D、折線、R2/Worker 與雷達功能不修改。
- **只需覆蓋本包 5 個檔案**；不需重新部署 Cloudflare Worker。
- 回歸測試與尚未線上驗證的項目見 `TEST_REPORT_v2.0.2.txt`。

## v2.0.0 — 繪圖工作台（2026-10-25）

- 全圖共用對數價格軸；4H／1D 與 K 線／收盤折線切換；左鍵平移與滾輪時間軸縮放（4H 最多約 45 天）。
- 瀏覽更早歷史時單幣按需補載 300 根 4H，不在開啟網站時替 41 檔預抓。
- Fib 倍率 `0, 0.5, 0.618, 0.786, 1, 1.236, 1.5, 1.572, 1.618, 2`；採對數公式並依約定顏色標示。CTRL 可吸附當前週期 OHLC。
- 透明綠／紅／黃矩形與虛線中軸；做多／做空部位可各自設定兩組風險金額、停損、目標及掛單價格。
- 標題列僅顯示選取中的部位名義價值（多綠／空紅）。選圖＋Delete 刪圖，空白處取消選取，輸入框內 Delete 不會刪圖。
- S 膠囊切布林帶顯示、HA 膠囊切平均 K 階梯顯示；原監控運算不停止。繪圖與 HA 延伸按標的保存，4H／1D 皆可見。
- `drawing-workspace.js` 本機先存＋Worker R2 `drawings/<SYMBOL>_USDT_PERP.json`、修訂號與刪除標記；`drawing-manager.js` 記憶列表及刪除。
- **除了 GitHub Pages 檔案，必須把本版 `cloudflare/worker.js` 更新至現有 Worker 才能讓 R2 繪圖跨裝置正常工作。** 目前工作台視窗同步 API 保留。
- 沒有更動使用者上傳檔案內的 `rr-config.js` 門檻（**1.20**），也沒有變更 10 秒行情與 HA／CCI／S／雷達／RR 演算公式。
- 沒有接交易所下單功能；部位與名義價值是**理論規劃**，未含手續費與滑價。

## v1.8.5 — 即時 RR 加入日線平均 K 方向確認（2026-10-25）

- **做多亮綠燈**：`LongRR = (U - P)/(P - L) >= 1.50`，且**當前日線 HA 平均 K 是黃**。
- **做空亮紅燈**：`ShortRR = (P - L)/(U - P) >= 1.50`，且**當前日線 HA 平均 K 是紫**。
- 任一方向 RR 達標但 HA 顏色相反或缺值，**一律不亮燈**；若計算的 HA 所屬日不是今日（以台灣 08:00 換日），亦不亮燈。
- **不限制獲利幅度百分比**；不加入 CCI、S 狀態、中軌斜率額外過濾。
- 仍然使用原有即時現價、CoinGlass 7D / 有效備援上下界、共用 `dailyHA()` 的當前日線結果；三份清單（21＋12＋最多 8）同樣適用。
- **調整門檻**：`MultiAssetLiquidityRadar/rr-config.js` 裡 `THRESHOLD: 1.50`，改數字後重新上傳 GitHub 並強制重新整理網頁。
- 本次只修改前端，不變更 Cloudflare Worker、R2、圖表或智慧事件雷達。

## v1.8.4 — 即時賺賠比偵測器（歷史版本，已由 v1.8.5 取代）（2026-10-25）

- 左側加密 21 檔、右側美股／商品 12 檔，以及右側自由 PERP 最多 8 檔：幣名右側新增小 LED。
- 即時用圖表共用的現價 P、上界 U、下界 L 計算：做多 `(U-P)/(P-L)`；做空 `(P-L)/(U-P)`。只在 `L<P<U` 且資料有效、新鮮時顯示。
- **只依 RR 門檻判定，不限制波動百分比或指標顏色。** RR ≥ 1.70 時，做多綠 `#16D99A`、做空紅 `#FF5364`；均未達標或資料失效不顯示。
- 靜態燈號；滑鼠移到燈號顯示方向、RR、上下界、現價、來源與計算時間。燈號不保存，也不新增 Worker/API/R2。
- **修改門檻只要編輯 `MultiAssetLiquidityRadar/rr-config.js` 的 `THRESHOLD: 1.70`**（例如 1.50 或 2.00），覆蓋 GitHub 並硬重新整理頁面即可測試。
- 保留既有圖表工作列、四視窗、智慧雷達、價格鈴鐺、標記、清算與四項指標。

## v1.8.3 — 自由清單直接移除（2026-10-24）

- 在右側「自由清單 → 管理」點選標的旁的「移除」，立即移除該標的，不再跳出瀏覽器原生 confirm 確認框。
- 管理列表、清單 0–8 檔數量及瀏覽器保存資料同步刷新；管理視窗保持開啟，可連續移除不同標的。
- 保留原本的保護範圍：移除自由清單標的不會刪除其已建立的遠端 Telegram 價格提醒；該幣種的開啟圖表則沿用原有清理邏輯。
- 不更動雷達偵測、四視窗、行情、置後、Cloudflare Worker 或其他檔案。

## v1.8.1 — 工作列與持續置後修正

- 雷達入口緊靠均分按鈕左邊；終端 READY 資訊恢復寬度，圖表工作列保留四圖標籤。
- 置後為持續開關：按鈕有高亮／aria-pressed，點圖表不會解除；再按置後或雙擊同一圖表工作列標籤才解除。
- 原有 Signal Spotlight、4H 圖表、清算監控與四視窗功能均保留。

# MultiAssetLiquidityRadar v1.8.0 — Signal Spotlight 智慧事件雷達（2026-10-24）

## 新增功能

- 原底部「圖表工作列」增加「◎ 雷達」按鈕，只有符合門檻的新鮮五星 NEW 事件未讀時，按鈕才以約 3.8 秒柔和青綠光呼吸，無清單逐行閃爍。
- 新增獨立 `signal-spotlight.js`（37 條日線矩陣）與 `signal-spotlight-ui.js`（本機事件、未讀卡、門檻選擇、圖表開啟）。
- 由既有 `app.js` 的 `dailyAsOf()` 取得日線及最新形成中 K 線，分別用歷史截斷的日線資料重算 t-2／t-1／t 的 HA、CCI-SMA、中軌與 SState；使用原本 `monitor-engine.js`，不使用今日資料冒充歷史狀態。
- 區域用今日 HA 收盤相對 BB(20,2) 中軌；CCI-SMA -100 門檻以未四捨五入原值判斷；#23/#37 只比 `Math.round()` 後可見的 SMA，絕非 CCI 加速度。
- 只有五星＋NEW 的事件建立主提醒卡。其餘持續、警惕及非五星規則留在可展開的「觀察中」區塊，不反覆呼吸。初始門檻 80，可選 70/75/80/85/90；形成中扣 8 分。
- 以 `symbol|Rxx|YYYY-MM-DD` 去重；重算不製造第二個未讀事件。信號撤銷時保留事件但不呼吸；08:00 日線結算後對已經存在的前一日形成中事件核對確認／撤銷。
- 點事件卡才帶出 4H 圖表；存在的鎖定或最小化同幣圖表可恢復／置頂，四圖全鎖定時不替換、不偷開第五張。
- 記錄只在瀏覽器 localStorage 儲存，**不修改 Cloudflare Worker/R2**。關頁期間的形成中短暫訊號不一定能還原，也不具跨設備同步能力。
- 共用原有 33 檔固定清單與最多 8 檔自由 PERP 清單之行情資料；10 秒價格更新不代表 10 秒對所有標的重算三次 SState，只在重要指標變化／日線刷新時重評估。

## 覆蓋方式

將壓縮包 `MultiAssetLiquidityRadar/` 的檔案按相同路徑覆蓋至 GitHub 專案。不需修改根目錄主站、`monitor-engine.js`、`workspace.js`、`symbols.js`、`alerts.js` 或 Cloudflare Worker。

## 測試範圍

25 項純函式規則測試＋37 項單條矩陣可達測試＋30 項 Chromium 互動及版面測試；另以 95 根模擬真實型態 OHLC 日線完成 #30 偵測、去重、撤銷端到端（本機模擬，非即時交易所）。正式 TradingView/Pionex/CoinGlass API、Telegram 與其他設備上的同步沒有做線上端到端測試。完整結果見 `TEST_REPORT_v1.8.0.txt`。

---

# v1.6.2｜2026-10-24 微調更新

- 底部終端資訊區與四圖工作列之間僅保留一道分隔線。
- 歷史行情載入期間顯示 BOOT 進度條；載入批次完成後隱藏進度條，改顯示 READY／SYNC、監控標的數、雙黃、雙紫與 K 線完成組數。
- 圖表標題列的 S 狀態、中軌斜率、HA、CCI 四種膠囊恢復主站圓角與立體漸層質感，各項語意色保持一致。
- 不修改資料來源、四視窗邏輯、PERP 自由清單上限（8 檔）、顏色標記或 Telegram 鈴鐺邏輯。

## v1.6.1（2026-10-24）
- 圖表標題列直接顯示四項語意膠囊，移除置後鍵與冗餘 7D 描述列。
- HA 延伸線維持選取，只有點價格標籤或其他 HA 階梯可修改。
- 呼吸點完整呈現，週期 4 秒。
- 右側自由清單擴增為 8 檔；「管理」集中移除，禁止誤點 CCI 膠囊。
- 左右固定清單更緊湊，工作列右移，增加具實際載入資料的終端機進度條。

# MultiAssetLiquidityRadar v1.6.0 — 自由 PERP 清單與圖表研究互動（2026-10-24）

## 新版重點

- 加密清單 21 檔、美股／商品清單 12 檔保持全數可見、各自排序與六色標記；第三區自由清單固定在右側下方，最多 6 檔，沒有內部捲軸。
- 自由清單新增：點「＋新增」→ 搜尋派網 USDT 本位 PERP → 點選加入；結果不包含 SPOT。搜尋來源與原 `monitor.html` 一致：SState Worker `/api/monitor/symbols`。清單完整時只顯示已確認的合約，部分清單／離線時才允許明確標為「候選 · 未驗證」的手動輸入；若後續歷史資料失敗會呈現缺值，不會冒充有效報價。
- 自由清單與原本 33 檔共享行情、K 線、日線指標計算／備援，使用本機 `localStorage` 記憶清單。移除自選合約不會刪除 Telegram 遠端提醒，也不會修改 `symbols.js`。
- 圖表只改動表現：NOW 更名「現價」，其水平線加入小型青色呼吸光點；黃紫平均 K 階梯點一下即固定延伸線與不透明價格標籤（直到本圖點空白處／選另一段）；切換幣種則解除舊標籤。
- 狀態膠囊恢復 S 狀態、中軌斜率、HA、CCI 的顏色語意，置於圖表標題下方；十字游標虛線及日線布林帶加強約 30%。
- 恐懼與貪婪為點擊後才出現的加大高層彈窗；面板內能查閱歷史日期，游標離開面板即關閉。
- 4 圖工作列移入底部固定工具列；移除「全部更新」「重置排版」與 33/33 即時監控膠囊。原每 10 秒價格與原定義定期更新仍由程式自動執行。

## 覆蓋方式

本包僅含 `MultiAssetLiquidityRadar/` 內的需覆蓋檔案。對 GitHub `SStateMarketTerminal` 專案中同名路徑覆蓋即可；**不修改 Worker、主站、`symbols.js`、`alerts.js`**。

## 測試限制

已使用 Chromium 的本地 DOM/JavaScript + 模擬 OHLC/Worker 回應驗證 1862×992、1600×900、1366×768 桌面排版、PERP 篩選／新增／滿額／移除、四視窗、平均 K 選取記憶、圖層、點擊式情緒彈窗。沒有使用正式 TradingView、Pionex、CoinGlass 或 Telegram 做真實網路端到端驗證。

---

## v1.5.2：右側價格軸拖曳縮放（2026-10-24）

- 在圖表右側價格刻度區按住滑鼠左鍵：往上拖曳，K 線價格間距放大；往下拖曳，間距縮小。
- 雙擊價格軸恢復自動刻度；每張視窗獨立儲存價格軸縮放比例（0.25×–16×）。
- K 線、日線布林帶、HA 階梯、清算上下界與 NOW 使用相同價格軸重新計算，超出畫面的價格元素會裁切。
- 其餘四視窗、21/12 清單與原資料來源不變。

# v1.5.1 — HA 階梯點擊延伸線修復（2026-10-24）

- 在任何一張 4H 浮動圖表中，點擊真正的黃／紫色 **日線平均 K（HA）水平階梯段**，顯示沿該 HA 價格延伸到右側價格軸的同色水平虛線，與完全不透明的同色價格標籤。
- 價格標籤位於 SVG 最前景，遮住同價位其他標籤而不被它們蓋住；HA 真實價格與右側刻度完全一致。
- 滑鼠仍在該圖表時持續顯示（即使移到右側價格標籤）；離開該圖表立即消失；點擊其他空白或別的階梯也會取消／替換。
- 修復浮動視窗 pointerdown 自動重繪而讓後續 click 事件失效的問題。四張獨立視窗互不干擾；即時重繪、拖曳縮放、最小化還原等功能沿用 v1.5.0。
- **只需覆蓋本版 ZIP 列出的檔案**：`index.html`、`style.css`、`app.js`、`chart4h.js`、`workspace.js`、`VERSION.json`、`README.md`、`TEST_REPORT_v1.5.1.txt`。其他 JS、Worker、symbols 不需更新。

---

# MultiAssetLiquidityRadar v1.5.0 — 四視窗浮動工作台（2026-10-24）

## 本版功能

- **最多四張獨立 4H 浮動圖表**：底部新增「圖表工作列」，使用「＋新增」開啟第二、三、四張；達到上限後停止新增。每張有自己的幣種、標題列拖曳、八方向縮放、置後、預設尺寸還原、最小化、關閉、鎖定／解鎖。
- **清單點擊只切換作用中的未鎖定視窗**：不自動輪播。若目前作用中的視窗被鎖定，則優先改切其他未鎖定視窗，若全部鎖定且未達四張則新增；若四張全鎖定，維持原圖並提示先解鎖或關閉，絕不覆蓋鎖定的研究圖。點擊工作列標籤可找回或還原原視窗。
- **最小化／遮蔽時停用繪圖**：最小化移除該視窗的 SVG DOM 以釋放繪圖負擔、保留行情和指標記錄；完全被其他視窗遮蔽或背景網頁不可見時不重繪，重新還原／置頂時重新使用最新共用資料畫圖。四視窗不各自對 API 發起獨立請求。
- **維持 21／12 全畫面監控**：左右清單不新增捲軸、不縮減四項日線指標，不破壞既有獨立排序／顏色標註。**價格提醒鈴鐺改至標記旗標後面、幣種文字前面**。
- **排序字體更清楚**：兩份清單的獨立排序選單從 10px 提升為 12px，選單寬度調整至 137px；所有原有排序選項保留。
- **視窗個別記憶**：`SStateLiquidityRadar.workspace.v1.5` 保存每張圖表的幣種、尺寸、位置、鎖定、最小化、作用中視窗；首次升級會繼承 v1.4.0 圖表位置／尺寸（若曾儲存）。原標記／Telegram 警報 localStorage/R2 規則不更動。
- **共用資料，無重複請求**：由現有 `app.js` 保存並持續更新 33 檔資料；視窗交給 `chart4h.js` 繪製，沿用 4H OHLC、日線布林帶、HA 階梯、S狀態、CCI 和 7D 清算上下界。

## 交付覆蓋

僅將 ZIP 內 `MultiAssetLiquidityRadar/` 下的 7 個檔案依原路徑覆蓋原 GitHub 資料夾。不要刪掉原資料夾其他檔案，也不需要更新 Worker、GitHub Actions 或主站。保持原本 `symbols.js`, `alerts.js`, `chart4h.js`, `color-marks.js`、`fear-greed-popover.js` 等不變。`index.html` 已為新程式檔加上 v1.5.0 快取版本字串。

## 操作提醒

1. 在兩邊固定監控清單點標的：只更新目前作用中的未鎖定圖表；鎖定圖不被覆蓋。
2. 底部圖表工作列點「＋新增」開第二張（最多四張）；工作列標籤點一下可以將視窗帶到最上層／還原。
3. 圖表按 🔓 可鎖定為 🔒；按「−」最小化，按「×」真正關閉。最小化和關閉是不同操作，只有關閉才釋出四張的名額。
4. 圖表拖曳標題列移動，拖曳四邊或四角縮放；縮放會以新容器尺寸重新計算 SVG，而不是拉長圖片。
5. 頁面底部「重置排版」將仍開啟的視窗重新排列，保留標的與鎖定狀態。

## 驗證與限制

瀏覽器本地離線 UI 測試使用合成合法 OHLC 歷史資料；此報告只證明排版、圖表繪製座標、視窗操作與本地記憶邏輯，**沒有驗證遠端 Pionex / TradingView / CoinGlass 的即時連線品質，也沒有測試 Telegram 真正送達**。本機 1862×992、1600×900、1366×768 無清單捲軸；在更小螢幕或調高系統字體比例時仍受物理空間限制。

---

## v1.4.0 舊版說明（保留）

# MultiAssetLiquidityRadar v1.4.0 — 雙市場固定監控 + 自由浮動 4H 圖表

## v1.4.0 改版摘要（2026-10-24）

- **唯一的可拖曳 4H 圖表**：標題列移動、四邊及四角縮放、點擊圖表置頂、點「置後」優先看清單、重置排版；縮放後直接按容器尺寸重繪 OHLC / 1D 布林帶 / HA 階梯 / NOW / 清算上下界，而不是把 SVG 當作圖片拉長。
- **雙市場固定可視**：左側 21 檔加密、右側 12 檔美股／商品；沒有清單捲軸，頁面不需縱向捲動。已在 1862×992、1600×900、1366×768 Chromium 桌面尺寸驗證。低於此高度與窄螢幕仍可能受字體與空間物理限制影響。
- **清單逐檔資訊**：保留標記旗幟、現價與 08:00 台灣換日漲跌幅；新增 S 狀態、中軌斜率、日線平均 K、CCI-SMA；HA 膠囊左上小色點代表前日顏色，今日顏色為膠囊內文字，滑鼠停留可看完整前日 → 今日轉色與斜率 / CCI 詳情。
- **兩市場各自排序**：標記集中、清單順序、字母、雙黃、雙紫、平均 K、CCI、中軌、S 狀態、最近清算界；排序互不影響且不自動切換圖表。
- **單圖點擊換幣**：點選任意清單標的直接更新中央 4H 圖表；即使圖表已經放大或移動，切換幣種依然維持圖表原本尺寸與位置，沒有自動輪播。
- **Telegram 價格提醒移位**：兩側每個標的右側都有小鈴鐺，沿用原本 alerts.js 與 Cloudflare Worker，不更動價格穿越判定或背景提醒。
- **底部工具列**：保留回主站、恐懼貪婪、連線狀態、台灣時間、全部更新、排版重置與診斷；移除全域搜尋、篩選及垂直多圖總表。
- **保留演算法**：原本的 4H OHLC、日線 BB/HA/SState/CCI 計算、7D CoinGlass 與失效備援、10 秒報價、60 秒上下界、4 分鐘 4H、12 分鐘日線等流程不改。

## 記憶範圍

- 顏色旗標：沿用 `SStateLiquidityRadar.colorMarks.v1`，如 Worker 已配置可跨裝置同步。
- 浮動圖表位置與大小：新增 `SStateLiquidityRadar.workspace.v1.4`（此瀏覽器 localStorage）。
- 目前幣種與兩清單的排序：新增 `liq-v140-active-symbol`、`liq-v140-sort-crypto`、`liq-v140-sort-stock`（此瀏覽器 localStorage）。
- 伺服器 Telegram 提醒設定沿用原本 Worker，不會移除既有提醒。

## 部署

將此版本壓縮檔中的 `MultiAssetLiquidityRadar/` 下檔案原路徑覆蓋到 GitHub 倉庫同名資料夾，不需要更動根目錄、`monitor-engine.js`、Worker、`symbols.js` 或 `color-marks.js`。**新增的 `workspace.js` 也必須一併上傳。**

## 驗證限制

在本地 headless Chromium 使用測試 OHLC 資料與隔離外部 API 完成排版、選幣、拖曳縮放、指標、選色、提醒視窗、兩清單排序等功能驗證；即時 CoinGlass/TradingView/Pionex、Telegram Worker 實際端到端網路回覆需在部署環境另行確認，不宣稱已實測遠端服務成功。

---

## 舊版技術說明（保留）

# MultiAssetLiquidityRadar v1.2.6 · 4H 實際 K 線監控

## v1.2.5 功能

* 每個自選標的顯示真正 4H OHLC K 線（4H = 240 分鐘），不是日 K 拉伸。圖表讀取 TradingView Pionex 圖表，失效時依序透過既有 Cloudflare Worker、Pionex REST、加密貨幣 Binance 備援；無有效 K 線時顯示等待、不虛構 K 棒。
* **日線 1D 布林帶**（20 日收盤價均線、2 倍母體標準差，與主站 monitor-engine.js 同一套）：上軌、中軌、下軌依真正的日線數據計算後對齊 4H 時間軸。只有實際 OHLC K 棒採 4H，三條日線布林帶均已淡化。
* 黃／紫階梯：**日線平均 K（Heikin-Ashi）的 HA 收盤值**，從與主頁相同的日線 OHLC 推算，依 **Asia/Taipei 08:00** 換日；1 個日階梯最多橫跨 6 根 4H K 線。非 4H HA，請勿混淆。
* **滑鼠左鍵點擊**日線平均 K 黃／紫階梯時才顯示延伸右側的同色虛線及價格標籤；僅移動滑鼠不觸發價格標籤。滑鼠移開被點選的階梯（日期或價格位置）、離開繪圖區或圖表立即清除；即時價格重新繪圖時，若游標仍停在原階梯，選取可保留。
* 右側價格刻度、價格橫向虛線；每日台灣 08:00 換日垂直時間虛線；下方**只顯示 MM/DD 日期**，不再顯示 08:00。右端最新 K 棒後方保留 3 根 4H K 棒位置。
* 7D CoinGlass 上下界、NOW 即時價皆依價格繪成水平線，右邊獨立標籤；清算上下界標籤**只有數值**（不寫 CG 7D、上、下或 $），NOW 則是 NOW 加數字。上下界過近時只移動標籤並畫連接線，**不移動實際水平價格線**。15M 代理資料來源保留於程式邏輯／診斷而不在價格前加註。
* 頂部四個膠囊：S 狀態、中軌斜率、日線平均 K（含前日顏色 → 今日顏色）、CCI-SMA；沿用原來主站的日線引擎及顏色定義。
* 移除原小三線圖、機率卡與不必要的 CCI 下方面板。保留篩選、排序、顏色標記持久化、Telegram 小鈴鐺、CMC 恐懼貪婪卡、7D 清算來源與主站返回連結。

## 資料更新與限制

NOW 報價每 10 秒刷新；CoinGlass 7D 每 60 秒刷新；4H K 線每 4 分鐘嘗試更新；日線歷史每 12 分鐘嘗試更新。非交易所提供的 4H 新 OHLC 不會被編造；若最新一根 4H 與台灣當前 4H 區間一致，NOW 更新該根尚未收線 K 的 close/high/low 僅用於**顯示**，不覆寫抓回的歷史資料。

唯一的 4H 級別是實際 K 線；BB(20,2)、S 狀態、中軌斜率、HA 平均 K、CCI-SMA 均為 1D 資料。若 TradingView / API / Worker / GitHub Pages 因網路、CORS、限流或交易對不支援而無資料，對應欄位保留等待或錯誤，不顯示虛假行情。官方 CoinGlass 資料缺失時，代理值不冒充官方。

## 覆蓋檔案（只有 MultiAssetLiquidityRadar 子目錄）

- `MultiAssetLiquidityRadar/index.html`
- `MultiAssetLiquidityRadar/style.css`
- `MultiAssetLiquidityRadar/app.js`（版本號）
- `MultiAssetLiquidityRadar/chart4h.js`（覆蓋舊版）
- `MultiAssetLiquidityRadar/VERSION.json`
- `MultiAssetLiquidityRadar/README.md`

不需要更動根目錄主頁、Cloudflare Worker、monitor-engine.js、symbols.js、alerts.js、color-marks.js 或恐懼貪婪頁。

v1.2.5 將 4H K 棒改成紅色空心、綠色半透明實體；上下影線仍分別止於實體邊緣，不穿過實體。圖表改為接近 TradingView 的深墨黑背景、極淡水平網格與淡虛線日切線，清算與日線平均 K 階梯繼續為主視覺。

## v1.2.5 微調

- 綠 K 實體改成半透明青綠色、紅 K 保持空心；影線仍不穿過實體。
- 修正點選平均 K 階梯後，滑鼠移開該階梯卻殘留標籤的行為。
- 清算與 NOW 標籤、平均 K 延伸標籤背景變得更透明；虛線細化、淡化。
- 仍沿用 1D 指標與 4H OHLC、CoinGlass 7D 數值及既有即時刷新。

## v1.2.5 平均 K 標籤修正

- **只有點擊平均 K（黃色／紫色）階梯時出現的右側數字標籤底色，改為完全不透明（100%）**，不讓後方 NOW 與清算價標籤透出重疊。
- NOW、清算上下界的價格標籤維持半透明（60%）；平均 K 的延伸虛線、點擊／滑鼠移開隱藏行為、4H K 線與全部日線指標維持 v1.2.3 不變。

### v1.2.5：日線 BB 跟隨當前 4H 即時價

- 布林帶仍為 **1D BB(20,2)**，不是 4H BB；當日暫時日 K 由當天 4H OHLC 彙整，最新收盤價使用有效即時報價。
- 即使日線 API 尚未回傳當日日 K，也會使用當天 4H OHLC 補入今日暫時日 K；每日台灣時間 08:00 換日。已完成日 K 不回頭修改。
- 日線 S 狀態、中軌斜率、平均 K、CCI-SMA 和圖表布林帶共用同一組投影日 K；每 10 秒既有即時行情刷新時重新計算。
- 4H 空心／半透明 K 線、7D 清算、NOW、點擊平均 K 延伸線、鈴鐺與註記保持原狀。

### v1.2.6：TradingView OHLC + 滑鼠價格讀取

- 圖表左上角顯示 4H 開／高／低／收，預設為最新 4H K 線；滑鼠移動至歷史 4H K 線顯示該根 OHLC；移開回復最新 K。
- 十字虛線的右側價格軸新增對應滑鼠高度的即時價格標籤（保留清算標籤、NOW、平均K點擊延伸）；最新K右側的三根空白位置仍可讀價。
- 純前端修改，不變更日線資料來源、S狀態／中軌斜率／平均K／CCI 演算、10 秒 NOW 更新、清算 API 或提醒。

### v1.2.7：左右浮動標的快速導覽

- 左側固定加密貨幣，右側固定美股代幣／商品，兩者直接讀取 `symbols.js` 中的 `group` 欄位，無需手動編輯第二份名單。顯示名稱及現有報價，沒有增加新 API。
- 點選名稱平滑跳至對應的標的資料列與 4H 圖表並短暫高亮；即使目前篩選／搜尋排除該標的，也會自動清除篩選後跳至正確位置；各種排序不影響定位。
- 側欄固定於視窗，可隨捲動顯示當前標的；窄螢幕改為左右摺疊標籤，點開才顯示完整清單，選取後收起。
- 原有圖表、指標、七日清算、Telegram 鈴鐺、顏色標記及即時更新不變。


## v1.7.0 浮動四圖・跨裝置工作台

本次更新直接採 v1.6.2 往上增量，保留固定 21 檔加密、12 檔美股與最多 8 檔自選 PERP，以及每日 08:00 換日的日線指標。

- 圖表標題列操作順序：鎖定、置後（只在加密清單後面）、還原預設、最小化、關閉。
- 底部圖表工作列右側 `▦ 均分`：2 張上下分割；3 張按第一次上 2 下 1、第二次上 1 下 2；4 張 2×2。
- 當前可見視窗參加均分，最小化視窗不會強制還原。可繼續手動移動、縮放。
- 平均 K 階梯點擊的價格標籤由視窗記憶：視窗重繪、最小化、重新開啟網頁都會恢復（原階梯仍在圖表範圍時可顯示）。改選階梯或點已選價格標籤會更新或清除；關閉視窗會刪除視窗的全部狀態。
- 共用 R2 狀態包括：視窗數、幣種、尺寸、座標、上層／左加密清單後方、鎖定、最小化、垂直縮放、HA 選取時間，以及自由清單 8 檔。

### 跨裝置同步必要條件（不能省略）

1. GitHub 覆蓋 `MultiAssetLiquidityRadar/` 內的前端檔案（注意**新增** `workspace-sync.js`）。
2. 將更新的 `cloudflare/worker.js` 部署到**現有** `white-meadow-16bc` Worker（使用原有 Cloudflare R2 `JSON_BUCKET` 綁定），**不要**將範例 wrangler 配置部署為新的 Worker 服務。
3. 確認 `GET https://white-meadow-16bc.youjianchonglangshou.workers.dev/api/monitor/radar/workspace` 回傳 `ok:true` 與 `revision`；舊版本未部署會回 404，此時仍能本機記憶但**不會**跨裝置同步。
4. 共用安裝資料使用 revision 控制與本機離線備援；當兩台設備同時修改，最近一次成功同步的狀態可能覆蓋另一台設備（最後寫入者優先）。

**安全事項**：`/api/monitor/radar/workspace` 是與同 Worker 使用者共用的狀態，沒有個別帳號鑑別；若頁面與 Worker 公開，知道端點者可能讀寫工作台狀態。正式共享給別人前需設定服務端存取控制（例如 Cloudflare Access／獨立授權）。不要在公開 GitHub Pages 裡寫入私有認證金鑰。


## v1.7.1 雙圖「上下均分」修正

- `▦ 均分` 偵測到 **2 張可見圖表**：改為上／下平均分割，各占中央可用寬度，間距 6px；圖表跟隨容器重新繪製。
- 3 張圖表維持原有兩種可輪替版型；4 張圖表維持 2 × 2。
- 只有可見（未最小化）圖表參與均分；套用後仍可自由拖曳、縮放，並延用本機／R2 記憶功能。


## v1.8.2 — Price bell and diagnostic overlay repair

- Alert initialization now waits for the asynchronous market context (workspace state restore can delay `app.js`).
- Price bell opens the original Telegram ABOVE/BELOW target-setting modal on fixed and custom PERP watchlists.
- Alert modal and diagnostics panel sit **above all four floating charts**.
- No changes to Telegram Worker endpoints, 37-rule Spotlight engine, chart price-scale/HA behavior or market refresh schedule.


### v1.9.0 — Startup priority + IndexedDB history
- Initial 1D history queues before nonessential 4H; up to four restored/active 4H windows are prioritized.
- 15M fetches occur only for individual symbols with invalid/missing CoinGlass 7D after first 7D and quote fetches have settled.
- Immutable closed OHLC caches in IndexedDB; upon revisit a short tail is fetched and overlap checked, with full refresh on mismatch.
- Source success preference is stored locally while retaining all fallbacks.
- Startup progress counts usable current-day daily HA, CCI, S state and midline.
- Live quote cadence, repeated derived indicator calculations, 37-signal spotlight, and the uploaded RR threshold setting (1.20) + HA gating remain unchanged.


## v2.0.1 — Drawing UI regression fixes

- Mouse wheel adjusts time density; primary-button drag pans both timeline and logarithmic price axis without zooming, including future blank space.
- Ctrl OHLC magnet is enabled before drawing starts. Fib now uses upper first anchor = 1, lower second anchor = 0.
- Rectangle handles include mid-edge extenders; long/short position creation is valid on first click, with a per-position limit-order toggle.
- Click HA staircase to restore persistent price extension even when mouse pan layer captures input.
- Right-side semantic notional header and maximize / restore.
- Unchanged: Worker, RR thresholds, SState/HA/CCI formulae, Signal Spotlight and 10-second live monitor.


## v2.0.3 操作精修（2026-10-26）
- Fib／矩形第一點已放置後按右鍵，取消尚未完成的圖形；Ctrl+Z 恢復每幣最近一次繪圖新增、刪除或拖曳編輯（不劫持輸入欄位）。
- 工具列左側 ⠿ 可拖曳，位置隨工作台跨裝置同步；OHLC 置於工具列上方。
- 只有選取多／空部位時才顯示右側進場、目標、止損價格標籤；目標／止損標籤附上百分比。
- 多空填滿色透明度減半，現價標籤不顯示「現價」文字，清算上下界只顯示價格標籤，不畫延伸線。
- 「⚙ 繪圖」設定新增預設止損金額 1/2，套用下一張部位，保存至現有工作台跨裝置設定。
- 同時最大化多張圖表時，點下方視窗標籤可帶到前景。


### v2.0.4 — 多空目標／止損水平對價虛線（2026-10-26）

- 點選做多或做空部位後，目標價以淡綠色水平虛線、止損價以淡紅色水平虛線延伸至整個繪圖區右側價格軸。
- 拖曳目標／止損錨點時，虛線與價格百分比標籤使用同一對數價格投影，即時同步上下移動。
- 未選取部位時不顯示輔助虛線；虛線不攔截滑鼠事件，也不寫入 R2（直接依既有部位價格重建）。
- 不變更其他資料、繪圖工具及每 10 秒動態指標更新。


## v2.0.5｜名義價值膠囊＋CCI-SMA 懸浮圖卡（2026-10-26）

- 做多名義①／②：選取後顯示在止損下緣外側，左／右綠字；做空在止損上緣外側，左／右紅字。標題列移除金額。窄矩形時第二個膠囊往風險區外錯位。
- CCI 懸浮卡：監控清單及浮動圖表標題列 CCI 膠囊滑入顯示、移出隱藏；全站只建立一張卡。使用主站 `../monitor-engine.js` 的 `calculateCciSma`，以完整既有日線計算後取最後 20 日；白色 CCI、黃紫 SMA 階梯、+100/0/-100 參考線完整沿用主站樣式，不含日期追蹤。
- 不增加額外行情 API 請求；每 10 秒行情更新時僅刷新正在顯示的那一張小卡。
- 部署：僅覆蓋本次 ZIP 列出的 GitHub Pages 檔案，不更新 Cloudflare Worker。


## v2.0.8｜名義價值表格顯示（2026-10-26）

- 選取做多／做空部位後，在該浮動圖表右下角顯示三欄表格：止損價格｜名義價值①｜名義價值②。
- 做多名義綠字、做空名義紅字；未選取部位時隱藏；改選其他部位不沿用舊數字。
- 移除止損線外的舊 SVG 名義膠囊，保留 RR、進場／目標／止損標籤、水平虛線與原有計算公式。
- 固定每窗獨立的 HTML 表格，縮放、平移、最大化及每 10 秒 SVG 重繪都不改變表格錨點。
- 不改變 Worker、R2 繪圖結構及行情 API。


## v2.0.9｜名義價值雙欄表格（2026-10-26）

- 依照使用者回饋，移除固定右下表格的「止損價格」第一欄。只保留「名義價值①｜名義價值②」。
- 表格整體向左位移；不同視窗尺寸使用響應式 `right`，不貼住右側價軸。
- 多單兩欄顯示綠色、空單兩欄顯示紅色，僅選取部位後顯示；兩欄仍沿用 v2.0.8 的止損換算結果。
- `workspace.js`、`style.css`、`index.html`、`VERSION.json`、`README.md` 是唯一需覆蓋檔案；無 Worker／R2 部署。


## v2.1.0 — 六態十階段即時 RR（規格 v2.2.1）

- 每次有效行情更新，從同一份日線 OHLC 形成 HA 歷史，重新計算六態及對應的十個偵測分支；不增加額外行情請求。
- ① 空延續、⑤ 多延續；②/④ 動態回溯高／低肩膀；③/⑥ 向歷史搜尋最近一個已收線的「與今天同色」 HA 階梯，現價 P 與肩膀比較決定方向。
- 延續 RR 預設 1.50、反向轉勢 RR 預設 1.70，兩者可在**網頁底部工作列「⚙ 繪圖」→ 原有 R2 繪圖記憶管理**中獨立調整，與止損金額預設共存。套用後立即重算所有監控清單 RR LED。
- RR 參數保存於現有 `SStateLiquidityRadar.workspace.v1.5` 工作台 JSON，沿用 `workspace-sync.js` 跨裝置同步；不寫入單一幣種的 R2 繪圖 JSON。
- 左肩膀與 RR LED 都不保存歷史觸發狀態；價格突破／跌回、今日 HA 轉色或 08:00 換日後重新動態判斷。
- 手動多空部位、目標／止損與名義價值表格計算完全不受影響。


## v2.1.1 — RR 左肩膀辨識修復（2026-10-27）

- 修復 ③/⑥ 原本依今日黃紫顏色直接搜尋歷史同色階梯造成的誤判；統一根據 **HA 收盤價階梯的最近一段升降轉折** 選出左肩膀，不再用「黃→找黃／紫→找紫」作為硬性條件。
- ⑥ 近期下降腿的第一個下降階梯作為高肩膀，③ 使用鏡像的上升腿；單階反轉則回看轉折左側平台。②/④ 仍按既定的「最近且高於／低於今日 HA」向歷史回溯。
- 找不到可驗證結構、缺連續日線或未取得有效上下界時 **不亮燈**，不猜一個替代肩膀。
- 門檻維持：① 空 1.5，② 未破空 1.5／上破多 1.7，③ 未跌多 1.7／下破空 1.5，④ 未破多 1.5／下破空 1.7，⑤ 多 1.5，⑥ 未破空 1.7／上破多 1.5。兩個門檻仍可從底部「⚙ 繪圖」調整。
- 清單幣種名稱的滑鼠提示增加不亮燈時的肩膀日期／價格／搜尋法／候選 RR，讓查錯不再依賴亮燈。
- 強制回歸：INTCX 形成中 10/26 黃色，歷史 10/21 高點 93.1825→10/22 紫 88.0725→10/23 低點、右側恢復，應參照 10/22 的 88.0725；P≈90.81 時多方 RR≈0.135，不亮紅燈。此回歸使用已知截圖點位重建的 **合成日線序列**，不是從交易所取得的當時完整 OHLC 檔。
- `TEST_REPORT_v2.1.1.txt` 與 `tests/rr-v211.test.js` 證明重播測試的範圍；不能將合成資料驗收誤寫成四個幣種完整真實行情回測。


## v2.1.2 — 獨立持久化止損金額與 RR 門檻

此版加入 `/api/monitor/radar/settings`，在 Cloudflare R2 獨立儲存 `terminal/radar_settings_v1.json`，
保留預設止損金額 1／2 和 RR 延續／轉勢門檻。不同設備重新開啟、GitHub Pages 程式版本更新，
都會以同一份 R2 設定為準。原本的每幣繪圖 JSON 不受影響。

**部署順序：先發布 `cloudflare/worker.js`，再覆蓋 `MultiAssetLiquidityRadar` 前端檔案。**
舊 Worker 的 `radar/workspace` API 只保存視窗與自選清單，會丟棄這兩組設定。
更新 Worker 後，請把希望保留的數值再儲存一次，確認介面顯示「已存入 R2」。
若 R2 連線失敗，前端會顯示「已存本機，R2 尚未同步成功」，不可將其視為跨裝置同步完成。
舊的 R2 圖表記憶、止損/進場/目標繪圖數值不需要重建。


## v2.1.5 Browser Notification Monitor

RR LED transitions and new Signal Spotlight events can generate **page-lifetime-only** browser notifications. A `♧ 通知` button on the chart dock provides opt-in RR/radar toggles, notification-permission request, a test button, and 7-day local event statistics. First valid observation is always baseline, after refresh/invalid feed/revision no backlog is sent. RR thresholds and all market calculations remain untouched, and there are **no new network requests or Cloudflare/R2 deployments**. Multi-tab event deduplication uses Web Locks where available and localStorage as a best-effort fallback. Browser/OS settings can suppress notification display even if the app attempts to send.


## v2.1.8 — 圖表工作列留白與上限提醒修正（2026-10-27）

- 回復 v2.1.6 原本的視覺按鈕位置：工作列標題、繪圖、圖表分頁、新增、黃色訊息區、均分。
- 只比 v2.1.6 微縮 12px 的工作列寬度，不再像 v2.1.7 大幅縮短造成中央空白。
- 當已經開啟四張圖，新增按鈕保持可點擊；點擊時顯示「最多只能開啟 4 張圖表」，不會真的新增第五張。
- 較窄畫面無法容納完整提醒時，黃色文字暫時浮在工作列上方，4 秒自動消失。
- 保留通知、智慧雷達、恐懼與貪婪、RR、繪圖設定、日線行情、雲端同步等原始功能。


## v2.1.9 — 圖表工作列右側邊界微調（2026-10-27）

- 在 v2.1.8 基礎上僅將圖表工作列右邊界向左縮 20px，保留左側原始起點。
- 不調整任何按鈕順序或按鈕事件；保留繪圖、圖表分頁、新增、均分及最多四張的黃色上限通知。
- 不修改 workspace.js、RR、智慧雷達、通知系統、行情 API 或雲端儲存。


## v2.1.10 — 斐波 0 虛線快捷選取圓點（2026-10-27）

- 每張斐波繪圖的 **0 水平線起始端前方**增加一顆實心小圓點（直徑約 10px）。
- 圓點的透明可點擊範圍約 24px；滑鼠指向時會亮起，解決細虛線不容易點到的問題。
- 點圓點會使用既有繪圖的選取機制；選取後仍按 Delete / Backspace 刪除。
- 不改動原本斐波參數、價格、位置、儲存同步與其他繪圖工具。


### v2.1.13 — Pionex WebSocket 即時價格整合（2026-10-30）

- 原有 `MultiAssetLiquidityRadar` 使用一條 Worker 中繼 WS (`/api/monitor/ws`) 動態訂閱固定清單及自由清單。僅行情源更換：WS → 既有 `/api/monitor/tickers` 快取 REST → TradingView Scanner。
- 派網 CL 原油合約訂閱 `WTI_USDT_PERP`；頁面及 CoinGlass 查詢仍維持 `CL`。
- 即時現價、RR/LED 合批約 300ms；每筆變動只更新對應標的，1D 指標約 3 秒重算一次。WebSocket 本身沒有提供完整 OHLC；仍依既有 1D／4H 歷史資料合成當日日 K，不改公式與 08:00 換日。
- Pionex WebSocket 連線成功不等於所有合約已收到真實成交，診斷卡提供訂閱、成交、最近成交時間與重連資訊；缺價時使用 REST／Scanner，備援價格不得冒充逐筆成交。
- 保留 Browser Notifications、RR 六態、37 規則、Signal Spotlight 台灣 00:00 歸零、繪圖、R2 設定；網頁關閉／Chrome 凍結時不承諾背景持續監控。
- Cloudflare Worker 已有 `/api/monitor/ws` 中繼，不需另外部署。


### v2.1.14 — 即時現價線／標籤與清單同步（2026-10-30）

- 修正 v2.1.13 的清單現價約 300ms 更新，但圖表右側 NOW 藍色標籤／水平現價線需等待約 3 秒整圖重繪的視覺落差。
- `workspace.js` 新增 `refreshPrice(symbol)`：同一批次只更新對應圖表標題現價、SVG NOW 標籤、水平現價線與呼吸光點；不重建圖表或繪圖物件。
- `chart4h.js` 新增 `syncLivePrice()`，沿用現有價格座標與清算上下界標籤避讓規則，縮放與 HA 畫線維持不變。
- 平均 K、CCI-SMA、布林帶、SState／中軌、Signal Spotlight 仍約每 3 秒更新，公式與 00:00／08:00 邏輯均未調整。
- 保留 WebSocket/REST/Scanner 備援、CL→WTI 映射、RR 與通知規則，無需重新部署 Worker 或 R2。


## v2.1.16 — CoinGlass 7D 解析與來源診斷修復（2026-10-30）

- 僅接受 CoinGlass 7D 解密後的上下清算界限，**禁止**用 15M 代理估算替換。
- 保留既有 CoinGlassReader 加密版本支援；擴充解密資料的商品代碼辨識（例如 BTCUSDT 與 BTC）。
- 成功取得且能對應清單的 CoinGlass 7D 資料，才寫入本機最後有效快取；下一次抓取失敗時可保留上次的真實界限，但明確標示過期並停用 RR。
- 診斷面板顯示抓取／解密／解析與對應成功數量、版本、錯誤與識別鍵樣本。
- 此版本無法替代實際 CoinGlass API：如果 CoinGlassReader 遇到 HTTP、CORS、解密金鑰或尚未支援的新加密版本，會保留明確錯誤，**不會**生成假清算線。


## v2.1.17 CoinGlass 7D 取得與解碼器修復（2026-10-30）

- 在 `MultiAssetLiquidityRadar` 內部署恢復的 `coinglass-decrypt.js`（支援 V0、V1、V2、V55、V66、V77），不再依賴已刪除的 `BTC_iquidation`。
- 優先由既有 Cloudflare Worker `/api/monitor/coinglass-7d?range=7d` 取得經授權的 CoinGlass 官方 V4 `max-pain`；需部署 `cloudflare/worker.js` 並安全設定 `COINGLASS_API_KEY`，其 API 方案須支援 Professional/Enterprise。
- 若 V4 未設定/遭拒，僅嘗試保留的六版本舊接口；若兩邊皆不可用，診斷顯示原因並保留最後成功的真實 CoinGlass 快取（過期時停用 RR），**不**啟動 15M 代理。
- 本次已完成模擬資料與程式測試；因無使用者授權的官方 V4 金鑰、舊接口回傳 403，**尚未通過真實 7D 連線的最終驗收**。請勿將部署完成誤認為真實數據已恢復。
- 安全：API Key 僅存在 Worker Secret，不得存入 GitHub、R2 公開資源或瀏覽器 localStorage。
