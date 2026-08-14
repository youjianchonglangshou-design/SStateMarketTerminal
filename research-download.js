(() => {
  "use strict";

  const cfg = window.SSTATE_CONFIG || {};
  const workerUrl = String(cfg.workerUrl || "").replace(/\/$/, "");
  const market = document.getElementById("market-select");
  const button = document.getElementById("research-download-button");
  const toast = document.getElementById("toast");
  if (!market || !button) return;

  function showToast(message, timeout = 5000) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.remove("hidden");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.add("hidden"), timeout);
  }

  function syncVisibility() {
    const usStock = market.value === "us-stock";
    button.classList.toggle("hidden", !usStock);
    button.disabled = !usStock;
    button.title = usStock
      ? "下載 Cloudflare R2｜research/us-stock/latest.json（使用者主動查詢並寫入 R2 的最新美股新聞／財報情報）"
      : "只在美股代幣模式提供";
  }

  function downloadBlob(blob, name) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 500);
  }

  async function downloadLatestResearch() {
    if (market.value !== "us-stock") return;
    if (!workerUrl) {
      showToast("尚未設定 Cloudflare Worker，無法讀取 R2 新聞 JSON。", 7000);
      return;
    }

    button.disabled = true;
    const oldText = button.textContent;
    button.textContent = "⏳ 新聞 JSON";
    try {
      const res = await fetch(`${workerUrl}/api/research/us-stock/latest?t=${Date.now()}`, {
        cache: "no-store"
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`${res.status}${detail ? ` ${detail.slice(0, 160)}` : ""}`);
      }
      const blob = await res.blob();
      downloadBlob(blob, "us_stock_news_latest.json");
      showToast("已下載 R2 隨選新聞 JSON｜research/us-stock/latest.json");
    } catch (err) {
      showToast(`R2 新聞 JSON 下載失敗：${err.message || err}`, 8000);
    } finally {
      button.textContent = oldText;
      button.disabled = false;
      syncVisibility();
    }
  }

  market.addEventListener("change", syncVisibility);
  button.addEventListener("click", downloadLatestResearch);
  syncVisibility();
})();
