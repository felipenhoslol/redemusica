// Visual 2016 (easter egg): who sees which skin/cat, the 16-tap counter, and applying it to <html>
export const LOOK_KEY = 'rmsn_look_v1';
export const DEFAULT_LOOK = { skin: 'padrao', cat: 'kawaii' };
const SKINS = ['padrao', 'yt2016'];
const CATS = ['kawaii', 'retro'];

export function readLooks() {
  try {
    const v = JSON.parse(localStorage.getItem(LOOK_KEY));
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch { return {}; }
}

export function saveLook(id, patch) {
  if (!id) return;
  const looks = readLooks();
  const prev = looks[id] || {};
  looks[id] = { ...prev, ...patch };
  if (prev.found === true) looks[id].found = true; // a discovery is never undone
  try { localStorage.setItem(LOOK_KEY, JSON.stringify(looks)); } catch {}
}

export function resolveLook(looks, id, serverFound = false) {
  const rec = (id && looks?.[id]) || {};
  const found = rec.found === true || serverFound === true;
  if (!found) return { ...DEFAULT_LOOK, found };
  return {
    skin: SKINS.includes(rec.skin) ? rec.skin : DEFAULT_LOOK.skin,
    cat: CATS.includes(rec.cat) ? rec.cat : DEFAULT_LOOK.cat,
    found,
  };
}

export function createTapCounter({ need = 16, resetMs = 2000 } = {}) {
  let count = 0, last = -Infinity;
  return now => {
    if (now - last > resetMs) count = 0;
    last = now;
    if (++count < need) return false;
    count = 0;
    return true;
  };
}

// Reconcile the local mirror with the server flag: copy down what the server knows, push up what only this device knows
export function discoveryActions(localFound, serverFound) {
  return { saveMirror: !localFound && serverFound, pushFlag: localFound && !serverFound };
}

export function applyLook({ skin, cat }, root = document.documentElement) {
  if (skin && skin !== DEFAULT_LOOK.skin) root.setAttribute('data-skin', skin); else root.removeAttribute('data-skin');
  if (cat && cat !== DEFAULT_LOOK.cat) root.setAttribute('data-cat', cat); else root.removeAttribute('data-cat');
  if (skin === 'yt2016' && !document.getElementById('font-2016')) {
    const link = document.createElement('link');
    link.id = 'font-2016';
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Roboto:wght@400;500&display=swap';
    document.head.appendChild(link);
  }
}
