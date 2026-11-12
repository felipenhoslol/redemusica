// Swipe sideways on a panel to move to the neighbouring tab (feed: "Para você" ⇄ "Seguindo").
// The panel follows the finger or mouse; vertical scrolling is left to the browser.

import { horizontalScroller } from './dragScroll.js';
import { SPRINGS, reducedMotion } from './motion.js';

const START = 10;        // px before deciding the direction
const COMMIT = 0.22;     // share of the width that switches tabs
const FLICK = 0.45;      // px/ms that switches tabs even on a short swipe

/** Opacity while the panel sits at x (the same while dragging and while springing). */
const fade = (x, width) => 1 - Math.min(Math.abs(x) / width, 1) * 0.35;

/** Release: the old list leaves from where the finger left it, the new one enters from the same distance on the other side. */
export function releaseKeyframes(fromX, width, dir) {
  const off = dir * width * 0.6;
  return {
    out: [{ transform: `translateX(${fromX}px)`, opacity: fade(fromX, width) }, { transform: `translateX(${-off}px)`, opacity: 0 }],
    in: [{ transform: `translateX(${off}px)`, opacity: 0 }, { transform: 'translateX(0px)', opacity: 1 }],
  };
}

/** translateX of a computed `matrix(a, b, c, d, x, y)`. shortcut: ignores matrix3d, the swipe only ever sets 2D translates. */
const currentX = (transform) => +(/^matrix\(([^)]+)\)/.exec(transform)?.[1].split(',')[4] ?? 0);

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
  const clear = () => { el.style.transition = 'none'; el.style.transform = ''; el.style.opacity = ''; };
  // Spring from wherever the panel is back to rest
  const settle = (x) => {
    const opacity = +(el.style.opacity || fade(x, el.offsetWidth || 1)); // from where it shows now
    clear();
    if (x && !reducedMotion()) el.animate([{ transform: `translateX(${x}px)`, opacity }, { transform: 'translateX(0px)', opacity: 1 }],
      { duration: SPRINGS.smooth.duration, easing: SPRINGS.smooth.easing });
  };

  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest('input, textarea, select, [contenteditable="true"], .progress-track, input[type="range"]')) return;
    // A carousel inside the panel that can scroll sideways keeps the drag for itself
    const sc = horizontalScroller(e.target);
    if (sc && sc !== el && el.contains(sc)) return;
    // Caught mid-spring: stop it where it is and let the finger carry on from there
    let base = 0, opacity = 1;
    const running = el.getAnimations?.() || [];
    if (running.length) {
      const cs = getComputedStyle(el);
      base = currentX(cs.transform);
      running.forEach(a => a.cancel());
      el.style.transition = 'none';
      el.style.transform = `translateX(${base}px)`;
      opacity = +cs.opacity;
      el.style.opacity = cs.opacity;
    }
    s = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, base, dx: base, catchFade: opacity / fade(base, el.offsetWidth || 1), axis: null, width: el.offsetWidth || 1,
          last: { x: e.clientX, t: e.timeStamp }, v: 0 };
  });

  el.addEventListener('pointermove', (e) => {
    if (!s || e.pointerId !== s.id) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (!s.axis) {
      if (Math.abs(dx) < START && Math.abs(dy) < START) return;
      s.axis = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'x' : 'y';
      if (s.axis === 'y') { settle(s.base); s = null; return; }
      try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      el.classList.add('is-swiping');
      window.getSelection()?.removeAllRanges();
    }
    // Release speed: the last two moves
    s.v = (e.clientX - s.last.x) / Math.max(e.timeStamp - s.last.t, 1);
    s.last = { x: e.clientX, t: e.timeStamp };
    // No tab on that side: the finger's part moves with resistance so it's clear it ends there
    const x = s.base + dx;
    s.dx = neighbour(x < 0 ? 1 : -1) ? x : s.base + dx / 4;
    el.style.transition = 'none';
    el.style.transform = `translateX(${s.dx}px)`;
    el.style.opacity = String(Math.min(fade(s.dx, s.width) * s.catchFade, 1)); // caught mid-fade: carry on from that opacity
  });

  const finish = (e) => {
    if (!s || e.pointerId !== s.id) return;
    const { dx, width, axis, t, base, v } = s;
    s = null;
    if (axis !== 'x') { if (base) settle(base); return; }
    el.classList.remove('is-swiping');

    // A swipe is not a click: swallow the click that follows
    const swallow = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
    window.addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);

    const dir = dx < 0 ? 1 : -1;
    const target = neighbour(dir);
    const fast = Math.abs(dx - base) / Math.max(e.timeStamp - t, 1) > FLICK;

    if (target && (Math.abs(dx) > width * COMMIT || fast)) {
      const opacity = +el.style.opacity;
      clear();
      const kf = releaseKeyframes(dx, width, dir);
      if (opacity) kf.out[0].opacity = opacity; // caught mid-fade earlier
      const { duration, easing } = SPRINGS.smooth;
      // A fast finger has already covered part of the way: the exit takes what is left at that speed, between half and the whole spring
      const left = Math.abs(-dir * width * 0.6 - dx);
      const outMs = duration * Math.min(Math.max(left / (Math.abs(v) * duration), 0.5), 1);
      // The old list leaves; the new one is drawn when it is gone (forwards fill: no frame of it back at rest in between)
      const out = reducedMotion() ? null : el.animate?.(kf.out, { duration: outMs, easing, fill: 'forwards' });
      if (!out) { onSwitch(target, dir); return; }
      // Grabbed during the exit: the animation is cancelled, the old list stays and the new gesture decides from there
      out.finished.then(() => {
        onSwitch(target, dir);
        out.cancel();
        el.animate(kf.in, { duration, easing });
      }, () => {});
    } else {
      settle(dx);
    }
  };
  el.addEventListener('pointerup', finish);
  el.addEventListener('pointercancel', (e) => {
    if (!s || e.pointerId !== s.id) return;
    const { dx } = s;
    s = null;
    el.classList.remove('is-swiping');
    settle(dx);
  });
}
