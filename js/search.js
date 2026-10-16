// Search page: one box for people, posts, songs, artists, albums and playlists, plus artist and album pages.
// People and posts come from Supabase when signed in (cache otherwise); music comes from iTunes, charts from Last.fm.
import { esc, safeUrl, jsArg, avatarInner } from './dom.js';
import * as Storage from './storage.js';
import { ICONS } from './icons.js';
import { searchTracks, searchArtists, searchAlbums, lookupArtist, lookupAlbum } from './api.js';
import { fetchLastFmTrendingTracks, getArtistImage } from './lastfm.js';
import { searchPeople, searchPosts } from './sync.js';
import { renderPostCard } from './feed.js';
import { mountTabIndicator, tabDirection, animatePanel } from './tabs.js';

const TABS = [
  { id: 'tudo', label: 'Tudo' },
  { id: 'pessoas', label: 'Pessoas' },
  { id: 'posts', label: 'Posts' },
  { id: 'musicas', label: 'Músicas' },
  { id: 'artistas', label: 'Artistas' },
  { id: 'albuns', label: 'Álbuns' },
  { id: 'playlists', label: 'Playlists' }
];
const SONG_PAGES = [25, 50, 100, 200];
const RECENTS_KEY = 'rmsn_recent_searches_v1';

// Kept between visits to the tab, so coming back shows the same search
const state = { q: '', tab: 'tudo', songPage: 0, view: null };
let seq = 0;
let root = null;

// ─── helpers ────────────────────────────────────────────────────────────────

function getRecents() {
  try { return JSON.parse(localStorage.getItem(RECENTS_KEY)) || []; } catch { return []; }
}
function saveRecent(q) {
  q = q.trim();
  if (q.length < 2) return;
  const list = [q, ...getRecents().filter(r => r.toLowerCase() !== q.toLowerCase())].slice(0, 8);
  try { localStorage.setItem(RECENTS_KEY, JSON.stringify(list)); } catch { /* optional */ }
}
function removeRecent(q) {
  try { localStorage.setItem(RECENTS_KEY, JSON.stringify(q ? getRecents().filter(r => r !== q) : [])); } catch { /* optional */ }
}

