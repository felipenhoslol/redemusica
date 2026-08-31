// Feed module — post creation, rendering, interactions, lyric cards
import * as Storage from './storage.js';
import { globalAudio } from './audio.js';
import { ICONS, getStarSVG, renderRatingStars } from './icons.js';
import { searchTracks, fetchLastFmTrendingTracks } from './api.js';
import { getRandomLyric, getRandomCardStyle } from './lyrics_db.js';

// ──────────────────────────────────────────
// RENDER HELPERS
// ──────────────────────────────────────────

function renderLyricsCard(post) {
  if (!post.lyrics) return '';
  const text = post.lyrics;
  const attr = post.lyricsSong ? `<span class="lyrics-song-attr">— ${post.lyricsSong}</span>` : '';
  const style = post.lyricsCardStyle || 'compact';
  const art = post.lyricsArt || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80';

  if (style === 'compact' && !post.lyricsArt) {
    return `
      <div class="lyrics-card-compact">
        <div class="lyrics-text">${text}</div>
        ${attr}
      </div>`;
  }

  return `
    <div class="lyrics-card-fullbleed" style="position:relative;overflow:hidden;border-radius:var(--radius-md);margin:8px 0;padding:14px;min-height:96px;display:flex;flex-direction:column;justify-content:space-between;border:1px solid rgba(255,255,255,0.12);">
      <img class="lyrics-bg-image" src="${art}" alt="" loading="lazy" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:blur(12px) brightness(0.25) saturate(1.4);transform:scale(1.15);pointer-events:none;z-index:0;">
      <div style="position:absolute;inset:0;background:linear-gradient(135deg, rgba(20, 10, 35, 0.7), rgba(5, 2, 10, 0.85));z-index:1;"></div>
      <div class="lyrics-fullbleed-content" style="position:relative;z-index:2;">
        <div class="lyrics-text" style="font-size:0.95rem;line-height:1.45;color:#ffffff;font-style:italic;font-weight:600;text-shadow:0 2px 8px rgba(0,0,0,0.85);">${text}</div>
        <div style="display:flex;align-items:center;gap:8px;margin-top:10px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.15);">
          <img src="${art}" style="width:28px;height:28px;border-radius:4px;object-fit:cover;flex-shrink:0;border:1px solid rgba(255,255,255,0.2);">
          <div style="font-size:0.75rem;font-weight:700;color:var(--purple-light);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
            ${post.lyricsSong || 'Música Destacada'}
          </div>
        </div>
      </div>
    </div>`;
}

