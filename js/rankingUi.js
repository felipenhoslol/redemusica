// Star ranking: the screen where you rate an artist's releases (grid + tabs) or an album's tracks.
// Every tap saves (setRankingRating); posting is a separate button.
import { lookupArtist, lookupAlbum, searchArtists, searchAlbums, searchAlbumsBySongs } from './api.js';
import { albumSearchResults, matchingArtist, dedupeReleases, groupReleases, rankingKey, rankItems, RANKING_CHALLENGE_ID } from './ranking.js';
import { getRanking, setRankingRating, deleteRanking, createPost, getUserRankings, getFriendsRankings, getUserById } from './storage.js';
import { popIcon, rollNumber, flip, animateSpring, reducedMotion } from './motion.js';
import { getArtistImage } from './lastfm.js';
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

// key → updatedAt when posted: a new rating changes updatedAt, which unlocks posting again
const postedAt = new Map();
/** Already posted as it is now (this session): Postar shows "Postado", disabled. */
export const isPosted = (key) => !!key && postedAt.has(key) && postedAt.get(key) === getRanking(key)?.updatedAt;

export function postRanking(key) {
  const ranking = getRanking(key);
  if (!ranking?.items?.length) { showToast(EMPTY_HINT); return null; }
  if (isPosted(key)) return null;
  const post = createPost({ text: '', ranking });
  postedAt.set(key, ranking.updatedAt);
  showToast('Ranking postado');
  return post;
}

const showPosted = (btn) => { if (btn) { btn.disabled = true; btn.textContent = 'Postado'; } };

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

// Álbuns / EPs / Singles: the editor's grid and the discography picker in album search share it
const tabsHtml = (groups, active, handler) => `<div class="feed-filter-bar rk-tabs" role="tablist" aria-label="Tipo de lançamento">${TABS.map(([id, name]) => {
  const count = groups[id].length;
  return `<button type="button" role="tab" class="feed-filter-btn${active === id ? ' active' : ''}" data-tab="${id}" aria-selected="${active === id}" ${count ? '' : 'disabled'} onclick="window.${handler}('${id}', this)">${name} <span class="rk-tab-count">${count}</span></button>`;
}).join('')}</div>`;

const firstTab = (groups) => TABS.map(([id]) => id).find(id => groups[id].length);

function headerHtml() {
  const n = ratedCount();
  const s = ed.subject;
  const tabs = ed.mode === 'artist' ? tabsHtml(ed.groups, ed.tab, '_rankTab') : '';
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
        <button type="button" class="doodle-btn doodle-btn-secondary rk-view" ${n ? '' : 'disabled'} onclick="window._rankView(this)">Concluir</button>
        <button type="button" class="doodle-btn doodle-btn-primary rk-post" ${n && !isPosted(ed.key) ? '' : 'disabled'} aria-describedby="rk-hint" onclick="window._rankPost(this)">${isPosted(ed.key) ? 'Postado' : 'Postar'}</button>
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
      tab: groups ? firstTab(groups) : null };
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
  const post = ed.container.querySelector('.rk-post');
  if (post) { post.disabled = !n; post.textContent = 'Postar'; } // edited: posting is open again
  if (n === before) return;
  rollNumber(ed.container.querySelector('.rk-count-n'), n, n > before ? 1 : -1);
  ed.container.querySelectorAll('.rk-view').forEach(b => { b.disabled = !n; });
  const hint = ed.container.querySelector('.rk-hint');
  if (hint) hint.textContent = n ? 'Salvo enquanto você dá notas' : EMPTY_HINT;
};

function switchTab(root, tab, btn, html) {
  root.querySelectorAll('.rk-tabs [role="tab"]').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tab);
    t.setAttribute('aria-selected', String(t.dataset.tab === tab));
  });
  press(btn);
  const grid = root.querySelector('.rk-grid');
  flip(grid, '.rk-cell', () => { grid.innerHTML = html(); });
}

window._rankTab = (tab, btn) => {
  if (!ed?.groups?.[tab]?.length || ed.tab === tab) return;
  ed.tab = tab;
  switchTab(ed.container, tab, btn, gridHtml);
  lastGridCount = ed.groups[tab].length;
};

window._rankView = (btn) => {
  const ranking = ed && getRanking(ed.key);
  if (!ranking) return;
  press(btn);
  openRankingView(ranking, { own: true, posted: isPosted(ed.key) }); // ratings are already saved: Concluir only changes screen
};