const norm = (s) => (s || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const matches = (q, ...fields) => { const n = norm(q); return fields.some(f => norm(f).includes(n)); };

/** Escape text and wrap the searched term in <mark>, ignoring accents and case. */
function hl(text, q = state.q) {
  const raw = (text || '').toString();
  const n = norm(q.replace(/^[@#]/, '')).trim();
  if (!n) return esc(raw);
  const i = norm(raw).indexOf(n);
  if (i === -1) return esc(raw);
  return esc(raw.slice(0, i)) + '<mark>' + esc(raw.slice(i, i + n.length)) + '</mark>' + esc(raw.slice(i + n.length));
}

const loading = (text = 'Buscando…') => `<div class="search-loading">${esc(text)}</div>`;
const sectionHead = (title, tab) => `
  <div class="search-section-head">
    <h2>${esc(title)}</h2>
    ${tab ? `<button type="button" class="search-see-all" data-tab="${tab}">Ver tudo</button>` : ''}
  </div>`;

// ─── data ───────────────────────────────────────────────────────────────────

async function findPeople(q, limit = 30) {
  const me = Storage.getActiveUser()?.id;
  let ids = null;
  try { ids = await searchPeople(q, limit); } catch { /* fall back to the cache */ }
  const term = q.replace(/^@/, '');
  const all = Storage.getAllUsers();
  const found = ids ? all.filter(u => ids.includes(u.id) || matches(term, u.name, u.handle)) : all.filter(u => matches(term, u.name, u.handle));
  // Other people first; your own profile still shows up when you search for it
  return found.sort((a, b) => (a.id === me) - (b.id === me)).slice(0, limit);
}

async function findPosts(q, limit = 40) {
  let posts = null;
  try { posts = await searchPosts(q, limit); } catch { /* fall back to the cache */ }
  if (q.startsWith('#')) {
    const tag = norm(q);
    const pool = posts || Storage.getFeedPosts();
    return pool.filter(p => norm(p.tag) === tag || norm(p.text).includes(tag)).slice(0, limit);
  }
  if (posts) return posts;
  return Storage.getFeedPosts().filter(p =>
    matches(q, p.text, p.lyrics, p.lyricsSong, p.tag, p.song?.title, p.song?.artist, p.playlist?.title)
  ).slice(0, limit);
}

function findPlaylists(q) {
  const byId = new Map();
  Storage.getAllPlaylists().forEach(p => byId.set(p.id, { ...p, local: true }));
  Storage.getFeedPosts().forEach(post => {
    if (post.playlist?.id && !byId.has(post.playlist.id)) byId.set(post.playlist.id, { ...post.playlist, authorId: post.playlist.authorId || post.authorId, local: false });
  });
  return [...byId.values()].filter(p =>
    matches(q, p.title, p.description, ...(p.songs || []).flatMap(s => [s.title, s.artist]))
  );
}

// ─── row templates ──────────────────────────────────────────────────────────

function personRow(u) {
  const following = Storage.isFollowing(u.id);
  return `
    <div class="search-row" role="button" tabindex="0" data-profile="${esc(u.id)}">
      <div class="post-author-avatar search-avatar">${avatarInner(u.avatar, u.name)}</div>
      <div class="search-row-text">
        <div class="search-row-title">${hl(u.name)}</div>
        <div class="search-row-sub">${hl(u.handle || '')}${u.bio ? ` <span class="search-row-bio">${esc(u.bio)}</span>` : ''}</div>
      </div>
      ${u.id === Storage.getActiveUser()?.id ? '<span class="search-row-sub">Você</span>' : `<button type="button" class="search-follow-btn${following ? ' following' : ''}" data-follow-id="${esc(u.id)}">${following ? 'Seguindo' : 'Seguir'}</button>`}
    </div>`;
}

function songRow(t, { number } = {}) {
  const sub = [t.artist, t.album].filter(Boolean);
  return `
    <div class="search-row search-song" role="button" tabindex="0" data-play='${esc(JSON.stringify(t))}'>
      ${number != null ? `<span class="search-track-no">${number}</span>` : ''}
      ${t.artwork ? `<img class="search-cover" src="${safeUrl(t.artwork)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'search-cover search-cover-empty'}))">` : `<span class="search-cover search-cover-empty"></span>`}
      <div class="search-row-text">
        <div class="search-row-title">${hl(t.title)}</div>
        <div class="search-row-sub">
          ${t.artistId ? `<button type="button" class="search-link" data-artist="${esc(t.artistId)}" data-artist-name="${esc(t.artist)}">${hl(t.artist)}</button>` : hl(sub[0] || '')}
          ${sub[1] ? ` · ${t.albumId ? `<button type="button" class="search-link" data-album="${esc(t.albumId)}">${hl(sub[1])}</button>` : hl(sub[1])}` : ''}
        </div>
      </div>
      ${t.duration && t.duration !== '--:--' ? `<span class="search-duration">${esc(t.duration)}</span>` : ''}
      <button type="button" class="search-icon-btn" data-post-song title="Postar sobre esta música" aria-label="Postar sobre ${esc(t.title)}">${ICONS.edit}</button>
      <button type="button" class="search-icon-btn search-play" title="Tocar prévia" aria-label="Tocar ${esc(t.title)}">${ICONS.play}</button>
    </div>`;
}

function artistCard(a) {
  return `
    <button type="button" class="search-artist" data-artist="${esc(a.id)}" data-artist-name="${esc(a.name)}">
      <span class="search-artist-photo" data-artist-photo="${esc(a.name)}">${esc((a.name || '?')[0])}</span>
      <span class="search-artist-name">${hl(a.name)}</span>
      ${a.genre ? `<span class="search-artist-genre">${esc(a.genre)}</span>` : ''}
    </button>`;
}

function albumCard(al) {
  return `
    <button type="button" class="search-album" data-album="${esc(al.id)}">
      ${al.artwork ? `<img src="${safeUrl(al.artwork)}" alt="" loading="lazy">` : '<span class="search-cover-empty"></span>'}
      <span class="search-album-title">${hl(al.title)}</span>
      <span class="search-album-sub">${hl(al.artist)}${al.year ? ` · ${esc(al.year)}` : ''}</span>
    </button>`;
}

function playlistRow(p) {
  const author = Storage.getUserById(p.authorId);
  const covers = (p.songs || []).map(s => s.artwork).filter(Boolean).slice(0, 4);
  const cover = p.coverUrl
    ? `<img src="${safeUrl(p.coverUrl)}" alt="">`
    : covers.length ? covers.map(c => `<img src="${safeUrl(c)}" alt="">`).join('') : `<span class="search-cover-empty"></span>`;
  return `
    <div class="search-row" role="button" tabindex="0" data-playlist="${esc(p.id)}">
      <span class="search-playlist-cover${covers.length >= 4 && !p.coverUrl ? ' mosaic' : ''}">${cover}</span>
      <div class="search-row-text">
        <div class="search-row-title">${hl(p.title)}</div>
        <div class="search-row-sub">${(p.songs || []).length} músicas${author ? ` · ${esc(author.name)}` : ''}</div>
      </div>
    </div>`;
}

const postsList = (posts) => `<div class="feed-posts-list search-posts">${posts.map(p => renderPostCard(p)).join('')}</div>`;

function emptyResults(what) {
  return `
    <div class="search-empty">
      <div class="search-empty-title">Nada encontrado para “${esc(state.q)}”</div>
      <div class="search-empty-sub">${esc(what || 'Confira a grafia ou tente um termo mais curto.')}</div>
    </div>`;
}

// Artist photos come from Deezer/iTunes one by one: fill them in after rendering
function hydrateArtistPhotos(scope) {
  scope.querySelectorAll('[data-artist-photo]:not([data-loaded])').forEach(async el => {
    el.dataset.loaded = '1';
    try {
      const url = await getArtistImage(el.dataset.artistPhoto);
      if (url) el.innerHTML = `<img src="${safeUrl(url)}" alt="" loading="lazy">`;
    } catch { /* keep the initial */ }
  });
}

// ─── renderers ──────────────────────────────────────────────────────────────

function body() { return root?.querySelector('#search-body'); }

function paint(html, mySeq) {
  const el = body();
  if (!el || mySeq !== seq) return null;
  el.innerHTML = html;
  hydrateArtistPhotos(el);
  return el;
}

async function renderExplore(mySeq) {
  const recents = getRecents();
  const me = Storage.getActiveUser()?.id;
  const suggestions = Storage.getAllUsers().filter(u => u.id !== me && !Storage.isFollowing(u.id)).slice(0, 5);

  paint(`
    ${recents.length ? `
      <section class="search-section">
        <div class="search-section-head"><h2>Buscas recentes</h2><button type="button" class="search-see-all" data-clear-recents>Limpar</button></div>
        <div class="search-chips">${recents.map(r => `
          <span class="search-chip">
            <button type="button" data-query="${esc(r)}">${esc(r)}</button>
            <button type="button" class="search-chip-x" data-remove-recent="${esc(r)}" aria-label="Remover ${esc(r)}">${ICONS.close}</button>
          </span>`).join('')}
        </div>
      </section>` : ''}
    ${suggestions.length ? `
      <section class="search-section">
        ${sectionHead('Pessoas para seguir', 'pessoas')}
        ${suggestions.map(personRow).join('')}
      </section>` : ''}
    <section class="search-section">
      ${sectionHead('Em alta no mundo')}
      <div id="search-trending">${loading('Carregando as mais ouvidas…')}</div>
    </section>`, mySeq);

  const tracks = await fetchLastFmTrendingTracks(10).catch(() => []);
  const el = root?.querySelector('#search-trending');
  if (!el || mySeq !== seq) return;
  el.innerHTML = tracks.length
    ? tracks.map(t => songRow(t, { number: t.rank })).join('')
    : `<div class="search-loading">Não foi possível carregar as paradas agora.</div>`;
}

async function renderAll(q, mySeq) {
  paint(`
    <section class="search-section" data-slot="pessoas">${sectionHead('Pessoas', 'pessoas')}${loading()}</section>
    <section class="search-section" data-slot="musicas">${sectionHead('Músicas', 'musicas')}${loading()}</section>
    <section class="search-section" data-slot="artistas">${sectionHead('Artistas', 'artistas')}${loading()}</section>
    <section class="search-section" data-slot="posts">${sectionHead('Posts', 'posts')}${loading()}</section>
    <section class="search-section" data-slot="albuns">${sectionHead('Álbuns', 'albuns')}${loading()}</section>
    <section class="search-section" data-slot="playlists">${sectionHead('Playlists', 'playlists')}${loading()}</section>`, mySeq);

  const fill = (slot, title, html, count) => {
    const el = root?.querySelector(`[data-slot="${slot}"]`);
    if (!el || mySeq !== seq) return;
    if (!count) { el.remove(); checkEmpty(); return; }
    el.innerHTML = sectionHead(title, slot) + html;
    hydrateArtistPhotos(el);
  };
  const checkEmpty = () => {
    const el = body();
    if (el && mySeq === seq && !el.querySelector('[data-slot]')) el.innerHTML = emptyResults();
  };

  const playlists = findPlaylists(q);
  fill('playlists', 'Playlists', playlists.slice(0, 3).map(playlistRow).join(''), playlists.length);

  await Promise.all([
    findPeople(q, 4).then(r => fill('pessoas', 'Pessoas', r.slice(0, 3).map(personRow).join(''), r.length)),
    searchTracks(q, 6).then(r => fill('musicas', 'Músicas', r.slice(0, 5).map(t => songRow(t)).join(''), r.length)).catch(() => fill('musicas', '', '', 0)),
    searchArtists(q, 8).then(r => fill('artistas', 'Artistas', `<div class="search-artist-row">${r.slice(0, 8).map(artistCard).join('')}</div>`, r.length)).catch(() => fill('artistas', '', '', 0)),
    findPosts(q, 3).then(r => fill('posts', 'Posts', postsList(r.slice(0, 3)), r.length)),
    searchAlbums(q, 6).then(r => fill('albuns', 'Álbuns', `<div class="search-album-grid">${r.slice(0, 6).map(albumCard).join('')}</div>`, r.length)).catch(() => fill('albuns', '', '', 0))
  ]);
}

async function renderTab(q, tab, mySeq) {
  paint(loading(), mySeq);
  try {
    if (tab === 'pessoas') {
      const r = await findPeople(q);
      paint(r.length ? `<section class="search-section">${r.map(personRow).join('')}</section>` : emptyResults('Procure pelo nome ou pelo @ da pessoa.'), mySeq);
    } else if (tab === 'posts') {
      const r = await findPosts(q);
      paint(r.length ? postsList(r) : emptyResults('Procure por palavras do post, uma música, um artista ou uma #tag.'), mySeq);
    } else if (tab === 'musicas') {
      const limit = SONG_PAGES[state.songPage];
      const r = await searchTracks(q, limit);
      const more = r.length >= limit && state.songPage < SONG_PAGES.length - 1;
      paint(r.length ? `
        <section class="search-section">
          <div class="search-count">${r.length} músicas</div>
          ${r.map(t => songRow(t)).join('')}
          ${more ? `<button type="button" class="search-more" data-more-songs>Mostrar mais músicas</button>` : ''}
        </section>` : emptyResults(), mySeq);
    } else if (tab === 'artistas') {
      const r = await searchArtists(q, 30);
      paint(r.length ? `<div class="search-artist-grid">${r.map(artistCard).join('')}</div>` : emptyResults(), mySeq);
    } else if (tab === 'albuns') {
      const r = await searchAlbums(q, 48);
      paint(r.length ? `<div class="search-album-grid">${r.map(albumCard).join('')}</div>` : emptyResults(), mySeq);
    } else if (tab === 'playlists') {
      const r = findPlaylists(q);
      paint(r.length ? `<section class="search-section">${r.map(playlistRow).join('')}</section>` : emptyResults('Procure pelo nome da playlist ou por uma música que esteja nela.'), mySeq);
    }
  } catch {
    paint(`<div class="search-empty"><div class="search-empty-title">A busca falhou</div><div class="search-empty-sub">Verifique sua conexão e tente de novo.</div></div>`, mySeq);
  }
}

async function renderArtistView(view, mySeq) {
  paint(`
    <div class="search-detail-head">
      <span class="search-artist-photo search-detail-photo" data-artist-photo="${esc(view.name)}">${esc((view.name || '?')[0])}</span>
      <div>
        <div class="search-detail-kind">Artista</div>
        <h1 class="search-detail-title">${esc(view.name)}</h1>
      </div>
    </div>
    ${loading('Carregando músicas e álbuns…')}`, mySeq);

  const [{ songs, albums }, posts] = await Promise.all([
    lookupArtist(view.id).catch(() => ({ songs: [], albums: [] })),
    findPosts(view.name, 10).catch(() => [])
  ]);
  if (mySeq !== seq) return;
  const el = body();
  el.querySelector('.search-loading')?.remove();
  const showAll = view.allSongs;
  el.insertAdjacentHTML('beforeend', `
    ${songs.length ? `
      <section class="search-section">
        ${sectionHead('Músicas populares')}
        ${songs.slice(0, showAll ? 25 : 8).map((t, i) => songRow(t, { number: i + 1 })).join('')}
        ${!showAll && songs.length > 8 ? `<button type="button" class="search-more" data-all-artist-songs>Ver todas as ${songs.length}</button>` : ''}
      </section>` : ''}
    ${albums.length ? `
      <section class="search-section">
        ${sectionHead('Álbuns')}
        <div class="search-album-grid">${albums.map(albumCard).join('')}</div>
      </section>` : ''}
    ${posts.length ? `
      <section class="search-section">
        ${sectionHead(`Posts sobre ${view.name}`)}
        ${postsList(posts)}
      </section>` : ''}
    ${!songs.length && !albums.length ? `<div class="search-loading">Não encontramos o catálogo desse artista.</div>` : ''}`);
}

async function renderAlbumView(view, mySeq) {
  paint(loading('Carregando álbum…'), mySeq);
  const { album, tracks } = await lookupAlbum(view.id).catch(() => ({ album: null, tracks: [] }));
  if (!album) {
    paint(`<div class="search-empty"><div class="search-empty-title">Álbum indisponível</div><div class="search-empty-sub">Não foi possível carregar este álbum agora.</div></div>`, mySeq);
    return;
  }
  const first = tracks.find(t => t.previewUrl);
  paint(`
    <div class="search-detail-head search-album-head">
      ${album.artwork ? `<img class="search-detail-cover" src="${safeUrl(album.artwork)}" alt="">` : ''}
      <div>
        <div class="search-detail-kind">Álbum${album.year ? ` · ${esc(album.year)}` : ''}</div>
        <h1 class="search-detail-title">${esc(album.title)}</h1>
        <div class="search-detail-sub">
          ${tracks[0]?.artistId ? `<button type="button" class="search-link" data-artist="${esc(tracks[0].artistId)}" data-artist-name="${esc(album.artist)}">${esc(album.artist)}</button>` : esc(album.artist)}
          · ${tracks.length} músicas${album.genre ? ` · ${esc(album.genre)}` : ''}
        </div>
        ${first ? `<button type="button" class="doodle-btn doodle-btn-primary search-detail-play" data-play='${esc(JSON.stringify(first))}'>${ICONS.play} Tocar</button>` : ''}
      </div>
    </div>
    <section class="search-section">${tracks.map(t => songRow(t, { number: t.trackNumber })).join('')}</section>`, mySeq);
}

function renderPlaylistView(view, mySeq) {
  const p = findPlaylists('').find(x => x.id === view.id);
  if (!p) { paint(emptyResults(), mySeq); return; }
  const author = Storage.getUserById(p.authorId);
  paint(`
    <div class="search-detail-head">
      <div>
        <div class="search-detail-kind">Playlist${author ? ` de ${esc(author.name)}` : ''}</div>
        <h1 class="search-detail-title">${esc(p.title)}</h1>
        ${p.description ? `<div class="search-detail-sub">${esc(p.description)}</div>` : ''}
      </div>
    </div>
    <section class="search-section">${(p.songs || []).map((t, i) => songRow(t, { number: i + 1 })).join('')}</section>`, mySeq);
}

function run({ animate = 0 } = {}) {
  const mySeq = ++seq;
  syncChrome();
  const el = body();
  if (animate && el) animatePanel(el, animate);
  const q = state.q.trim();
  if (state.view?.type === 'artist') return renderArtistView(state.view, mySeq);
  if (state.view?.type === 'album') return renderAlbumView(state.view, mySeq);
  if (state.view?.type === 'playlist') return renderPlaylistView(state.view, mySeq);
  if (q.length < 2) return renderExplore(mySeq);
  return state.tab === 'tudo' ? renderAll(q, mySeq) : renderTab(q, state.tab, mySeq);
}

// Tabs only make sense with a query and outside detail pages
function syncChrome() {
  if (!root) return;
  const hasQuery = state.q.trim().length >= 2;
  root.querySelector('.search-tabs').hidden = !hasQuery || Boolean(state.view);
  root.querySelector('.search-back').hidden = !state.view;
  root.querySelector('.search-clear').hidden = !state.q;
  root.querySelectorAll('.search-tabs button').forEach(b => {
    const on = b.dataset.tab === state.tab;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', String(on));
  });
}

function setTab(tab) {
  if (tab === state.tab && !state.view) return;
  const ids = TABS.map(t => t.id);
  const direction = tabDirection(ids.indexOf(state.tab), ids.indexOf(tab));
  state.tab = tab;
  state.songPage = 0;
  state.view = null;
  run({ animate: direction });
  root?.querySelector('.search-page')?.scrollIntoView({ block: 'start' });
}

function openView(view) {
  if (state.q.trim()) saveRecent(state.q);
  state.view = { ...view, back: state.view };
  run({ animate: 1 });
  root?.querySelector('.search-page')?.scrollIntoView({ block: 'start' });
}

// ─── public ─────────────────────────────────────────────────────────────────

/** Open the search tab already filled (e.g. from a profile's artist list). */
export function openSearch(q, tab = 'tudo') {
  state.q = q || '';
  state.tab = tab;
  state.view = null;
  state.songPage = 0;
  window.switchTab?.('search');
}

export function openArtist(id, name) {
  state.view = { type: 'artist', id, name };
  window.switchTab?.('search');
}

export function renderSearchPage(container) {
  root = container;
  container.innerHTML = `
    <div class="search-page">
      <div class="search-top">
        <div class="search-bar-row">
          <button type="button" class="search-back" aria-label="Voltar" hidden>${ICONS.chevronLeft}</button>
          <label class="search-bar">
            ${ICONS.search}
            <input id="global-search-input" type="search" autocomplete="off" enterkeyhint="search"
              placeholder="Buscar pessoas, posts, músicas, artistas…" aria-label="Buscar" value="${esc(state.q)}">
            <button type="button" class="search-clear" aria-label="Limpar busca" hidden>${ICONS.close}</button>
          </label>
        </div>
        <div class="search-tabs" role="tablist" hidden>
          ${TABS.map(t => `<button type="button" role="tab" data-tab="${t.id}">${t.label}</button>`).join('')}
        </div>
      </div>
      <div id="search-body"></div>
    </div>`;

  mountTabIndicator(container.querySelector('.search-tabs'), { key: 'search' });
  // Listeners go on the page itself: the tab container survives re-renders, so binding there
  // stacked one more handler per visit (a single "Seguir" click fired several follows and toasts)
  const page = container.querySelector('.search-page');
  const input = container.querySelector('#global-search-input');
  let timer = null;

  input.addEventListener('input', () => {
    clearTimeout(timer);
    root.querySelector('.search-clear').hidden = !input.value;
    timer = setTimeout(() => {
      state.q = input.value;
      state.view = null;
      state.songPage = 0;
      run();
    }, 300);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { clearTimeout(timer); state.q = input.value; state.view = null; saveRecent(state.q); run(); input.blur(); }
    if (e.key === 'Escape' && input.value) { input.value = ''; input.dispatchEvent(new Event('input')); }
  });

  page.addEventListener('click', (e) => {
    const t = e.target.closest('button, [role="button"]');
    if (!t || !page.contains(t)) return;

    if (t.classList.contains('search-clear')) { input.value = ''; state.q = ''; state.view = null; run(); input.focus(); return; }
    if (t.classList.contains('search-back')) { state.view = state.view?.back || null; run({ animate: -1 }); return; }
    if (t.closest('.search-tabs') && t.dataset.tab) { setTab(t.dataset.tab); return; }
    if (t.dataset.tab && t.classList.contains('search-see-all')) { setTab(t.dataset.tab); return; }
    if (t.hasAttribute('data-clear-recents')) { removeRecent(null); run(); return; }
    if (t.dataset.removeRecent) { removeRecent(t.dataset.removeRecent); run(); return; }
    if (t.dataset.query) {
      state.q = t.dataset.query; input.value = state.q;
      state.tab = t.dataset.goTab || 'tudo'; state.view = null;
      saveRecent(state.q); run(); return;
    }
    if (t.hasAttribute('data-more-songs')) { state.songPage++; run(); return; }
    if (t.hasAttribute('data-all-artist-songs')) { state.view = { ...state.view, allSongs: true }; run(); return; }
    if (t.dataset.followId) { e.stopPropagation(); window._toggleFollow?.(t.dataset.followId); return; }
    if (t.dataset.artist) { e.stopPropagation(); openView({ type: 'artist', id: t.dataset.artist, name: t.dataset.artistName }); return; }
    if (t.dataset.album) { e.stopPropagation(); openView({ type: 'album', id: t.dataset.album }); return; }

    const song = t.closest('[data-play]');
    if (t.hasAttribute('data-post-song') && song) {
      e.stopPropagation();
      const track = JSON.parse(song.dataset.play);
      window._composeNew?.();
      setTimeout(() => window._setCreatorSong?.(track), 80);
      return;
    }
    if (song && (t === song || t.classList.contains('search-play') || t.classList.contains('search-detail-play'))) {
      if (state.q.trim()) saveRecent(state.q);
      window._playTrack?.(JSON.parse(song.dataset.play));
      return;
    }

    if (t.dataset.profile) { saveRecent(state.q); window._goToProfile?.(t.dataset.profile); return; }
    if (t.dataset.playlist) {
      const local = Storage.getPlaylistById(t.dataset.playlist);
      if (local) { window.switchTab?.('playlists'); setTimeout(() => window._viewPlaylist?.(local.id), 60); }
      else openView({ type: 'playlist', id: t.dataset.playlist });
    }
  });

  // Rows are focusable: Enter acts like a click
  page.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('[role="button"]')) { e.preventDefault(); e.target.click(); }
  });

  run();
  if (!state.q && !state.view) setTimeout(() => input.focus({ preventScroll: true }), 50);
}
