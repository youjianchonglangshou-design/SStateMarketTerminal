# SStateMarketTerminal v0.1.87 — CCI RELATION PILL

## v0.1.87｜CCI 數字膠囊直接顯示 CCI / SMA 關係

本版只調整 CCI 副圖右上角的 **CCI 數字膠囊顏色**：

| CCI 與 SMA14 關係 | CCI 膠囊 | 快速閱讀 |
|---|---|---|
| **CCI > SMA** | 🟢 綠色 | CCI 已站在 smoothingMA 上方 |
| **CCI < SMA** | 🔴 紅色 | CCI 仍在 smoothingMA 下方 |
| **CCI = SMA** | ⚪ 原本無色 / 中性 | 交會點，暫不給方向色 |
| 任一數值缺失 | ⚪ 原本無色 / 中性 | 資料不足，不製造方向 |

SMA 膠囊完全維持原規則：**SMA 上升＝黃、SMA 下降＝紫、持平/未成熟＝無色**。因此掃描卡片時，`SMA 黃 + CCI 綠` 可以直接看成「慢線已向上，且 CCI 位於 SMA 上方」。

同步十字線也套用同一條規則：滑到歷史某一天時，SMA / CCI 數字與 CCI 綠紅色會一起切換；滑鼠離開後恢復最新一天。

**沒有修改** CCI PRIMARY Champion、機率、S-state、path commentary、JSON、HistoricalTraining 或任何引擎判斷。純 UI 顯示，不需要重新完整分析。

---

# SStateMarketTerminal v0.1.86 — CCI ONLY ENGINE

## v0.1.86｜ADX / DMI 正式退役

CCI PRIMARY 已正式成為目前唯一的指標路徑，因此這版把舊 ADX / DMI 從 **live engine + snapshot JSON** 拿掉：

- `engine/analysis_core.py` 不再計算 `DI+ / DI- / DX / ADX`，也不再重播 `dmi_relation_age_*`。
- `engine/get.py` 不再輸出每筆 `dmi_relation_age_bars / bin / relation`。
- `chart_30d` 不再輸出 `di_plus / di_minus / dx / adx`，只保留 HA、BB20、真實 OHLC、CCI20、CCI SMA14。
- Snapshot schema 升為 `crypto-monitor-ai-v16-cci-only-primary-path-probability`，AI layer 升為 `state-first-v7-cci-only-path-comment`，下一次完整分析會淘汰舊 ADX 快照。
- **不改** Champion `e321f6d35445798b`、CCI PRIMARY 機率、S-state、BB/HA 幾何、CCI 評語或十字線。

以 2026-09-04 這份 127 檔美股 snapshot 實測，單純移除 ADX/DMI 欄位可由約 **5.31 MB → 4.85 MB**，減少約 **459 KB（8.66%）**。

> README 下方舊版 ADX 章節保留作為歷史 changelog；從 v0.1.86 起，它們不再代表目前 live engine。


本版只把 **CCI PRIMARY 路徑評語膠囊** 改成 SSR 等級色系，並把所有評語完整記錄在 README，避免之後忘記每種顏色與文字代表什麼。

> **重要：顏色只是在翻譯既有 path commentary 的 tone。沒有重新計分、沒有改 Champion 機率、沒有改任何 CCI/BB/HA 判斷條件。**

## CCI 路徑評語：SSR 顏色總表

| 路徑等級 | 程式 tone | 膠囊顏色 | 定義 |
|---|---|---|---|
| **SSR** | `strong` | 🟡 金黃 | **強共振**：目前路徑條件最完整、延續/啟動訊號最強 |
| **SR** | `positive` | 🟣 紫 | **健康偏多**：結構仍完整，回踩/承接/確認偏正面 |
| **R** | `setup` | 🔵 藍 | **等待確認**：條件正在形成，還差下一個上穿、承接或延伸 |
| **N** | `neutral` | ⚪ 灰白 | **中性**：目前沒有足夠方向優勢，持續觀察 |
| **警戒** | `caution` | 🟠 橘 | **警戒**：反彈、降速或結構缺陷存在，但尚不能直接判失敗 |
| **危險** | `risk` | 🔴 紅 | **明顯風險**：二次衰竭、頂背離、轉弱等高風險結構 |

顏色閱讀順序：

