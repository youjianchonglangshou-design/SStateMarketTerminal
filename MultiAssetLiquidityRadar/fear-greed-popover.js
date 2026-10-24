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
    ensureLoaded();
    const rect=trigger.getBoundingClientRect();
    const width=Math.min(850,Math.max(330,window.innerWidth-32));
    const height=Math.min(Math.round(width/ratio),Math.max(220,window.innerHeight-88));
    panel.style.left=`${Math.round(Math.max(8,Math.min(window.innerWidth-width-8,rect.left+rect.width/2-width/2)))}px`;
    panel.style.top=`${Math.round(Math.max(8,rect.top-height-8))}px`;
    panel.style.width=`${width}px`;
    panel.style.height=`${height}px`;
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