window._rankPost = (btn) => {
  if (!ed) return;
  press(btn);
  if (postRanking(ed.key)) showPosted(btn);
};

// ──────────────────────────────────────────
// CHALLENGE AREA: start a ranking, my saved rankings, the ones from people I follow
// ──────────────────────────────────────────

let area = null;      // { container, pick: 'artist'|'album'|null, results: [], shown, artist, disco, friends: [] }
let searchTimer = 0;
let searchToken = 0;  // also guards the discography: a slow search can't land on it, nor it on a newer search
const ALBUM_PAGE = 20;

const MODE_LABEL = { artist: 'Artista', album: 'Álbum' };

function metaLine(r) {
  const top = rankItems(r.items || [], r.mode)[0]?.title;
  return `${MODE_LABEL[r.mode]}${top ? ` · 1º ${esc(top)}` : ''}`;
}

const myRowHtml = (r) => `
  <li class="rk-entry" data-flip-key="${esc(r.key)}">
    ${cover(r.subject?.artwork)}
    <div class="rk-entry-text">
      <span class="ranking-title">${esc(r.subject?.title)}</span>
      <span class="ranking-meta">${metaLine(r)}</span>
      <span class="ranking-meta">${r.items?.length || 0} com nota</span>
    </div>
    <div class="rk-entry-actions">
      <button type="button" class="doodle-btn doodle-btn-secondary" onclick="window._rankEdit(${jsArg(r.key)}, this)">Editar</button>
      <button type="button" class="doodle-btn doodle-btn-primary" ${isPosted(r.key) ? 'disabled' : ''} onclick="window._rankPostSaved(${jsArg(r.key)}, this)">${isPosted(r.key) ? 'Postado' : 'Postar'}</button>
      <button type="button" class="doodle-btn doodle-btn-ghost rk-delete" aria-label="${esc(`Apagar o ranking de ${r.subject?.title || ''}`)}" title="Apagar" onclick="window._rankDelete(${jsArg(r.key)}, this)"><span class="ui-icon" aria-hidden="true">${ICONS.trash}</span></button>
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

const MINE_EMPTY = 'Você ainda não fez nenhum ranking';
const listOrEmpty = (rows, empty) => rows.length ? `<ul class="rk-entries">${rows.join('')}</ul>` : emptyHtml(empty);

/** The ranking challenge: "Novo ranking", "Meus rankings" and "Amigos" (saved rankings, never posts). */
export function renderRankingChallenge(container) {
  ++loadToken; // an editor still loading must not land on top of this screen
  ed = null;
  const friends = getFriendsRankings();
  area = { container, pick: null, results: [], shown: 0, artist: null, disco: null, friends };
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
          <div class="rk-editor rk-disco" hidden></div>
        </div>
      </section>
      <section class="rk-section" aria-labelledby="rk-mine" data-flip-key="mine">
        <h2 class="rk-section-title" id="rk-mine">Meus rankings</h2>
        ${listOrEmpty(getUserRankings().map(myRowHtml), MINE_EMPTY)}
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
  showDisco(false);
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
  <li data-flip-key="r${i}"><button type="button" class="search-row rk-result" onclick="window._rankChoose(${i})">
    ${area.pick === 'album' ? cover(r.artwork) : `<span class="rk-result-icon rk-result-photo" data-rk-photo="${esc(r.name)}">${ICONS.music}</span>`}
    <span class="search-row-text">
      <span class="search-row-title">${esc(r.title || r.name)}</span>
      <span class="search-row-sub">${esc(area.pick === 'album' ? [r.artist, r.year].filter(Boolean).join(' · ') : r.genre)}</span>
    </span>
  </button></li>`;

const moreHtml = () => area.shown < area.results.length
  ? '<li class="rk-more-row"><button type="button" class="ranking-more rk-more" onclick="window._rankMore(this)">Ver mais</button></li>' : '';

const artistRowHtml = (a) => `
  <li data-flip-key="artist"><button type="button" class="search-row rk-result" onclick="window._rankDisco(this)">
    <span class="rk-result-icon rk-result-photo" data-rk-photo="${esc(a.name)}">${ICONS.music}</span>
    <span class="search-row-text">
      <span class="search-row-title">${esc(a.name)}</span>
      <span class="search-row-sub rk-disco-cta">Ver discografia</span>
    </span>
    <span class="rk-result-chevron" aria-hidden="true">${ICONS.chevronRight}</span>
  </button></li>`;