**🟡 SSR > 🟣 SR > 🔵 R > ⚪ N > 🟠 警戒 > 🔴 危險**

## S-state 本身的固定顏色

這一組是「市場 S-state」本身的顏色，和上面的「CCI 路徑評語等級色」是兩套不同資訊：

| S-state | 固定顏色 | 用途 |
|---|---|---|
| **S3** | 🟡 黃 | S3 趨勢延伸 / 成熟段 |
| **S2** | 🟢 綠 | S2 回踩 / 三浪前後結構 |
| **S1** | 🔵 藍 | S1 突破後趨勢建立 |
| **S0.5** | 🟣 紫 | S0.5 築底 / 優質反彈候選 |
| **S0** | ⚪ 白 | S0 反彈候選，尚未升級 |
| **OTHER** | ◻️ 灰 | 未落入正式 S-state 結構 |

因此畫面上會同時存在：**S-state 顏色**（例如 S0.5 紫）＋**CCI 評語等級色**（例如 SSR 金黃），不要把兩者混成同一種等級。

### 評語判定原則

- 評語是 **CCI PRIMARY Schema 5 的中文解釋器**，不是第二套 AI。
- `S0.5 / S1 / S2 / S3`：評語會讀取 Champion 已使用的 CCI/BB/HA path features；Tooltip 仍可查看 matched path / 樣本 / level。
- `S0 / OTHER`：不屬正式 Champion probability target，只做結構評語，**不假裝成勝率**。
- 每個 S-state 內的規則依程式 `if / elif` **由上往下判斷，第一個符合的條件就是當下評語（first-match-wins）**。

---

## S0.5｜築底／左V與右V辨識

| 等級 | 顏色 | 評語 | 主要意思 |
|---|---|---|---|
| **SR** | 🟣 | **假跌破回收｜多方結構仍在** | CCI 短破黃 SMA 後 reclaim，且中軌仍維持上升背景 |
| **SR** | 🟣 | **黃階梯承接｜右側回踩守住** | CCI 拉開後回踩黃 SMA，中軌沒有重新惡化 |
| **SSR** | 🟡 | **右V共振｜二次上穿・中軌改善** | 21日內第二次以上上穿＋中軌改善/走平＋黃SMA或黃平均K共振 |
| **SR** | 🟣 | **右V確認｜二次上穿・中軌改善** | 第二次以上 CCI 上穿發生在較友善的中軌背景 |
| **警戒** | 🟠 | **左V反彈｜首次低位上穿** | 第一次在 -100附近或更低上穿，但中軌仍明顯惡化，較像深跌反彈 |
| **R** | 🔵 | **首次上穿｜反轉仍待二次確認** | 第一次上穿且中軌改善，但還沒出現右V的二次確認 |
| **R** | 🔵 | **右V醞釀｜CCI快速逼近SMA** | CCI 尚在 SMA 下方，但 gap 快速收斂；等待下一次有效上穿 |
| **SR** | 🟣 | **黃階梯建立｜多方動能接管** | CCI 已站在上升 smoothingMA 上方，築底轉向右側動能確認 |
| **警戒** | 🟠 | **築底反彈｜中軌仍有下壓** | S0.5 仍成立，但中軌下斜惡化尚未解除，先視為反彈 |
| **R** | 🔵 | **築底觀察｜等待右V共振** | 等待二次上穿、中軌改善、黃 SMA / 平均K共振 |

---

## S1｜趨勢建立／延伸

| 等級 | 顏色 | 評語 | 主要意思 |
|---|---|---|---|
| **SR** | 🟣 | **回踩收復｜趨勢結構延續** | CCI 跌破黃 SMA 後重新站回，中軌仍上斜 |
| **SR** | 🟣 | **健康回踩｜CCI守住黃階梯** | CCI 回踩接近黃 SMA，但沒有破壞上升中軌 |
| **警戒** | 🟠 | **動能放緩｜留意頂背離** | 價格高點延伸、CCI高點降低，中軌升勢開始降速/走平 |
| **SSR** | 🟡 | **趨勢建立｜黃階梯延伸** | CCI 在黃 SMA 上方且中軌同步上斜，屬正常趨勢延伸 |
| **R** | 🔵 | **動能重整｜等待CCI再上穿** | CCI 在 SMA 下方但逼近，等待重新上穿確認續攻 |
| **R** | 🔵 | **趨勢續行｜中軌升勢放緩** | 中軌仍上斜但速度下降，結構尚未破壞 |
| **N** | ⚪ | **趨勢建立｜觀察CCI延伸** | S1 已完成早期突破，但尚無更強的 CCI 路徑確認 |