export function renderPostCard(post, options = {}) {
  const author = Storage.getUserById(post.authorId) || { name: '???', avatar: '?', handle: '@...' };
  const activeUser = Storage.getActiveUser();
  const liked = Array.isArray(post.likes) && post.likes.includes(activeUser.id);
  const bookmarked = Storage.isBookmarked(post.id);
  const reposted = Array.isArray(post.reposts) && post.reposts.includes(activeUser.id);
  const pinnedPostId = author.pinnedPostId;
  const isPinned = pinnedPostId === post.id;
  const isOwner = post.authorId === activeUser.id;

  const isRepost = post.isRepost || options.isRepost;
  const reposterName = post.reposterName || options.reposterName || '';

  const repostBannerHtml = isRepost ? `
    <div class="repost-header-banner">
      ${ICONS.repost || '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M17 1l4 4-4 4"></path><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><path d="M7 23l-4-4 4-4"></path><path d="M21 13v2a4 4 0 0 1-4 4H3"></path></svg>'}
      <span>${reposterName ? `${reposterName} repostou` : 'Repostado'}</span>
    </div>` : '';

  const songHtml = post.song ? `
    <div class="post-attached-song">
      <div class="post-song-info">
        <img class="post-song-cover" src="${post.song.artwork || ''}" alt="" onerror="this.style.display='none'">
        <div>
          <div class="post-song-title">${post.song.title}</div>
          <div class="post-song-artist">${post.song.artist}</div>
        </div>
      </div>
      <button class="doodle-btn doodle-btn-ghost doodle-btn-sm" onclick="window._playTrack(${JSON.stringify(post.song).replace(/"/g, '&quot;')})">
        ${ICONS.play}
      </button>
    </div>` : '';

  const imageHtml = post.imageUrl ? `<img class="post-attached-image" src="${post.imageUrl}" alt="post image" loading="lazy">` : '';

  const ratingHtml = post.rating > 0 ? `
    <div class="post-rating-display">
      ${renderRatingStars(post.rating, 18)}
      <span>${post.rating.toFixed(1)}</span>
    </div>` : '';

  const pinnedLabel = isPinned ? `<div class="pinned-label">${ICONS.pin || '&#128204;'} Post Fixado</div>` : '';

  const authorAvatarHtml = author.avatar && (author.avatar.startsWith('http') || author.avatar.startsWith('data:') || author.avatar.startsWith('/'))
    ? `<img src="${author.avatar}" alt="${author.name}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
    : (author.avatar || author.name?.[0] || 'U');

  const commentsHtml = (post.comments || []).map(c => {
    const cAvatar = c.userAvatar && (c.userAvatar.startsWith('http') || c.userAvatar.startsWith('data:') || c.userAvatar.startsWith('/'))
      ? `<img src="${c.userAvatar}" alt="${c.userName}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
      : (c.userAvatar || c.userName?.[0] || 'U');
    return `
      <div class="comment-row">
        <div class="comment-avatar">${cAvatar}</div>
        <div class="comment-content">
          <div class="comment-name">${c.userName}</div>
          <div class="comment-text">${c.text}</div>
        </div>
      </div>`;
  }).join('');

  return `
    <div class="post-card${isPinned ? ' pinned-post' : ''}" data-post-id="${post.id}">
      ${repostBannerHtml}
      ${pinnedLabel}
      <div class="post-header">
        <div class="post-author" onclick="window._goToProfile('${post.authorId}')">
          <div class="post-author-avatar">${authorAvatarHtml}</div>
          <div>
            <div class="post-author-name">${author.name}</div>
            <div class="post-author-handle">${author.handle || ''}</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
          <span class="post-meta">${post.updatedAt || post.createdAt || ''}</span>
          <button class="post-options-btn" onclick="window._togglePostOptions('${post.id}', event)" title="Opções">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"></circle><circle cx="12" cy="12" r="2"></circle><circle cx="12" cy="19" r="2"></circle></svg>
          </button>
        </div>
      </div>
      <div id="post-options-${post.id}" class="post-options-dropdown" style="display:none;">
        ${isOwner ? `
          <button class="post-options-item" onclick="window._openEditPost('${post.id}')">Editar post</button>
          <button class="post-options-item" onclick="window._pinPost('${post.id}')">
            ${isPinned ? 'Desfixar do perfil' : 'Fixar no perfil'}
          </button>
          <button class="post-options-item danger" onclick="window._deletePost('${post.id}')">Excluir post</button>
        ` : ''}
        <button class="post-options-item" onclick="window._bookmarkPost('${post.id}')">
          ${bookmarked ? 'Remover dos salvos' : 'Salvar post'}
        </button>
        ${!isOwner ? `<button class="post-options-item danger" onclick="window._reportUser('${post.authorId}')">Reportar</button>` : ''}
      </div>

      ${post.text ? `<div class="post-text">${post.text}${post.tag ? `<span class="post-tag">${post.tag}</span>` : ''}</div>` : ''}
      ${ratingHtml}
      ${renderLyricsCard(post)}
      ${imageHtml}
      ${songHtml}

      <div class="post-actions">
        <button class="btn-post-action${liked ? ' liked' : ''}" onclick="window._likePost('${post.id}', this)">
          ${liked ? ICONS.heartFilled : ICONS.heartEmpty}
          <span class="like-count">${(post.likes || []).length}</span>
        </button>
        <button class="btn-post-action" onclick="window._toggleComments('${post.id}')">
          ${ICONS.chat}
          <span>${(post.comments || []).length}</span>
        </button>
        <button class="btn-post-action${reposted ? ' reposted' : ''}" onclick="window._repostPost('${post.id}', this)">
          ${ICONS.repost || ICONS.refresh}
          <span class="repost-count">${(post.reposts || []).length}</span>
        </button>
        <button class="btn-post-action${bookmarked ? ' bookmarked' : ''}" onclick="window._bookmarkPost('${post.id}')">
          ${ICONS.bookmark || ICONS.attach}
        </button>
      </div>

      <div id="comments-${post.id}" class="post-comments-section" style="display:none;">
        ${commentsHtml}
        <div class="comment-input-row">
          <input class="doodle-input" id="comment-input-${post.id}" placeholder="Comentar..." style="font-size:0.8rem;padding:5px 10px;" onkeydown="if(event.key==='Enter'){window._submitComment('${post.id}')}">
          <button class="doodle-btn doodle-btn-primary doodle-btn-sm" onclick="window._submitComment('${post.id}')">Enviar</button>
        </div>
      </div>
    </div>`;
}

