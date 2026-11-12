// Scroll memory per screen: going back to a tab (or a profile) lands exactly where you left it.
// The window scrolls (not a container per tab), so each screen keeps its scrollY, plus the post that was
// on screen: if the screen came back taller or shorter (new posts above), we follow that post instead.

export const ANCHOR = '.post-card, [data-flip-key]';

const saved = new Map(); // screen key → { y, h, anchorKey, anchorOffset }
const keyOf = (el) => el.dataset.postId || el.dataset.flipKey;

/** 'profile:<uid>' for a profile (each person scrolls on their own), otherwise the tab name. */
export const screenKey = (tab, uid) => (tab === 'profile' ? `profile:${uid}` : tab);

/** Remember where the current screen is scrolled (call before leaving it). */
export function saveScroll(key, anchorSelector = ANCHOR, root = document) {
  // The first item of the screen being left (`root`) still (partly) on screen; kept hidden tabs are not searched
  const anchor = [...root.querySelectorAll(anchorSelector)].find(el => keyOf(el) && el.getBoundingClientRect().bottom > 0);
  saved.set(key, {
    y: window.scrollY,
    h: document.documentElement.scrollHeight,
    anchorKey: anchor ? keyOf(anchor) : null,
    anchorOffset: anchor ? anchor.getBoundingClientRect().top : 0
  });
}

/** Scroll to where `key` was left, in the same frame (call once `root` is shown). Never seen: top. */
export function restoreScroll(key, root, anchorSelector = ANCHOR) {
  const s = saved.get(key);
  let y = s ? s.y : 0;
  if (s?.anchorKey && document.documentElement.scrollHeight !== s.h) {
    const anchor = [...root.querySelectorAll(anchorSelector)].find(el => keyOf(el) === s.anchorKey);
    if (anchor) y = anchor.getBoundingClientRect().top + window.scrollY - s.anchorOffset;
  }
  window.scrollTo({ top: y, behavior: 'instant' });
}