---

## S2｜二浪回踩 vs 末浪衰竭

| 等級 | 顏色 | 評語 | 主要意思 |
|---|---|---|---|
| **危險** | 🔴 | **二次衰竭｜頂背離・中軌降速** | 第二次以上死叉＋Price HH / CCI LH＋中軌走平或轉弱 |
| **危險** | 🔴 | **二次死叉｜轉弱風險升高** | 第二次以上死叉，且中軌已不再明顯上斜 |
| **SR** | 🟣 | **二浪回踩｜中軌仍上斜** | 高位第一次死叉但中軌仍上斜，較像普通二浪回踩 |
| **SSR** | 🟡 | **再蓄力｜CCI零軸附近重上穿** | CCI 在 -80~+100 區域重新上穿，中軌未明顯惡化，三浪重啟候選 |
| **SR** | 🟣 | **二浪承接｜三浪仍有空間** | 黃 SMA 附近完成回踩/收復＋中軌仍上斜 |
| **R** | 🔵 | **回踩整理｜上升結構未破** | S2 回踩中，但中軌仍上斜，等待下一次 CCI 啟動 |
| **N** | ⚪ | **高檔整理｜等待再啟動或衰竭** | 中軌走平本身不是空頭答案，等待下一次金叉/死叉與背離決定方向 |
| **警戒** | 🟠 | **結構轉弱｜留意二次死叉** | 中軌背景已偏弱；若再出現二次死叉或頂背離，失敗風險上升 |

---

## S3｜三浪延伸／成熟段風險

| 等級 | 顏色 | 評語 | 主要意思 |
|---|---|---|---|
| **危險** | 🔴 | **末浪衰竭｜二次死叉・頂背離** | 成熟段出現第二次以上死叉＋Price HH / CCI LH，屬末浪衰竭警訊 |
| **警戒** | 🟠 | **高檔背離｜末浪動能降速** | Price HH / CCI LH，同時中軌降速或走平 |
| **SR** | 🟣 | **趨勢續航｜黃階梯回踩承接** | 黃 SMA 附近完成回踩/reclaim，中軌仍上斜 |
| **SSR** | 🟡 | **三浪延伸｜CCI動能仍擴張** | CCI 在黃 SMA 上方且距離持續擴大 |
| **R** | 🔵 | **高檔回踩｜中軌仍上斜** | smoothingMA 轉紫，但中軌仍上斜，先視為成熟趨勢內回踩 |
| **警戒** | 🟠 | **高檔降速｜保護既有趨勢成果** | SMA轉紫且中軌失去明顯上斜，重點從追漲轉為衰竭觀察 |
| **N** | ⚪ | **趨勢成熟｜觀察CCI衰竭訊號** | S3 完成度高，但目前尚無更明確的延伸或衰竭條件 |

---

## S0｜反彈候選（非正式 Champion probability target）

| 等級 | 顏色 | 評語 | 主要意思 |
|---|---|---|---|
| **警戒** | 🟠 | **左V反彈｜中軌仍明顯下壓** | 第一次低位上穿但中軌仍惡化，只視為反彈 |
| **R** | 🔵 | **底部反轉醞釀｜等待升級S0.5** | 第二次以上上穿＋中軌改善，但價格結構還沒升級 S0.5 |
| **R** | 🔵 | **超賣修復｜CCI逼近SMA** | 尚未上穿，但 CCI/SMA gap 快速收斂 |
| **N** | ⚪ | **反彈區｜結構尚未升級** | 仍只是反彈候選，等待中軌、CCI與價格結構升級 |

---

## OTHER｜未分類結構（非正式 Champion probability target）

