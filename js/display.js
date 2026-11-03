// Display settings: theme (dark / light / auto) and accent color, saved per device.
// The <head> script in index.html applies the saved choice before first paint.
import { catLogoHtml } from './logo.js';
import { isNativeApp } from './appPromo.js';
import { getPushPrefs, setPushPrefs, pushState } from './push.js';

const KEY = 'rmsn_display_v1';

export const ACCENTS = [
  { id: 'roxo', label: 'Roxo', swatch: '#9b5cf6' },
  { id: 'azul', label: 'Azul', swatch: '#2f86f0' },
  { id: 'verde', label: 'Verde', swatch: '#1fb27a' },
  { id: 'laranja', label: 'Laranja', swatch: '#ea7a22' },
  { id: 'rosa', label: 'Rosa', swatch: '#e2408f' },
  { id: 'vermelho', label: 'Vermelho', swatch: '#e04545' }
];

const THEMES = [
  { id: 'dark', label: 'Escuro', cls: 'opt-dark' },
  { id: 'light', label: 'Claro', cls: 'opt-light' },
  { id: 'auto', label: 'Automático', cls: 'opt-auto' }
];

const systemLight = window.matchMedia('(prefers-color-scheme: light)');

export function getDisplayPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) || '{}');
    return {
      theme: THEMES.some(t => t.id === p.theme) ? p.theme : 'dark',
      accent: ACCENTS.some(a => a.id === p.accent) ? p.accent : 'roxo'
    };
  } catch {
    return { theme: 'dark', accent: 'roxo' };
  }
}

function applyDisplay({ theme, accent }) {
  const resolved = theme === 'auto' ? (systemLight.matches ? 'light' : 'dark') : theme;
  document.documentElement.setAttribute('data-theme', resolved);
  document.documentElement.setAttribute('data-accent', accent);
  // Android app: status/gesture bar icons follow the theme. Only when the WebView draws under the bars
  // (Capacitor SystemBars does that from WebView 140 with viewport-fit=cover); below that the bars sit on the dark window background.
  const edgeToEdge = Number(/Chrome\/(\d+)/.exec(navigator.userAgent)?.[1]) >= 140;
  window.Capacitor?.Plugins?.SystemBars?.setStyle?.({ style: resolved === 'light' && edgeToEdge ? 'LIGHT' : 'DARK' })?.catch?.(() => {});
}

function saveDisplay(prefs) {
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* the choice still applies to this visit */ }
  applyDisplay(prefs);
}

let bound = false;
/** Follow the system theme while "Automático" is chosen. Call once at startup. */
export function initDisplay() {
  if (bound) return;
  bound = true;
  applyDisplay(getDisplayPrefs());
  systemLight.addEventListener('change', () => {
    if (getDisplayPrefs().theme === 'auto') applyDisplay(getDisplayPrefs());
  });
}

const check = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

// Only in the Android app: which notices arrive with the app closed (saved on the server, per phone)
function pushGroupHtml() {
  const p = getPushPrefs();
  const row = (name, label, on) => `
    <label><span>${label}</span><input type="checkbox" name="${name}" ${on ? 'checked' : ''}></label>`;
  return `
      <fieldset class="display-group">
        <legend>Avisos no celular</legend>
        <p>${pushState === 'denied'
          ? 'O Android está bloqueando os avisos do app. Libere em Configurações, Apps, rede de música. O sininho continua funcionando.'
          : 'Chegam com o app fechado. O sininho continua mostrando tudo.'}</p>
        <div class="push-options">
          ${row('push-posts', 'Posts de quem você segue', p.posts)}
          ${row('push-messages', 'Mensagens', p.messages)}
        </div>
      </fieldset>`;
}

export function openDisplaySettings() {
  const body = document.getElementById('display-modal-body');
  if (!body) return;
  const prefs = getDisplayPrefs();

  body.innerHTML = `
    <div class="display-settings">
      <div class="display-preview" aria-hidden="true">
        <div class="cat-wrap">${catLogoHtml({ mood: 'happy' })}</div>
        <div>
          <b>rede de música</b> <span>@redemusica</span>
          <p>É assim que os posts vão aparecer. Links e botões usam a cor escolhida, como <a href="#" tabindex="-1">#descoberta</a>.</p>
        </div>
      </div>

      <fieldset class="display-group">
        <legend>Cor</legend>
        <p>Usada em botões, links e destaques.</p>
        <div class="accent-swatches">
          ${ACCENTS.map(a => `
            <label>
              <input type="radio" name="display-accent" value="${a.id}" ${a.id === prefs.accent ? 'checked' : ''}>
              <span class="accent-dot" style="--swatch:${a.swatch}">${check}</span>
              <span>${a.label}</span>
            </label>`).join('')}
        </div>
      </fieldset>

      <fieldset class="display-group">
        <legend>Tema</legend>
        <p>Automático acompanha o modo claro ou escuro do seu aparelho.</p>
        <div class="theme-options">
          ${THEMES.map(t => `
            <label class="${t.cls}">
              <input type="radio" name="display-theme" value="${t.id}" ${t.id === prefs.theme ? 'checked' : ''}>
              <span>${t.label}</span>
            </label>`).join('')}
        </div>
      </fieldset>

      ${isNativeApp() ? pushGroupHtml() : ''}

      <div style="display:flex;justify-content:flex-end;">
        <button type="button" class="doodle-btn doodle-btn-primary" onclick="closeDoodleModal('display-modal')">Pronto</button>
      </div>
    </div>`;

  // onchange (not addEventListener) so reopening the modal doesn't stack handlers
  body.onchange = (e) => {
    if (e.target.name === 'push-posts' || e.target.name === 'push-messages') {
      setPushPrefs({ [e.target.name === 'push-posts' ? 'posts' : 'messages']: e.target.checked });
      return;
    }
    if (e.target.name !== 'display-accent' && e.target.name !== 'display-theme') return;
    saveDisplay({
      accent: body.querySelector('input[name="display-accent"]:checked')?.value || 'roxo',
      theme: body.querySelector('input[name="display-theme"]:checked')?.value || 'dark'
    });
  };

  window.openDoodleModal('display-modal');
}
