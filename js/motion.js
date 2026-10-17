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

/** Run a WAAPI animation with one of the springs (no-op under reduced motion unless `fade` only). */
export function animateSpring(el, keyframes, name = 'snappy', extra = {}) {
  if (!el?.animate) return null;
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

/**
 * Accordion open/close for a block toggled between `display: none` and visible.
 * Height is the one non-transform property allowed here (no transform equivalent); kept short.
 */
export function toggleCollapse(el, open, display = 'flex') {
  if (!el) return;
  el.getAnimations?.().forEach(a => a.cancel());
  if (reducedMotion()) { el.style.display = open ? display : 'none'; return; }
  if (open) {
    el.style.display = display;
    const h = el.scrollHeight;
    el.style.overflow = 'hidden';
    const a = el.animate(
      [{ height: '0px', opacity: 0 }, { height: `${h}px`, opacity: 1 }],
      { duration: 200, easing: FALLBACK_EASE_OUT }
    );
    a.onfinish = () => { el.style.overflow = ''; };
  } else {
    const h = el.offsetHeight;
    el.style.overflow = 'hidden';
    const a = el.animate(
      [{ height: `${h}px`, opacity: 1 }, { height: '0px', opacity: 0 }],
      { duration: 160, easing: FALLBACK_EASE_OUT } // exit faster than enter
    );
    a.onfinish = () => { el.style.display = 'none'; el.style.overflow = ''; };
  }
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
