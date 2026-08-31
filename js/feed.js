// Feed module — post creation, rendering, interactions, lyric cards
import * as Storage from './storage.js';
import { globalAudio } from './audio.js';
import { ICONS, getStarSVG, renderRatingStars } from './icons.js';
import { searchTracks } from './api.js';
import { getRandomLyric, getRandomCardStyle } from './lyrics_db.js';

// ──────────────────────────────────────────
// RENDER HELPERS
// ──────────────────────────────────────────

function renderLyricsCard(post) {
  if (!post.lyrics) return '';
  const text = post.lyrics;
  const attr = post.lyricsSong ? `<span class="lyrics-song-attr">— ${post.lyricsSong}</span>` : '';
  const style = post.lyricsCardStyle || 'compact';

  if (style === 'with-cover' && post.lyricsArt) {
    return `
      <div class="lyrics-card-cover">
        <img class="lyrics-cover-img" src="${post.lyricsArt}" alt="cover" loading="lazy" onerror="this.style.display='none'">
        <div>
          <div class="lyrics-text">${text}</div>
          ${attr}
        </div>
      </div>`;
  }
  if (style === 'full-bleed' && post.lyricsArt) {
    return `
      <div class="lyrics-card-fullbleed">
        <img class="lyrics-bg-image" src="${post.lyricsArt}" alt="" loading="lazy">
        <div class="lyrics-fullbleed-content">
          <div class="lyrics-text">${text}</div>
          ${attr}
        </div>
      </div>`;
  }
  // compact (default)
  return `
    <div class="lyrics-card-compact">
      <div class="lyrics-text">${text}</div>
      ${attr}
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

let creatorState = {
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
      creatorState.lyricsArt = lyricData.albumArt || '';
      creatorState.lyricsCardStyle = getRandomCardStyle();
      el.style.display = 'block';
      el.innerHTML = `
        <div class="creator-lyrics-box">
          <div class="creator-lyrics-header">
            <span>Letra</span>
            <div style="flex:1;display:flex;gap:6px;align-items:center;justify-content:flex-end;">
              <label class="form-label" style="margin:0">Estilo:</label>
              <select id="lyrics-style-sel" style="background:var(--bg-input);border:var(--border);border-radius:6px;color:var(--white);font-family:var(--font);font-size:0.72rem;padding:2px 4px;" onchange="creatorState.lyricsCardStyle=this.value">
                <option value="compact"${creatorState.lyricsCardStyle==='compact'?' selected':''}>Compacto</option>
                <option value="with-cover"${creatorState.lyricsCardStyle==='with-cover'?' selected':''}>Com Capa</option>
                <option value="full-bleed"${creatorState.lyricsCardStyle==='full-bleed'?' selected':''}>Fundo</option>
              </select>
              <button class="btn-attach" onclick="window._creatorToggleLyrics()">Remover</button>
            </div>
          </div>
          <textarea id="creator-lyrics" class="creator-lyrics-textarea" placeholder="Cole a letra aqui..." onchange="window._creatorLyricsChanged()">${lyricData.lyrics}</textarea>
          <input class="doodle-input" id="creator-lyrics-song" placeholder="Música — Artista" value="${lyricData.song} — ${lyricData.artist}" style="font-size:0.78rem;padding:4px 8px;margin-top:5px;" onchange="window._creatorLyricsChanged()">
          <input class="doodle-input" id="creator-lyrics-art" placeholder="URL da capa (opcional)" value="${lyricData.albumArt||''}" style="font-size:0.78rem;padding:4px 8px;margin-top:4px;" onchange="window._creatorLyricsChanged()">
        </div>`;
    } else {
      el.style.display = 'none';
      creatorState.lyricsText = '';
      creatorState.lyricsSong = '';
      creatorState.lyricsArt = '';
    }
  };

  window._creatorLyricsChanged = () => {
    creatorState.lyricsText = document.getElementById('creator-lyrics')?.value || '';
    creatorState.lyricsSong = document.getElementById('creator-lyrics-song')?.value || '';
    creatorState.lyricsArt = document.getElementById('creator-lyrics-art')?.value || '';
    creatorState.lyricsCardStyle = document.getElementById('lyrics-style-sel')?.value || 'compact';
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
  el.innerHTML = `
    <div class="creator-rating-row">
      <span class="form-label" style="margin:0">Nota da música:</span>
      <div id="creator-stars-row" style="display:flex;gap:4px;">
        ${[1,2,3,4,5].map(n => `
          <button class="star-pick-btn" data-val="${n}" onmouseover="window._hoverStar(${n})" onmouseout="window._hoverStar(0)" onclick="window._pickStar(${n})">
            ${getStarSVG(creatorState.rating >= n ? 1 : (creatorState.rating >= n - 0.5 ? 0.5 : 0), 26)}
          </button>
          <button class="star-pick-btn" data-val="${n-0.5}" onmouseover="window._hoverStar(${n - 0.5})" onmouseout="window._hoverStar(0)" onclick="window._pickStar(${n - 0.5})" style="margin-left:-22px;clip-path:inset(0 50% 0 0);opacity:0.01;position:absolute;">
          </button>`).join('')}
      </div>
      <span class="rating-value-badge">${creatorState.rating > 0 ? creatorState.rating.toFixed(1) : '—'}</span>
    </div>`;

  window._pickStar = (val) => {
    creatorState.rating = val;
    renderCreatorRating(el);
  };
  window._hoverStar = (val) => {};
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
  const style = cachedLyricCardStyle;

  let inner = '';
  if (style === 'with-cover' && lyric.albumArt) {
    inner = `
      <div class="lyric-widget-cover">
        <img src="${lyric.albumArt}" alt="cover" onerror="this.style.display='none'" style="width:56px;height:56px;border-radius:8px;object-fit:cover;flex-shrink:0;">
        <div>
          <div class="lyric-widget-text">${lyric.lyrics}</div>
          <div class="lyric-widget-attr">${lyric.song} — ${lyric.artist}</div>
        </div>
      </div>`;
  } else if (style === 'full-bleed' && lyric.albumArt) {
    inner = `
      <div style="position:relative;border-radius:0 0 12px 12px;overflow:hidden;min-height:90px;display:flex;align-items:flex-end;">
        <img src="${lyric.albumArt}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:brightness(0.3) saturate(0.5);">
        <div style="position:relative;z-index:1;padding:10px 12px;width:100%;background:linear-gradient(transparent,rgba(0,0,0,0.6));">
          <div class="lyric-widget-text">${lyric.lyrics}</div>
          <div class="lyric-widget-attr">${lyric.song} — ${lyric.artist}</div>
        </div>
      </div>`;
  } else {
    inner = `
      <div class="lyric-widget-compact">
        <div class="lyric-widget-text">${lyric.lyrics}</div>
        <div class="lyric-widget-attr">${lyric.song} — ${lyric.artist}, ${lyric.year}</div>
      </div>`;
  }

  container.innerHTML = inner;
}

// ──────────────────────────────────────────
// TRENDING WIDGET
// ──────────────────────────────────────────

export function renderTrendingWidget(container) {
  // Count most picked songs from challenge answers
  const users = Storage.getAllUsers();
  const songCount = {};

  users.forEach(u => {
    const answers = Storage.getChallengeAnswers(Storage.getActiveChallengeId(), u.id);
    Object.values(answers).forEach(ans => {
      if (ans && ans.title) {
        const key = `${ans.title}|||${ans.artist}`;
        if (!songCount[key]) songCount[key] = { title: ans.title, artist: ans.artist, artwork: ans.artwork, count: 0 };
        songCount[key].count++;
      }
    });
  });

  const sorted = Object.values(songCount).sort((a, b) => b.count - a.count).slice(0, 5);

  if (!sorted.length) {
    container.innerHTML = `<div class="notif-empty" style="padding:12px">Ainda sem dados de tendências.</div>`;
    return;
  }

  container.innerHTML = sorted.map((s, i) => `
    <div class="trending-item">
      <span class="trending-rank">${i + 1}</span>
      ${s.artwork ? `<img class="trending-cover" src="${s.artwork}" alt="">` : '<div class="trending-cover" style="background:var(--purple-dark);border-radius:5px;"></div>'}
      <div class="trending-info">
        <div class="trending-title">${s.title}</div>
        <div class="trending-artist">${s.artist}</div>
      </div>
      <span class="trending-count">${s.count}x</span>
    </div>`).join('');
}

// ──────────────────────────────────────────
// FRIENDS WIDGET (online simulation)
// ──────────────────────────────────────────

export function renderFriendsWidget(container) {
  const following = Storage.getFollowing();
  const users = Storage.getAllUsers().filter(u => following.includes(u.id));

  if (!users.length) {
    container.innerHTML = `<div class="notif-empty" style="padding:10px;font-size:0.78rem;">Siga alguém para ver aqui.</div>`;
    return;
  }

  container.innerHTML = users.map(u => `
    <div class="friend-item" onclick="window._goToProfile('${u.id}')">
      <div class="friend-online-dot"></div>
      <div class="post-author-avatar" style="width:26px;height:26px;font-size:11px;border-radius:50%;background:var(--purple-dark);color:var(--purple-light);display:flex;align-items:center;justify-content:center;font-weight:700;border:1px solid var(--purple-mid);">${u.avatar || u.name[0]}</div>
      <div>
        <div style="font-size:0.78rem;font-weight:700;color:var(--white)">${u.name}</div>
        <div style="font-size:0.68rem;color:var(--muted)">${u.status || 'offline'}</div>
      </div>
    </div>`).join('');
}
