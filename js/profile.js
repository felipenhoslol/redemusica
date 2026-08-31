// Profile module — render, edit, follow, pin, showcase, sub-tabs
import * as Storage from './storage.js';
import { ICONS, renderRatingStars } from './icons.js';
import { renderPostCard } from './feed.js';
import { openSearchModalForFeaturedSong } from './ui.js';

// ──────────────────────────────────────────
// PROFILE RENDER
// ──────────────────────────────────────────

export function renderProfileView(container, targetUserId) {
  const user = Storage.getUserById(targetUserId) || Storage.getActiveUser();
  const activeUser = Storage.getActiveUser();
  const isMe = user.id === activeUser.id;
  const following = Storage.isFollowing(user.id);
  const followers = Storage.getFollowers(user.id);
  const followingList = Storage.getFollowing(user.id);

  // Apply custom CSS variables
  const cssVars = `
    --profile-card-bg:      ${user.profileBgColor || 'var(--bg-card)'};
    --profile-text-color:   ${user.profileTextColor || 'var(--white)'};
    --profile-status-color: ${user.profileStatusColor || 'var(--muted)'};
    --profile-featured-bg:  ${user.profileFeaturedColor || 'var(--bg-selected)'};
    --profile-accent:       ${user.profileAccentColor || 'var(--purple-accent)'};
  `;

  const featuredHtml = user.featuredSong ? `
    <div class="featured-song-box" style="${cssVars}">
      <div class="featured-label">Destaque</div>
      <img class="featured-vinyl" id="featured-vinyl-img"
        src="${user.featuredSong.artwork || ''}"
        alt="${user.featuredSong.title}"
        onerror="this.style.display='none'">
      <div class="featured-info">
        <div class="featured-title">${user.featuredSong.title}</div>
        <div class="featured-artist">${user.featuredSong.artist}</div>
      </div>
      <div style="display:flex;gap:6px;align-items:center;">
        ${isMe ? `
          <button class="doodle-btn doodle-btn-ghost doodle-btn-sm" onclick="window._editFeaturedSong()" title="Alterar música de destaque">
            Alterar
          </button>
        ` : ''}
        <button class="doodle-btn doodle-btn-ghost doodle-btn-sm" onclick="window._playTrack(${JSON.stringify(user.featuredSong).replace(/"/g, '&quot;')})">
          ${ICONS.play}
        </button>
      </div>
    </div>` : (isMe ? `
    <div class="featured-song-box empty" style="${cssVars};cursor:pointer;justify-content:center;padding:12px 16px;" onclick="window._editFeaturedSong()">
      <span style="font-size:0.82rem;color:var(--purple-light);font-weight:700;display:flex;align-items:center;gap:6px;">
        🎵 + Escolher Música em Destaque
      </span>
    </div>` : '');

  const showcaseHtml = buildShowcaseHtml(user, isMe);
  const topArtistsHtml = buildTopArtistsMonthHtml(user, isMe);

  const bannerStyle = user.bannerUrl
    ? `background-image:url('${user.bannerUrl}');background-size:cover;background-position:center;`
    : `background:linear-gradient(135deg, ${user.themeColor || '#130c1e'}, #000);`;

  const isImageAvatar = user.avatar && (user.avatar.startsWith('http') || user.avatar.startsWith('data:') || user.avatar.startsWith('/'));
  const avatarInner = isImageAvatar
    ? `<img src="${user.avatar}" alt="${user.name}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
    : (user.avatar || user.name?.[0] || 'U');

  const avatarHtml = `
    <div class="profile-avatar-wrap" ${isMe ? 'onclick="window._editAvatar()" title="Alterar foto de perfil"' : ''}>
      <div class="profile-main-avatar">
        ${avatarInner}
      </div>
      ${isMe ? `
        <div class="avatar-edit-overlay">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
        </div>` : ''}
    </div>`;

  container.innerHTML = `
    <div class="profile-wrap" style="${cssVars}">
      <div class="profile-banner" style="${bannerStyle}">
        ${isMe ? `<button class="btn-edit-banner" onclick="window._editBanner()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg> Alterar banner</button>` : ''}
      </div>
      <div class="profile-info-card" style="background:${user.profileBgColor||'var(--bg-card)'}">
        <div class="profile-top-row">
          ${avatarHtml}
          <div class="profile-action-row">
            ${!isMe ? `
              <button class="doodle-btn doodle-btn-follow${following ? ' following' : ''}" id="follow-btn-${user.id}"
                onclick="window._toggleFollow('${user.id}')">
                ${following ? 'Seguindo' : 'Seguir'}
              </button>
              <button class="doodle-btn doodle-btn-ghost doodle-btn-sm" onclick="window._openDMWith('${user.id}')">
                ${ICONS.chat}
              </button>
            ` : `
              <button class="doodle-btn doodle-btn-secondary doodle-btn-sm" onclick="window._openProfileEdit()">
                ${ICONS.edit} Editar
              </button>
            `}
          </div>
        </div>
        <div class="profile-details">
          <div class="profile-name">${user.name}</div>
          <div class="profile-handle">${user.handle || '@' + user.name.toLowerCase()}</div>
          <!-- Inline editable status (shown above actions) -->
          <div class="profile-status-wrap">
            ${isMe ? `
              <div id="status-display" class="profile-status-pill" onclick="window._startEditStatus()">
                <span id="status-text">${user.status || 'Adicionar status...'}</span>
                ${ICONS.edit}
              </div>
              <div id="status-form" class="inline-status-form" style="display:none;">
                <input id="status-input" class="inline-status-input" value="${user.status || ''}" placeholder="Status..." maxlength="60">
                <button class="doodle-btn doodle-btn-primary doodle-btn-sm" onclick="window._saveStatus()">Ok</button>
                <button class="doodle-btn doodle-btn-ghost doodle-btn-sm" onclick="window._cancelEditStatus()">X</button>
              </div>
            ` : `
              <div class="profile-status-pill" style="cursor:default;">
                ${user.status || ''}
              </div>
            `}
          </div>
          <div class="profile-bio">${user.bio || ''}</div>
        </div>
        <div class="profile-stats-row">
          <div class="profile-stat" onclick="window._showFollowList('${user.id}', 'following')">
            <strong>${followingList.length}</strong><span>seguindo</span>
          </div>
          <div class="profile-stat" onclick="window._showFollowList('${user.id}', 'followers')">
            <strong>${followers.length}</strong><span>seguidores</span>
          </div>
        </div>
        ${featuredHtml}
        ${topArtistsHtml}
        ${showcaseHtml}
        <div class="profile-subtabs">
          <button class="profile-subtab-btn active" data-profile-tab="posts" onclick="window._switchProfileTab('posts', this)">Posts</button>
          <button class="profile-subtab-btn" data-profile-tab="lista" onclick="window._switchProfileTab('lista', this)">Lista</button>
          <button class="profile-subtab-btn" data-profile-tab="avaliados" onclick="window._switchProfileTab('avaliados', this)">Avaliados</button>
          ${isMe ? `<button class="profile-subtab-btn" data-profile-tab="salvos" onclick="window._switchProfileTab('salvos', this)">Salvos</button>` : ''}
        </div>
      </div>

      <!-- Sub-tab content -->
      <div id="profile-tab-posts"   class="profile-subtab-content" style="margin-top:10px;"></div>
      <div id="profile-tab-lista"   class="profile-subtab-content" style="display:none;margin-top:10px;"></div>
      <div id="profile-tab-avaliados" class="profile-subtab-content" style="display:none;margin-top:10px;"></div>
      ${isMe ? `<div id="profile-tab-salvos" class="profile-subtab-content" style="display:none;margin-top:10px;"></div>` : ''}
    </div>`;

  // Load default tab
  loadProfileTab('posts', user.id);

  // Global helper to search for artist songs in the app
  window._searchArtistInCatalog = (artistName) => {
    if (window._switchTabFn) {
      window._switchTabFn('search');
      setTimeout(() => {
        const inp = document.getElementById('global-search-input');
        if (inp) {
          inp.value = artistName;
          inp.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }, 100);
    }
  };

  // Inline status editing
  window._startEditStatus = () => {
    document.getElementById('status-display').style.display = 'none';
    document.getElementById('status-form').style.display = 'flex';
    document.getElementById('status-input').focus();
  };

  window._cancelEditStatus = () => {
    document.getElementById('status-display').style.display = '';
    document.getElementById('status-form').style.display = 'none';
  };

  window._saveStatus = () => {
    const val = document.getElementById('status-input')?.value?.trim() || '';
    Storage.updateUser(activeUser.id, { status: val });
    document.getElementById('status-text').textContent = val || 'Adicionar status...';
    window._cancelEditStatus();
  };

  window._switchProfileTab = (tabId, btn) => {
    document.querySelectorAll('.profile-subtab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.profile-subtab-content').forEach(c => c.style.display = 'none');
    btn.classList.add('active');
    const el = document.getElementById(`profile-tab-${tabId}`);
    if (el) el.style.display = 'block';
    loadProfileTab(tabId, user.id);
  };
}

function buildTopArtistsMonthHtml(user, isMe) {
  const topArtists = user.topArtistsMonth || (user.topArtist ? [user.topArtist] : []);
  const service = user.musicService || 'spotify';
  const serviceLabel = service === 'lastfm' ? 'Last.fm' : 'Spotify';
  const serviceClass = service === 'lastfm' ? 'lastfm' : 'spotify';

  if (!topArtists.length) {
    if (!isMe) return '';
    return `
      <div class="top-artists-section">
        <div style="background:var(--bg-card);border:1px dashed var(--purple-accent);border-radius:var(--radius-lg);padding:14px;text-align:center;cursor:pointer;transition:border-color 0.2s;" onclick="window._openSpotifyModal()">
          <div style="font-size:1.4rem;margin-bottom:4px;">👑</div>
          <div style="font-size:0.88rem;font-weight:700;color:var(--white)">Exibir Top 5 Artistas do Mês</div>
          <div style="font-size:0.75rem;color:var(--muted);margin-top:2px;">Conecte seu Last.fm ou Spotify para destacar seus artistas mais escutados</div>
          <button class="doodle-btn doodle-btn-primary doodle-btn-sm" style="margin-top:10px;">Conectar Agora</button>
        </div>
      </div>`;
  }

  const top1 = topArtists[0];
  const others = topArtists.slice(1, 5);

  return `
    <div class="top-artists-section">
      <div class="top-artists-header">
        <div class="top-artists-title">
          <span>👑 Top 5 Artistas do Mês</span>
          <span class="top-artists-service-badge ${serviceClass}">
            ${serviceLabel}
          </span>
        </div>
        ${isMe ? `
          <button class="doodle-btn doodle-btn-ghost doodle-btn-sm" onclick="window._openSpotifyModal()" style="font-size:0.72rem;padding:3px 8px;" title="Atualizar ou sincronizar">
            Sincronizar
          </button>
        ` : ''}
      </div>

      <!-- #1 Artist Spotlight -->
      ${top1 ? `
        <div class="top-artist-spotlight" onclick="window._searchArtistInCatalog('${top1.name.replace(/'/g, "\\'")}')" title="Clique para ver músicas de ${top1.name}">
          <div class="spotlight-rank-crown">👑 #1 Mais Escutado</div>
          <img class="spotlight-avatar" src="${top1.imageUrl || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80'}" alt="${top1.name}" onerror="this.src='https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80'">
          <div class="spotlight-info">
            <div class="spotlight-title">${top1.name}</div>
            <div class="spotlight-genre">${top1.genre || 'Top Artista do Mês'}</div>
            <div class="spotlight-scrobbles">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="color:var(--purple-light);"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/></svg>
              <span>${top1.playcount ? top1.playcount + ' scrobbles este mês' : 'Mais escutado'}</span>
            </div>
          </div>
          <button class="doodle-btn doodle-btn-secondary doodle-btn-sm" onclick="event.stopPropagation();window._searchArtistInCatalog('${top1.name.replace(/'/g, "\\'")}')" title="Buscar músicas deste artista">
            Músicas
          </button>
        </div>
      ` : ''}

      <!-- #2 to #5 Grid -->
      ${others.length ? `
        <div class="top-artists-grid">
          ${others.map(a => `
            <div class="top-artist-item" onclick="window._searchArtistInCatalog('${a.name.replace(/'/g, "\\'")}')" title="Clique para ver músicas de ${a.name}">
              <div class="artist-rank-badge">#${a.rank}</div>
              <img class="artist-avatar-thumb" src="${a.imageUrl || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80'}" alt="${a.name}" onerror="this.src='https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80'">
              <div class="artist-item-info">
                <div class="artist-item-name">${a.name}</div>
                <div class="artist-item-sub">${a.playcount ? a.playcount + ' scrobbles' : a.genre || 'Top Artista'}</div>
              </div>
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>`;
}

function buildShowcaseHtml(user, isMe) {
  const showcase = user.songShowcase || [];
  const slots = Array.from({ length: 5 }, (_, i) => showcase[i] || null);

  const html = slots.map((song, i) => {
    if (song) {
      return `
        <div class="showcase-slot" title="${song.title} — ${song.artist}"
          onclick="window._playTrack(${JSON.stringify(song).replace(/"/g, '&quot;')})">
          ${song.artwork ? `<img src="${song.artwork}" alt="${song.title}" loading="lazy">` : '<div class="showcase-slot-add">♪</div>'}
          ${isMe ? `<button onclick="event.stopPropagation();window._removeShowcase('${song.id}')" style="position:absolute;top:2px;right:2px;background:rgba(0,0,0,0.8);border:none;color:#fff;font-size:10px;cursor:pointer;border-radius:3px;padding:1px 3px;">&times;</button>` : ''}
        </div>`;
    }
    return `<div class="showcase-slot" ${isMe ? `onclick="window._addToShowcase()"` : ''}>
      <span class="showcase-slot-add">+</span>
    </div>`;
  }).join('');

  return `
    <div style="padding:6px 14px 4px;border-top:var(--border);">
      <div style="font-size:0.7rem;color:var(--muted);margin-bottom:5px;">Vitrine de Músicas</div>
      <div class="song-showcase-grid">${html}</div>
    </div>`;
}

function loadProfileTab(tabId, userId) {
  const el = document.getElementById(`profile-tab-${tabId}`);
  if (!el) return;

  const activeUser = Storage.getActiveUser();
  const isMe = userId === activeUser.id;
  const user = Storage.getUserById(userId);

  if (tabId === 'posts') {
    const allPosts = Storage.getFeedPosts('all');
    const pinnedId = user?.pinnedPostId;

    const userPosts = [];
    allPosts.forEach(p => {
      const isAuthor = p.authorId === userId;
      const isUserRepost = Array.isArray(p.reposts) && p.reposts.includes(userId);
      if (isAuthor) {
        userPosts.push(p);
      } else if (isUserRepost) {
        userPosts.push({
          ...p,
          isRepost: true,
          reposterName: isMe ? 'Você' : (user?.name || 'Alguém')
        });
      }
    });

    if (!userPosts.length) {
      el.innerHTML = `<div class="empty-state"><div class="empty-state-title">Sem posts ainda</div></div>`;
      return;
    }

    // Sort: pinned first
    const sorted = [...userPosts].sort((a, b) => {
      if (a.id === pinnedId) return -1;
      if (b.id === pinnedId) return  1;
      return 0;
    });

    el.innerHTML = `<div class="feed-posts-list">${sorted.map(p => renderPostCard(p, { isMyProfile: isMe })).join('')}</div>`;

  } else if (tabId === 'lista') {
    const challenge = Storage.getActiveChallenge();
    const answers = Storage.getChallengeAnswers(challenge.id, userId);
    const questions = challenge.questions || [];
    const answered = questions.filter(q => answers[q.id]);

    if (!answered.length) {
      el.innerHTML = `<div class="empty-state"><div class="empty-state-title">Lista vazia</div></div>`;
      return;
    }

    el.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;padding:10px 0;">
      ${answered.map(q => {
        const ans = answers[q.id];
        return `<div style="background:var(--bg-card);border:var(--border);border-radius:12px;overflow:hidden;cursor:pointer;" onclick="window._playTrack(${JSON.stringify(ans).replace(/"/g, '&quot;')})">
          ${ans.artwork ? `<img src="${ans.artwork}" style="width:100%;aspect-ratio:1;object-fit:cover;" alt="">` : '<div style="aspect-ratio:1;background:var(--purple-dark);"></div>'}
          <div style="padding:6px 8px;">
            <div style="font-size:0.72rem;color:var(--muted)">${q.id}. ${q.title.length > 30 ? q.title.slice(0,28)+'...' : q.title}</div>
            <div style="font-size:0.8rem;font-weight:700;color:var(--white);margin-top:2px;">${ans.title}</div>
            <div style="font-size:0.68rem;color:var(--muted)">${ans.artist}</div>
          </div>
        </div>`;
      }).join('')}
    </div>`;

  } else if (tabId === 'avaliados') {
    el.innerHTML = `<div class="empty-state"><div class="empty-state-title">Sem avaliações ainda</div></div>`;

  } else if (tabId === 'salvos' && isMe) {
    const saved = Storage.getUserBookmarkedPosts();
    if (!saved.length) {
      el.innerHTML = `<div class="empty-state"><div class="empty-state-title">Nada salvo ainda</div></div>`;
      return;
    }
    el.innerHTML = `<div class="feed-posts-list">${saved.map(p => renderPostCard(p, { isMyProfile: isMe })).join('')}</div>`;
  }
}

