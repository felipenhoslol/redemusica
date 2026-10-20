// Star ranking: the screen where you rate an artist's releases (grid + tabs) or an album's tracks.
// Every tap saves (setRankingRating); posting is a separate button.
import { lookupArtist, lookupAlbum } from './api.js';
import { dedupeReleases, groupReleases, rankingKey } from './ranking.js';
import { getRanking, setRankingRating, createPost } from './storage.js';
import { popIcon, rollNumber, flip, animateSpring, reducedMotion } from './motion.js';
import { showToast } from './profile.js'; // ui.js re-exports it; importing ui.js here would close a cycle
import { openRankingView } from './rankingCard.js';
import { getStarSVG } from './icons.js';
import { catLogoHtml } from './logo.js';
import { esc, safeUrl, jsArg } from './dom.js';

const TABS = [['albums', 'Álbuns'], ['eps', 'EPs'], ['singles', 'Singles']];
const EMPTY_HINT = 'Dê nota a pelo menos um item para postar';

let ed = null;        // the open editor: { container, mode, subject, key, items: Map, groups, tab }
let loadToken = 0;    // a newer open wins over a slower lookup still in flight
let lastGridCount = 8;

/** Tapping the value already set clears it. */
export const rateFromStarTap = (current, tapped) => (current === tapped ? 0 : tapped);

export function postRanking(key) {
  const ranking = getRanking(key);
  if (!ranking?.items?.length) { showToast(EMPTY_HINT); return null; }
  const post = createPost({ text: '', ranking });
  showToast('Ranking postado');
  return post;
}

const ratingOf = (id) => getRanking(ed.key)?.items.find(i => i.id === String(id))?.rating || 0;
const ratedCount = () => getRanking(ed.key)?.items.length || 0;
const label = (v) => `Nota ${String(v).replace('.', ',')}`;
const starFill = (rating, n) => (rating >= n ? 1 : rating >= n - 0.5 ? 0.5 : 0);

// Ratings go 1..5 in half steps (C10): the first star has no left half
function starsHtml(id, title, rating) {
  const half = (v, side) => `<button type="button" class="rk-half rk-${side}" aria-label="${label(v)}" aria-pressed="${rating === v}" onclick="window._rankStar(${jsArg(id)}, ${v}, this)"></button>`;
  return `<div class="rk-stars" role="group" aria-label="${esc(`Nota para ${title}`)}" data-stars="${esc(id)}">${[1, 2, 3, 4, 5].map(n => `
    <span class="rk-star" data-n="${n}">${getStarSVG(starFill(rating, n), 22)}${n > 1 ? half(n - 0.5, 'left') : ''}${half(n, n > 1 ? 'right' : 'whole')}</span>`).join('')}</div>`;
}

const cover = (art) => {
  const src = safeUrl(art);
  return `<div class="ranking-cover">${src ? `<img src="${src}" alt="" loading="lazy" decoding="async" onerror="this.remove()">` : ''}</div>`;
};

function headerHtml() {
  const n = ratedCount();
  const s = ed.subject;
  const tabs = ed.mode === 'artist' ? `<div class="rk-tabs" role="tablist">${TABS.map(([id, name]) => {
    const count = ed.groups[id].length;
    return `<button type="button" role="tab" class="rk-tab" data-tab="${id}" aria-selected="${ed.tab === id}" ${count ? '' : 'disabled'} onclick="window._rankTab('${id}', this)">${name} <span class="rk-tab-count">${count}</span></button>`;
  }).join('')}</div>` : '';
  return `
    <div class="rk-header">
      ${ed.mode === 'album' ? `<div class="rk-album-cover">${cover(s.artwork)}</div>` : ''}
      <div class="rk-head-text">
        <span class="ranking-kicker">${ed.mode === 'album' ? 'Notas para as faixas' : 'Notas para os lançamentos'}</span>
        <span class="rk-subject">${esc(s.title)}</span>
        ${ed.mode === 'album' && s.artist ? `<span class="ranking-meta">${esc(s.artist)}</span>` : ''}
      </div>
      <div class="rk-actions">
        <span class="rk-count"><span class="rk-count-n">${n}</span> com nota</span>
        <button type="button" class="doodle-btn doodle-btn-secondary rk-view" ${n ? '' : 'disabled'} onclick="window._rankView(this)">Ver ranking</button>
        <button type="button" class="doodle-btn doodle-btn-primary rk-post" ${n ? '' : 'disabled'} aria-describedby="rk-hint" onclick="window._rankPost(this)">Postar</button>
      </div>
      <p class="rk-hint" id="rk-hint">${n ? 'Salvo enquanto você dá notas' : EMPTY_HINT}</p>
      ${tabs}
    </div>`;
}

const gridHtml = () => ed.groups[ed.tab].map(r => `
  <div class="rk-cell" data-flip-key="${esc(r.id)}">
    ${cover(r.artwork)}
    <span class="ranking-title" title="${esc(r.title)}">${esc(r.title)}</span>
    <span class="ranking-meta">${esc(r.year)}</span>
    ${starsHtml(r.id, r.title, ratingOf(r.id))}
  </div>`).join('');

const tracklistHtml = () => `<ol class="rk-tracks">${[...ed.items.values()].map(t => `
  <li class="rk-track">
    <span class="ranking-place">${t.order}</span>
    <span class="ranking-title">${esc(t.title)}</span>
    ${starsHtml(t.id, t.title, ratingOf(t.id))}
  </li>`).join('')}</ol>`;

