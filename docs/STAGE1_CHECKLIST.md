# Stage 1 驗收清單

- [ ] GitHub Pages 一進站能顯示 bootstrap / R2 最後結果
- [ ] 選「加密貨幣」不會自動重新抓資料
- [ ] 選「美股代幣」不會自動重新抓資料
- [ ] 按「完整分析」才產生 run_id
- [ ] Worker 成功 dispatch `full-analysis.yml`
- [ ] GitHub Action Python 不需要 Streamlit
- [ ] Action 能讀 R2 active probability model；不存在時使用 repo fallback
- [ ] Action 能取得前一版 snapshot 延續 state_history
- [ ] 進度 status 寫入 R2，HTML 能輪詢顯示
- [ ] 分析完成 latest snapshot 更新
- [ ] HTML 自動重讀新 snapshot
- [ ] JSON 下載內容與畫面資料源相同
- [ ] snapshot 仍包含 Level 5 / 4-outcome probability