// ──────────────────────────────────────────
// PROFILE EDIT MODAL
// ──────────────────────────────────────────

export function renderProfileEditModal() {
  const user = Storage.getActiveUser();
  const modal = document.getElementById('profile-edit-modal');
  if (!modal) return;

  const isImg = user.avatar && (user.avatar.startsWith('http') || user.avatar.startsWith('data:') || user.avatar.startsWith('/'));
  const currentAvatarHtml = isImg
    ? `<img id="preview-avatar-img" src="${user.avatar}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
    : `<span id="preview-avatar-text">${user.avatar || user.name[0]}</span>`;

  const bannerBg = user.bannerUrl
    ? `background-image:url('${user.bannerUrl}');background-size:cover;background-position:center;`
    : `background:linear-gradient(135deg, ${user.themeColor || '#130c1e'}, #000);`;

  modal.querySelector('.modal-body').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:14px;">

      <!-- LIVE PREVIEW SECTION -->
      <div class="profile-edit-preview-section">
        <div class="profile-edit-preview-title">
          <span>✨ Pré-visualização em Tempo Real</span>
          <span style="font-size:0.65rem;opacity:0.7;">Atualiza instantaneamente</span>
        </div>
        <div id="live-profile-preview" class="profile-preview-card" style="background:${user.profileBgColor || '#130c1e'};color:${user.profileTextColor || '#ffffff'};">
          <div id="preview-banner-el" class="preview-banner" style="${bannerBg}"></div>
          <div class="preview-top-row">
            <div id="preview-avatar-el" class="preview-avatar" style="border-color:${user.profileBgColor || '#130c1e'}">
              ${currentAvatarHtml}
            </div>
            <div style="display:flex;gap:4px;">
              <span class="doodle-btn doodle-btn-secondary doodle-btn-sm" style="font-size:0.68rem;padding:2px 8px;pointer-events:none;">Editar</span>
            </div>
          </div>
          <div class="preview-body">
            <div id="preview-name-el" class="preview-name">${user.name}</div>
            <div id="preview-handle-el" class="preview-handle">${user.handle || '@' + user.name.toLowerCase()}</div>
            <div id="preview-status-el" class="preview-status" style="color:${user.profileStatusColor || '#bda2db'};border-color:${user.profileStatusColor || '#bda2db'}">
              ${user.status || 'Status do perfil'}
            </div>
            ${user.featuredSong ? `
              <div id="preview-featured-el" class="preview-featured" style="background:${user.profileFeaturedColor || '#0a0610'};border-left:3px solid ${user.profileAccentColor || '#3a165a'};margin-top:6px;border-radius:6px;">
                🎵 <strong>${user.featuredSong.title}</strong> — <span style="opacity:0.7;">${user.featuredSong.artist}</span>
              </div>
            ` : ''}
          </div>
        </div>
      </div>

      <!-- THEME PRESETS -->
      <div>
        <label class="form-label" style="margin-bottom:6px;">Paletas Prontas</label>
        <div class="color-presets-row">
          <button type="button" class="preset-pill" onclick="window._applyThemePreset('cyber')">
            <span class="preset-swatch" style="background:#8a2be2;"></span> Cyber Violet
          </button>
          <button type="button" class="preset-pill" onclick="window._applyThemePreset('midnight')">
            <span class="preset-swatch" style="background:#3b82f6;"></span> Midnight Blue
          </button>
          <button type="button" class="preset-pill" onclick="window._applyThemePreset('emerald')">
            <span class="preset-swatch" style="background:#10b981;"></span> Emerald
          </button>
          <button type="button" class="preset-pill" onclick="window._applyThemePreset('sunset')">
            <span class="preset-swatch" style="background:#f43f5e;"></span> Sunset Pink
          </button>
          <button type="button" class="preset-pill" onclick="window._applyThemePreset('gold')">
            <span class="preset-swatch" style="background:#f59e0b;"></span> Obsidian Gold
          </button>
        </div>
      </div>

      <!-- BASIC INFO -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div>
          <label class="form-label">Nome</label>
          <input id="edit-name" class="doodle-input" value="${user.name || ''}" placeholder="Seu nome">
        </div>
        <div>
          <label class="form-label">Handle</label>
          <input id="edit-handle" class="doodle-input" value="${user.handle || ''}" placeholder="@voce">
        </div>
      </div>

      <div>
        <label class="form-label">Bio</label>
        <textarea id="edit-bio" class="doodle-input" rows="2" placeholder="Fale sobre você...">${user.bio || ''}</textarea>
      </div>

      <div>
        <label class="form-label">Foto de Perfil (URL ou Emoji/Letra)</label>
        <input id="edit-avatar" class="doodle-input" value="${user.avatar || ''}" placeholder="https://... ou emoji">
      </div>

      <div>
        <label class="form-label">Banner do Perfil (URL da imagem)</label>
        <div style="display:flex;gap:8px;">
          <input id="edit-banner" class="doodle-input" value="${user.bannerUrl || ''}" placeholder="https://...">
          <button type="button" class="doodle-btn doodle-btn-ghost doodle-btn-sm" onclick="document.getElementById('edit-banner').value='';window._updateLiveProfilePreview();">
            Limpar
          </button>
        </div>
      </div>

      <div>
        <label class="form-label">Música em Destaque</label>
        <div style="display:flex;gap:8px;align-items:center;">
          <button type="button" class="doodle-btn doodle-btn-secondary doodle-btn-sm" onclick="window._editFeaturedSong()">
            ${user.featuredSong ? `Alterar: ${user.featuredSong.title} — ${user.featuredSong.artist}` : '+ Escolher Música'}
          </button>
          ${user.featuredSong ? `
            <button type="button" class="doodle-btn doodle-btn-danger doodle-btn-sm" onclick="window._removeFeaturedSong();renderProfileEditModal();">
              Remover
            </button>` : ''}
        </div>
      </div>

      <div>
        <label class="form-label" style="margin-bottom:8px;">Personalização de Cores</label>
        <div class="color-picker-grid">
          <div class="color-picker-row">
            <span class="color-picker-label">Fundo do card</span>
            <input type="color" id="color-bg" value="${user.profileBgColor || '#130c1e'}">
          </div>
          <div class="color-picker-row">
            <span class="color-picker-label">Cor do Destaque</span>
            <input type="color" id="color-accent" value="${user.profileAccentColor || '#3a165a'}">
          </div>
          <div class="color-picker-row">
            <span class="color-picker-label">Texto</span>
            <input type="color" id="color-text" value="${user.profileTextColor || '#f5f0fa'}">
          </div>
          <div class="color-picker-row">
            <span class="color-picker-label">Status</span>
            <input type="color" id="color-status" value="${user.profileStatusColor || '#bda2db'}">
          </div>
          <div class="color-picker-row">
            <span class="color-picker-label">Fundo destaque</span>
            <input type="color" id="color-featured" value="${user.profileFeaturedColor || '#0a0610'}">
          </div>
          <div class="color-picker-row">
            <span class="color-picker-label">Cor do tema</span>
            <input type="color" id="color-theme" value="${user.themeColor || '#2b1042'}">
          </div>
        </div>
      </div>

      <div style="display:flex;gap:8px;justify-content:flex-end;padding-top:6px;">
        <button type="button" class="doodle-btn doodle-btn-ghost" onclick="window._closeProfileEdit()">Cancelar</button>
        <button type="button" class="doodle-btn doodle-btn-primary" onclick="window._saveProfileEdit()">Salvar Alterações</button>
      </div>
    </div>`;

  // Live preview function
  window._updateLiveProfilePreview = () => {
    const preview = document.getElementById('live-profile-preview');
    if (!preview) return;

    const bg = document.getElementById('color-bg')?.value || '#130c1e';
    const text = document.getElementById('color-text')?.value || '#ffffff';
    const accent = document.getElementById('color-accent')?.value || '#8a2be2';
    const status = document.getElementById('color-status')?.value || '#bda2db';
    const featured = document.getElementById('color-featured')?.value || '#0a0610';
    const theme = document.getElementById('color-theme')?.value || '#2b1042';
    const name = document.getElementById('edit-name')?.value || user.name;
    const handle = document.getElementById('edit-handle')?.value || user.handle;
    const avatar = document.getElementById('edit-avatar')?.value || user.avatar || user.name[0];
    const banner = document.getElementById('edit-banner')?.value?.trim();

    preview.style.background = bg;
    preview.style.color = text;

    const bannerEl = document.getElementById('preview-banner-el');
    if (bannerEl) {
      bannerEl.style.backgroundImage = banner ? `url('${banner}')` : '';
      if (!banner) bannerEl.style.background = `linear-gradient(135deg, ${theme}, #000)`;
    }

    const avatarEl = document.getElementById('preview-avatar-el');
    if (avatarEl) {
      avatarEl.style.borderColor = bg;
      const isAImg = avatar && (avatar.startsWith('http') || avatar.startsWith('data:') || avatar.startsWith('/'));
      avatarEl.innerHTML = isAImg
        ? `<img src="${avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
        : `<span>${avatar || 'U'}</span>`;
    }

    const nameEl = document.getElementById('preview-name-el');
    if (nameEl) nameEl.textContent = name || 'Nome';

    const handleEl = document.getElementById('preview-handle-el');
    if (handleEl) handleEl.textContent = handle || '@usuario';

    const statusEl = document.getElementById('preview-status-el');
    if (statusEl) {
      statusEl.style.color = status;
      statusEl.style.borderColor = status;
    }

    const featEl = document.getElementById('preview-featured-el');
    if (featEl) {
      featEl.style.background = featured;
      featEl.style.borderLeftColor = accent;
    }
  };

  // Presets definition
  const presets = {
    cyber:    { bg: '#0c0814', accent: '#8a2be2', text: '#ffffff', status: '#bda2db', featured: '#170b26', theme: '#200a38' },
    midnight: { bg: '#090a10', accent: '#3b82f6', text: '#f0f4ff', status: '#93c5fd', featured: '#0e1626', theme: '#131f38' },
    emerald:  { bg: '#050f0a', accent: '#10b981', text: '#ecfdf5', status: '#6ee7b7', featured: '#0b2116', theme: '#0e3020' },
    sunset:   { bg: '#13090f', accent: '#f43f5e', text: '#fff1f2', status: '#fda4af', featured: '#240c1a', theme: '#380f28' },
    gold:     { bg: '#0e0d0a', accent: '#f59e0b', text: '#fffbeb', status: '#fcd34d', featured: '#211d0e', theme: '#332a0d' }
  };

  window._applyThemePreset = (key) => {
    const p = presets[key];
    if (!p) return;
    if (document.getElementById('color-bg')) document.getElementById('color-bg').value = p.bg;
    if (document.getElementById('color-accent')) document.getElementById('color-accent').value = p.accent;
    if (document.getElementById('color-text')) document.getElementById('color-text').value = p.text;
    if (document.getElementById('color-status')) document.getElementById('color-status').value = p.status;
    if (document.getElementById('color-featured')) document.getElementById('color-featured').value = p.featured;
    if (document.getElementById('color-theme')) document.getElementById('color-theme').value = p.theme;
    window._updateLiveProfilePreview();
  };

  // Attach live preview event listeners
  const inputIds = ['color-bg', 'color-accent', 'color-text', 'color-status', 'color-featured', 'color-theme', 'edit-name', 'edit-handle', 'edit-avatar', 'edit-banner'];
  inputIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', window._updateLiveProfilePreview);
      el.addEventListener('change', window._updateLiveProfilePreview);
    }
  });

  openModal('profile-edit-modal');

  window._saveProfileEdit = () => {
    const updates = {
      name:                 document.getElementById('edit-name')?.value?.trim() || user.name,
      handle:               document.getElementById('edit-handle')?.value?.trim() || user.handle,
      avatar:               document.getElementById('edit-avatar')?.value?.trim() || user.avatar,
      bio:                  document.getElementById('edit-bio')?.value?.trim() || '',
      bannerUrl:            document.getElementById('edit-banner')?.value?.trim() || '',
      profileBgColor:       document.getElementById('color-bg')?.value || user.profileBgColor,
      profileAccentColor:   document.getElementById('color-accent')?.value || user.profileAccentColor,
      profileTextColor:     document.getElementById('color-text')?.value || user.profileTextColor,
      profileStatusColor:   document.getElementById('color-status')?.value || user.profileStatusColor,
      profileFeaturedColor: document.getElementById('color-featured')?.value || user.profileFeaturedColor,
      themeColor:           document.getElementById('color-theme')?.value || user.themeColor,
    };
    Storage.updateUser(user.id, updates);
    closeModal('profile-edit-modal');
    showToast('Perfil atualizado!');
    // Update sidebar avatar if changed
    const sidebarAvatar = document.querySelector('.sidebar-avatar');
    if (sidebarAvatar) {
      const isImg = updates.avatar && (updates.avatar.startsWith('http') || updates.avatar.startsWith('data:') || updates.avatar.startsWith('/'));
      sidebarAvatar.innerHTML = isImg ? `<img src="${updates.avatar}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">` : (updates.avatar || updates.name[0]);
    }
    window._refreshProfile?.();
  };

  window._closeProfileEdit = () => closeModal('profile-edit-modal');
}

// ──────────────────────────────────────────
// FOLLOW LIST MODAL
// ──────────────────────────────────────────

export function renderFollowListModal(userId, mode) {
  const modal = document.getElementById('follow-list-modal');
  if (!modal) return;

  modal.querySelector('.modal-header h3').textContent = mode === 'following' ? 'Seguindo' : 'Seguidores';

  const ids = mode === 'following' ? Storage.getFollowing(userId) : Storage.getFollowers(userId);
  const users = ids.map(id => Storage.getUserById(id)).filter(Boolean);

  modal.querySelector('.modal-body').innerHTML = users.length ? users.map(u => `
    <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:var(--border);cursor:pointer;" onclick="closeModal('follow-list-modal');window._goToProfile('${u.id}')">
      <div class="post-author-avatar">${u.avatar || u.name[0]}</div>
      <div>
        <div style="font-size:0.88rem;font-weight:700;color:var(--white)">${u.name}</div>
        <div style="font-size:0.72rem;color:var(--muted)">${u.handle || ''}</div>
      </div>
      ${u.id !== Storage.getActiveUserId() ? `
        <button class="doodle-btn doodle-btn-follow doodle-btn-sm${Storage.isFollowing(u.id) ? ' following' : ''}" style="margin-left:auto;" onclick="event.stopPropagation();window._toggleFollow('${u.id}')">
          ${Storage.isFollowing(u.id) ? 'Seguindo' : 'Seguir'}
        </button>` : ''}
    </div>`).join('') :
    `<div class="empty-state"><div class="empty-state-sub">Ninguém aqui ainda.</div></div>`;

  openModal('follow-list-modal');
}

// helpers re-exported for app.js
export function openModal(id) {
  document.getElementById(id)?.classList.add('active');
}
export function closeModal(id) {
  document.getElementById(id)?.classList.remove('active');
}
export function showToast(msg) {
  const c = document.getElementById('toast-container');
  if (!c) return;
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

window.openModal = openModal;
window.closeModal = closeModal;
window.closeDoodleModal = closeModal;
window.openDoodleModal = openModal;
window.showToast = showToast;
