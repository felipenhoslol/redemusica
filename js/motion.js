// Motion: physics springs without a library, following the Emil Kowalski guidelines in CLAUDE.md.
// A spring (stiffness, damping, mass) is simulated once and turned into a CSS `linear()` easing,
// so it runs in CSS transitions and in the Web Animations API — off the main thread, interruptible.

const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
export const reducedMotion = () => reduceQuery.matches;

const supportsLinear = (() => {
  try { return CSS.supports('transition-timing-function', 'linear(0, 1)'); } catch { return false; }
})();
const FALLBACK_EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';

/**
 * Simulate a damped spring from 0 to 1 and describe it as a CSS easing.
 * @param {{ stiffness?: number, damping?: number, mass?: number }} cfg
 * @returns {{ easing: string, duration: number }} duration in ms (time to settle)
 */
export function spring({ stiffness = 300, damping = 30, mass = 1 } = {}) {
  const dt = 1 / 1000;
  let x = 0, v = 0, t = 0;
  const samples = [0];
  const stepEvery = 0.008; // one point per 8ms keeps the curve faithful
  let next = stepEvery;
  while (t < 2) {
    const a = (-stiffness * (x - 1) - damping * v) / mass;
    v += a * dt;
    x += v * dt;
    t += dt;
    if (t >= next) { samples.push(x); next += stepEvery; }
    if (Math.abs(x - 1) < 0.003 && Math.abs(v) < 0.05) break; // beyond this the eye sees no motion
  }
  samples.push(1);
  const duration = Math.round(t * 1000);
  if (!supportsLinear) return { easing: FALLBACK_EASE_OUT, duration: Math.min(duration, 300) };
  return { easing: `linear(${samples.map(n => +n.toFixed(4)).join(', ')})`, duration };
}

// The few springs the app uses (named by feel, so every interaction shares one vocabulary)
export const SPRINGS = {
  press:  spring({ stiffness: 2600, damping: 102 }), // button press: crisp, critically damped
  snappy: spring({ stiffness: 900, damping: 55 }),   // icon swaps, small state changes
  smooth: spring({ stiffness: 520, damping: 42 }),   // things moving on screen (layout, indicators)
  pop:    spring({ stiffness: 700, damping: 32 }),   // a like landing: one soft overshoot (bounce ≈ 0.1)
  drawer: spring({ stiffness: 380, damping: 38 })    // the player rising from the bottom
};

// Same curves for CSS: var(--spring-smooth) with var(--spring-smooth-dur)
(function exposeToCss() {
  const css = Object.entries(SPRINGS)
    .map(([name, s]) => `--spring-${name}: ${s.easing}; --spring-${name}-dur: ${s.duration}ms;`)
    .join(' ');
  const style = document.createElement('style');
  style.id = 'motion-springs';
  style.textContent = `:root { ${css} }`;
  document.head.appendChild(style);
})();

/** Run a WAAPI animation with one of the springs. Reduced motion: returns null, or with `fade: true` runs only the opacity. */
export function animateSpring(el, keyframes, name = 'snappy', { fade, ...extra } = {}) {
  if (!el?.animate) return null;
  if (reducedMotion()) {
    if (fade !== true) return null;
    keyframes = keyframes.map(({ transform, filter, ...rest }) => rest);
  }
  const s = SPRINGS[name] || SPRINGS.snappy;
  return el.animate(keyframes, { duration: s.duration, easing: s.easing, ...extra });
}

/**
 * FLIP: re-render a list and let every item glide from where it was to where it is now,
 * so nothing next to the change jumps. New items fade in; removed ones are simply gone.
 * @param {HTMLElement} container
 * @param {string} selector items keyed by `data-flip-key` or `data-post-id`
 * @param {() => void} mutate does the re-render
 */
export function flip(container, selector, mutate) {
  if (!container) { mutate(); return; }
  const keyOf = (el) => el.dataset.flipKey || el.dataset.postId;
  const before = new Map();
  container.querySelectorAll(selector).forEach(el => {
    const k = keyOf(el);
    if (k && !before.has(k)) before.set(k, el.getBoundingClientRect().top);
  });
  mutate();
  if (reducedMotion() || !before.size) return;
  const viewH = window.innerHeight;
  container.querySelectorAll(selector).forEach(el => {
    const k = keyOf(el);
    const top = el.getBoundingClientRect().top;
    if (top > viewH + 200 || top + el.offsetHeight < -200) return; // off screen: nothing to see
    if (before.has(k)) {
      const dy = before.get(k) - top;
      if (Math.abs(dy) > 0.5) animateSpring(el, [{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }], 'smooth');
    } else {
      // Enters: from slightly smaller and transparent, never from nothing
      animateSpring(el, [
        { opacity: 0, transform: 'translateY(-6px) scale(0.98)' },
        { opacity: 1, transform: 'none' }
      ], 'smooth');
    }
  });
}

// Everything that gives a block its vertical size: all of it reaches 0, so `display: none` at the end is not a jump
const COLLAPSE_BOX = ['height', 'paddingTop', 'paddingBottom', 'borderTopWidth', 'borderBottomWidth', 'marginTop', 'marginBottom'];
const collapseBox = (el, closed) => {
  const cs = getComputedStyle(el);
  const box = Object.fromEntries(COLLAPSE_BOX.map(p => [p, closed ? '0px' : cs[p]]));
  box.opacity = closed ? 0 : cs.opacity;
  return box;
};