| 等級 | 顏色 | 評語 | 主要意思 |
|---|---|---|---|
| **危險** | 🔴 | **未分類弱化｜CCI背離・中軌失速** | 雖不符合正式 S-state，但背離＋中軌失速同時存在 |
| **R** | 🔵 | **趨勢存在｜尚未符合S-state考題** | CCI/SMA 與中軌偏多，但價格形態尚未落入正式 S-state |
| **N** | ⚪ | **整理等待｜CCI正在接近關鍵交叉** | CCI/SMA 距離收斂，等待下一個有效 S-state / 交叉路徑 |
| **N** | ⚪ | **結構未分類｜等待有效S-state** | 尚未落入正式 S0~S3 考題，只保留 CCI/BB 路徑觀察 |

---

# SStateMarketTerminal v0.1.84 — DESKTOP READABILITY 125

本版把桌面版 **瀏覽器 100%** 的整體可讀尺度調整到接近先前手動縮放 **125%** 的視覺效果，但不是使用 CSS `zoom`，因此不會把圖表線條粗暴放大。

- 桌面仍維持 **一列兩張卡片**（>1100px）。
- 整體字體、主圖/副圖數據、中文字膠囊、按鈕、篩選器同步放大。
- 主圖高度由 265px 提升到 **330px**；CCI 圖由 150px 提升到 **188px**，讓一張卡的閱讀密度接近原本 125% 畫面。
- 軸文字、失敗/存活/樣本統計與 CCI/SMA 數字同步放大。
- BB / 平均K / CCI 線寬只小幅增加，不使用整頁 transform/zoom，避免線條爆粗。
- **CCI PRIMARY 模型、評語內容、Champion 機率、十字線、資料與 Action 全部不改。**

---

# SStateMarketTerminal v0.1.83 — CCI PATH COMMENT LARGE

本版只調整 CCI 副圖的「路徑評語膠囊」視覺大小：

- 字級由 9px → **10px**。
- 上下 padding 由 4px → **5px**，尺寸與主圖上方中文字膠囊接近。
- 手機版同步放大，避免評語太小。
- **評語內容、CCI PRIMARY 判斷、Champion 機率、圖表與十字線全部不改。**

---

# SStateMarketTerminal v0.1.82 — CCI PATH COMMENT

本版在 CCI 副圖右上、原本 ADX 方向判斷膠囊的位置，加入 **CCI PRIMARY 路徑評語**。

重點：

- 評語不是第二套 AI，也不會重新加分/扣分；只把目前 Champion 已經使用的 CCI PRIMARY Schema 5 路徑翻譯成人話。
- S0.5：區分左V首次低位上穿、右V二次上穿、中軌改善、黃 SMA 承接/reclaim、CCI逼近SMA。
- S1：趨勢建立、黃階梯延伸、健康回踩、回踩收復、動能降速。
- S2：第一次高檔死叉＝二浪回踩候選；第二次死叉＋中軌降速/背離＝衰竭風險；0軸附近再金叉＝重新蓄力候選。
- S3：三浪延伸、黃階梯續航、高檔回踩、頂背離/二次死叉、成熟段降速。
- S0 / OTHER：雖不是正式機率考題，仍用同一套 CCI/BB/HA 路徑輸出「結構評語」，不假裝成模型機率。
- Tooltip 會顯示較完整的解釋；S0.5/S1/S2/S3 另附模型匹配樣本與 path level。
- 不新增 Python 檔；圖表、十字線、CCI/SMA 算法、Champion 機率本身完全不改。

部署後需要再跑一次 **完整分析 / Auto Market Batch**，讓新的 snapshot 寫入 `historical_probability.path_commentary`；舊 snapshot 會被視為缺少 v0.1.82 AI layer。

---

# SStateMarketTerminal v0.1.81 — CCI PRIMARY PATH

本版只把 live probability reader 接到 HistoricalTraining Schema 5 `CCI-PRIMARY-v2-PATH-TREE-HLC3-20-SMA14`。

- S-state 只選考題/target。
- CCI/BB中軌/HA 的 30 日路徑樹直接輸出成功、還活著、真失敗、其他機率。
- 支援第一次/第二次交叉、交叉距今天數、交叉位置、中軌 phase、approaching/pullback gap、黃/紫 SMA retest/reclaim、斜率/加速度與背離。
- `market_type` 進模型，因此 Crypto 與 US-stock/RWA 可走不同歷史分支。
- 圖表完全沿用已確認的 CCI20 / SMA14 + 上下同步十字線，不改 `app.js` / `styles.css` / `analysis_core.py`。
- `matched_samples` 現在代表實際匹配到的 CCI PRIMARY path node/leaf 樣本，不再是假裝成 CCI 的舊 Level 樣本。

