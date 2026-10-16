// Swipe sideways on a panel to move to the neighbouring tab (feed: "Para você" ⇄ "Seguindo").
// The panel follows the finger or mouse; vertical scrolling is left to the browser.

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const START = 10;        // px before deciding the direction
const COMMIT = 0.22;     // share of the width that switches tabs
const FLICK = 0.45;      // px/ms that switches tabs even on a short swipe

/**
 * @param {HTMLElement} el the panel that moves
 * @param {{ tabs: string[], current: () => string, onSwitch: (tab: string, direction: number) => void }} opts
 */
export function bindSwipeTabs(el, { tabs, current, onSwitch }) {
  if (!el || el._swipeBound) return;
  el._swipeBound = true;
  el.style.touchAction = 'pan-y';
  let s = null;

  const neighbour = (dir) => tabs[tabs.indexOf(current()) + dir] || null;

  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest('input, textarea, select, [contenteditable="true"], .progress-track, input[type="range"]')) return;
    s = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, dx: 0, axis: null, width: el.offsetWidth || 1 };
  });

  el.addEventListener('pointermove', (e) => {
    if (!s || e.pointerId !== s.id) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (!s.axis) {
      if (Math.abs(dx) < START && Math.abs(dy) < START) return;
      s.axis = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'x' : 'y';
      if (s.axis === 'y') { s = null; return; }
      try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      el.classList.add('is-swiping');
      window.getSelection()?.removeAllRanges();
    }
    // No tab on that side: move with resistance so it's clear it ends there
    s.dx = neighbour(dx < 0 ? 1 : -1) ? dx : dx / 4;
    el.style.transition = 'none';
    el.style.transform = `translateX(${s.dx}px)`;
    el.style.opacity = String(1 - Math.min(Math.abs(s.dx) / s.width, 1) * 0.35);
  });

  const finish = (e) => {
    if (!s || e.pointerId !== s.id) return;
    const { dx, width, axis, t } = s;
    s = null;
    if (axis !== 'x') return;
    el.classList.remove('is-swiping');

    // A swipe is not a click: swallow the click that follows
    const swallow = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
    window.addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);

    const dir = dx < 0 ? 1 : -1;
    const target = neighbour(dir);
    const fast = Math.abs(dx) / Math.max(e.timeStamp - t, 1) > FLICK;
    const reset = () => { el.style.transition = 'none'; el.style.transform = ''; el.style.opacity = ''; };

    if (target && (Math.abs(dx) > width * COMMIT || fast)) {
      if (reducedMotion.matches) { reset(); onSwitch(target, dir); return; }
      el.style.transition = 'transform .16s ease-in, opacity .16s ease-in';
      el.style.transform = `translateX(${-dir * width * 0.6}px)`;
      el.style.opacity = '0';
      setTimeout(() => { reset(); onSwitch(target, dir); }, 160);
    } else {
      el.style.transition = reducedMotion.matches ? 'none' : 'transform .2s ease-out, opacity .2s ease-out';
      el.style.transform = '';
      el.style.opacity = '';
    }
  };
  el.addEventListener('pointerup', finish);
  el.addEventListener('pointercancel', (e) => {
    if (!s || e.pointerId !== s.id) return;
    s = null;
    el.classList.remove('is-swiping');
    el.style.transition = 'transform .2s ease-out, opacity .2s ease-out';
    el.style.transform = '';
    el.style.opacity = '';
  });
}