// ──────────────────────────────────────────
// POST CREATOR
// ──────────────────────────────────────────

export let creatorState = {
  selectedSong: null,
  lyricsText: '',
  lyricsSong: '',
  lyricsArt: '',
  lyricsCardStyle: 'compact',
  rating: 0,
  tag: '#música',
  showLyrics: false
};

export function renderPostCreator(containerEl) {
  const activeUser = Storage.getActiveUser();
  const creatorAvatarHtml = activeUser.avatar && (activeUser.avatar.startsWith('http') || activeUser.avatar.startsWith('data:') || activeUser.avatar.startsWith('/'))
    ? `<img src="${activeUser.avatar}" alt="${activeUser.name}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
    : (activeUser.avatar || activeUser.name?.[0] || 'U');

  containerEl.innerHTML = `
    <div class="create-post-card">
      <div class="create-post-top">
        <div class="creator-avatar">${creatorAvatarHtml}</div>
        <div class="creator-fields">
          <textarea id="creator-text" class="create-post-textarea" placeholder="Compartilhe algo..."></textarea>
          <div id="creator-lyrics-attach" style="display:none"></div>
          <div id="creator-song-attach" style="display:none"></div>
          <div id="creator-rating-attach" style="display:none"></div>
        </div>
      </div>
      <div class="creator-action-bar">
        <div class="creator-attach-btns">
          <button class="btn-attach" onclick="window._creatorToggleLyrics()">${ICONS.music} Letra</button>
          <button class="btn-attach" onclick="window._creatorOpenSearch()">${ICONS.search} Música</button>
          <button class="btn-attach" onclick="window._creatorToggleRating()">${getStarSVG(1,16)} Nota</button>
        </div>
        <select id="creator-tag" class="doodle-input" style="width:auto;padding:4px 8px;font-size:0.78rem;">
          <option value="#música">#música</option>
          <option value="#letra">#letra</option>
          <option value="#desabafo">#desabafo</option>
          <option value="#descoberta">#descoberta</option>
          <option value="#recomendo">#recomendo</option>
        </select>
        <button class="doodle-btn doodle-btn-primary" onclick="window._submitPost()">Postar</button>
      </div>
    </div>`;

  // Re-bind creator global handlers
  window._creatorToggleLyrics = () => {
    creatorState.showLyrics = !creatorState.showLyrics;
    const el = document.getElementById('creator-lyrics-attach');
    if (!el) return;
    if (creatorState.showLyrics) {
      // Pick a random card style
      const lyricData = getRandomLyric();
      creatorState.lyricsText = lyricData.lyrics;
      creatorState.lyricsSong = `${lyricData.song} — ${lyricData.artist}`;
      creatorState.lyricsArt = lyricData.albumArt || '';
      creatorState.lyricsCardStyle = getRandomCardStyle();
      el.style.display = 'block';
      el.innerHTML = `
        <div class="creator-lyrics-box">
          <div class="creator-lyrics-header">
            <div style="display:flex;align-items:center;gap:6px;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>
              <span style="font-weight:700;color:var(--white);">Letra Anexada</span>
            </div>
            <div style="flex:1;display:flex;gap:6px;align-items:center;justify-content:flex-end;">
              <label class="form-label" style="margin:0;font-size:0.72rem;">Estilo:</label>
              <select id="lyrics-style-sel" style="background:var(--bg-input);border:var(--border);border-radius:6px;color:var(--white);font-family:var(--font);font-size:0.72rem;padding:2px 4px;" onchange="creatorState.lyricsCardStyle=this.value">
                <option value="compact"${creatorState.lyricsCardStyle==='compact'?' selected':''}>Compacto</option>
                <option value="with-cover"${creatorState.lyricsCardStyle==='with-cover'?' selected':''}>Com Capa</option>
                <option value="full-bleed"${creatorState.lyricsCardStyle==='full-bleed'?' selected':''}>Fundo Total</option>
              </select>
              <button type="button" class="btn-attach" style="color:#ff5555;border-color:rgba(255,85,85,0.4);" onclick="window._creatorRemoveLyrics()">Cancelar Letra ✕</button>
            </div>
          </div>

          <!-- iTunes Search Song Row -->
          <div id="creator-lyrics-song-preview" style="display:flex;align-items:center;justify-content:space-between;background:var(--bg-surface);border:1px solid var(--purple-accent);border-radius:var(--radius-md);padding:6px 10px;margin-bottom:8px;">
            <div style="display:flex;align-items:center;gap:8px;min-width:0;flex:1;">
              <img id="creator-lyrics-preview-img" src="${creatorState.lyricsArt || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80'}" style="width:34px;height:34px;border-radius:6px;object-fit:cover;flex-shrink:0;">
              <div style="min-width:0;flex:1;">
                <div id="creator-lyrics-preview-title" style="font-size:0.82rem;font-weight:700;color:var(--white);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${creatorState.lyricsSong}</div>
                <div style="font-size:0.68rem;color:var(--purple-light);">Música vinculada à letra</div>
              </div>
            </div>
            <button type="button" class="doodle-btn doodle-btn-primary doodle-btn-sm" style="font-size:0.75rem;padding:4px 10px;display:flex;align-items:center;gap:5px;flex-shrink:0;" onclick="window._openSearchForLyrics()">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
              Buscar no iTunes
            </button>
          </div>

          <textarea id="creator-lyrics" class="creator-lyrics-textarea" placeholder="Cole os versos ou trecho da letra aqui..." oninput="window._creatorLyricsChanged()">${lyricData.lyrics}</textarea>
          
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:6px;">
            <input class="doodle-input" id="creator-lyrics-song" placeholder="Música — Artista" value="${lyricData.song} — ${lyricData.artist}" style="font-size:0.78rem;padding:4px 8px;" oninput="window._creatorLyricsChanged()">
            <input class="doodle-input" id="creator-lyrics-art" placeholder="URL da capa (opcional)" value="${lyricData.albumArt||''}" style="font-size:0.78rem;padding:4px 8px;" oninput="window._creatorLyricsChanged()">
          </div>
        </div>`;
    } else {
      window._creatorRemoveLyrics();
    }
  };

  window._setCreatorLyricsSong = (track) => {
    creatorState.lyricsSong = `${track.title} — ${track.artist}`;
    creatorState.lyricsArt = track.artwork;
    creatorState.selectedLyricsTrack = track;

    const songInp = document.getElementById('creator-lyrics-song');
    const artInp = document.getElementById('creator-lyrics-art');
    const prevTitle = document.getElementById('creator-lyrics-preview-title');
    const prevImg = document.getElementById('creator-lyrics-preview-img');

    if (songInp) songInp.value = creatorState.lyricsSong;
    if (artInp) artInp.value = creatorState.lyricsArt;
    if (prevTitle) prevTitle.textContent = creatorState.lyricsSong;
    if (prevImg) prevImg.src = creatorState.lyricsArt;
  };

  window._creatorRemoveLyrics = () => {
    creatorState.showLyrics = false;
    creatorState.lyricsText = '';
    creatorState.lyricsSong = '';
    creatorState.lyricsArt = '';
    const el = document.getElementById('creator-lyrics-attach');
    if (el) {
      el.style.display = 'none';
      el.innerHTML = '';
    }
  };

  window._creatorLyricsChanged = () => {
    creatorState.lyricsText = document.getElementById('creator-lyrics')?.value || '';
    creatorState.lyricsSong = document.getElementById('creator-lyrics-song')?.value || '';
    creatorState.lyricsArt = document.getElementById('creator-lyrics-art')?.value || '';
    creatorState.lyricsCardStyle = document.getElementById('lyrics-style-sel')?.value || 'compact';

    const prevTitle = document.getElementById('creator-lyrics-preview-title');
    const prevImg = document.getElementById('creator-lyrics-preview-img');
    if (prevTitle && creatorState.lyricsSong) prevTitle.textContent = creatorState.lyricsSong;
    if (prevImg && creatorState.lyricsArt) prevImg.src = creatorState.lyricsArt;
  };

  window._creatorToggleRating = () => {
    const el = document.getElementById('creator-rating-attach');
    if (!el) return;
    if (el.style.display === 'none' || !el.style.display) {
      el.style.display = 'block';
      renderCreatorRating(el);
    } else {
      el.style.display = 'none';
      creatorState.rating = 0;
    }
  };
}

function renderCreatorRating(el) {
  const currentRating = creatorState.rating || 0;
  const presets = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0];

  el.innerHTML = `
    <div class="creator-rating-row" style="display:flex;flex-direction:column;gap:8px;background:var(--bg-surface);border:1px solid var(--purple-accent);border-radius:var(--radius-md);padding:10px 12px;margin-top:8px;">
      <div style="display:flex;align-items:center;justify-content:space-between;width:100%;">
        <span class="form-label" style="margin:0;font-weight:700;color:var(--white);">Nota para a música:</span>
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="rating-value-badge" style="font-size:0.9rem;font-weight:800;color:#ffb800;background:rgba(255,184,0,0.12);padding:2px 8px;border-radius:var(--radius-pill);border:1px solid rgba(255,184,0,0.3);">
            ${currentRating > 0 ? `★ ${currentRating.toFixed(1)}` : 'Sem nota'}
          </span>
          ${currentRating > 0 ? `<button type="button" class="doodle-btn doodle-btn-ghost doodle-btn-sm" style="font-size:0.7rem;padding:2px 6px;" onclick="window._pickStar(0)">Limpar</button>` : ''}
        </div>
      </div>

      <!-- 5 Interactive Stars with Half-Star Click Zones -->
      <div id="creator-stars-row" style="display:flex;gap:6px;align-items:center;padding:4px 0;">
        ${[1, 2, 3, 4, 5].map(n => {
          const fill = currentRating >= n ? 1 : (currentRating >= n - 0.5 ? 0.5 : 0);
          return `
            <div style="position:relative;display:inline-block;cursor:pointer;line-height:0;" title="${n-0.5} ou ${n}">
              ${getStarSVG(fill, 28)}
              <!-- Left half click target (.5) -->
              <div onclick="window._pickStar(${n - 0.5})" style="position:absolute;top:0;left:0;width:50%;height:100%;z-index:2;" title="Nota ${n - 0.5}"></div>
              <!-- Right half click target (.0) -->
              <div onclick="window._pickStar(${n})" style="position:absolute;top:0;right:0;width:50%;height:100%;z-index:2;" title="Nota ${n}.0"></div>
            </div>`;
        }).join('')}
      </div>

      <!-- Quick Decimal Rating Preset Pills -->
      <div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center;">
        ${presets.map(p => `
          <button type="button" class="rating-preset-btn${currentRating === p ? ' active' : ''}" onclick="window._pickStar(${p})" style="padding:2px 6px;font-size:0.72rem;background:${currentRating === p ? 'rgba(255,184,0,0.2)' : 'var(--bg-card)'};border:1px solid ${currentRating === p ? '#ffb800' : 'var(--border)'};color:${currentRating === p ? '#ffb800' : 'var(--muted)'};border-radius:4px;cursor:pointer;">
            ${p.toFixed(1)}
          </button>
        `).join('')}
      </div>
    </div>`;

  window._pickStar = (val) => {
    creatorState.rating = val;
    renderCreatorRating(el);
  };
}

// ──────────────────────────────────────────
// FEED RENDERING
// ──────────────────────────────────────────

export function renderFeed(container, filterMode = 'all') {
  const posts = Storage.getFeedPosts(filterMode);
  const activeUser = Storage.getActiveUser();

  if (!posts.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-title">Nada por aqui ainda</div><div class="empty-state-sub">${filterMode === 'following' ? 'Siga alguém para ver os posts deles.' : 'Seja o primeiro a postar algo!'}</div></div>`;
    return;
  }

  container.innerHTML = `<div class="feed-posts-list">${posts.map(p => renderPostCard(p)).join('')}</div>`;

  // Close options dropdowns on outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.post-options-btn') && !e.target.closest('.post-options-dropdown')) {
      document.querySelectorAll('.post-options-dropdown').forEach(d => d.style.display = 'none');
    }
  });
}