部署本版後，再讓 HistoricalTraining v3.8.0 Action 產生 Schema 5 Active Champion。早上 08:25 舊 Champion 的 checkpoint 不能掛到新 model_id；要用 `Auto Market Batch` 指定同一日期重跑，並設 `run_learning_after=true`。

---

## TERMINAL v0.1.80｜CCI-CHAMPION

- **v0.1.79 已確認的 CCI 圖表與上下同步十字線完全不改。**
- `engine/probability_reader.py` 改讀 HistoricalTraining Schema 4 的 `CCI-EXPERT-v1-HLC3-20-SMA14`，CCI Expert 正式取代舊 DMI Expert 的第二層機率修正。
- S-state / Level 1–5 基礎模型仍保留；只把原本 DMI Expert 修正層換成 CCI Expert。
- `engine/get.py` 的機率輸出改為 `cci_expert` / `cci_expert_version`，供 snapshot 與正式 Champion 考卷保存同一套 CCI 模型資訊。
- 不新增 Python 檔。這一版只接通新 CCI Champion 模型，不重新改畫面。

## TERMINAL v0.1.79｜CCI-SYNC-CROSSHAIR

- CCI calculation is integrated into existing `engine/analysis_core.py`; no new Python module is created.

- 主頁副圖由 ADX / DMI 14 改為 **CCI 20 + SMA 14 smoothingMA**；CCI 使用 `hlc3` 與 mean absolute deviation，公式對齊使用者提供的 TradingView Pine。
- CCI 計算直接整合進既有 `engine/analysis_core.py`，由同一檔案產生 30 日 CCI / smoothingMA；不新增任何 Python 檔。
- CCI 為白色線；smoothingMA 使用黃／紫階梯；保留 +100 / 0 / -100 參考線。
- 移除畫面上的「多方控制｜趨勢強度增強 ↗↗」ADX 判斷膠囊；副圖只保留 SMA 與 CCI 數值膠囊。SMA 膠囊跟著 smoothingMA 黃／紫，CCI 膠囊維持無色。
- 主圖與 CCI 副圖十字虛線依同一日期同步；滑鼠在主圖時顯示價格水平線／價格膠囊，滑鼠在 CCI 副圖時顯示 CCI 水平十字線並同步 SMA / CCI 數值。日期統一顯示在下方 CCI pane。
- **未刪除 ADX / DI 後端資料與現任 Champion DMI Expert 特徵**；本版只替換主頁可視副圖，避免破壞目前機率模型。

## TERMINAL v0.1.76｜PRESERVE-FROZEN-RECORDS

- 戰績明細與標的歷史路徑重新顯示所有本代 Frozen Snapshot，不再因 `official_scoring=false` 把舊考卷整筆隱藏。
- 120 筆 Evolution 進度仍只計正式 08:25 考卷；舊制資料只是保留與重新批改，不污染正式學習門檻。
- Frozen Prediction 永遠不改；HistoricalTraining 若發現舊 settlement 用了盤中假 S3，會改 settlement，而不是刪除該筆 Frozen Snapshot。

## TERMINAL v0.1.75｜0825-DAILY-CHAMPION

- 正式 Champion 考試改為台灣 **08:25**；Cloudflare 08:25 先跑 Crypto + 美股正式分析，兩邊成功後才自動觸發 HistoricalTraining。
- 原本每 4H 的台灣 08:01 pair 會跳過，改由 08:25 取代，因此一天仍是 6 次 pair：00:01、04:01、08:25、12:01、16:01、20:01。
- 唯一永久 Champion checkpoint：`runs/champion/YYYY-MM-DD_0825/`；其餘 Live 分析只更新 `latest/`。
- `12H` 顯示為「觀察」；24H / 48H / 72H 由 HistoricalTraining 只比較每日正式 checkpoint，盤中暫時轉黃/S3 不得判成功。
- 新 08:25 checkpoint 寫入時會清理舊普通大型 run snapshot 與過時 `_0401` / `_0801` Champion snapshot；小型 status JSON 保留。
- R2 Sharded Ledger、排序、標的歷史路徑、ADX / S-state 主分析本身未改。

## TERMINAL v0.1.74｜R2-SHARDED-LEDGER

