/* v1.1.11 — card height extends to around row 7 bottom; width keeps original ratio; clamped inside table boundary. */
(() => {
  'use strict';
  const root = document.getElementById('fgPopover');
  const trigger = document.getElementById('fgTrigger');
  const panel = document.getElementById('fgPanel');
  const frame = document.getElementById('fgChartFrame');
  if (!root || !trigger || !panel || !frame) return;

  let touchOpen = false;
  const desktopQuery = window.matchMedia('(min-width: 851px)');
  const ratio = 830 / 514;

  const ensureLoaded = () => {
    if (!frame.hasAttribute('src')) frame.setAttribute('src', frame.dataset.src);
  };
  const updateExpanded = open => trigger.setAttribute('aria-expanded', String(open));
  const isOpen = () => root.matches(':hover') || touchOpen || root.contains(document.activeElement);

  function resetDesktopLayout() {
    panel.style.removeProperty('left');
    panel.style.removeProperty('top');
    panel.style.removeProperty('width');
    panel.style.removeProperty('height');
  }

  function positionPanel() {
    if (!desktopQuery.matches) {
      resetDesktopLayout();
      return;
    }
    const table = document.querySelector('.radar-table');
    const tableScroll = document.querySelector('.table-scroll') || document.querySelector('.shell') || document.body;
    const boundaryRect = tableScroll.getBoundingClientRect();
    const triggerRect = trigger.getBoundingClientRect();
    const gap = 7;

    let targetBottom = boundaryRect.bottom - 10;
    if (table) {
      const rows = table.querySelectorAll('tbody tr');
      if (rows.length >= 7) {
        const targetRect = rows[6].getBoundingClientRect();
        targetBottom = Math.min(boundaryRect.bottom - 10, Math.round(targetRect.bottom));
      }
    }

    const top = Math.round(triggerRect.bottom + gap);
    const maxViewportBottom = window.innerHeight - 16;
    const limitedBottom = Math.min(targetBottom, maxViewportBottom);
    const desiredHeight = Math.max(420, limitedBottom - top);

    const maxWidthByBoundary = Math.max(760, Math.floor(boundaryRect.width - 8));
    let width = Math.min(Math.round(desiredHeight * ratio), maxWidthByBoundary, 1200);
    let height = Math.round(width / ratio);

    if (top + height > limitedBottom) {
      height = Math.max(420, desiredHeight);
      width = Math.min(Math.round(height * ratio), maxWidthByBoundary, 1200);
      height = Math.round(width / ratio) > desiredHeight ? desiredHeight : height;
    }

    const minLeft = Math.round(boundaryRect.left);
    const maxLeft = Math.round(boundaryRect.right - width);
    let left = Math.round(triggerRect.left + triggerRect.width / 2 - width / 2);
    left = Math.min(Math.max(left, minLeft), maxLeft);

    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.style.width = `${width}px`;
    panel.style.height = `${height}px`;
  }

  const openFromHover = () => {
    ensureLoaded();
    positionPanel();
    updateExpanded(true);
  };

  root.addEventListener('mouseenter', openFromHover);
  root.addEventListener('mouseleave', () => {
    root.classList.remove('touch-open');
    touchOpen = false;
    updateExpanded(false);
    if (document.activeElement === trigger) trigger.blur();
  });
  trigger.addEventListener('focus', () => {
    ensureLoaded();
    positionPanel();
    updateExpanded(true);
  });
  root.addEventListener('focusout', () => {
    requestAnimationFrame(() => {
      if (!root.contains(document.activeElement) && !root.matches(':hover') && !touchOpen) updateExpanded(false);
    });
  });
  trigger.addEventListener('click', event => {
    if (event.detail && event.pointerType !== 'touch' && !window.matchMedia('(hover: none)').matches) return;
    if (event.detail === 0) {
      ensureLoaded();
      positionPanel();
      updateExpanded(true);
      return;
    }
    touchOpen = !touchOpen;
    root.classList.toggle('touch-open', touchOpen);
    if (touchOpen) {
      ensureLoaded();
      positionPanel();
    }
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

  const onViewportChange = () => {
    if (isOpen()) positionPanel();
    else if (!desktopQuery.matches) resetDesktopLayout();
  };
  window.addEventListener('resize', onViewportChange);
  window.addEventListener('scroll', onViewportChange, true);
  if (desktopQuery.addEventListener) desktopQuery.addEventListener('change', onViewportChange);
  else if (desktopQuery.addListener) desktopQuery.addListener(onViewportChange);
})();
