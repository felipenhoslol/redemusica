// Measures a screen against the visual rules (docs/superpowers/specs/2026-10-19-visual-refresh-design.md).
// Run in the page console: (await import('/tools/ui-audit.mjs?v=' + Date.now())).auditScreen()

const firstClass = (el) => `${el.tagName.toLowerCase()}.${String(el.className?.baseVal ?? el.className ?? '').split(' ')[0]}`;

/**
 * @param {Element} root the screen to measure (default: the active tab)
 * @returns {{ textSizes: string[], textWeights: string[], iconSizes: number[], framedBoxes: string[], accentOnStatic: string[] }}
 */
export function auditScreen(root = document.querySelector('.tab-view-content.active')) {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.top < innerHeight * 3 && getComputedStyle(el).visibility !== 'hidden';
  };
  const all = [...root.querySelectorAll('*')].filter(visible);
  const ownsText = (el) => [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
  const texts = all.filter(el => ownsText(el) && !el.closest('input, textarea, select, .profile-bio, .cat'));

  const accent = (() => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--accent)';
    document.body.appendChild(probe);
    const c = getComputedStyle(probe).color;
    probe.remove();
    return c;
  })();
  const interactive = 'a, button, [role="button"], .active, [aria-current], [aria-selected="true"], .liked, .reposted, .bookmarked';
  const notFrame = 'input, textarea, select, button, a, [role="button"], .featured-song-box, .comment-composer-box, .app-dialog-panel, img, [class*="avatar"], [class*="photo"]';
  const framed = (el) => {
    const cs = getComputedStyle(el);
    return el.getBoundingClientRect().width > 60 && !el.matches(notFrame) && !el.closest('.featured-song-box')
      && ['Top', 'Right', 'Bottom', 'Left'].every(s => parseFloat(cs[`border${s}Width`]) > 0 && cs[`border${s}Style`] !== 'none');
  };
  const uniq = (xs) => [...new Set(xs)];
  const byNumber = (a, b) => parseFloat(a) - parseFloat(b);

  return {
    textSizes: uniq(texts.map(el => getComputedStyle(el).fontSize)).sort(byNumber),
    textWeights: uniq(texts.map(el => getComputedStyle(el).fontWeight)).sort(byNumber),
    iconSizes: uniq(all.filter(el => el.matches('svg[stroke="currentColor"]') && !el.closest('.cat, .player-bar'))
      .map(el => Math.round(el.getBoundingClientRect().width))).sort((a, b) => a - b),
    framedBoxes: uniq(all.filter(framed).map(firstClass)),
    accentOnStatic: uniq(texts.filter(el => getComputedStyle(el).color === accent && !el.closest(interactive)).map(firstClass))
  };
}

/** Runs auditScreen on feed, search, chat, desafios, your profile and a post screen (uses the app's globals). */
export async function auditAll() {
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const Storage = await import('/js/storage.js');
  const out = {};
  for (const tab of ['feed', 'search', 'chat', 'desafios']) { window.switchTab(tab); await wait(1300); window.scrollTo(0, 0); out[tab] = auditScreen(); }
  window._goToProfile(Storage.getActiveUserId()); await wait(1800); out.profile = auditScreen();
  window.switchTab('feed'); await wait(800);
  const postId = document.querySelector('#feed-posts .post-card')?.dataset.postId;
  if (postId) { window._openPostView(postId); await wait(1200); out.post = auditScreen(document.getElementById('post-view')); document.querySelector('#post-view [data-close]')?.click(); }
  return out;
}