- `performance.html` 不再讀 GitHub `data/champion/ledger.jsonl`，改讀 Worker 的 R2 Champion API。
- Frozen Ledger 正式路徑：`champion/ledger/GENxxx/YYYY-MM-DD.json`。
- `champion/performance/latest.json` 提供近期戰績總覽。
- 點擊標的時，歷史路徑會按 Generation 從 R2 讀取，不受 90 日主表限制。
- Worker 新增 HistoricalTraining 專用 authenticated PUT：ledger shard / performance / evolution review / evolution policy。
- 主分析、S-state、ADX、04:01 checkpoint 與 08:25 schedule 均未改動。

## TERMINAL v0.1.73｜ASSET-HISTORY-PATH

- `逐筆 Frozen Snapshot 結算` 的標的名稱改為可點擊。
- 點擊後在目前戰績頁開啟歷史路徑視窗，不離開頁面。
- 路徑視窗會用所有已保存 Frozen Ledger 顯示 `日期 + S-state` 演進，例如 `9/1 S0.5 → 9/2 S1 → 9/3 S2 → 9/4 S3`。
- 同時列出每一天的 Generation、預測目標、Champion 成功/存活/失敗率，以及 12H / 24H / 48H / 72H 結算與實際路徑。
- 不修改 HistoricalTraining、Cloudflare Worker、ADX、S-state 或 04:01 / 08:25 排程。

## TERMINAL v0.1.72｜PERFORMANCE-STATE-COLORS

- 修正近期戰績頁 S-state 膠囊配色，與主頁正式配色完全一致：S3 黃、S2 綠、S1 藍、S0.5 紫。
- 未修改 Frozen Snapshot、排序、結算、模型、ADX、S-state 計算或 Cloudflare 排程。

## TERMINAL v0.1.71｜SORTABLE-PERFORMANCE

- `每日 Champion 戰績` 與 `逐筆 Frozen Snapshot 結算` 的欄位標題可點擊排序；再次點擊切換升冪/降冪。
- Frozen Snapshot 日期畫面簡化為 `M/D`（例如 `9/1`），內部仍使用完整 checkpoint timestamp 排序。
- 未修改 04:01 Champion Checkpoint、08:25 HistoricalTraining、ADX、S-state 或模型機率邏輯。

## TERMINAL v0.1.70｜0401-CHAMPION-CHECKPOINT

- 每 4 小時 Crypto + 美股分析照常執行，所有批次仍更新 `latest/`。
- 一般 00:01 / 08:01 / 12:01 / 16:01 / 20:01 與手動分析不再把完整 snapshot 永久寫進 `runs/<run_id>/`。
- 台灣時間 **04:01** 的 Cloudflare 自動批次是唯一每日 Champion checkpoint，存到 `runs/champion/YYYY-MM-DD_0401/`。
- 新增 `/api/champion/checkpoint?market=...&date=YYYY-MM-DD`，提供 08:25 HistoricalTraining 讀取「Terminal 當時真正顯示過的 Champion 預測」。
- 04:01 checkpoint 寫入時會清除舊 `runs/` 下的大型普通 snapshot；小型 `status.json` 保留供執行狀態診斷。
- ADX、S-state、機率模型、主頁與近期戰績頁邏輯未修改。

## TERMINAL v0.1.69｜PERFORMANCE-MARKET-TABS

- 主頁 `近期戰績` 改為新分頁開啟，不覆蓋目前分析畫面。
- 戰績頁配合 HistoricalTraining v3.3.0：下一代學習門檻顯示 120 筆 72H 正式結算。
- 新增 `全部 / Crypto / 美股` 市場切換；S-state、機率校準、每日戰績與逐筆 Frozen Snapshot 都會跟著篩選。
- 逐筆紀錄新增市場欄位。
- 未修改 ADX、S-state、完整分析或 Cloudflare 08:25 排程。

# SState Market Terminal

## v0.1.67｜MODEL-ADX-MIGRATION

`engine/probability_reader.py` now carries both ADX Step contracts during the v2 → v3 migration. R2 Active `DMI-EXPERT-v2-ADX-STEP` continues to use the old full-precision direction features. Only when the loaded model declares `DMI-EXPERT-v3-ADX-1DP-STICKY` does live inference switch to the new one-decimal + equal-value-sticky ADX Step fields. This keeps the current Champion mathematically stable while the new model is retrained/evaluated.


