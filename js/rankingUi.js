// Star ranking: the screen where you rate an artist's releases (grid + tabs) or an album's tracks.
// Every tap saves (setRankingRating); posting is a separate button.
import { lookupArtist, lookupAlbum, searchArtists, searchAlbums } from './api.js';
import { dedupeReleases, groupReleases, rankingKey, rankItems, RANKING_CHALLENGE_ID } from './ranking.js';
import { getRanking, setRankingRating, createPost, getUserRankings, getFriendsRankings, getUserById } from './storage.js';
import { popIcon, rollNumber, flip, animateSpring, reducedMotion } from './motion.js';
import { showToast } from './profile.js'; // ui.js re-exports it; importing ui.js here would close a cycle
import { openRankingView } from './rankingCard.js';
import { ICONS, getStarSVG } from './icons.js';
import { mountTabIndicator } from './tabs.js';
import { catLogoHtml } from './logo.js';
import { esc, safeUrl, jsArg, avatarInner } from './dom.js';

export { RANKING_CHALLENGE_ID };

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
  const tabs = ed.mode === 'artist' ? `<div class="feed-filter-bar rk-tabs" role="tablist" aria-label="Tipo de lançamento">${TABS.map(([id, name]) => {
    const count = ed.groups[id].length;
    return `<button type="button" role="tab" class="feed-filter-btn${ed.tab === id ? ' active' : ''}" data-tab="${id}" aria-selected="${ed.tab === id}" ${count ? '' : 'disabled'} onclick="window._rankTab('${id}', this)">${name} <span class="rk-tab-count">${count}</span></button>`;
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
    <p class="rk-cell-line"><span class="ranking-title" title="${esc(r.title)}">${esc(r.title)}</span>${r.year ? `<span class="ranking-meta">· ${esc(r.year)}</span>` : ''}</p>
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
  if (ed.mode === 'artist') {
    lastGridCount = ed.groups[ed.tab].length || 8;
    mountTabIndicator(ed.container.querySelector('.rk-tabs'), { key: 'ranking' });
  }
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
  ed.container.querySelectorAll('.rk-tabs [role="tab"]').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tab);
    t.setAttribute('aria-selected', String(t.dataset.tab === tab));
  });
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

// ──────────────────────────────────────────
// CHALLENGE AREA: start a ranking, my saved rankings, the ones from people I follow
// ──────────────────────────────────────────

let area = null;      // { container, pick: 'artist'|'album'|null, results: [], friends: [] }
let searchTimer = 0;
let searchToken = 0;

const MODE_LABEL = { artist: 'Artista', album: 'Álbum' };

function metaLine(r) {
  const top = rankItems(r.items || [], r.mode)[0]?.title;
  return `${MODE_LABEL[r.mode]}${top ? ` · 1º ${esc(top)}` : ''}`;
}

const myRowHtml = (r) => `
  <li class="rk-entry">
    ${cover(r.subject?.artwork)}
    <div class="rk-entry-text">
      <span class="ranking-title">${esc(r.subject?.title)}</span>
      <span class="ranking-meta">${metaLine(r)}</span>
      <span class="ranking-meta">${r.items?.length || 0} com nota</span>
    </div>
    <div class="rk-entry-actions">
      <button type="button" class="doodle-btn doodle-btn-secondary" onclick="window._rankEdit(${jsArg(r.key)}, this)">Editar</button>
      <button type="button" class="doodle-btn doodle-btn-primary" onclick="window._rankPostSaved(${jsArg(r.key)}, this)">Postar</button>
    </div>
  </li>`;

function friendRowHtml({ userId, ranking: r }, i) {
  const u = getUserById(userId) || { name: '' };
  return `
  <li><button type="button" class="rk-entry rk-friend" onclick="window._rankFriend(${i}, this)">
    ${cover(r.subject?.artwork)}
    <div class="rk-entry-text">
      <span class="rk-friend-who"><span class="rk-friend-avatar">${avatarInner(u.avatar, u.name)}</span>${esc(u.name)}</span>
      <span class="ranking-title">${esc(r.subject?.title)}</span>
      <span class="ranking-meta">${metaLine(r)}</span>
    </div>
  </button></li>`;
}

const listOrEmpty = (rows, empty) => rows.length ? `<ul class="rk-entries">${rows.join('')}</ul>` : emptyHtml(empty);

/** The ranking challenge: "Novo ranking", "Meus rankings" and "Amigos" (saved rankings, never posts). */
export function renderRankingChallenge(container) {
  ++loadToken; // an editor still loading must not land on top of this screen
  ed = null;
  const friends = getFriendsRankings();
  area = { container, pick: null, results: [], friends };
  container.innerHTML = `
    <div class="rk-area">
      <section class="rk-section" aria-labelledby="rk-new">
        <h2 class="rk-section-title" id="rk-new">Novo ranking</h2>
        <div class="rk-choice">
          ${Object.entries(MODE_LABEL).map(([mode, name]) => `<button type="button" class="doodle-btn doodle-btn-secondary" data-pick="${mode}" aria-pressed="false" onclick="window._rankPick('${mode}', this)">${name}</button>`).join('')}
        </div>
        <div class="rk-pick" hidden>
          <label class="search-bar">${ICONS.search}<input type="search" class="rk-pick-input" autocomplete="off" oninput="window._rankSearch(this.value)"></label>
          <ul class="rk-results" aria-live="polite"></ul>
        </div>
      </section>
      <section class="rk-section" aria-labelledby="rk-mine" data-flip-key="mine">
        <h2 class="rk-section-title" id="rk-mine">Meus rankings</h2>
        ${listOrEmpty(getUserRankings().map(myRowHtml), 'Você ainda não fez nenhum ranking')}
      </section>
      <section class="rk-section" aria-labelledby="rk-friends" data-flip-key="friends">
        <h2 class="rk-section-title" id="rk-friends">Amigos</h2>
        ${listOrEmpty(friends.map(friendRowHtml), 'Ninguém que você segue fez um ranking ainda')}
      </section>
    </div>`;
  if (!reducedMotion()) container.querySelectorAll('.rk-entry').forEach((el, i) =>
    animateSpring(el, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], 'smooth', { delay: Math.min(i, 8) * 40, fill: 'backwards' }));
}

/** Editor inside the challenge area, with a way back to the lists (which then show the new ratings). */
function openInArea(mode, subject) {
  const { container } = area;
  container.innerHTML = `<button type="button" class="doodle-btn doodle-btn-secondary rk-back" onclick="window._rankBack(this)">Voltar</button><div class="rk-editor-host"></div>`;
  window.scrollTo?.({ top: 0 });
  return openRankingEditor(container.querySelector('.rk-editor-host'), { mode, subject });
}

window._rankBack = (btn) => { if (!area) return; press(btn); renderRankingChallenge(area.container); };

// The pick box and its results grow above "Meus rankings"/"Amigos": those glide down instead of jumping
const glide = (mutate) => flip(area?.container.querySelector('.rk-area'), '.rk-section[data-flip-key]', mutate);

window._rankPick = (mode, btn) => {
  if (!area) return;
  press(btn);
  area.pick = mode;
  area.results = [];
  const c = area.container;
  c.querySelectorAll('[data-pick]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.pick === mode)));
  const box = c.querySelector('.rk-pick');
  if (box) glide(() => { box.hidden = false; });
  const input = c.querySelector('.rk-pick-input');
  if (!input) return;
  input.placeholder = mode === 'artist' ? 'Buscar artista' : 'Buscar álbum';
  input.setAttribute('aria-label', input.placeholder);
  input.focus();
  window._rankSearch(input.value);
};

const resultHtml = (r, i) => `
  <li><button type="button" class="search-row rk-result" onclick="window._rankChoose(${i})">
    ${area.pick === 'album' ? cover(r.artwork) : `<span class="rk-result-icon">${ICONS.music}</span>`}
    <span class="search-row-text">
      <span class="search-row-title">${esc(r.title || r.name)}</span>
      <span class="search-row-sub">${esc(area.pick === 'album' ? [r.artist, r.year].filter(Boolean).join(' · ') : r.genre)}</span>
    </span>
  </button></li>`;

window._rankSearch = (query) => {
  clearTimeout(searchTimer);
  const list = area?.container.querySelector('.rk-results');
  if (!list) return;
  const q = String(query || '').trim();
  const token = ++searchToken;
  if (!q) { glide(() => { list.innerHTML = ''; }); return; }
  searchTimer = setTimeout(async () => {
    const mode = area.pick;
    let results = [];
    try { results = await (mode === 'album' ? searchAlbums(q, 12) : searchArtists(q, 12)); } catch { /* shown as nothing found */ }
    if (token !== searchToken || mode !== area?.pick) return;
    area.results = results;
    glide(() => { list.innerHTML = results.length ? results.map(resultHtml).join('') : '<li class="rk-no-results">Nada encontrado</li>'; });
  }, 300);
};

window._rankChoose = (i) => {
  const r = area?.results[i];
  if (!r) return;
  openInArea(area.pick, area.pick === 'album'
    ? { id: r.id, title: r.title, artist: r.artist, artwork: r.artwork }
    : { id: r.id, name: r.name, title: r.name });
};

window._rankEdit = (key, btn) => {
  const r = getRanking(key);
  if (!r || !area) return;
  press(btn);
  openInArea(r.mode, r.subject);
};

window._rankPostSaved = (key, btn) => { press(btn); postRanking(key); };

window._rankFriend = (i, btn) => {
  const f = area?.friends[i];
  if (!f) return;
  press(btn);
  openRankingView(f.ranking);
};