// ──────────────────────────────────────────
// LYRIC OF THE DAY WIDGET
// ──────────────────────────────────────────

let cachedLyricOfDay = null;
let cachedLyricCardStyle = null;

export function renderLyricWidget(container, forceNew = false) {
  if (!cachedLyricOfDay || forceNew) {
    cachedLyricOfDay = getRandomLyric();
    cachedLyricCardStyle = getRandomCardStyle();
  }

  const lyric = cachedLyricOfDay;
  const art = lyric.albumArt || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80';
  const trackObj = {
    title: lyric.song,
    artist: lyric.artist,
    artwork: art,
    duration: '3:30'
  };

  container.innerHTML = `
    <div class="lyric-widget-immersive" style="position:relative;overflow:hidden;border-radius:0 0 var(--radius-lg) var(--radius-lg);padding:14px;min-height:125px;display:flex;flex-direction:column;justify-content:space-between;">
      <!-- Blurred Atmospheric Cover Background -->
      <img src="${art}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:blur(14px) brightness(0.22) saturate(1.5);transform:scale(1.18);pointer-events:none;z-index:0;">
      <div style="position:absolute;inset:0;background:linear-gradient(135deg, rgba(20, 10, 35, 0.72), rgba(5, 2, 10, 0.88));z-index:1;"></div>

      <!-- Lyric Text -->
      <div style="position:relative;z-index:2;margin-bottom:10px;">
        <div style="font-size:0.92rem;line-height:1.42;color:#ffffff;font-style:italic;font-weight:600;text-shadow:0 2px 10px rgba(0,0,0,0.9);">
          "${lyric.lyrics}"
        </div>
      </div>

      <!-- Song Attribution Bar with Play and Search Lupa -->
      <div style="position:relative;z-index:2;display:flex;align-items:center;gap:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.14);">
        <img src="${art}" alt="${lyric.song}" style="width:34px;height:34px;border-radius:6px;object-fit:cover;flex-shrink:0;border:1px solid rgba(255,255,255,0.22);box-shadow:0 2px 8px rgba(0,0,0,0.6);cursor:pointer;" onclick="window._playTrack(${JSON.stringify(trackObj).replace(/"/g, '&quot;')})" title="Ouvir música no iTunes">
        <div style="min-width:0;flex:1;cursor:pointer;" onclick="window._playTrack(${JSON.stringify(trackObj).replace(/"/g, '&quot;')})" title="Clique para ouvir">
          <div style="font-size:0.8rem;font-weight:700;color:#ffffff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${lyric.song}</div>
          <div style="font-size:0.68rem;color:rgba(255,255,255,0.7);">${lyric.artist}${lyric.year ? ` &bull; ${lyric.year}` : ''}</div>
        </div>
        <div style="display:flex;align-items:center;gap:3px;flex-shrink:0;">
          <button type="button" class="doodle-btn doodle-btn-ghost doodle-btn-sm" style="padding:4px 6px;color:var(--purple-light);border-radius:50%;" onclick="window._playTrack(${JSON.stringify(trackObj).replace(/"/g, '&quot;')})" title="Ouvir prévia no iTunes">
            ${ICONS.play}
          </button>
          <button type="button" class="doodle-btn doodle-btn-ghost doodle-btn-sm" style="padding:4px 6px;color:var(--purple-light);border-radius:50%;" onclick="window._searchLyricSong('${lyric.song.replace(/'/g, "\\'")}', '${lyric.artist.replace(/'/g, "\\'")}')" title="Buscar no catálogo do iTunes">
            ${ICONS.search}
          </button>
        </div>
      </div>
    </div>`;
}

