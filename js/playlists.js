// Playlists Module — Create, Manage, Play, and Share Custom Playlists without limits
import { esc, safeUrl, jsArg, avatarInner, isImageAvatar } from './dom.js';
import {
  getAllPlaylists, getPlaylistById, createPlaylist, updatePlaylist,
  deletePlaylist, addSongToPlaylist, removeSongFromPlaylist,
  reorderPlaylistSongs, toggleLikePlaylist, getActiveUser, getUserById,
  createPost
} from './storage.js';
import { ICONS } from './icons.js';
import { openSearchModalForPlaylist, showToast, openDoodleModal, closeDoodleModal } from './ui.js';
import { mountTabIndicator, tabDirection, animatePanel } from './tabs.js';
import { fetchSimilarTracks } from './lastfm.js';

let currentFilter = 'all'; // 'all' | 'mine' | 'community'
let searchQuery = '';
let activePlaylistId = null;

/**
 * Render avatar HTML (Image if URL, or styled initial)
 */
function renderAvatarHtml(user, size = 20, isHero = false) {
  if (!user) {
    return `<span class="playlist-author-avatar fallback" style="width:${size}px;height:${size}px;font-size:${Math.round(size*0.48)}px;">U</span>`;
  }
  const isImg = isImageAvatar(user.avatar);
  if (isImg) {
    const cls = isHero ? 'playlist-hero-author-avatar-img' : 'playlist-author-avatar-img';
    return `<img src="${safeUrl(user.avatar)}" alt="${esc(user.name)}" class="${cls}" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;flex-shrink:0;">`;
  }
  const initial = (user.avatar && user.avatar.length <= 2 ? user.avatar : (user.name?.[0] || 'U')).toUpperCase();
  return `<span class="playlist-author-avatar fallback" style="width:${size}px;height:${size}px;border-radius:50%;background:var(--purple-dark);color:var(--white);display:inline-flex;align-items:center;justify-content:center;font-size:${Math.round(size*0.48)}px;font-weight:800;flex-shrink:0;">${initial}</span>`;
}

/**
 * Filter playlists according to current state
 */
function getFilteredPlaylists() {
  const activeUser = getActiveUser();
  const allPlaylists = getAllPlaylists();

  let filtered = allPlaylists.filter(p => {
    if (currentFilter === 'mine') return p.authorId === activeUser.id;
    if (currentFilter === 'community') return p.authorId !== activeUser.id;
    return true;
  });

  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase().trim();
    filtered = filtered.filter(p => {
      const matchTitle = (p.title || '').toLowerCase().includes(q);
      const matchDesc = (p.description || '').toLowerCase().includes(q);
      const matchSongs = (p.songs || []).some(s =>
        (s.title || '').toLowerCase().includes(q) || (s.artist || '').toLowerCase().includes(q)
      );
      const author = getUserById(p.authorId);
      const matchAuthor = (author?.name || '').toLowerCase().includes(q);
      return matchTitle || matchDesc || matchSongs || matchAuthor;
    });
  }

  return { filtered, allPlaylists, activeUser };
}

/**
 * Update the grid content smoothly without re-rendering the search bar or losing focus
 */
function updatePlaylistsGridOnly(containerEl) {
  const grid = containerEl.querySelector('.playlists-grid');
  if (!grid) {
    renderPlaylistsTab(containerEl);
    return;
  }
  const { filtered, activeUser } = getFilteredPlaylists();
  grid.innerHTML = filtered.length
    ? filtered.map(pl => renderPlaylistCard(pl, activeUser)).join('')
    : renderEmptyPlaylistsState();
}

/**
 * Main entry to render the Playlists tab
 */