function resultsHtml() {
  if (!area.results.length && !area.artist) return '<li class="rk-no-results">Nada encontrado</li>';
  return (area.artist ? artistRowHtml(area.artist) : '') + area.results.slice(0, area.shown).map(resultHtml).join('') + moreHtml();
}

window._rankSearch = (query) => {
  clearTimeout(searchTimer);
  const list = area?.container.querySelector('.rk-results');
  if (!list) return;
  const q = String(query || '').trim();
  const token = ++searchToken;
  if (!q) { glide(() => { list.innerHTML = ''; }); return; }
  searchTimer = setTimeout(async () => {
    const mode = area.pick;
    let results = [], artist = null;
    // 80 albums: deluxe/explicit editions and singles used to fill the first page and push real albums out.
    // Song search in parallel: iTunes' album search never returns some albums (The Dark Side of the Moon); songs first, they come by popularity.
    // Artists too: typing a band's name offers its whole discography above the albums.
    try {
      if (mode === 'album') {
        const [songs, albums, artists] = await Promise.all([searchAlbumsBySongs(q).catch(() => []), searchAlbums(q, 80).catch(() => []), searchArtists(q, 5).catch(() => [])]);
        results = albumSearchResults([...songs, ...albums], q);
        artist = matchingArtist(artists, q);
      } else results = await searchArtists(q, 12);
    } catch { /* shown as nothing found */ }
    if (token !== searchToken || mode !== area?.pick) return;
    Object.assign(area, { results, artist, shown: mode === 'album' ? ALBUM_PAGE : results.length });
    glide(() => { list.innerHTML = resultsHtml(); });
    hydrateResultPhotos(list);
  }, 300);
};

// The next 20 of the already ranked list; the rows above stay put, the new ones spring in
window._rankMore = (btn) => {
  const list = area?.container.querySelector('.rk-results');
  if (!list || area.shown >= area.results.length) return;
  press(btn);
  const from = area.shown;
  area.shown = Math.min(from + ALBUM_PAGE, area.results.length);
  flip(area.container.querySelector('.rk-area'), '.rk-section[data-flip-key], .rk-results > li[data-flip-key]', () => {
    list.querySelector('.rk-more-row')?.remove();
    list.insertAdjacentHTML('beforeend', area.results.slice(from, area.shown).map((r, i) => resultHtml(r, from + i)).join('') + moreHtml());
  });
  list.querySelector(`[data-flip-key="r${from}"] button`)?.focus({ preventScroll: true }); // the tapped button is gone: keyboard users land on the first new album
};

// iTunes has no artist photos: Deezer's come in one by one (cached) into the fixed round slot, the icon stays when there is none
function hydrateResultPhotos(list) {
  list.querySelectorAll('[data-rk-photo]').forEach(async el => {
    const url = safeUrl(await getArtistImage(el.dataset.rkPhoto).catch(() => ''));
    if (!url || !el.isConnected) return;
    const img = new Image();
    img.alt = '';
    img.decoding = 'async';
    img.onload = () => { el.replaceChildren(img); if (!reducedMotion()) animateSpring(img, [{ opacity: 0 }, { opacity: 1 }], 'smooth'); };
    img.src = url;
  });
}

// ── Discography picker (album search → artist row): covers by Álbuns/EPs/Singles, no stars; a tap opens that album's editor

function showDisco(on) {
  const box = area?.container.querySelector('.rk-pick');
  if (!box) return;
  if (!on) { area.disco = null; ++searchToken; }
  glide(() => {
    box.querySelector('.search-bar').hidden = on;
    box.querySelector('.rk-results').hidden = on;
    box.querySelector('.rk-disco').hidden = !on;
  });
}

const discoCellHtml = (r, i) => `
  <button type="button" class="rk-cell rk-cell-pick" data-flip-key="${esc(r.id)}" onclick="window._rankDiscoPick(${i}, this)">
    ${cover(r.artwork)}
    <span class="rk-cell-line"><span class="ranking-title" title="${esc(r.title)}">${esc(r.title)}</span>${r.year ? `<span class="ranking-meta">· ${esc(r.year)}</span>` : ''}</span>
  </button>`;