function renderEditor() {
  ed.container.innerHTML = `<div class="rk-editor" data-mode="${ed.mode}">${headerHtml()}
    ${ed.mode === 'artist' ? `<div class="rk-grid">${gridHtml()}</div>` : tracklistHtml()}</div>`;
  if (ed.mode === 'artist') lastGridCount = ed.groups[ed.tab].length || 8;
}

const loadingHtml = () => `<div class="rk-editor" aria-busy="true"><p class="rk-loading-text">Carregando o catálogo…</p>
  <div class="rk-grid">${'<div class="rk-cell"><div class="ranking-cover"></div></div>'.repeat(lastGridCount)}</div></div>`;

const emptyHtml = (text) => `<div class="rk-state">${catLogoHtml({ mood: 'idle' })}<p>${text}</p></div>`;

/** Opens the rating screen in `container` and resolves once it is rendered (or showing an error/empty state). */
export async function openRankingEditor(container, { mode, subject }) {
  const token = ++loadToken;
  ed = null;
  container.innerHTML = loadingHtml();
  try {
    const items = new Map();
    let fullSubject, groups = null;
    if (mode === 'album') {
      const { album, tracks } = await lookupAlbum(subject.id);
      if (token !== loadToken) return;
      fullSubject = { ...subject, ...(album ? { title: album.title, artist: album.artist, artwork: album.artwork, year: album.year } : {}) };
      tracks.forEach((t, i) => items.set(t.id, { id: t.id, title: t.title, kind: 'track', artwork: fullSubject.artwork, order: i + 1 }));
    } else {
      const { albums = [], singles = [] } = await lookupArtist(subject.id);
      if (token !== loadToken) return;
      groups = groupReleases(dedupeReleases([...albums, ...singles]));
      [...groups.albums, ...groups.eps, ...groups.singles].forEach(r =>
        items.set(r.id, { id: r.id, title: r.title, kind: r.kind, year: r.year, released: r.released, artwork: r.artwork }));
      fullSubject = { ...subject, title: subject.title || subject.name, artwork: subject.artwork || [...items.values()][0]?.artwork || '' };
    }
    if (!items.size) {
      container.innerHTML = emptyHtml(mode === 'album' ? 'Esse álbum não tem faixas no iTunes' : 'Esse artista ainda não tem lançamentos no iTunes');
      return;
    }
    ed = { container, mode, subject: fullSubject, key: rankingKey(mode, subject.id), items, groups,
      tab: groups ? TABS.map(([id]) => id).find(id => groups[id].length) : null };
    renderEditor();
  } catch {
    if (token !== loadToken) return;
    container.innerHTML = `<div class="rk-state"><p>Não foi possível carregar o catálogo.</p>
      <button type="button" class="doodle-btn doodle-btn-primary" onclick="window._rankRetry()">Tentar de novo</button></div>`;
    window._rankRetry = () => openRankingEditor(container, { mode, subject });
  }
}

const press = (el) => { if (!reducedMotion()) animateSpring(el, [{ transform: 'scale(0.94)' }, { transform: 'scale(1)' }], 'pop'); };

window._rankStar = (id, value, btn) => {
  const item = ed?.items.get(String(id));
  if (!item) return;
  const before = ratedCount();
  const rating = rateFromStarTap(ratingOf(id), value);
  setRankingRating(ed.mode, ed.subject, item, rating);
  // Update the stars in place so the focused button survives (keyboard users keep their spot)
  const row = ed.container.querySelector(`[data-stars="${CSS.escape(String(id))}"]`);
  row?.querySelectorAll('.rk-star').forEach(star => {
    star.querySelector('svg')?.remove();
    star.insertAdjacentHTML('afterbegin', getStarSVG(starFill(rating, Number(star.dataset.n)), 22));
    star.querySelectorAll('.rk-half').forEach(b => b.setAttribute('aria-pressed', String(b.getAttribute('aria-label') === label(rating))));
  });
  popIcon(btn?.closest('.rk-star'));
  const n = ratedCount();
  if (n === before) return;
  rollNumber(ed.container.querySelector('.rk-count-n'), n, n > before ? 1 : -1);
  ed.container.querySelectorAll('.rk-view, .rk-post').forEach(b => { b.disabled = !n; });
  const hint = ed.container.querySelector('.rk-hint');
  if (hint) hint.textContent = n ? 'Salvo enquanto você dá notas' : EMPTY_HINT;
};

window._rankTab = (tab, btn) => {
  if (!ed?.groups?.[tab]?.length || ed.tab === tab) return;
  ed.tab = tab;
  ed.container.querySelectorAll('.rk-tab').forEach(t => t.setAttribute('aria-selected', String(t.dataset.tab === tab)));
  press(btn);
  const grid = ed.container.querySelector('.rk-grid');
  flip(grid, '.rk-cell', () => { grid.innerHTML = gridHtml(); });
  lastGridCount = ed.groups[tab].length;
};

window._rankView = (btn) => {
  const ranking = ed && getRanking(ed.key);
  if (!ranking) return;
  press(btn);
  openRankingView(ranking);
};

window._rankPost = (btn) => {
  if (!ed) return;
  press(btn);
  postRanking(ed.key);
};