export function renderPlaylistsTab(containerEl) {
  if (!containerEl) return;

  if (activePlaylistId) {
    const pl = getPlaylistById(activePlaylistId);
    if (pl) {
      renderPlaylistDetails(containerEl, activePlaylistId);
      return;
    } else {
      activePlaylistId = null;
    }
  }

  const { filtered, allPlaylists, activeUser } = getFilteredPlaylists();

  containerEl.innerHTML = `
    <div class="playlists-wrap">
      <!-- Header -->
      <div class="page-header" style="margin-bottom:20px;">
        <div style="display:flex;align-items:center;justify-content:space-between;width:100%;flex-wrap:wrap;gap:12px;">
          <div>
            <div class="page-title" style="display:flex;align-items:center;gap:10px;">
              ${ICONS.playlist}
              <span>Playlists</span>
            </div>
            <div class="page-sub">Monte listas com as suas músicas e compartilhe no feed.</div>
          </div>
          <button class="doodle-btn doodle-btn-primary" onclick="window._openCreatePlaylistModal()" style="display:inline-flex;align-items:center;gap:8px;padding:10px 20px;font-weight:700;">
            ${ICONS.plus}
            <span>Nova playlist</span>
          </button>
        </div>
      </div>

      <!-- Controls bar (Filter Pills + Search) -->
      <div class="playlists-controls-bar">
        <div class="playlists-filter-pills" id="playlists-filter-pills-wrap">
          <button class="playlist-pill${currentFilter === 'all' ? ' active' : ''}" onclick="window._setPlaylistFilter('all')">
            Todas (${allPlaylists.length})
          </button>
          <button class="playlist-pill${currentFilter === 'mine' ? ' active' : ''}" onclick="window._setPlaylistFilter('mine')">
            Minhas (${allPlaylists.filter(p => p.authorId === activeUser.id).length})
          </button>
          <button class="playlist-pill${currentFilter === 'community' ? ' active' : ''}" onclick="window._setPlaylistFilter('community')">
            Comunidade (${allPlaylists.filter(p => p.authorId !== activeUser.id).length})
          </button>
        </div>
        <div class="playlists-search-box">
          ${ICONS.search}
          <input type="text" id="playlist-search-input" class="doodle-input" placeholder="Buscar playlist, música ou artista..." value="${esc(searchQuery)}" oninput="window._onPlaylistSearch(this.value)">
        </div>
      </div>

      <!-- Playlists Grid -->
      <div class="playlists-grid">
        ${filtered.length ? filtered.map(pl => renderPlaylistCard(pl, activeUser)).join('') : renderEmptyPlaylistsState()}
      </div>
    </div>
  `;
  mountTabIndicator(containerEl.querySelector('#playlists-filter-pills-wrap'), { key: 'playlists', variant: 'pill' });

  // Bind global helpers
  window._setPlaylistFilter = (f) => {
    const order = ['all', 'mine', 'community'];
    const direction = tabDirection(order.indexOf(currentFilter), order.indexOf(f));
    currentFilter = f;
    // Update pill classes without re-rendering search box
    const pillsWrap = containerEl.querySelector('#playlists-filter-pills-wrap');
    if (pillsWrap) {
      const pills = pillsWrap.querySelectorAll('.playlist-pill');
      pills.forEach((p, idx) => {
        const filterKey = idx === 0 ? 'all' : (idx === 1 ? 'mine' : 'community');
        if (filterKey === f) p.classList.add('active');
        else p.classList.remove('active');
      });
    }
    updatePlaylistsGridOnly(containerEl);
    if (direction) animatePanel(containerEl.querySelector('.playlists-grid'), direction);
  };

  window._onPlaylistSearch = (val) => {
    searchQuery = val;
    updatePlaylistsGridOnly(containerEl);
  };

  window._viewPlaylist = (id) => {
    activePlaylistId = id;
    renderPlaylistDetails(containerEl, id);
  };

  window._backToPlaylists = () => {
    activePlaylistId = null;
    renderPlaylistsTab(containerEl);
  };

  window._refreshPlaylists = () => {
    if (activePlaylistId) {
      renderPlaylistDetails(containerEl, activePlaylistId);
    } else {
      updatePlaylistsGridOnly(containerEl);
    }
  };
}

/**
 * Render single playlist card
 */
function renderPlaylistCard(pl, activeUser) {
  const author = getUserById(pl.authorId) || { name: 'Desconhecido', avatar: 'U', handle: '@user' };
  const isOwner = pl.authorId === activeUser.id;
  const songs = pl.songs || [];
  const songsCount = songs.length;
  const totalDuration = calculatePlaylistDuration(songs);
  const isLiked = Array.isArray(pl.likes) && pl.likes.includes(activeUser.id);
  const likesCount = (pl.likes || []).length;

  const coverHtml = renderPlaylistCoverHtml(pl, 'card');
  const avatarHtml = renderAvatarHtml(author, 22, false);

  return `
    <div class="playlist-card" onclick="window._viewPlaylist('${pl.id}')">
      <div class="playlist-card-cover-wrap">
        ${coverHtml}
        <button class="playlist-card-play-btn" title="Tocar Playlist" onclick="event.stopPropagation();window._playEntirePlaylist('${pl.id}')">
          ${ICONS.play}
        </button>
      </div>

      <div class="playlist-card-body">
        <div class="playlist-card-title-row">
          <h3 class="playlist-card-title" title="${esc(pl.title)}">${esc(pl.title)}</h3>
        </div>

        ${pl.description ? `<p class="playlist-card-desc">${esc(pl.description)}</p>` : ''}

        <div class="playlist-card-meta">
          <div class="playlist-card-author" onclick="event.stopPropagation();window._goToProfile('${pl.authorId}')" title="Ver perfil de ${esc(author.name)}">
            ${avatarHtml}
            <span class="playlist-author-name">${esc(author.name)}</span>
          </div>
          <span class="playlist-card-count">${songsCount} ${songsCount === 1 ? 'música' : 'músicas'} ${totalDuration ? `&bull; ${totalDuration}` : ''}</span>
        </div>

        <div class="playlist-card-actions" onclick="event.stopPropagation()">
          <button class="doodle-btn doodle-btn-ghost doodle-btn-sm" onclick="window._toggleLikePlaylist('${pl.id}')" title="Curtir playlist" style="gap:5px;${isLiked ? 'color:var(--danger);' : ''}">
            ${isLiked ? ICONS.heartFilled : ICONS.heartEmpty}
            <span>${likesCount}</span>
          </button>
          <button class="doodle-btn doodle-btn-ghost doodle-btn-sm" onclick="window._openPlaylistShareModal('${pl.id}')" title="Compartilhar Playlist">
            ${ICONS.share}
            <span>Compartilhar</span>
          </button>
          ${isOwner ? `
            <button class="doodle-btn doodle-btn-ghost doodle-btn-sm" onclick="window._openEditPlaylistModal('${pl.id}')" title="Editar Playlist">
              ${ICONS.edit}
            </button>
            <button class="doodle-btn doodle-btn-ghost doodle-btn-sm" style="color:var(--pink);" onclick="window._deletePlaylistConfirm('${pl.id}')" title="Excluir Playlist">
              ${ICONS.trash}
            </button>
          ` : ''}
        </div>
      </div>
    </div>
  `;
}