/** Whether the accordion was last asked to open (true while it is still animating open). */
export const isCollapseOpen = (el) => el?.dataset.open === 'true';

/**
 * Accordion open/close for a block toggled between `display: none` and visible.
 * Height is the one non-transform property allowed here (no transform equivalent).
 * Interruptible: a second tap mid-way continues from the current height.
 * @returns {Animation|null} null under reduced motion (the switch is instant)
 */
export function toggleCollapse(el, open, display = 'flex') {
  if (!el) return null;
  el.dataset.open = String(open);
  const hidden = el.style.display === 'none' || getComputedStyle(el).display === 'none';
  const from = collapseBox(el, hidden);
  el.getAnimations?.().forEach(a => a.cancel());
  el.style.display = display;
  const a = animateSpring(el, [from, collapseBox(el, !open)], 'smooth');
  if (!a) { if (!open) el.style.display = 'none'; return null; }
  el.style.overflow = 'hidden';
  a.onfinish = () => { el.style.overflow = ''; if (!open) el.style.display = 'none'; };
  return a;
}

/**
 * Enter animation that never jumps: from `from` when the element is at rest, or from
 * wherever a running animation has it right now. Ends at rest (no transform, opaque).
 * @returns {Animation|null} null under reduced motion (running animations are still cancelled)
 */
export function enterFrom(el, from, name = 'smooth') {
  if (!el?.animate) return null;
  const running = el.getAnimations();
  if (running.length) {
    const cs = getComputedStyle(el);
    from = cs.transform === 'none' ? { opacity: cs.opacity } : { opacity: cs.opacity, transform: cs.transform };
  }
  running.forEach(a => a.cancel());
  // No transform in `from`: opacity only. Animating transform (even to 'none') makes el the box its fixed descendants position in
  return animateSpring(el, [from, 'transform' in from ? { opacity: 1, transform: 'none' } : { opacity: 1 }], name);
}

/** transform-origin that makes `box` grow out of `trigger`: the trigger's centre, relative to the box and kept inside it. */
export function originFrom(trigger, box) {
  const t = trigger.getBoundingClientRect(), b = box.getBoundingClientRect();
  const inside = (v, max) => Math.round(Math.min(Math.max(v, 0), max));
  return `${inside(t.left + t.width / 2 - b.left, b.width)}px ${inside(t.top + t.height / 2 - b.top, b.height)}px`;
}

/** The control the event being handled came from (inline onclick or listener), if any. */
function eventTrigger() {
  const e = window.event;
  if (e?.currentTarget?.nodeType === 1) return e.currentTarget; // an element, not document/window
  return e?.target?.closest?.('button, a, [onclick], [role="button"]') || null;
}

/** Point a modal/dialog box at what was tapped to open it (centre when nothing was, e.g. a forced update). */
export function growFrom(box, trigger = eventTrigger()) {
  if (box) box.style.transformOrigin = trigger ? originFrom(trigger, box) : 'center';
}

/**
 * Open/close a dropdown or popover. The CSS transition (scoped to the popover's class, `[data-open]`)
 * does the motion; `data-open="false"` counts as closed even while it is still fading out.
 */
export function setPopover(el, open, trigger) {
  if (!el) return;
  if (open) growFrom(el, trigger || null);
  el.dataset.open = String(open);
}

/** Feedback for a toggle that just turned on (like, repost, bookmark): the icon lands with a soft pop. */
export function popIcon(btn) {
  const icon = btn?.querySelector('svg');
  if (!icon || reducedMotion()) return;
  animateSpring(icon, [{ transform: 'scale(0.82)' }, { transform: 'scale(1)' }], 'pop');
}

/** A counter that changes: the new number rolls in from the direction of the change, width stays put. */
export function rollNumber(el, value, direction = 1) {
  if (!el) return;
  const old = el.textContent;
  el.textContent = value;
  if (reducedMotion() || String(old) === String(value)) return;
  animateSpring(el, [
    { transform: `translateY(${direction > 0 ? 6 : -6}px)`, opacity: 0, filter: 'blur(2px)' },
    { transform: 'translateY(0)', opacity: 1, filter: 'blur(0)' }
  ], 'snappy');
}

/** Swap an icon/content inside a control with a blur-masked crossfade (state indication). */
export function swapContent(el, html) {
  if (!el) return;
  if (el.innerHTML === html) return;
  el.innerHTML = html;
  if (reducedMotion()) return;
  const target = el.firstElementChild || el;
  animateSpring(target, [
    { opacity: 0, transform: 'scale(0.85)', filter: 'blur(2px)' },
    { opacity: 1, transform: 'scale(1)', filter: 'blur(0)' }
  ], 'snappy');
}

/**
 * Back to the top of the window with a spring: jump there at once (the page is never in-between),
 * then let the content glide down into place (FLIP). Reduced motion: just the jump.
 * @param {HTMLElement} el what glides (the screen's content)
 */
export function springScrollTop(el) {
  const from = Math.min(window.scrollY, window.innerHeight); // from far down only the last screen glides: the eye can't follow more
  window.scrollTo({ top: 0, behavior: 'instant' });
  if (from > 0) animateSpring(el, [{ transform: `translateY(${-from}px)` }, { transform: 'none' }], 'smooth');
}