**Current version:** `TERMINAL v0.1.80｜CCI-CHAMPION`

## Current runtime

```text
GitHub Pages
  ├─ latest Crypto / US-stock snapshot ← Cloudflare R2
  ├─ Full Analysis → Cloudflare Worker → GitHub Actions → Python S-state engine → R2
  └─ US-stock S3 / S0.5 / S1 news click
       → Cloudflare Worker
       → reviewed 122-symbol asset identity
       → Tavily Search + Answer
       → R2 24H research cache
       → research modal
```

US-stock news is on-demand only. Full Analysis and Auto Batch do not automatically search news.

## US-stock identity

`engine/us_stock_aliases.py` is the reviewed maintenance dictionary. Each Pionex/RWA symbol records real ticker, exchange, qualified ticker, English name, Traditional-Chinese name, asset type and aliases. The live Worker carries the synchronized runtime copy and resolves exact reviewed identity before the unknown-symbol fallback.

```text
ONX   → NASDAQ:ON   → onsemi → 安森美半導體
MSFTX → NASDAQ:MSFT → Microsoft Corporation → 微軟
PAYPX → NASDAQ:PAYP → PayPay Corporation
DRAMX → CBOE:DRAM   → Roundhill Memory ETF
XYZX  → NYSE:XYZ    → Block, Inc.
```

## News provider

The live news runtime uses Tavily Search + Answer only. No second-layer model binding is required.

```text
R2 binding: JSON_BUCKET
Secrets: GITHUB_TOKEN, CALLBACK_TOKEN, TAVILY_API_KEY
Variables: GITHUB_REPOSITORY, GITHUB_BRANCH, ALLOWED_ORIGIN
```

Tavily request: `search_depth=basic`, `topic=news`, `time_range=week`, `max_results=20`, `include_answer=advanced`.

Pipeline: `tavily-answer-direct-zhtw-v9-asset-identity`. Both frontend and Worker require this exact pipeline for a 24H hit. Expired or previous-pipeline entries are pruned on the next successful research write.




## ADX 1-decimal sticky stepline (v0.1.66)

- ADX red/green stepline direction now compares values after rounding to **1 decimal place**.
- If the rounded current ADX equals the rounded previous ADX, the display **keeps the previous effective green/red direction** instead of switching color because of hidden decimal noise.
- The latest state capsule and synchronized hover capsule use the same sticky direction, so line color and state text remain consistent.
- Raw ADX/DI calculations and plotted Y-values are unchanged. `engine/probability_reader.py`, HistoricalTraining model semantics, S-state rules, Worker, and workflows are intentionally unchanged in this release.

## ADX state pill background boost (v0.1.61)

The ADX/DMI state capsule now separates **direction identity** from **trend-strength change**:

- Capsule yellow = `DI+ > DI-` (bullish controller)
- Capsule purple = `DI- > DI+` (bearish controller)
- Dot green = ADX rising versus the previous displayed day
- Dot red = ADX falling versus the previous displayed day
- Dot gray = ADX flat or unavailable
- Hovering the 30-day DMI panel recomputes the same visual state for the hovered date.

The ADX stepline itself is unchanged: green segments rise, red segments fall. No Python or probability logic changed in this release.

## ADX step dominance display (v0.1.59)

The existing Pine-equivalent ADX values from `engine/analysis_core.py` are now rendered in the 30-day DMI panel as a stepline. Rising ADX segments use `#26A69A`, falling segments use `#EF5350`, and flat segments use neutral gray. The live/hover capsule combines DI controller and ADX direction into four states: bullish control + strengthening, bullish control + weakening, bearish control + strengthening, bearish control + weakening. DI+ remains yellow, DI- remains purple, and the white dashed 20 line remains a reference only. No Python formula changed in v0.1.59.

## Challenger schema-upgrade policy (v0.1.57)

`cloudflare/worker.js` now allows the current shadow Challenger to be replaced **only when the latest Candidate has a strictly newer model schema** (for example schema v2 -> schema v3 DMI Expert). The superseded Challenger is archived with status `SUPERSEDED_SCHEMA_UPGRADE`; the Active Champion is never changed by this operation. Daily Candidates with the same schema version do not replace the Challenger, so the future OOS evaluation window can continue accumulating normally. HistoricalTraining already calls `/api/internal/model/challenger/ensure` after uploading each Candidate, therefore the next ensure call immediately performs any pending schema upgrade.