/**
 * Render details of a specific playlist
 */
export function renderPlaylistDetails(containerEl, playlistId) {
  if (!containerEl) return;
  const pl = getPlaylistById(playlistId);
  if (!pl) {
    activePlaylistId = null;
    renderPlaylistsTab(containerEl);
    return;
  }

  const activeUser = getActiveUser();
  const author = getUserById(pl.authorId) || { name: 'Desconhecido', avatar: 'U', handle: '@user' };
  const isOwner = pl.authorId === activeUser.id;
  const songs = pl.songs || [];
  const songsCount = songs.length;
  const totalDuration = calculatePlaylistDuration(songs);
  const coverHtml = renderPlaylistCoverHtml(pl, 'hero');
  const avatarHeroHtml = renderAvatarHtml(author, 28, true);

  containerEl.innerHTML = `
    <div class="playlist-detail-wrap">
      <!-- Breadcrumb / Back Button -->
      <button class="doodle-btn doodle-btn-ghost doodle-btn-sm playlist-back-btn" onclick="window._backToPlaylists()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
        <span>Voltar para todas as playlists</span>
      </button>

      <!-- Hero Header -->
      <div class="playlist-detail-hero">
        <div class="playlist-hero-cover-wrap">
          ${coverHtml}
        </div>
        <div class="playlist-hero-info">
          <div class="playlist-hero-badge">
            ${ICONS.playlist}
            <span>Playlist Personalizada</span>
          </div>
          <h1 class="playlist-hero-title">${esc(pl.title)}</h1>
          ${pl.description ? `<p class="playlist-hero-desc">${esc(pl.description)}</p>` : ''}
          
          <div class="playlist-hero-meta">
            <div class="playlist-hero-author" onclick="window._goToProfile('${pl.authorId}')" title="Ver perfil de ${esc(author.name)}">
              ${avatarHeroHtml}
              <strong>${esc(author.name)}</strong>
              <span style="color:var(--muted);font-size:0.8rem;">${esc(author.handle || '')}</span>
            </div>
            <span class="playlist-hero-divider">•</span>
            <span>${songsCount} ${songsCount === 1 ? 'música' : 'músicas'}</span>
            ${totalDuration ? `<span class="playlist-hero-divider">•</span><span>${totalDuration}</span>` : ''}
            <span class="playlist-hero-divider">•</span>
            <span style="color:var(--muted);">${esc(pl.createdAt || 'recente')}</span>
          </div>

          <!-- Hero Action Bar -->
          <div class="playlist-hero-actions">
            ${songsCount > 0 ? `
              <button class="doodle-btn doodle-btn-primary playlist-hero-play-btn" onclick="window._playEntirePlaylist('${pl.id}')">
                ${ICONS.play}
                <span>Tocar Playlist</span>
              </button>
            ` : ''}
            
            ${isOwner ? `
              <button class="doodle-btn doodle-btn-secondary" onclick="window._openAddSongToPlaylist('${pl.id}')">
                ${ICONS.plus}
                <span>Adicionar Música</span>
              </button>
            ` : ''}

            <button class="doodle-btn doodle-btn-ghost" onclick="window._openPlaylistShareModal('${pl.id}')" title="Compartilhar Playlist">
              ${ICONS.share}
              <span>Compartilhar</span>
            </button>

            ${isOwner ? `
              <button class="doodle-btn doodle-btn-ghost" onclick="window._openEditPlaylistModal('${pl.id}')" title="Editar Informações">
                ${ICONS.edit}
                <span>Editar</span>
              </button>
              <button class="doodle-btn doodle-btn-ghost" style="color:var(--pink);" onclick="window._deletePlaylistConfirm('${pl.id}')" title="Excluir Playlist">
                ${ICONS.trash}
                <span>Excluir</span>
              </button>
            ` : ''}
          </div>
        </div>
      </div>

      <!-- Tracks Section -->
      <div class="playlist-tracks-section">
        <div class="playlist-tracks-header">
          <div style="display:flex;align-items:center;gap:10px;">
            <h2 style="font-size:1.1rem;font-weight:800;color:var(--white);margin:0;">Faixas da Playlist</h2>
            <span class="playlist-tracks-count-badge">${songsCount}</span>
          </div>
          ${isOwner && songsCount > 0 ? `
            <button class="doodle-btn doodle-btn-ghost doodle-btn-sm" onclick="window._openAddSongToPlaylist('${pl.id}')">
              ${ICONS.plus} Adicionar mais músicas
            </button>
          ` : ''}
        </div>

        ${songsCount > 0 ? `
          <div class="playlist-tracks-list">
            ${songs.map((song, idx) => renderTrackRow(pl, song, idx, isOwner)).join('')}
          </div>
        ` : renderEmptyTracksState(pl.id, isOwner)}
      </div>

      ${songsCount > 0 ? `
        <section class="playlist-tracks-section playlist-recs" aria-labelledby="pl-recs-title">
          <div class="playlist-tracks-header">
            <div>
              <h2 id="pl-recs-title" style="font-size:1.1rem;font-weight:800;color:var(--white);margin:0;">Recomendadas</h2>
              <p class="playlist-recs-sub">Com base nas músicas desta playlist</p>
            </div>
            <button class="doodle-btn doodle-btn-ghost doodle-btn-sm" onclick="window._refreshPlaylistRecs('${pl.id}')">${ICONS.refresh} Outras</button>
          </div>
          <div class="playlist-tracks-list" id="playlist-recs-list"></div>
        </section>` : ''}
    </div>
  `;

  if (songsCount > 0) loadPlaylistRecs(pl, isOwner);

  window._refreshPlaylistDetails = (id) => {
    if (activePlaylistId === id) {
      renderPlaylistDetails(containerEl, id);
    }
  };
}

