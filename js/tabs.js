// Tab bar motion: an indicator that slides to the selected tab, and content that enters
// from the side the user moved to. Reused by every tab bar (feed, profile, admin, login, playlists).

const lastPosition = new Map(); // bar key → { x, w } so re-rendered bars slide from where they were
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const ACTIVE = '.active, [aria-selected="true"]';

function textWidth(el) {
  const range = document.createRange();
  range.selectNodeContents(el);
  return Math.min(range.getBoundingClientRect().width, el.offsetWidth);
}

/**
 * Add a sliding indicator to a tab bar. Safe to call again after the bar is re-rendered.
 * @param {HTMLElement} bar
 * @param {{ key?: string, variant?: 'line' | 'pill', tabs?: string }} opts
 *   key: remembers the last position across re-renders (omit it to start in place)
 *   line: bar under the label (underlined tabs) · pill: filled shape behind the label (pill filters)
 */
export function mountTabIndicator(bar, { key, variant = 'line', tabs = 'button' } = {}) {
  if (!bar) return;
  bar.classList.add('has-tab-indicator', `tab-indicator-${variant}`);
  let ind = bar.querySelector(':scope > .tab-indicator');
  if (!ind) {
    ind = document.createElement('span');
    ind.className = 'tab-indicator';
    ind.setAttribute('aria-hidden', 'true');
    bar.appendChild(ind);
  }

  const place = (animate) => {
    const active = bar.querySelector(`:scope > ${tabs}:is(${ACTIVE})`);
    if (!active) { ind.style.opacity = '0'; return; }
    let x, w;
    if (variant === 'line') {
      w = Math.max(32, textWidth(active));
      x = active.offsetLeft + (active.offsetWidth - w) / 2;
    } else {
      w = active.offsetWidth;
      x = active.offsetLeft;
    }
    ind.style.transition = animate && !reducedMotion.matches ? '' : 'none';
    ind.style.opacity = '1';
    ind.style.width = `${w}px`;
    ind.style.transform = `translateX(${x}px)`;
    if (variant === 'pill') {
      ind.style.top = `${active.offsetTop}px`;
      ind.style.height = `${active.offsetHeight}px`;
    }
    if (key) lastPosition.set(key, { x, w });
  };

  // Start from the previous position (the bar may have been re-rendered), then slide
  const prev = key ? lastPosition.get(key) : null;
  if (prev) {
    ind.style.transition = 'none';
    ind.style.width = `${prev.w}px`;
    ind.style.transform = `translateX(${prev.x}px)`;
    void ind.offsetWidth;
  }
  requestAnimationFrame(() => place(Boolean(prev)));

  if (!bar._tabObserver) {
    bar._tabObserver = new MutationObserver(() => place(true));
    bar._tabObserver.observe(bar, { subtree: true, attributes: true, attributeFilter: ['class', 'aria-selected'] });
    new ResizeObserver(() => place(false)).observe(bar);
  }
}

/**
 * Index-based direction between two tabs: 1 = moved right, -1 = moved left, 0 = same.
 */
export function tabDirection(fromIndex, toIndex) {
  return Math.sign(toIndex - fromIndex);
}

/**
 * Play the "content enters from the side" animation on a panel.
 * @param {HTMLElement} el
 * @param {number} direction 1 (from right), -1 (from left) or 0 (fade only)
 */
export function animatePanel(el, direction = 0) {
  if (!el || reducedMotion.matches) return;
  el.classList.remove('panel-in-right', 'panel-in-left', 'panel-in-fade');
  void el.offsetWidth;
  el.classList.add(direction > 0 ? 'panel-in-right' : direction < 0 ? 'panel-in-left' : 'panel-in-fade');
  el.addEventListener('animationend', () => el.classList.remove('panel-in-right', 'panel-in-left', 'panel-in-fade'), { once: true });
}
