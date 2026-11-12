// Shared element: the tapped cover or avatar flies to its place on the screen it opens (View Transitions API).
// Without the API (WebView older than Chromium 111) or with reduced motion the screen changes at once.

import { reducedMotion } from './motion.js';

const ORIGIN = '[data-vt-origin]'; // the element the last flight left from
let pending = null; // updates waiting for the transition about to capture the old screen (they join it)
let active = null;  // the running transition, until it finishes
let last = null;    // the last flight that landed: { name, toSelector, back }, for the way back

const canTransition = () => typeof document.startViewTransition === 'function' && !reducedMotion();

/** A transition is changing the screen: what it swaps in gets no enter animation of its own. */
export const transitioning = () => !!active;

/** On screen and on top: not in a hidden kept tab, not under a dialog. */
function shown(el) {
  if (!el?.isConnected) return false;
  const r = el.getBoundingClientRect();
  const hit = r.width > 0 && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return !!hit && (el.contains(hit) || hit.contains(el));
}

function run(update, from, name, toSelector, onLanded) {
  // Only one element carries a name at a time (the same name twice aborts the transition)
  if (from) from.style.viewTransitionName = name;
  let to = null;
  pending = [update];
  const t = document.startViewTransition(() => {
    const updates = pending;
    pending = null;
    try { updates.forEach(fn => fn()); } finally {
      if (from) {
        from.style.viewTransitionName = '';
        const el = document.querySelector(toSelector);
        if (shown(el)) { to = el; to.style.viewTransitionName = name; onLanded?.(); }
      }
    }
  });
  active = t;
  const skip = () => t.skipTransition(); // a touch never waits for the animation
  document.addEventListener('pointerdown', skip, true);
  t.ready?.catch(() => {}); // skipped before it started: not an error
  t.finished.catch(() => {}).finally(() => {
    document.removeEventListener('pointerdown', skip, true);
    if (to) to.style.viewTransitionName = '';
    if (active === t) active = null;
  });
}

/**
 * Change the screen inside a View Transition. With `pair`, `from` (if on screen) flies to `toSelector` after the update;
 * otherwise, or when the destination isn't on screen, the screen only crossfades. `back` is where the way back lands
 * when `from` itself is redrawn (default: `from`). `update` must not wait for the network.
 */
export function withTransition(update, pair) {
  if (pending) { pending.push(update); return; } // same tap (e.g. leaving the post view for a profile): one transition
  if (active || !canTransition()) { update(); return; }
  const from = pair && shown(pair.from) ? pair.from : null;
  if (from) {
    document.querySelector(ORIGIN)?.removeAttribute('data-vt-origin');
    from.setAttribute('data-vt-origin', '');
  }
  run(update, from, pair?.name, pair?.toSelector,
    () => { last = { name: pair.name, toSelector: pair.toSelector, back: pair.back || ORIGIN }; });
}

/** Going back (button, gesture, popstate): the reverse flight while its destination is still on top; else a plain change. */
export function withReturn(update) {
  const from = last && !pending && !active && canTransition() ? document.querySelector(last.toSelector) : null;
  if (!shown(from)) { if (pending) pending.push(update); else update(); return; }
  const { name, back } = last;
  last = null;
  run(update, from, name, back);
}