// ─── Recommendations ────────────────────────────────────────────────────────

const recsCache = new Map(); // playlist id → Promise<track[]>
const sameSong = (a, b) => a.id === b.id || (a.title?.toLowerCase() === b.title?.toLowerCase() && a.artist?.toLowerCase() === b.artist?.toLowerCase());

async function loadPlaylistRecs(pl, isOwner) {
  const list = document.getElementById('playlist-recs-list');
  if (!list) return;
  list.innerHTML = `<div class="playlist-recs-empty">Procurando músicas parecidas…</div>`;
  if (!recsCache.has(pl.id)) {
    const seeds = (pl.songs || []).map(s => ({ title: s.title, artist: s.artist }));
    recsCache.set(pl.id, fetchSimilarTracks(seeds, 12).catch(() => []));
  }
  const tracks = await recsCache.get(pl.id);
  const el = document.getElementById('playlist-recs-list');
  if (!el || activePlaylistId !== pl.id) return;
  const current = getPlaylistById(pl.id)?.songs || [];
  const fresh = tracks.filter(t => !current.some(s => sameSong(s, t))).slice(0, 10);
  if (!fresh.length) {
    el.innerHTML = `<div class="playlist-recs-empty">Não achamos recomendações agora. Tente "Outras" daqui a pouco.</div>`;
    return;
  }
  el.innerHTML = fresh.map(t => `
    <div class="playlist-track-row playlist-rec-row" onclick="window._playTrack(${jsArg(t)})">
      <div class="playlist-track-index"><button class="track-play-icon" style="opacity:1" title="Tocar prévia">${ICONS.play}</button></div>
      <div class="playlist-track-cover">
        ${t.artwork ? `<img src="${safeUrl(t.artwork)}" alt="" loading="lazy">` : `<div class="track-cover-fallback">${ICONS.music}</div>`}
      </div>
      <div class="playlist-track-info">
        <div class="playlist-track-title">${esc(t.title)}</div>
        <div class="playlist-track-artist">${esc(t.artist)}</div>
      </div>
      <div class="playlist-track-album" title="${esc(t.album || '')}">${esc(t.album || '—')}</div>
      <div class="playlist-track-duration">${esc(t.duration || '--:--')}</div>
      <div class="playlist-track-actions" onclick="event.stopPropagation()">
        ${isOwner ? `<button class="btn-track-action" title="Adicionar à playlist" aria-label="Adicionar ${esc(t.title)} à playlist"
          onclick="window._addRecToPlaylist('${pl.id}', ${jsArg(t)})">${ICONS.plus}</button>` : ''}
      </div>
    </div>`).join('');
}

window._refreshPlaylistRecs = (playlistId) => {
  recsCache.delete(playlistId);
  const pl = getPlaylistById(playlistId);
  if (pl) loadPlaylistRecs(pl, pl.authorId === getActiveUser().id);
};

window._addRecToPlaylist = (playlistId, track) => {
  addSongToPlaylist(playlistId, track);
  showToast(`"${track.title}" adicionada à playlist!`);
  window._refreshPlaylistDetails?.(playlistId);
};

/**
 * Render single track row inside playlist
 */