const discoGridHtml = () => area.disco.groups[area.disco.tab].map(discoCellHtml).join('');

function renderDisco(body, busy = false) {
  const el = area.container.querySelector('.rk-disco');
  el.setAttribute('aria-busy', String(busy));
  el.innerHTML = `<button type="button" class="doodle-btn doodle-btn-secondary rk-back" onclick="window._rankDiscoBack(this)">Voltar</button>
    <div class="rk-head-text"><span class="ranking-kicker">Discografia</span><span class="rk-subject">${esc(area.disco.artist.name)}</span></div>${body}`;
  return el;
}

window._rankDisco = async (btn) => {
  const artist = area?.disco?.artist || area?.artist; // "Tentar de novo" retries the one on screen
  if (!artist) return;
  press(btn);
  clearTimeout(searchTimer);
  const token = ++searchToken;
  area.disco = { artist, groups: null, tab: null };
  renderDisco(`<p class="rk-loading-text">Carregando a discografia…</p><div class="rk-grid">${'<div class="rk-cell"><div class="ranking-cover"></div></div>'.repeat(8)}</div>`, true);
  showDisco(true);
  try {
    const { albums = [], singles = [] } = await lookupArtist(artist.id);
    if (token !== searchToken) return;
    const groups = groupReleases(dedupeReleases([...albums, ...singles]));
    area.disco = { artist, groups, tab: firstTab(groups) };
    if (!area.disco.tab) { renderDisco(emptyHtml('Esse artista ainda não tem lançamentos no iTunes')); return; }
    const el = renderDisco(`${tabsHtml(groups, area.disco.tab, '_rankDiscoTab')}<div class="rk-grid">${discoGridHtml()}</div>`);
    mountTabIndicator(el.querySelector('.rk-tabs'), { key: 'ranking-disco' });
  } catch {
    if (token !== searchToken) return;
    renderDisco(`<div class="rk-state"><p>Não foi possível carregar a discografia.</p>
      <button type="button" class="doodle-btn doodle-btn-primary" onclick="window._rankDisco(this)">Tentar de novo</button></div>`);
  }
};

window._rankDiscoTab = (tab, btn) => {
  const d = area?.disco;
  if (!d?.groups?.[tab]?.length || d.tab === tab) return;
  d.tab = tab;
  switchTab(area.container.querySelector('.rk-disco'), tab, btn, discoGridHtml);
};

window._rankDiscoBack = (btn) => {
  press(btn);
  showDisco(false);
  area?.container.querySelector('.rk-pick-input')?.focus();
};

window._rankDiscoPick = (i, btn) => {
  const d = area?.disco;
  const r = d?.groups?.[d.tab]?.[i];
  if (!r) return;
  press(btn);
  openInArea('album', { id: r.id, title: r.title, artist: r.artist || d.artist.name, artwork: r.artwork });
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

// Meus rankings and the summary; the editor underneath the summary follows along
window._rankPostSaved = (key, btn) => {
  press(btn);
  if (!postRanking(key)) return;
  showPosted(btn);
  if (ed?.key === key) showPosted(ed.container.querySelector('.rk-post'));
};

window._rankDelete = (key, btn) => {
  const r = getRanking(key);
  if (!r || !area) return;
  if (!confirm(`Apagar o ranking de ${r.subject?.title || 'este ranking'}? Os posts que você já publicou continuam no feed.`)) return;
  deleteRanking(key);
  showToast('Ranking apagado.');
  const row = btn?.closest('li');
  if (!row) return;
  row.querySelectorAll('button').forEach(b => { b.disabled = true; });
  // The row fades out, then the rows below and "Amigos" glide up into its place
  const close = () => flip(area?.container.querySelector('.rk-area'), '.rk-section[data-flip-key], .rk-entries > li[data-flip-key]', () => {
    const list = row.parentElement;
    row.remove();
    if (list && !list.children.length) list.outerHTML = emptyHtml(MINE_EMPTY);
  });
  const out = reducedMotion() ? null : animateSpring(row, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.98)' }], 'snappy', { fill: 'forwards' });
  out ? out.finished.then(close, close) : close();
};

window._rankFriend = (i, btn) => {
  const f = area?.friends[i];
  if (!f) return;
  press(btn);
  openRankingView(f.ranking);
};
