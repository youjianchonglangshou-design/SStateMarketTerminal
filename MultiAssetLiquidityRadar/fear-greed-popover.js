/* v1.1.8 — open on hover, close on leave; touch/keyboard support; lazy CMC-only iframe. */
(() => {
  'use strict';
  const root = document.getElementById('fgPopover');
  const trigger = document.getElementById('fgTrigger');
  const frame = document.getElementById('fgChartFrame');
  if (!root || !trigger || !frame) return;
  let touchOpen = false;
  const ensureLoaded = () => {
    if (!frame.hasAttribute('src')) frame.setAttribute('src', frame.dataset.src);
  };
  const updateExpanded = open => trigger.setAttribute('aria-expanded', String(open));
  root.addEventListener('mouseenter', () => { ensureLoaded(); updateExpanded(true); });
  root.addEventListener('mouseleave', () => {
    root.classList.remove('touch-open');
    touchOpen = false;
    updateExpanded(false);
    // A click must never pin the card after the mouse leaves.
    if (document.activeElement === trigger) trigger.blur();
  });
  trigger.addEventListener('focus', () => { ensureLoaded(); updateExpanded(true); });
  root.addEventListener('focusout', () => {
    requestAnimationFrame(() => {
      if (!root.contains(document.activeElement) && !root.matches(':hover') && !touchOpen) updateExpanded(false);
    });
  });
  trigger.addEventListener('click', event => {
    // Desktop pointer clicks continue to use hover-only, not sticky toggle.
    if (event.detail && event.pointerType !== 'touch' && !window.matchMedia('(hover: none)').matches) return;
    if (event.detail === 0) { ensureLoaded(); updateExpanded(true); return; }
    touchOpen = !touchOpen;
    root.classList.toggle('touch-open', touchOpen);
    if (touchOpen) ensureLoaded();
    updateExpanded(touchOpen);
  });
  document.addEventListener('pointerdown', event => {
    if (touchOpen && !root.contains(event.target)) {
      touchOpen = false;
      root.classList.remove('touch-open');
      updateExpanded(false);
    }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && (root.matches(':hover') || touchOpen || root.contains(document.activeElement))) {
      touchOpen = false;
      root.classList.remove('touch-open');
      trigger.blur();
      updateExpanded(false);
    }
  });
})();