function renderTrackRow(playlist, song, index, isOwner) {
  const songDataJson = jsArg(song);
  return `
    <div class="playlist-track-row" onclick="window._playTrack(${songDataJson})">
      <div class="playlist-track-index">
        <span class="track-num">${index + 1}</span>
        <button class="track-play-icon" title="Tocar prévia">${ICONS.play}</button>
      </div>

      <div class="playlist-track-cover">
        ${song.artwork ? `<img src="${safeUrl(song.artwork)}" alt="${esc(song.title)}" loading="lazy">` : `<div class="track-cover-fallback">${ICONS.music}</div>`}
      </div>

      <div class="playlist-track-info">
        <div class="playlist-track-title">${esc(song.title)}</div>
        <div class="playlist-track-artist">${esc(song.artist)}</div>
        ${song.note ? `<div class="playlist-track-note">💬 "${esc(song.note)}"</div>` : ''}
      </div>

      <div class="playlist-track-album" title="${esc(song.album || '')}">
        ${esc(song.album || '—')}
      </div>

      <div class="playlist-track-duration">
        ${esc(song.duration || '--:--')}
      </div>

      <div class="playlist-track-actions" onclick="event.stopPropagation()">
        ${isOwner ? `
          ${index > 0 ? `
            <button class="btn-track-action" title="Mover para cima" onclick="window._movePlaylistTrack('${playlist.id}', ${index}, ${index - 1})">
              ↑
            </button>
          ` : ''}
          ${index < playlist.songs.length - 1 ? `
            <button class="btn-track-action" title="Mover para baixo" onclick="window._movePlaylistTrack('${playlist.id}', ${index}, ${index + 1})">
              ↓
            </button>
          ` : ''}
          <button class="btn-track-action danger" title="Remover da playlist" onclick="window._removePlaylistTrack('${playlist.id}', ${index})">
            ${ICONS.trash}
          </button>
        ` : ''}
      </div>
    </div>
  `;
}

/**
 * Generate 2x2 artwork collage or single cover
 */
function renderPlaylistCoverHtml(pl, variant = 'card') {
  if (pl.coverUrl) {
    return `<img src="${safeUrl(pl.coverUrl)}" alt="${esc(pl.title)}" class="playlist-cover-img ${variant}">`;
  }

  const songsWithArt = (pl.songs || []).filter(s => !!s.artwork);

  if (songsWithArt.length >= 4) {
    return `
      <div class="playlist-cover-collage ${variant}">
        <img src="${safeUrl(songsWithArt[0].artwork)}" alt="1">
        <img src="${safeUrl(songsWithArt[1].artwork)}" alt="2">
        <img src="${safeUrl(songsWithArt[2].artwork)}" alt="3">
        <img src="${safeUrl(songsWithArt[3].artwork)}" alt="4">
      </div>
    `;
  } else if (songsWithArt.length > 0) {
    return `
      <div class="playlist-cover-single ${variant}">
        <img src="${safeUrl(songsWithArt[0].artwork)}" alt="${esc(pl.title)}">
      </div>
    `;
  }

  return `
    <div class="playlist-cover-placeholder ${variant}">
      ${ICONS.playlist}
    </div>
  `;
}

function renderEmptyPlaylistsState() {
  return `
    <div class="playlists-empty-state">
      <div class="empty-icon">${ICONS.playlist}</div>
      <h3>Nenhuma playlist por aqui</h3>
      <p>Junte as músicas que você mais ouve numa lista e compartilhe com quem segue você.</p>
      <button class="doodle-btn doodle-btn-primary" onclick="window._openCreatePlaylistModal()" style="margin-top:10px;">
        ${ICONS.plus} Criar playlist
      </button>
    </div>
  `;
}

function renderEmptyTracksState(playlistId, isOwner) {
  return `
    <div class="playlist-empty-tracks">
      <div class="empty-icon">${ICONS.music}</div>
      <h3>Esta playlist ainda está vazia</h3>
      <p>${isOwner ? 'Comece pesquisando e adicionando músicas que combinam com essa vibe!' : 'O criador ainda não adicionou músicas a esta playlist.'}</p>
      ${isOwner ? `
        <button class="doodle-btn doodle-btn-primary" onclick="window._openAddSongToPlaylist('${playlistId}')" style="margin-top:12px;">
          ${ICONS.plus} Adicionar Músicas
        </button>
      ` : ''}
    </div>
  `;
}

function calculatePlaylistDuration(songs = []) {
  let totalSeconds = 0;
  songs.forEach(s => {
    if (s.duration && s.duration.includes(':')) {
      const parts = s.duration.split(':');
      const mins = parseInt(parts[0], 10) || 0;
      const secs = parseInt(parts[1], 10) || 0;
      totalSeconds += (mins * 60) + secs;
    }
  });

  if (totalSeconds === 0) return '';
  const mins = Math.floor(totalSeconds / 60);
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;

  if (hours > 0) {
    return `${hours}h ${remMins}m`;
  }
  return `${mins} min`;
}

/**
 * Open Create / Edit Playlist Modal
 */
