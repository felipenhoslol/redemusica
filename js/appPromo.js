// App Android: o anúncio no site (só em navegadores Android) e o aviso de versão nova dentro do app.
// A versão vem da última Release do GitHub (gerada por .github/workflows/android.yml): a API tem CORS
// liberado, e o corpo da Release traz {"version","versionCode","minVersionCode"} num comentário.
// Sem Release (ou sem rede), nada aparece.

import { esc } from './dom.js';
import { animateSpring, reducedMotion } from './motion.js';

const REPO = 'felipenhoslol/redemusica';
const APK_NAME = 'rede-de-musica.apk';
export const APK_URL = `https://github.com/${REPO}/releases/latest/download/${APK_NAME}`;
export const DOWNLOAD_PAGE = 'https://redemusicasemnome.vercel.app/baixar.html';
const NEW_DAYS = 14;
const KEY_SEEN = 'rmsn_app_promo_seen';   // a janela já foi fechada ou usada
const KEY_FIRST = 'rmsn_app_item_first';  // quando o item "Baixar app" apareceu pela primeira vez (para a etiqueta NOVO)

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* modo privado: a janela pode voltar, sem problema */ } }
};

export const isNativeApp = () => !!window.Capacitor?.isNativePlatform?.();
export const isAndroidWeb = () => /Android/i.test(navigator.userAgent) && !isNativeApp();

/** Parse a GitHub "latest release" response into the version info, or null if it isn't a usable app release. */
export function parseRelease(rel) {
  const apk = rel?.assets?.find(a => a.name === APK_NAME);
  const m = /<!--\s*app-version\s*(\{[^}]*\})\s*-->/.exec(rel?.body || '');
  if (!apk || !m) return null;
  let meta;
  try { meta = JSON.parse(m[1]); } catch { return null; }
  const versionCode = Number(meta.versionCode);
  if (!Number.isInteger(versionCode) || versionCode < 1) return null;
  return {
    version: String(meta.version || versionCode),
    versionCode,
    minVersionCode: Number.isInteger(meta.minVersionCode) ? meta.minVersionCode : 1,
    sizeMB: (apk.size / 1048576).toLocaleString('pt-BR', { maximumFractionDigits: 1 }),
    url: APK_URL
  };
}

let latest = null;
/** Latest app version (cached for the session: the API allows 60 calls/hour per IP). */
export function fetchLatest() {
  if (latest) return latest;
  latest = (async () => {
    try {
      const cached = sessionStorage.getItem('rmsn_app_latest');
      if (cached) return JSON.parse(cached);
    } catch { /* sem sessionStorage: busca de novo */ }
    try {
      const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } });
      const info = res.ok ? parseRelease(await res.json()) : null;
      try { sessionStorage.setItem('rmsn_app_latest', JSON.stringify(info)); } catch { /* ok */ }
      return info;
    } catch { return null; }
  })();
  return latest;
}

let latestNow = null; // the resolved value, for the menu (drawn synchronously)

/** "Baixar app" item for the me-sheet: empty outside Android browsers or without a release. */
export function appMenuItemHtml(icon) {
  if (!isAndroidWeb() || !latestNow) return '';
  let first = Number(store.get(KEY_FIRST));
  if (!first) { first = Date.now(); store.set(KEY_FIRST, String(first)); }
  const isNew = Date.now() - first < NEW_DAYS * 864e5;
  return `<button type="button" class="me-sheet-item" data-go="app">${icon}<span>Baixar app</span>${isNew ? '<span class="app-new-tag">NOVO</span>' : ''}</button>`;
}

export const openDownloadPage = () => { location.href = DOWNLOAD_PAGE; };

// ─── Bottom sheet (same shape as the me-sheet, with a spring) ───
function openSheet({ title, text, button, href, blocking = false, onDone }) {
  const root = document.createElement('div');
  root.className = 'app-promo';
  root.innerHTML = `
    <div class="app-promo-scrim"${blocking ? '' : ' data-close'}></div>
    <div class="app-promo-panel" role="dialog" aria-modal="true" aria-labelledby="app-promo-title">
      <div class="app-promo-grip" aria-hidden="true"></div>
      <img class="app-promo-cat" src="assets/favicon.svg" alt="" width="56" height="56">
      <h2 id="app-promo-title">${esc(title)}</h2>
      <p>${esc(text)}</p>
      <a class="app-promo-btn" href="${esc(href)}" data-done${isNativeApp() ? ' target="_blank" rel="noopener"' : ''}>${esc(button)}</a>
      ${blocking ? '' : '<button type="button" class="app-promo-later" data-close>Agora não</button>'}
    </div>`;
  document.body.appendChild(root);
  const panel = root.querySelector('.app-promo-panel');
  const scrim = root.querySelector('.app-promo-scrim');
  if (!reducedMotion()) {
    animateSpring(panel, [{ transform: 'translateY(100%)' }, { transform: 'none' }], 'drawer');
    scrim.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });
  }
  const close = () => {
    document.removeEventListener('keydown', onKey);
    onDone?.();
    if (reducedMotion()) return root.remove();
    scrim.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, easing: 'ease-in', fill: 'forwards' });
    const a = animateSpring(panel, [{ transform: 'none' }, { transform: 'translateY(100%)' }], 'snappy', { fill: 'forwards' });
    a ? (a.onfinish = () => root.remove()) : root.remove();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) close();
    else if (e.target.closest('[data-done]') && !blocking) close(); // the link still downloads / opens
  });
  if (!blocking) document.addEventListener('keydown', onKey);
  root.querySelector('.app-promo-btn').focus({ preventScroll: true });
}

/** Call once the app has started. */
export async function initAppPromo() {
  if (isNativeApp()) return checkForUpdate();
  if (!isAndroidWeb()) return;
  latestNow = await fetchLatest();
  if (!latestNow || store.get(KEY_SEEN)) return;
  openSheet({
    title: 'rede de música sem nome agora é app',
    text: `Instale o APK (${latestNow.sizeMB} MB) e abra a rede direto da tela inicial.`,
    button: 'Baixar APK',
    href: latestNow.url,
    onDone: () => store.set(KEY_SEEN, '1')
  });
}

// Inside the app: the bundled www/app-version.json says which version this is (tools/build-app.mjs)
async function checkForUpdate() {
  let current;
  try { current = await (await fetch('app-version.json', { cache: 'no-store' })).json(); } catch { return; }
  const info = await fetchLatest();
  if (!info || !(info.versionCode > current.versionCode)) return;
  const blocking = current.versionCode < info.minVersionCode;
  if (!blocking && store.get('rmsn_app_update_seen') === String(info.versionCode)) return; // one notice per version
  openSheet({
    title: blocking ? 'Atualize o app para continuar' : 'Versão nova do app',
    text: blocking
      ? `Esta versão não funciona mais com a rede. Baixe a ${info.version} (${info.sizeMB} MB).`
      : `A versão ${info.version} já saiu (${info.sizeMB} MB).`,
    button: 'Atualizar',
    href: DOWNLOAD_PAGE,
    blocking,
    onDone: () => store.set('rmsn_app_update_seen', String(info.versionCode))
  });
}
