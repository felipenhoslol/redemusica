// Kept tabs: each tab is built once and stays in the page; coming back only shows it again.
// It is redrawn when its data changed (app.js TAB_SIGNATURES), never just because it was visited.

import { enterFrom } from './motion.js';

/** Build the tab now? First visit, a profile of someone else, or admin (always fresh). */
export function needsBuild(tab, state, uid) {
  if (tab === 'admin' || !state.built.has(tab)) return true;
  return tab === 'profile' && state.profileUid !== uid;
}

/** More than 30 s since the last check with the server. */
export const isStale = (lastCheck, now) => now - lastCheck > 30000;

/** The person as their profile shows them. Presence (lastSeenAt) is left out: every sync rewrites it, and it must not redraw the profile. */
export function profileUserSignature(user) {
  const { lastSeenAt, ...shown } = user || {};
  return JSON.stringify(shown);
}

/**
 * The tab shows position: fixed content (the phone chat, the open composer). A transform on the tab would make
 * the tab their containing block, so they would collapse into it while it moves.
 */
export const hasFixedContent = (el) =>
  [...el.querySelectorAll(':scope > *, #creator-wrap')].some(n => getComputedStyle(n).position === 'fixed');

/** Short enter for a tab shown again: from 8px below and transparent (fade only over fixed content), or from wherever a running enter has it. */
export const enterPanel = (el) =>
  el ? enterFrom(el, hasFixedContent(el) ? { opacity: 0 } : { opacity: 0, transform: 'translateY(8px)' }, 'smooth') : null;

/** Run what sits below the fold after the first frame is on screen. */
export function mountBelowFold(fn) {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(fn, { timeout: 500 });
  else setTimeout(fn, 0);
}

/**
 * First visit: the items past the first screen are added after the first frame.
 * Skipped if `list` was redrawn in between (its last item is no longer the one drawn now).
 */
export function appendBelowFold(list, restHtml) {
  if (!list || !restHtml) return;
  const tail = list.lastElementChild;
  mountBelowFold(() => { if (list.isConnected && list.lastElementChild === tail) list.insertAdjacentHTML('beforeend', restHtml); });
}