export function openCreatePlaylistModal(playlistId = null) {
  const pl = playlistId ? getPlaylistById(playlistId) : null;
  const modal = document.getElementById('create-playlist-modal');
  if (!modal) return;

  const isEdit = !!pl;
  modal.querySelector('.modal-header h3').textContent = isEdit ? 'Editar Playlist' : 'Nova Playlist';

  const body = modal.querySelector('.modal-body');
  body.innerHTML = `
    <form id="playlist-form" onsubmit="event.preventDefault();window._submitPlaylistForm('${playlistId || ''}')">
      <div style="margin-bottom:14px;">
        <label class="form-label">Nome da Playlist *</label>
        <input type="text" id="playlist-form-title" class="doodle-input" required placeholder="Ex: Madrugadas & Melancolia" value="${esc(pl?.title || '')}" style="font-weight:700;">
      </div>

      <div style="margin-bottom:14px;">
        <label class="form-label">Descrição / Vibe (opcional)</label>
        <textarea id="playlist-form-desc" class="doodle-input" rows="3" placeholder="Qual a atmosfera ou história dessa lista?">${esc(pl?.description || '')}</textarea>
      </div>

      <div style="margin-bottom:18px;">
        <label class="form-label" style="display:flex;align-items:center;justify-content:space-between;">
          <span>Capa Customizada (opcional)</span>
          <span style="font-size:0.72rem;color:var(--muted);font-weight:normal;">URL ou Arquivo</span>
        </label>
        <div style="display:flex;gap:8px;">
          <input type="text" id="playlist-form-cover" class="doodle-input" placeholder="https://exemplo.com/capa.jpg ou arquivo" value="${esc(pl?.coverUrl || '')}">
          <label class="doodle-btn doodle-btn-secondary doodle-btn-sm" style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;white-space:nowrap;" title="Escolher imagem do dispositivo">
            ${ICONS.image || ''}
            <span>Dispositivo</span>
            <input type="file" id="playlist-form-file" accept="image/*" style="display:none;" onchange="window._handlePlaylistCoverUpload(event)">
          </label>
        </div>
        <div style="font-size:0.75rem;color:var(--muted);margin-top:4px;">
          Se deixar em branco, geramos uma capa automática com a colagem dos álbuns adicionados!
        </div>
      </div>

      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px;">
        <button type="button" class="doodle-btn doodle-btn-ghost" onclick="closeDoodleModal('create-playlist-modal')">Cancelar</button>
        <button type="submit" class="doodle-btn doodle-btn-primary">${isEdit ? 'Salvar Alterações' : 'Criar Playlist'}</button>
      </div>
    </form>
  `;

  openDoodleModal('create-playlist-modal');
}

window._handlePlaylistCoverUpload = (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const input = document.getElementById('playlist-form-cover');
    if (input) input.value = e.target.result;
    showToast('Imagem carregada do dispositivo!');
  };
  reader.readAsDataURL(file);
};

/**
 * Handle form submit
 */
window._submitPlaylistForm = (playlistId) => {
  const title = document.getElementById('playlist-form-title')?.value || '';
  const description = document.getElementById('playlist-form-desc')?.value || '';
  const coverUrl = document.getElementById('playlist-form-cover')?.value || '';

  if (!title.trim()) {
    showToast('Informe um título para a playlist.');
    return;
  }

  if (playlistId) {
    updatePlaylist(playlistId, { title, description, coverUrl });
    showToast('Playlist atualizada com sucesso!');
  } else {
    const newPl = createPlaylist({ title, description, coverUrl });
    activePlaylistId = newPl.id;
    showToast(`Playlist "${newPl.title}" criada!`);
  }

  closeDoodleModal('create-playlist-modal');
  const container = document.getElementById('tab-playlists');
  if (container) renderPlaylistsTab(container);
};

/**
 * Play an entire playlist sequentially
 */
window._playEntirePlaylist = async (playlistId) => {
  const pl = getPlaylistById(playlistId);
  if (!pl || !pl.songs || !pl.songs.length) {
    showToast('Esta playlist não possui faixas.');
    return;
  }

  showToast(`Tocando playlist: ${pl.title}`);
  // Start with the first song
  const firstSong = pl.songs[0];
  if (window._playTrack) {
    await window._playTrack(firstSong);
  }
};

/**
 * Add Song to Playlist
 */
window._openAddSongToPlaylist = (playlistId) => {
  openSearchModalForPlaylist(playlistId);
};

/**
 * Remove Song from Playlist
 */
window._removePlaylistTrack = (playlistId, index) => {
  if (confirm('Deseja remover esta música da playlist?')) {
    removeSongFromPlaylist(playlistId, index);
    showToast('Música removida.');
    const container = document.getElementById('tab-playlists');
    if (container) renderPlaylistDetails(container, playlistId);
  }
};

/**
 * Move Song up/down
 */
window._movePlaylistTrack = (playlistId, fromIdx, toIdx) => {
  reorderPlaylistSongs(playlistId, fromIdx, toIdx);
  const container = document.getElementById('tab-playlists');
  if (container) renderPlaylistDetails(container, playlistId);
};

/**
 * Delete Playlist confirmation
 */
window._deletePlaylistConfirm = (playlistId) => {
  const pl = getPlaylistById(playlistId);
  if (!pl) return;
  if (confirm(`Tem certeza que deseja excluir a playlist "${pl.title}"?`)) {
    deletePlaylist(playlistId);
    activePlaylistId = null;
    showToast('Playlist excluída.');
    const container = document.getElementById('tab-playlists');
    if (container) renderPlaylistsTab(container);
  }
};

