(() => {
  "use strict";

  let layer = null;
  let lastTrigger = null;

  function closeResearchModal({ restoreFocus = true } = {}) {
    if (!layer) return;
    const old = layer;
    layer = null;
    old.remove();
    document.body.classList.remove("research-modal-open");
    document.querySelectorAll(".research-pill[aria-expanded='true']")
      .forEach(el => el.setAttribute("aria-expanded", "false"));
    if (restoreFocus && lastTrigger && document.contains(lastTrigger)) {
      try { lastTrigger.focus({ preventScroll: true }); } catch (_) {}
    }
    lastTrigger = null;
  }

  function buildLayer(sourceCard, trigger) {
    closeResearchModal({ restoreFocus: false });

    const overlay = document.createElement("div");
    overlay.id = "research-modal-layer";
    overlay.className = "research-modal-layer";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "美股 AI 情報");

    const card = sourceCard.cloneNode(true);
    card.classList.add("research-card-modal");
    card.removeAttribute("style");

    const close = document.createElement("button");
    close.type = "button";
    close.className = "research-modal-close";
    close.setAttribute("aria-label", "關閉情報卡片");
    close.title = "關閉";
    close.textContent = "×";
    card.appendChild(close);

    overlay.appendChild(card);
    document.body.appendChild(overlay);
    document.body.classList.add("research-modal-open");

    layer = overlay;
    lastTrigger = trigger;
    trigger.setAttribute("aria-expanded", "true");

    close.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeResearchModal();
    });

    card.addEventListener("click", event => event.stopPropagation());
    overlay.addEventListener("click", () => closeResearchModal());

    requestAnimationFrame(() => {
      overlay.classList.add("is-open");
      try { close.focus({ preventScroll: true }); } catch (_) {}
    });
  }

  document.addEventListener("click", event => {
    const trigger = event.target.closest?.(".research-pill");
    if (!trigger) return;

    const wrap = trigger.closest(".research-wrap");
    const sourceCard = wrap?.querySelector(".research-card");
    if (!sourceCard) return;

    event.preventDefault();
    event.stopPropagation();
    buildLayer(sourceCard, trigger);
  }, true);

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && layer) {
      event.preventDefault();
      closeResearchModal();
    }
  });

  // Cards are re-rendered frequently (filters, Pionex session status, analysis refresh).
  // Event delegation above survives those re-renders; this observer only adds
  // accessibility/title hints to newly created research pills.
  const observer = new MutationObserver(() => {
    document.querySelectorAll(".research-pill").forEach(pill => {
      if (pill.dataset.clickReady === "1") return;
      pill.dataset.clickReady = "1";
      pill.setAttribute("role", "button");
      pill.setAttribute("tabindex", "0");
      pill.setAttribute("aria-expanded", "false");
      pill.title = "點擊查看 AI 新聞／財報情報";
    });
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });

  document.addEventListener("keydown", event => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const trigger = event.target.closest?.(".research-pill");
    if (!trigger) return;
    event.preventDefault();
    trigger.click();
  });
})();