// ──────────────────────────────────────────
// TRENDING WIDGET (LAST.FM CHARTS API)
// ──────────────────────────────────────────

let cachedTrendingList = null;

export async function renderTrendingWidget(container) {
  if (!container) return;

  if (cachedTrendingList) {
    drawTrendingHtml(container, cachedTrendingList);
    return;
  }

  container.innerHTML = `
    <div style="padding:14px;text-align:center;color:var(--purple-light);font-size:0.75rem;">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="animation:spin 1s linear infinite;display:inline-block;vertical-align:middle;margin-right:4px;"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
      Carregando tendências do Last.fm...
    </div>`;

  try {
    const tracks = await fetchLastFmTrendingTracks(5);
    cachedTrendingList = tracks;
    drawTrendingHtml(container, tracks);
  } catch (err) {
    container.innerHTML = `<div class="notif-empty" style="padding:12px">Não foi possível carregar tendências no momento.</div>`;
  }
}

function drawTrendingHtml(container, tracks) {
  if (!tracks || !tracks.length) {
    container.innerHTML = `<div class="notif-empty" style="padding:12px">Sem dados de tendências.</div>`;
    return;
  }

  container.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:1px;">
      ${tracks.map((s, i) => `
        <div class="trending-item" style="cursor:pointer;" onclick="window._playTrack(${JSON.stringify(s).replace(/"/g, '&quot;')})" title="Ouvir prévia de ${s.title}">
          <span class="trending-rank">#${i + 1}</span>
          <img class="trending-cover" src="${s.artwork}" alt="${s.title}" onerror="this.src='https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80'">
          <div class="trending-info">
            <div class="trending-title">${s.title}</div>
            <div class="trending-artist" onclick="event.stopPropagation();window._searchArtistInCatalog('${s.artist.replace(/'/g, "\\'")}')" style="cursor:pointer;" title="Ver mais de ${s.artist}">${s.artist}</div>
          </div>
          <button type="button" class="doodle-btn doodle-btn-ghost doodle-btn-sm" style="padding:3px 6px;color:var(--purple-light);border-radius:50%;" onclick="event.stopPropagation();window._playTrack(${JSON.stringify(s).replace(/"/g, '&quot;')})">
            ${ICONS.play}
          </button>
        </div>
      `).join('')}
    </div>`;
}

// ──────────────────────────────────────────
// FRIENDS WIDGET (online simulation)
// ──────────────────────────────────────────

export function renderFriendsWidget(container) {
  const activeUser = Storage.getActiveUser();
  const following = Storage.getFollowing(activeUser.id);
  const users = Storage.getAllUsers().filter(u => following.includes(u.id));

  if (!users.length) {
    container.innerHTML = `<div class="notif-empty" style="padding:14px;font-size:0.78rem;text-align:center;">Você ainda não segue ninguém.</div>`;
    return;
  }

  container.innerHTML = users.map(u => {
    const isImage = u.avatar && (u.avatar.startsWith('http') || u.avatar.startsWith('data:') || u.avatar.startsWith('/'));
    const avatarHtml = isImage
      ? `<img class="friend-avatar" src="${u.avatar}" alt="${u.name}" style="width:30px;height:30px;min-width:30px;aspect-ratio:1/1;border-radius:50%;object-fit:cover;flex-shrink:0;">`
      : `<div class="friend-avatar" style="width:30px;height:30px;min-width:30px;aspect-ratio:1/1;border-radius:50%;background:var(--purple-dark);color:var(--purple-light);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.75rem;border:1px solid var(--purple-mid);flex-shrink:0;">${u.avatar || u.name[0]}</div>`;

    return `
      <div class="friend-item" onclick="window._goToProfile('${u.id}')" style="display:flex;align-items:center;gap:10px;padding:8px 12px;cursor:pointer;">
        <div class="friend-online-dot" style="width:7px;height:7px;border-radius:50%;background:#10b981;flex-shrink:0;box-shadow:0 0 6px #10b981;"></div>
        ${avatarHtml}
        <div style="flex:1;min-width:0;">
          <div style="font-size:0.82rem;font-weight:700;color:var(--white);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${u.name}</div>
          <div style="font-size:0.7rem;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${u.status || u.handle || 'online'}</div>
        </div>
      </div>`;
  }).join('');
}