/**
 * Like Playlist toggle
 */
window._toggleLikePlaylist = (playlistId) => {
  toggleLikePlaylist(playlistId);
  const container = document.getElementById('tab-playlists');
  if (container) {
    if (activePlaylistId) renderPlaylistDetails(container, activePlaylistId);
    else updatePlaylistsGridOnly(container);
  }
};

window._openCreatePlaylistModal = () => openCreatePlaylistModal(null);
window._openEditPlaylistModal = (id) => openCreatePlaylistModal(id);

// ──────────────────────────────────────────
// PLAYLIST SHARING (Text, Feed Post, Web Share, Canvas Image)
// ──────────────────────────────────────────

/**
 * Generate formatted text list of playlist
 */
export function generatePlaylistText(playlist) {
  const author = getUserById(playlist.authorId) || { name: 'Alguém' };
  const songs = playlist.songs || [];
  
  let text = `🎧 Playlist: ${playlist.title} — por ${author.name}\n`;
  if (playlist.description) {
    text += `"${playlist.description}"\n`;
  }
  text += `📊 Total: ${songs.length} faixas\n`;
  text += `═══════════════════════════════════════\n\n`;

  songs.forEach((s, i) => {
    const num = String(i + 1).padStart(2, '0');
    text += `${num}. ▶ ${s.title} — ${s.artist}${s.album ? ` (${s.album})` : ''}\n`;
    if (s.note) {
      text += `   💬 "${s.note}"\n`;
    }
  });

  text += `\n═══════════════════════════════════════\nCriada no Music Ask 🎵`;
  return text;
}

/**
 * Open Playlist Share Dialog Modal
 */
export function openPlaylistShareModal(playlistId) {
  const pl = getPlaylistById(playlistId);
  if (!pl) return;

  const modal = document.getElementById('playlist-share-modal');
  if (!modal) return;

  const author = getUserById(pl.authorId) || { name: 'Alguém', avatar: 'U' };
  const avatarShareHtml = renderAvatarHtml(author, 36);
  const body = modal.querySelector('.modal-body');

  body.innerHTML = `
    <div class="playlist-share-content">
      <div style="display:flex;gap:14px;align-items:center;background:var(--bg-surface);padding:12px 14px;border-radius:12px;border:1px solid var(--purple-accent);margin-bottom:16px;">
        <div style="width:54px;height:54px;border-radius:8px;overflow:hidden;flex-shrink:0;">
          ${renderPlaylistCoverHtml(pl, 'card')}
        </div>
        <div style="min-width:0;flex:1;">
          <h4 style="margin:0;font-size:1rem;color:var(--white);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(pl.title)}</h4>
          <div style="display:flex;align-items:center;gap:6px;font-size:0.78rem;color:var(--purple-light);margin-top:4px;cursor:pointer;" onclick="closeDoodleModal('playlist-share-modal');window._goToProfile('${pl.authorId}')" title="Ver perfil de ${esc(author.name)}">
            ${avatarShareHtml}
            <span>${(pl.songs || []).length} músicas &bull; Curadoria de <strong style="text-decoration:underline;">${esc(author.name)}</strong></span>
          </div>
        </div>
      </div>

      <!-- Quick Share Actions -->
      <div class="playlist-share-options-grid">
        <!-- 1. Post to Feed -->
        <button class="share-option-card" onclick="window._sharePlaylistToFeedAction('${pl.id}')">
          <div class="share-option-icon" style="background:color-mix(in srgb, var(--accent) 20%, transparent);color:var(--purple-light);">
            ${ICONS.feed}
          </div>
          <div class="share-option-info">
            <strong>Publicar no Feed</strong>
            <span>Compartilhe com seus seguidores na timeline</span>
          </div>
        </button>

        <!-- 2. Copy Formatted Text -->
        <button class="share-option-card" onclick="window._copyPlaylistTextAction('${pl.id}')">
          <div class="share-option-icon" style="background:color-mix(in srgb, var(--accent) 15%, transparent);color:var(--accent);">
            ${ICONS.edit}
          </div>
          <div class="share-option-info">
            <strong>Copiar Lista em Texto</strong>
            <span>Para colar no WhatsApp, Discord ou Twitter</span>
          </div>
        </button>

        <!-- 3. Copy Link / Web Share -->
        <button class="share-option-card" onclick="window._sharePlaylistLinkAction('${pl.id}')">
          <div class="share-option-icon" style="background:color-mix(in srgb, var(--star) 15%, transparent);color:var(--star);">
            ${ICONS.share}
          </div>
          <div class="share-option-info">
            <strong>Compartilhar Link</strong>
            <span>Envie o link direto desta playlist</span>
          </div>
        </button>
      </div>
    </div>
  `;

  openDoodleModal('playlist-share-modal');
}

window._openPlaylistShareModal = (id) => openPlaylistShareModal(id);

/**
 * Share Playlist to Feed (opens composer modal to allow editing before posting)
 */
