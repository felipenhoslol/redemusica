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