## Protected in v0.1.56

v0.1.56 changes only the live probability-consumption path around the existing model: `engine/probability_reader.py` now consumes HistoricalTraining schema v3 DMI Expert, while `engine/analysis_core.py` supplies the matching live 4H DMI relation age. S-state scoring, `engine/pattern_options.py`, Pionex market logic, Full Analysis, Auto Batch, Daily Learning, Champion/Challenger validation, Worker/R2 routes, and research modal visual design are unchanged.

## R2 keys

```text
latest/crypto/snapshot_ai.json
latest/us-stock/snapshot_us_stock_ai.json
runs/<run_id>/status.json
runs/<run_id>/snapshot_ai.json
runs/<run_id>/snapshot_us_stock_ai.json
models/active/probability_model.json
research/us-stock/cache.json
research/us-stock/latest.json
automation/latest/status.json
```


## ADX Step live probability features (v0.1.62)

- `engine/probability_reader.py` now mirrors HistoricalTraining `DMI-EXPERT-v2-ADX-STEP` live feature semantics.
- New live fields: `adx_axis_zone`, `adx_step_direction`, `adx_step_age_days`, `adx_step_age_bin`, `adx_turn_event`, `adx_step_delta`, `dmi_adx_regime`.
- The three new model facets (`adx_step_regime`, `adx_step_persistence`, `adx_turn_handover`) can therefore participate in success / survival / true-fail correction when a v2 ADX-Step model is active.
- `adx_turn_handover` keeps the same 4H DI relation-age guard as training; invalid replay age is never replaced with a daily approximation.
- This release does not publish or promote a probability model.


## ADX state arrow visual (v0.1.63)

- ADX rising state text uses `趨勢強度增強 ↗↗`.
- ADX falling state text uses `力量衰退 ↘↘`.
- ADX flat state text uses `力道持平 ←→`.
- DI controller colors, ADX red/green step colors, probability logic, and Python engine are unchanged.

## PropW PW match badge (v0.1.65)

- The old Tradeify / `DX` match list and badge implementation are removed and replaced in place by PropW / `PW`.
- `app.js` keeps one current mapping only: `PROPW_PIONEX_SYMBOL_MAP`.
- A `PW` capsule appears only on the US-stock/RWA page when the current SState/Pionex symbol has a confirmed match in the supplied PropW list.
- `CRMX → CRM` is now a confirmed PropW match and displays the `PW` capsule.
- `CRWD` remains unlabeled because this Terminal build still has no confirmed corresponding SState/Pionex symbol identity.
- No Python engine, Worker, workflow, probability model, ADX/DMI, or S-state logic changes in v0.1.65.

## TERMINAL v0.1.68｜CHAMPION-PERFORMANCE

- 主頁移除舊的 `Champion vs Challenger` 模型競爭面板。
- 主頁右上新增 `📈 近期戰績`，開啟 `performance.html`。
- 戰績頁只讀 HistoricalTraining 的 Frozen Champion 正式帳本：`data/champion/performance.json` + `data/champion/ledger.jsonl`。
- 支援近 7 / 14 / 30 / 90 日 / 全部，並分 S0.5 / S1 / S2 / S3 顯示成功、慢速存活、真失敗、其他。
- 顯示模型預估成功率 ≥60% / ≥65% / ≥70% 後的實際 72H 成功率與校準差。
- 逐筆表保留 12H / 24H / 48H / 72H 結算、72H S-state 實際路徑、MFE / MAE。
- 主頁仍只讀 R2 Active Champion 作為正式機率模型；不再抓 Challenger / evaluation。
- 本版不修改 Cloudflare 08:25 排程、不修改 S-state/ADX/DI 計算、不修改完整分析流程。


## v0.1.77｜ONE-EXAM-PER-DAY
- 同一 Generation／模型／市場／標的／台灣日期，戰績頁只顯示一張 Frozen 考卷。
- 若同日同標的同時存在正式 08:25 與舊 intraday/repair 紀錄，正式 08:25 為唯一顯示版本。
- 不影響其他日期，也不改 Champion 預測內容。