window._sharePlaylistToFeedAction = (playlistId) => {
  const pl = getPlaylistById(playlistId);
  if (!pl) return;

  closeDoodleModal('playlist-share-modal');
  const modal = document.getElementById('playlist-compose-modal');
  if (!modal) return;
  const body = modal.querySelector('.modal-body');

  const songs = pl.songs || [];
  const topTracks = songs.slice(0, 3).map(s => `• ${s.title} — ${s.artist}`).join('\n');
  const defaultText = `🎶 Ouçam minha playlist "${pl.title}"!\n${pl.description ? `"${pl.description}"\n\n` : ''}${songs.length} faixas selecionadas:${topTracks ? `\n${topTracks}` : ''}`;

  const coverArt = pl.coverUrl || (songs.find(s => !!s.artwork)?.artwork || '');

  body.innerHTML = `
    <form onsubmit="event.preventDefault();window._submitPlaylistFeedPost('${pl.id}')">
      <!-- Attached Playlist Mini Preview -->
      <div style="display:flex;align-items:center;gap:12px;padding:10px 12px;background:linear-gradient(135deg,color-mix(in srgb, var(--hover) 85%, transparent),color-mix(in srgb, var(--surface) 95%, transparent));border:1px solid var(--purple-accent);border-radius:10px;margin-bottom:14px;">
        <div style="width:48px;height:48px;border-radius:6px;overflow:hidden;background:#000;flex-shrink:0;display:flex;align-items:center;justify-content:center;">
          ${coverArt ? `<img src="${safeUrl(coverArt)}" style="width:100%;height:100%;object-fit:cover;">` : `<span style="color:var(--purple-light);">${ICONS.playlist}</span>`}
        </div>
        <div style="min-width:0;flex:1;">
          <div style="font-size:0.7rem;font-weight:800;color:var(--purple-light);">Playlist Anexada</div>
          <div style="font-size:0.9rem;font-weight:800;color:var(--white);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(pl.title)}</div>
          <div style="font-size:0.75rem;color:var(--muted);">${songs.length} músicas</div>
        </div>
      </div>

      <!-- Textarea for post text -->
      <div style="margin-bottom:14px;">
        <label class="form-label" style="font-weight:700;color:var(--white);margin-bottom:6px;display:block;">Mensagem da publicação:</label>
        <textarea id="playlist-post-custom-text" class="doodle-input" rows="4" style="width:100%;resize:vertical;font-family:var(--font);" placeholder="O que você quer dizer sobre essa playlist?">${esc(defaultText)}</textarea>
      </div>

      <!-- Tag Selector -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;">
        <label class="form-label" style="margin:0;font-weight:700;">Tag:</label>
        <select id="playlist-post-custom-tag" class="doodle-input" style="width:auto;padding:6px 12px;">
          <option value="#recomendo" selected>#recomendo</option>
          <option value="#música">#música</option>
          <option value="#descoberta">#descoberta</option>
          <option value="#desabafo">#desabafo</option>
          <option value="#clássico">#clássico</option>
        </select>
      </div>

      <div style="display:flex;justify-content:flex-end;gap:10px;">
        <button type="button" class="doodle-btn doodle-btn-ghost" onclick="closeDoodleModal('playlist-compose-modal')">Cancelar</button>
        <button type="submit" class="doodle-btn doodle-btn-primary" style="padding:8px 20px;">Publicar no Feed</button>
      </div>
    </form>
  `;

  openDoodleModal('playlist-compose-modal');
};

window._submitPlaylistFeedPost = (playlistId) => {
  const pl = getPlaylistById(playlistId);
  if (!pl) return;

  const text = document.getElementById('playlist-post-custom-text')?.value || '';
  const tag = document.getElementById('playlist-post-custom-tag')?.value || '#recomendo';

  createPost({
    text: text.trim(),
    tag,
    playlistId: pl.id
  });

  closeDoodleModal('playlist-compose-modal');
  showToast('Playlist publicada no feed com sucesso!');
  window.switchTab('feed');
};

/**
 * Copy text
 */
window._copyPlaylistTextAction = async (playlistId) => {
  const pl = getPlaylistById(playlistId);
  if (!pl) return;
  const text = generatePlaylistText(pl);
  try {
    await navigator.clipboard.writeText(text);
    showToast('Lista copiada para a área de transferência!');
  } catch {
    showToast('Texto gerado!');
  }
};

/**
 * Web Share API / Copy Link
 */
window._sharePlaylistLinkAction = async (playlistId) => {
  const pl = getPlaylistById(playlistId);
  if (!pl) return;

  const shareData = {
    title: `Playlist: ${pl.title}`,
    text: `Confira a playlist "${pl.title}" no Music Ask!`,
    url: window.location.href
  };

  if (navigator.share) {
    try {
      await navigator.share(shareData);
      showToast('Compartilhado!');
      return;
    } catch {
      // fallback
    }
  }

  const text = generatePlaylistText(pl);
  navigator.clipboard?.writeText(text);
  showToast('Link & texto da playlist copiados!');
};

