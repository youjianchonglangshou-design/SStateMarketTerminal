# CoinGlass 7D 雙邊方向優勢 v1.2.0

將原 39 特徵「短時窗先掃」欄位改為 CoinGlass 7D 上下界**相對方向優勢估計**。畫面兩邊合計 100%，並非七日內必然觸及、實際觸價勝率或 CoinGlass 官方機率。

## 公式

- 基底：BTC 以 2017–2023 訓練的 7D 凍結動態模型（需要 135 根已收盤 UTC 日K）；非 BTC 標的使用價格動能 `sigmoid(clamp(0.48*r7/(vol*sqrt(7))+0.22*r3/(vol*sqrt(3)),-1.35,1.35))`。
- 當前上下界距離：`dUp=(Upper/Price-1)*100`，`dDown=(1-Lower/Price)*100`。
- 方向壓力：`distanceLogit=0.76*clamp(ln(dDown/dUp),-1.6,1.6)`。
- 最終 `P_up=clamp(sigmoid(logit(P_base)+distanceLogit),0.10,0.90)`；`P_down=1-P_up`。
- 資料非完整則顯示 `--`；不會填造 50%/50%。

**限制**：CoinGlass 歷史快照並未在專案內保存，距離係數 0.76 是透明的研究假設，不是已驗證的 CoinGlass 7D 真實命中機率；非 BTC 動能權重也未經各資產獨立訓練。若沒有 CoinGlass 界，維持原有 15M 代理界的明確標示。模型基底本身也不是 7D 觸界專用標籤。

## 覆蓋

`app.js`、`index.html`、`VERSION.json` 與新增 `coin7d-direction.js`、`btc7d-model.js`、`btc7d-runtime.js`。其餘不用覆蓋。
