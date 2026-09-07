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

  const artworkUrl = user.featuredSong?.artwork
    ? user.featuredSong.artwork.replace(/100x100bb|60x60bb/, '600x600bb')
    : 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80';

  const featuredHtml = user.featuredSong ? `
    <div class="featured-song-box" style="${cssVars}">
      <!-- Blurred Album Art Background -->
      <div class="featured-bg-blur" style="background-image:url('${artworkUrl}');"></div>
      <div class="featured-bg-overlay"></div>

      <!-- Top Row Header -->
      <div class="featured-top-row">
        <div class="featured-label-pill">
          ${ICONS.disc || '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3"></circle></svg>'}
          <span>Música em Destaque</span>
        </div>
        ${isMe ? `
          <button class="doodle-btn doodle-btn-ghost doodle-btn-sm" style="font-size:0.75rem;padding:3px 10px;background:rgba(0,0,0,0.45);border:1px solid rgba(255,255,255,0.18);color:#fff;" onclick="window._editFeaturedSong()" title="Alterar música de destaque">
            Alterar
          </button>
        ` : ''}
      </div>

      <!-- Main Content Row -->
      <div class="featured-content-row">
        <!-- Vinyl Stage: Realistic 90px Sleeve + 90px Spinning Vinyl Record -->
        <div class="featured-vinyl-stage" onclick="window._playTrack(${JSON.stringify(user.featuredSong).replace(/"/g, '&quot;')})" title="Clique para reproduzir / pausar">
          <!-- Album Sleeve Cover -->
          <div class="featured-album-sleeve">
            <img class="featured-sleeve-art"
              src="${artworkUrl}"
              alt="${user.featuredSong.title}"
              onerror="this.src='https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80'">
            <div class="sleeve-edge-sheen"></div>
          </div>

          <!-- Realistic Vinyl Record Disc -->
          <div class="featured-vinyl-disk" id="featured-vinyl-img">
            <div class="vinyl-groove-rings"></div>
            <div class="vinyl-light-sheen"></div>
            <div class="vinyl-center-label">
              <img class="vinyl-label-art"
                src="${artworkUrl}"
                alt=""
                onerror="this.src='https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80'">
              <div class="vinyl-spindle-hole"></div>
            </div>
          </div>
        </div>

        <!-- Info Details -->
        <div class="featured-info">
          <div class="featured-title" title="${user.featuredSong.title}">${user.featuredSong.title}</div>
          <div class="featured-artist">${user.featuredSong.artist}</div>
        </div>

        <!-- Large Play Button -->
        <div class="featured-actions">
          <button class="featured-play-btn" onclick="window._playTrack(${JSON.stringify(user.featuredSong).replace(/"/g, '&quot;')})" title="Tocar música de destaque">
            ${ICONS.play}
          </button>
        </div>
      </div>
    </div>` : (isMe ? `
    <div class="featured-song-box empty" style="${cssVars};cursor:pointer;justify-content:center;padding:18px 20px;" onclick="window._editFeaturedSong()">
      <span style="font-size:0.86rem;color:var(--purple-light);font-weight:700;display:flex;align-items:center;gap:8px;">
        ${ICONS.disc || ICONS.music} + Escolher Música em Destaque (Disco de Vinil)
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
          ${buildSocialsHtml(user, isMe)}
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
          <button class="profile-subtab-btn" data-profile-tab="playlists" onclick="window._switchProfileTab('playlists', this)">Playlists</button>
          <button class="profile-subtab-btn" data-profile-tab="avaliados" onclick="window._switchProfileTab('avaliados', this)">Avaliados</button>
          ${isMe ? `<button class="profile-subtab-btn" data-profile-tab="salvos" onclick="window._switchProfileTab('salvos', this)">Salvos</button>` : ''}
        </div>
      </div>

      <!-- Sub-tab content -->
      <div id="profile-tab-posts"     class="profile-subtab-content" style="margin-top:10px;"></div>
      <div id="profile-tab-playlists" class="profile-subtab-content" style="display:none;margin-top:10px;"></div>
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

function buildSocialsHtml(user, isMe) {
  const insta = user.instagram || user.socials?.instagram || '';
  const twitter = user.twitter || user.x || user.socials?.twitter || user.socials?.x || '';
  const lastfm = user.lastfm || user.socials?.lastfm || (user.musicService === 'lastfm' ? user.spotifyUsername : '') || '';

  const hasAny = Boolean(insta || twitter || lastfm);

  if (!hasAny && !isMe) return '';

  if (!hasAny && isMe) {
    return `
      <div class="profile-socials-row">
        <button type="button" class="profile-social-add-btn" onclick="window._openProfileEdit()">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          <span>Adicionar redes sociais (Instagram, X, Last.fm)</span>
        </button>
      </div>`;
  }

  const instaClean = insta.replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/$/, '');
  const twitterClean = twitter.replace(/^@/, '').replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//, '').replace(/\/$/, '');
  const lastfmClean = lastfm.replace(/^@/, '').replace(/^https?:\/\/(www\.)?last\.fm\/user\//, '').replace(/\/$/, '');

  return `
    <div class="profile-socials-row">
      ${instaClean ? `
        <a href="https://instagram.com/${instaClean}" target="_blank" rel="noopener noreferrer" class="profile-social-pill instagram" title="Instagram de ${user.name || ''}">
          ${ICONS.instagram}
          <span>@${instaClean}</span>
        </a>` : ''}

      ${twitterClean ? `
        <a href="https://x.com/${twitterClean}" target="_blank" rel="noopener noreferrer" class="profile-social-pill x-twitter" title="X (Twitter) de ${user.name || ''}">
          ${ICONS.twitter}
          <span>@${twitterClean}</span>
        </a>` : ''}

      ${lastfmClean ? `
        <a href="https://www.last.fm/user/${lastfmClean}" target="_blank" rel="noopener noreferrer" class="profile-social-pill lastfm" title="Perfil Last.fm de ${user.name || ''}">
          ${ICONS.lastfm}
          <span>${lastfmClean}</span>
        </a>` : ''}

      ${isMe ? `
        <button type="button" class="profile-social-edit-icon" onclick="window._openProfileEdit()" title="Editar redes sociais">
          ${ICONS.edit || '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>'}
        </button>` : ''}
    </div>`;
}

function buildTopArtistsMonthHtml(user, isMe) {
  const topArtists = user.topArtistsMonth || (user.topArtist ? [user.topArtist] : []);
  const service = user.musicService || 'lastfm';
  const serviceLabel = service === 'lastfm' ? 'Last.fm' : 'Artistas';
  const serviceClass = service === 'lastfm' ? 'lastfm' : 'custom';

  if (!topArtists.length) {
    return '';
  }

  const top1 = topArtists[0];
  const others = topArtists.slice(1, 5);

  return `
    <div class="top-artists-section">
      <div class="top-artists-header">
        <div class="top-artists-title">
          <span style="display:inline-flex;align-items:center;gap:6px;">${ICONS.crown} Top 5 Artistas do Mês</span>
          <span class="top-artists-service-badge ${serviceClass}">
            ${serviceLabel}
          </span>
        </div>
        ${isMe ? `
          <button class="doodle-btn doodle-btn-ghost doodle-btn-sm" onclick="window._openSpotifyModal()" style="font-size:0.72rem;padding:3px 8px;" title="Atualizar ou sincronizar com Last.fm">
            Sincronizar
          </button>
        ` : ''}
      </div>

      <!-- #1 Artist Spotlight -->
      ${top1 ? `
        <div class="top-artist-spotlight" onclick="window._searchArtistInCatalog('${top1.name.replace(/'/g, "\\'")}')" title="Clique para ver músicas de ${top1.name}">
          <div class="spotlight-rank-crown" style="display:inline-flex;align-items:center;gap:4px;">${ICONS.crown} #1 Mais Escutado</div>
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
          ${song.artwork ? `<img src="${song.artwork}" alt="${song.title}" loading="lazy">` : `<div class="showcase-slot-add" style="display:flex;align-items:center;justify-content:center;">${ICONS.music}</div>`}
          ${isMe ? `<button onclick="event.stopPropagation();window._removeShowcase('${song.id}')" style="position:absolute;top:2px;right:2px;background:rgba(0,0,0,0.8);border:none;color:#fff;font-size:10px;cursor:pointer;border-radius:3px;padding:1px 3px;">${ICONS.close}</button>` : ''}
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

  } else if (tabId === 'playlists') {
    const allPlaylists = Storage.getAllPlaylists ? Storage.getAllPlaylists() : [];
    const userPlaylists = allPlaylists.filter(p => p.authorId === userId);

    if (!userPlaylists.length) {
      el.innerHTML = `
        <div class="empty-state" style="padding:40px 20px;text-align:center;">
          <div style="font-size:2rem;color:var(--purple-light);margin-bottom:8px;display:flex;justify-content:center;">${ICONS.playlist}</div>
          <div class="empty-state-title" style="font-size:1rem;margin-bottom:6px;">Nenhuma playlist criada</div>
          <p style="font-size:0.82rem;color:var(--muted);margin-bottom:14px;">${isMe ? 'Crie suas próprias playlists de músicas e compartilhe com a comunidade.' : 'Este usuário ainda não criou nenhuma playlist.'}</p>
          ${isMe ? `
            <button class="doodle-btn doodle-btn-primary doodle-btn-sm" onclick="window.switchTab('playlists');window._openCreatePlaylistModal();">
              ${ICONS.plus} Criar Playlist
            </button>` : ''}
        </div>`;
      return;
    }

    el.innerHTML = `
      <div class="profile-playlists-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px;padding:10px 0;">
        ${userPlaylists.map(pl => {
          const songs = pl.songs || [];
          const songsWithArt = songs.filter(s => !!s.artwork);
          let coverHtml = '';
          if (pl.coverUrl) {
            coverHtml = `<img src="${pl.coverUrl}" alt="${pl.title}" style="width:100%;height:100%;object-fit:cover;">`;
          } else if (songsWithArt.length >= 4) {
            coverHtml = `
              <div style="display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;width:100%;height:100%;">
                <img src="${songsWithArt[0].artwork}" style="width:100%;height:100%;object-fit:cover;">
                <img src="${songsWithArt[1].artwork}" style="width:100%;height:100%;object-fit:cover;">
                <img src="${songsWithArt[2].artwork}" style="width:100%;height:100%;object-fit:cover;">
                <img src="${songsWithArt[3].artwork}" style="width:100%;height:100%;object-fit:cover;">
              </div>`;
          } else if (songsWithArt.length > 0) {
            coverHtml = `<img src="${songsWithArt[0].artwork}" style="width:100%;height:100%;object-fit:cover;">`;
          } else {
            coverHtml = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#2b1548,#0d0b14);color:var(--purple-light);font-size:1.8rem;">${ICONS.playlist}</div>`;
          }

          return `
            <div class="profile-playlist-card" onclick="window._goToSharedPlaylist('${pl.id}')" style="background:var(--bg-card);border:1px solid var(--border-accent);border-radius:12px;overflow:hidden;cursor:pointer;transition:transform 0.2s ease, border-color 0.2s ease;display:flex;flex-direction:column;">
              <div style="aspect-ratio:1;width:100%;background:#000;position:relative;overflow:hidden;">
                ${coverHtml}
                ${songs.length > 0 ? `
                  <button class="doodle-btn doodle-btn-primary doodle-btn-sm" style="position:absolute;bottom:8px;right:8px;border-radius:50%;width:34px;height:34px;padding:0;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 10px rgba(0,0,0,0.6);" title="Tocar Playlist" onclick="event.stopPropagation();window._playEntirePlaylist('${pl.id}')">
                    ${ICONS.play}
                  </button>` : ''}
              </div>
              <div style="padding:10px 12px;flex:1;display:flex;flex-direction:column;justify-content:space-between;">
                <div>
                  <div style="font-size:0.88rem;font-weight:800;color:var(--white);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${pl.title}</div>
                  ${pl.description ? `<div style="font-size:0.75rem;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px;">${pl.description}</div>` : ''}
                </div>
                <div style="display:flex;align-items:center;justify-content:space-between;margin-top:8px;font-size:0.72rem;color:var(--purple-light);font-weight:600;">
                  <span>${songs.length} ${songs.length === 1 ? 'música' : 'músicas'}</span>
                  <span style="color:var(--muted);font-weight:normal;">${pl.createdAt || ''}</span>
                </div>
              </div>
            </div>`;
        }).join('')}
      </div>`;

  } else if (tabId === 'avaliados') {
    // Collect all posts with ratings by this user
    const allPosts = Storage.getFeedPosts('all');
    const ratedPosts = allPosts.filter(p => p.authorId === userId && p.rating > 0 && (p.song || p.lyricsSong));

    // Also collect challenge reviews created by this user
    const allReviews = Storage.getAllReviews();
    const challengeReviews = [];
    Object.keys(allReviews).forEach(k => {
      const rev = allReviews[k]?.[userId];
      if (rev && rev.rating > 0) {
        const parts = k.split('_');
        const cid = rev.challengeId || parts[0];
        const targetUid = rev.targetUserId || parts[1];
        const qid = rev.questionId || parts[2];
        const targetUser = Storage.getUserById(targetUid);
        
        let song = rev.song;
        if (!song) {
          const answers = Storage.getChallengeAnswers(cid, targetUid);
          song = answers?.[qid];
        }

        if (song) {
          challengeReviews.push({
            id: `ch_rev_${k}`,
            rating: rev.rating,
            comment: rev.comment || '',
            song: song,
            targetUserName: targetUser?.name || 'Música Comparada',
            createdAt: rev.createdAt || 'agora',
            isChallengeReview: true
          });
        }
      }
    });

    const allEvaluations = [
      ...ratedPosts.map(p => ({
        id: p.id,
        rating: p.rating,
        comment: p.text || '',
        lyrics: p.lyrics || '',
        song: p.song || { title: p.lyricsSong || 'Música', artist: '', artwork: p.lyricsArt || '' },
        createdAt: p.createdAt || '',
        isPost: true
      })),
      ...challengeReviews
    ];

    if (!allEvaluations.length) {
      el.innerHTML = `
        <div class="empty-state" style="padding:24px 14px;text-align:center;">
          <div class="empty-state-title">Sem avaliações ainda</div>
          <div class="empty-state-sub" style="font-size:0.78rem;color:var(--muted);margin-top:4px;">
            Ao dar uma nota (estrelas) para uma música em um post ou na aba de comparar, ela aparecerá aqui.
          </div>
        </div>`;
      return;
    }

    el.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:10px;padding:4px 0;">
        ${allEvaluations.map(item => {
          const s = item.song || {};
          const trackObj = {
            title: s.title || 'Música',
            artist: s.artist || '',
            artwork: s.artwork || '',
            previewUrl: s.previewUrl || ''
          };
          return `
            <div class="rated-song-card" style="background:var(--bg-card);border:var(--border);border-radius:var(--radius-lg);padding:12px 14px;display:flex;gap:12px;align-items:flex-start;transition:background 0.15s;">
              <img src="${s.artwork || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80'}" 
                   alt="${s.title || ''}" 
                   style="width:54px;height:54px;min-width:54px;border-radius:8px;object-fit:cover;border:1px solid rgba(255,255,255,0.1);cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.4);"
                   onclick="window._playTrack(${JSON.stringify(trackObj).replace(/"/g, '&quot;')})"
                   title="Ouvir prévia">
              <div style="flex:1;min-width:0;">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px;">
                  <div style="min-width:0;flex:1;">
                    <div style="font-size:0.9rem;font-weight:800;color:var(--white);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;" onclick="window._playTrack(${JSON.stringify(trackObj).replace(/"/g, '&quot;')})" title="Clique para ouvir">
                      ${s.title || 'Sem título'}
                    </div>
                    <div style="font-size:0.75rem;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                      ${s.artist || 'Artista desconhecido'} ${item.targetUserName ? `· <span style="color:var(--purple-light);">Lista de ${item.targetUserName}</span>` : ''}
                    </div>
                  </div>
                  <div class="post-rating-display" style="margin:0;padding:2px 8px;flex-shrink:0;">
                    ${renderRatingStars(item.rating, 14)}
                    <span style="font-size:0.8rem;font-weight:800;">${item.rating.toFixed(1)}</span>
                  </div>
                </div>
                ${item.comment ? `
                  <div style="font-size:0.82rem;color:var(--white);background:var(--bg-surface);border-radius:6px;padding:6px 10px;margin-top:6px;border-left:2.5px solid var(--purple-accent);">
                    "${item.comment}"
                  </div>` : ''}
                ${item.lyrics ? `
                  <div style="font-size:0.75rem;color:var(--purple-light);font-style:italic;margin-top:4px;">
                    "${item.lyrics}"
                  </div>` : ''}
                <div style="display:flex;align-items:center;justify-content:space-between;margin-top:6px;font-size:0.7rem;color:var(--purple-muted);">
                  <span>${item.isChallengeReview ? '⭐ Avaliação em Comparar' : (item.createdAt || '')}</span>
                  <button class="doodle-btn doodle-btn-ghost doodle-btn-sm" style="padding:2px 8px;font-size:0.72rem;display:inline-flex;align-items:center;gap:4px;" onclick="window._playTrack(${JSON.stringify(trackObj).replace(/"/g, '&quot;')})">
                    ${ICONS.play} Ouvir
                  </button>
                </div>
              </div>
            </div>`;
        }).join('')}
      </div>`;

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
          <span style="display:inline-flex;align-items:center;gap:6px;">${ICONS.sparkles} Pré-visualização em Tempo Real</span>
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
            <div id="preview-socials-el" class="profile-socials-row" style="margin-top:6px;gap:6px;"></div>
            ${user.featuredSong ? `
              <div id="preview-featured-el" class="preview-featured" style="background:${user.profileFeaturedColor || '#0a0610'};border-left:3px solid ${user.profileAccentColor || '#3a165a'};margin-top:6px;border-radius:6px;display:flex;align-items:center;gap:6px;padding:6px 10px;">
                ${ICONS.music} <span><strong>${user.featuredSong.title}</strong> — <span style="opacity:0.7;">${user.featuredSong.artist}</span></span>
              </div>
            ` : ''}
            ${(user.topArtistsMonth?.length || user.topArtist) ? `
              <div id="preview-top-artist-el" class="top-artist-spotlight" style="margin-top:8px;padding:8px 10px;border-radius:10px;cursor:default;">
                <div class="spotlight-rank-crown" style="font-size:0.64rem;padding:1px 6px;">${ICONS.crown} Top Artista</div>
                <img class="spotlight-avatar" src="${(user.topArtistsMonth?.[0] || user.topArtist)?.imageUrl || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80'}" style="width:44px;height:44px;min-width:44px;" alt="">
                <div class="spotlight-info">
                  <div class="spotlight-title" style="font-size:0.86rem;">${(user.topArtistsMonth?.[0] || user.topArtist)?.name || 'Artista'}</div>
                  <div class="spotlight-genre" style="font-size:0.68rem;">${(user.topArtistsMonth?.[0] || user.topArtist)?.genre || 'Top Artista do Mês'}</div>
                </div>
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

      <!-- REDES SOCIAIS -->
      <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px 14px;display:flex;flex-direction:column;gap:10px;">
        <div style="font-size:0.85rem;font-weight:800;color:var(--white);display:flex;align-items:center;gap:6px;">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--purple-light);"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
          <span>Redes Sociais & Perfis de Música</span>
        </div>

        <div>
          <label class="form-label" style="display:flex;align-items:center;gap:6px;font-size:0.78rem;">
            <span style="color:#e1306c;">📸</span> Instagram (usuário ou link)
          </label>
          <input id="edit-instagram" class="doodle-input" value="${user.instagram || user.socials?.instagram || ''}" placeholder="@usuario ou https://instagram.com/usuario">
        </div>

        <div>
          <label class="form-label" style="display:flex;align-items:center;gap:6px;font-size:0.78rem;">
            <span style="color:#fff;">✖️</span> X / Twitter (usuário ou link)
          </label>
          <input id="edit-twitter" class="doodle-input" value="${user.twitter || user.x || user.socials?.twitter || ''}" placeholder="@usuario ou https://x.com/usuario">
        </div>

        <div>
          <label class="form-label" style="display:flex;align-items:center;gap:6px;font-size:0.78rem;">
            <span style="color:#ff5555;">🎵</span> Last.fm (usuário ou link)
          </label>
          <input id="edit-lastfm" class="doodle-input" value="${user.lastfm || user.socials?.lastfm || (user.musicService === 'lastfm' ? user.spotifyUsername : '') || ''}" placeholder="usuario_lastfm">
        </div>
      </div>

      <div>
        <label class="form-label" style="display:flex;align-items:center;justify-content:space-between;">
          <span>Foto de Perfil</span>
          <span style="font-size:0.72rem;color:var(--muted);font-weight:normal;">URL, Arquivo ou Emoji</span>
        </label>
        <div style="display:flex;gap:8px;">
          <input id="edit-avatar" class="doodle-input" value="${user.avatar || ''}" placeholder="https://... ou emoji">
          <label class="doodle-btn doodle-btn-secondary doodle-btn-sm" style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;white-space:nowrap;" title="Escolher imagem do dispositivo">
            ${ICONS.image || ''}
            <span>Dispositivo</span>
            <input type="file" id="edit-avatar-file" accept="image/*" style="display:none;" onchange="window._handleAvatarUpload(event)">
          </label>
        </div>
      </div>

      <div>
        <label class="form-label" style="display:flex;align-items:center;justify-content:space-between;">
          <span>Banner do Perfil</span>
          <span style="font-size:0.72rem;color:var(--muted);font-weight:normal;">URL ou Arquivo</span>
        </label>
        <div style="display:flex;gap:8px;">
          <input id="edit-banner" class="doodle-input" value="${user.bannerUrl || ''}" placeholder="https://...">
          <label class="doodle-btn doodle-btn-secondary doodle-btn-sm" style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;white-space:nowrap;" title="Escolher imagem do dispositivo">
            ${ICONS.image || ''}
            <span>Dispositivo</span>
            <input type="file" id="edit-banner-file" accept="image/*" style="display:none;" onchange="window._handleBannerUpload(event)">
          </label>
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
    preview.style.setProperty('--profile-card-bg', bg);
    preview.style.setProperty('--profile-accent', accent);
    preview.style.setProperty('--profile-text-color', text);
    preview.style.setProperty('--profile-status-color', status);
    preview.style.setProperty('--profile-featured-bg', featured);

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

    const socialsEl = document.getElementById('preview-socials-el');
    if (socialsEl) {
      const insta = document.getElementById('edit-instagram')?.value?.trim() || '';
      const twit = document.getElementById('edit-twitter')?.value?.trim() || '';
      const lfm = document.getElementById('edit-lastfm')?.value?.trim() || '';
      socialsEl.innerHTML = buildSocialsHtml({ instagram: insta, twitter: twit, lastfm: lfm, name: name || 'Usuário' }, false);
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

  window._handleAvatarUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const input = document.getElementById('edit-avatar');
      if (input) input.value = e.target.result;
      window._updateLiveProfilePreview?.();
    };
    reader.readAsDataURL(file);
  };

  window._handleBannerUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const input = document.getElementById('edit-banner');
      if (input) input.value = e.target.result;
      window._updateLiveProfilePreview?.();
    };
    reader.readAsDataURL(file);
  };

  // Attach live preview event listeners
  const inputIds = ['color-bg', 'color-accent', 'color-text', 'color-status', 'color-featured', 'color-theme', 'edit-name', 'edit-handle', 'edit-avatar', 'edit-banner', 'edit-instagram', 'edit-twitter', 'edit-lastfm'];
  inputIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', window._updateLiveProfilePreview);
      el.addEventListener('change', window._updateLiveProfilePreview);
    }
  });

  window._updateLiveProfilePreview();
  openModal('profile-edit-modal');

  window._saveProfileEdit = () => {
    const instaVal = document.getElementById('edit-instagram')?.value?.trim() || '';
    const twitVal = document.getElementById('edit-twitter')?.value?.trim() || '';
    const lastfmVal = document.getElementById('edit-lastfm')?.value?.trim() || '';

    const updates = {
      name:                 document.getElementById('edit-name')?.value?.trim() || user.name,
      handle:               document.getElementById('edit-handle')?.value?.trim() || user.handle,
      avatar:               document.getElementById('edit-avatar')?.value?.trim() || user.avatar,
      bio:                  document.getElementById('edit-bio')?.value?.trim() || '',
      bannerUrl:            document.getElementById('edit-banner')?.value?.trim() || '',
      instagram:            instaVal,
      twitter:              twitVal,
      lastfm:               lastfmVal,
      socials: {
        instagram: instaVal,
        twitter: twitVal,
        lastfm: lastfmVal
      },
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
