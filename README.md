# v0.3.14｜LIVE MONITOR TELEGRAM PRICE ALERTS

本版在 `monitor.html` 加入一次性 Telegram 價格提醒。

- 每個「現價 + 今日%」右側新增小鈴鐺。
- 點鈴鐺輸入目標價；系統依設定當下現價，自動判斷「上破」或「下破」。
- 提醒存在 R2，可跨裝置顯示；已有提醒的鈴鐺會亮黃。
- 頁面開著時每 10 秒由 Worker 檢查一次。
- 若 Cloudflare Dashboard 另外加入 `* * * * *` Cron Trigger，即使關掉 monitor.html，Worker 仍會每分鐘檢查。
- 觸發成功後傳送 Telegram，並自動刪除該提醒，只通知一次。
- Telegram 文字格式：

```text
BTC   觸發86514
時間：2026-10-03 08:28:27
```

Worker 支援既有環境變數名稱 `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID`，並相容 `TELEGRAM_API` / `TELEGRAM_ID`。
