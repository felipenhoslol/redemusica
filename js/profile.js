// Profile module — render, edit, follow, pin, showcase, sub-tabs
import { esc, safeUrl, jsArg, avatarInner, isImageAvatar } from './dom.js';
import * as Storage from './storage.js';
import { ICONS, renderRatingStars } from './icons.js';
import { renderPostCard } from './feed.js';
import { openSearchModalForFeaturedSong } from './ui.js';
import { getArtistImage, fetchLastFmRecentTracks, lastFmUserOf } from './lastfm.js';
import { presenceOf, relativeTime } from './sync.js';
import { mountTabIndicator, tabDirection, animatePanel } from './tabs.js';
import { BIO_FONTS, bioFont, bioFontStyle } from './bioFonts.js';

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

  const artworkUrl = user.featuredSong?.artwork
    ? user.featuredSong.artwork.replace(/100x100bb|60x60bb/, '600x600bb')
    : 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80';

  const featuredHtml = user.featuredSong ? `
    <div class="featured-song-box">
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
          <button class="doodle-btn doodle-btn-ghost doodle-btn-sm" style="font-size:0.75rem;padding:3px 10px;background:rgba(0,0,0,0.45);border:1px solid var(--tint-3);color:#fff;" onclick="window._editFeaturedSong()" title="Alterar música de destaque">
            Alterar
          </button>
        ` : ''}
      </div>

      <!-- Main Content Row -->
      <div class="featured-content-row">
        <!-- Vinyl Stage: Realistic 90px Sleeve + 90px Spinning Vinyl Record -->
        <div class="featured-vinyl-stage" onclick="window._playTrack(${jsArg(user.featuredSong)})" title="Clique para reproduzir / pausar">
          <!-- Album Sleeve Cover -->
          <div class="featured-album-sleeve">
            <img class="featured-sleeve-art"
              src="${safeUrl(artworkUrl)}"
              alt="${esc(user.featuredSong.title)}"
              onerror="this.src='https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80'">
            <div class="sleeve-edge-sheen"></div>
          </div>

          <!-- Realistic Vinyl Record Disc -->
          <div class="featured-vinyl-disk" id="featured-vinyl-img">
            <div class="vinyl-groove-rings"></div>
            <div class="vinyl-light-sheen"></div>
            <div class="vinyl-center-label">
              <img class="vinyl-label-art"
                src="${safeUrl(artworkUrl)}"
                alt=""
                onerror="this.src='https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80'">
              <div class="vinyl-spindle-hole"></div>
            </div>
          </div>
        </div>

        <!-- Info Details -->
        <div class="featured-info">
          <div class="featured-title" title="${esc(user.featuredSong.title)}">${esc(user.featuredSong.title)}</div>
          <div class="featured-artist">${esc(user.featuredSong.artist)}</div>
        </div>

        <!-- Large Play Button -->
        <div class="featured-actions">
          <button class="featured-play-btn" onclick="window._playTrack(${jsArg(user.featuredSong)})" title="Tocar música de destaque">
            ${ICONS.play}
          </button>
        </div>
      </div>
    </div>` : (isMe ? `
    <div class="featured-song-box empty" style="cursor:pointer;justify-content:center;padding:18px 20px;" onclick="window._editFeaturedSong()">
      <span style="font-size:0.86rem;color:var(--purple-light);font-weight:700;display:flex;align-items:center;gap:8px;">
        ${ICONS.disc || ICONS.music} Escolher música em destaque
      </span>
    </div>` : '');

  const showcaseHtml = buildShowcaseHtml(user, isMe);
  const topArtistsHtml = buildTopArtistsMonthHtml(user, isMe);
  const presence = isMe ? { online: true, known: true, label: 'online' } : presenceOf(user);
  const lfmUser = lastFmUserOf(user);
  const listeningHtml = lfmUser ? `
    <section class="profile-listening" id="profile-listening" data-lfm="${esc(lfmUser)}" aria-label="O que ${esc(user.name)} anda ouvindo">
      <div class="profile-listening-head">${ICONS.headphones}<span>Ouvindo no Last.fm</span></div>
      <div class="profile-listening-body"><div class="profile-listening-empty">Carregando…</div></div>
    </section>` : '';

  // Banner: the user's image, or a neutral wash of the chosen accent color
  const bannerStyle = user.bannerUrl && safeUrl(user.bannerUrl)
    ? `background-image:url(&quot;${safeUrl(user.bannerUrl)}&quot;);background-size:cover;background-position:center;`
    : `background:linear-gradient(135deg, var(--accent-soft), var(--surface));`;

  const avatarMarkup = avatarInner(user.avatar, user.name);

  const avatarHtml = `
    <div class="profile-avatar-wrap" ${isMe ? 'onclick="window._editAvatar()" title="Alterar foto de perfil"' : ''}>
      <div class="profile-main-avatar">
        ${avatarMarkup}
      </div>
      ${isMe ? `
        <div class="avatar-edit-overlay">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
        </div>` : ''}
    </div>`;

  container.innerHTML = `
    <div class="profile-wrap">
      <div class="profile-banner" style="${bannerStyle}">
        ${isMe ? `<button class="btn-edit-banner" onclick="window._editBanner()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg> Alterar banner</button>` : ''}
      </div>
      <div class="profile-info-card">
        <div class="profile-top-row">
          ${avatarHtml}
          <div class="profile-action-row">
            ${!isMe ? `
              <button class="doodle-btn doodle-btn-follow${following ? ' following' : ''}" id="follow-btn-${user.id}" data-follow-id="${user.id}"
                onclick="window._toggleFollow('${user.id}')">
                ${following ? 'Seguindo' : 'Seguir'}
              </button>
              <button class="doodle-btn doodle-btn-ghost doodle-btn-sm" data-dm-id="${user.id}" onclick="window._openDMWith('${user.id}')"
                title="Mandar mensagem" aria-label="Mandar mensagem"${following ? '' : ' hidden'}>
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
          <div class="profile-name">${esc(user.name)}</div>
          <div class="profile-handle">${esc(user.handle || '@' + user.name.toLowerCase())}
            ${presence.known ? `<span class="profile-presence${presence.online ? ' online' : ''}"><i aria-hidden="true"></i>${esc(presence.online ? 'Online' : presence.label.replace(/^visto/, 'Visto'))}</span>` : ''}
          </div>
          <!-- Inline editable status (shown above actions) -->
          <div class="profile-status-wrap">
            ${isMe ? `
              <div id="status-display" class="profile-status-pill" onclick="window._startEditStatus()">
                <span id="status-text">${esc(user.status || 'Adicionar status...')}</span>
                ${ICONS.edit}
              </div>
              <div id="status-form" class="inline-status-form" style="display:none;">
                <input id="status-input" class="inline-status-input" value="${esc(user.status || '')}" placeholder="Status..." maxlength="60">
                <button class="doodle-btn doodle-btn-primary doodle-btn-sm" onclick="window._saveStatus()">Ok</button>
                <button class="doodle-btn doodle-btn-ghost doodle-btn-sm" onclick="window._cancelEditStatus()">X</button>
              </div>
            ` : `
              <div class="profile-status-pill" style="cursor:default;">
                ${esc(user.status || '')}
              </div>
            `}
          </div>
          ${user.bio ? `<div class="profile-bio" style="${bioFontStyle(user.bioFont)}">${esc(user.bio)}</div>` : ''}
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
        ${listeningHtml}
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

  mountTabIndicator(container.querySelector('.profile-subtabs'));

  // Swap initial placeholders for real artist photos (async; cached afterwards)
  hydrateArtistImages(container, user.id);

  // Load default tab
  loadProfileTab('posts', user.id);
  if (lfmUser) loadListening(container.querySelector('#profile-listening'), lfmUser);


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
    const buttons = [...document.querySelectorAll('.profile-subtab-btn')];
    const direction = tabDirection(buttons.findIndex(b => b.classList.contains('active')), buttons.indexOf(btn));
    buttons.forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.profile-subtab-content').forEach(c => c.style.display = 'none');
    btn.classList.add('active');
    const el = document.getElementById(`profile-tab-${tabId}`);
    if (el) el.style.display = 'block';
    loadProfileTab(tabId, user.id);
    animatePanel(el, direction);
  };
}

// What the person is playing now and the last few songs, straight from Last.fm
async function loadListening(section, username) {
  const body = section?.querySelector('.profile-listening-body');
  if (!body) return;
  try {
    const { nowPlaying, recent } = await fetchLastFmRecentTracks(username, 5);
    if (!section.isConnected) return;
    const row = (t, now) => `
      <div class="profile-listening-row${now ? ' now' : ''}" role="button" tabindex="0"
        onclick="window._playTrack(${jsArg({ title: t.title, artist: t.artist, artwork: t.artwork })})" title="Tocar prévia">
        ${t.artwork ? `<img src="${safeUrl(t.artwork)}" alt="" loading="lazy">` : `<span class="profile-listening-cover">${ICONS.music}</span>`}
        <div class="profile-listening-text">
          <strong>${esc(t.title)}</strong>
          <span>${esc(t.artist)}</span>
        </div>
        <span class="profile-listening-when">${now ? '<span class="eq" aria-hidden="true"><i></i><i></i><i></i></span> agora' : esc(t.playedAt ? relativeTime(t.playedAt) : '')}</span>
      </div>`;
    if (!nowPlaying && !recent.length) {
      body.innerHTML = `<div class="profile-listening-empty">Nada registrado no Last.fm ainda.</div>`;
      return;
    }
    section.querySelector('.profile-listening-head span').textContent = nowPlaying ? 'Ouvindo agora' : 'Ouviu por último';
    body.innerHTML = `${nowPlaying ? row(nowPlaying, true) : ''}${recent.slice(0, nowPlaying ? 4 : 5).map(t => row(t, false)).join('')}`;
  } catch (err) {
    if (section.isConnected) body.innerHTML = `<div class="profile-listening-empty">${esc(err?.code === 17 ? 'O histórico desse perfil é privado no Last.fm.' : 'Não foi possível ver o Last.fm agora.')}</div>`;
  }
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
          <span>Adicionar redes sociais</span>
        </button>
      </div>`;
  }

  const instaClean = insta.replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/$/, '');
  const twitterClean = twitter.replace(/^@/, '').replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//, '').replace(/\/$/, '');
  const lastfmClean = lastfm.replace(/^@/, '').replace(/^https?:\/\/(www\.)?last\.fm\/user\//, '').replace(/\/$/, '');

  return `
    <div class="profile-socials-row">
      ${instaClean ? `
        <a href="https://instagram.com/${encodeURIComponent(instaClean)}" target="_blank" rel="noopener noreferrer" class="profile-social-pill instagram" title="Instagram de ${esc(user.name || '')}">
          ${ICONS.instagram}
          <span>@${esc(instaClean)}</span>
        </a>` : ''}

      ${twitterClean ? `
        <a href="https://x.com/${encodeURIComponent(twitterClean)}" target="_blank" rel="noopener noreferrer" class="profile-social-pill x-twitter" title="X (Twitter) de ${esc(user.name || '')}">
          ${ICONS.twitter}
          <span>@${esc(twitterClean)}</span>
        </a>` : ''}

      ${lastfmClean ? `
        <a href="https://www.last.fm/user/${encodeURIComponent(lastfmClean)}" target="_blank" rel="noopener noreferrer" class="profile-social-pill lastfm" title="Perfil Last.fm de ${esc(user.name || '')}">
          ${ICONS.lastfm}
          <span>${esc(lastfmClean)}</span>
        </a>` : ''}

      ${isMe ? `
        <button type="button" class="profile-social-edit-icon" onclick="window._openProfileEdit()" title="Editar redes sociais">
          ${ICONS.edit || '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>'}
        </button>` : ''}
    </div>`;
}

// Stored images that are generic stock photos (old seed data) count as "no photo"
const hasRealArtistPhoto = (url) => Boolean(url) && !/images\.unsplash\.com|\/images\/artist\/(\/|d41d8cd98f00b204e9800998ecf8427e)/.test(url);

// Artist photo, or an initial placeholder that hydrateArtistImages() swaps for the real photo
function artistPhotoHtml(artist, className) {
  const initial = esc((artist.name || '?').trim()[0] || '?');
  if (hasRealArtistPhoto(artist.imageUrl)) {
    return `<img class="${className}" src="${safeUrl(artist.imageUrl)}" alt="${esc(artist.name)}" loading="lazy" data-fallback-initial="${initial}" onerror="window._artistPhotoFailed(this)">`;
  }
  return `<span class="${className} artist-photo-fallback" data-artist-img="${esc(artist.name)}" aria-hidden="true">${initial}</span>`;
}

// A stored photo URL that stopped working falls back to the initial
window._artistPhotoFailed = (img) => {
  const span = document.createElement('span');
  span.className = `${img.className} artist-photo-fallback`;
  span.textContent = img.dataset.fallbackInitial || '?';
  img.replaceWith(span);
};

function formatScrobbles(n) {
  return `${Number(n).toLocaleString('pt-BR')} ${Number(n) === 1 ? 'scrobble' : 'scrobbles'}`;
}

function buildTopArtistsMonthHtml(user, isMe) {
  const topArtists = user.topArtistsMonth || (user.topArtist ? [user.topArtist] : []);
  const service = user.musicService || 'lastfm';
  const isLastFm = service === 'lastfm';
  const periodLabel = isLastFm ? (user.musicPeriodLabel || 'do mês') : '';
  const lastfmUser = isLastFm ? (user.spotifyUsername || '') : '';

  if (!topArtists.length) {
    if (!isMe) return '';
    return `
      <div class="top-artists-section top-artists-empty">
        <div class="top-artists-title">${ICONS.trophy} Seus artistas mais ouvidos</div>
        <p>Conecte seu Last.fm para mostrar seus Top 5 artistas e músicas, com fotos, aqui no perfil.</p>
        <button class="doodle-btn doodle-btn-primary doodle-btn-sm" onclick="window._openSpotifyModal()">Conectar Last.fm</button>
      </div>`;
  }

  const top1 = topArtists[0];
  const others = topArtists.slice(1, 5);
  const sub = (a) => a.playcount ? formatScrobbles(a.playcount) : (a.genre || 'Top artista');
  const profileUrl = user.musicProfileUrl || `https://www.last.fm/user/${encodeURIComponent(lastfmUser)}`;

  return `
    <div class="top-artists-section">
      <div class="top-artists-header">
        <div class="top-artists-title">
          <span style="display:inline-flex;align-items:center;gap:6px;">${ICONS.trophy} Top 5 Artistas ${esc(periodLabel)}</span>
          ${isLastFm && lastfmUser
            ? `<a class="top-artists-service-badge lastfm" href="${safeUrl(profileUrl)}" target="_blank" rel="noopener noreferrer" title="Abrir perfil no Last.fm">Last.fm · ${esc(lastfmUser)}</a>`
            : `<span class="top-artists-service-badge custom">Escolhidos</span>`}
        </div>
        ${isMe ? `
          <button class="doodle-btn doodle-btn-ghost doodle-btn-sm" onclick="window._openSpotifyModal()" style="font-size:0.72rem;padding:3px 8px;" title="Atualizar com o Last.fm ou escolher artistas">
            ${isLastFm ? 'Atualizar' : 'Editar'}
          </button>
        ` : ''}
      </div>

      ${top1 ? `
        <div class="top-artist-spotlight" onclick="window._searchArtistInCatalog(${jsArg(top1.name)})" title="Ver músicas de ${esc(top1.name)}">
          ${artistPhotoHtml(top1, 'spotlight-avatar')}
          <div class="spotlight-info">
            <div class="spotlight-rank-crown">${ICONS.trophy} #1 mais ouvido</div>
            <div class="spotlight-title">${esc(top1.name)}</div>
            <div class="spotlight-scrobbles"><span>${esc(sub(top1))}</span></div>
          </div>
          <button class="doodle-btn doodle-btn-secondary doodle-btn-sm" onclick="event.stopPropagation();window._searchArtistInCatalog(${jsArg(top1.name)})" title="Buscar músicas deste artista">
            Músicas
          </button>
        </div>
      ` : ''}

      ${others.length ? `
        <div class="top-artists-grid">
          ${others.map((a, i) => `
            <div class="top-artist-item" onclick="window._searchArtistInCatalog(${jsArg(a.name)})" title="Ver músicas de ${esc(a.name)}">
              <div class="artist-rank-badge">#${a.rank || i + 2}</div>
              ${artistPhotoHtml(a, 'artist-avatar-thumb')}
              <div class="artist-item-info">
                <div class="artist-item-name">${esc(a.name)}</div>
                <div class="artist-item-sub">${esc(sub(a))}</div>
              </div>
            </div>
          `).join('')}
        </div>
      ` : ''}

      ${buildTopTracksHtml(user, periodLabel)}
    </div>`;
}

// Top tracks synced from Last.fm (cover + 30s preview when found on iTunes)
function buildTopTracksHtml(user, periodLabel) {
  const tracks = user.topTracksMonth || [];
  if (!tracks.length) return '';
  return `
    <div class="top-tracks">
      <div class="top-tracks-title">Músicas mais ouvidas ${esc(periodLabel)}</div>
      <ol class="top-tracks-list">
        ${tracks.slice(0, 5).map((t, i) => `
          <li class="top-track-row">
            <span class="top-track-rank">${t.rank || i + 1}</span>
            ${t.artwork
              ? `<img class="top-track-cover" src="${safeUrl(t.artwork)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`
              : `<span class="top-track-cover artist-photo-fallback" aria-hidden="true">${esc((t.title || '?')[0])}</span>`}
            <div class="top-track-meta">
              <div class="top-track-title">${esc(t.title)}</div>
              <div class="top-track-artist">${esc(t.artist)}${t.playcount ? ` · ${esc(formatScrobbles(t.playcount))}` : ''}</div>
            </div>
            <button class="top-track-play" onclick="window._playTrack(${jsArg({ id: t.id, title: t.title, artist: t.artist, artwork: t.artwork, previewUrl: t.previewUrl, duration: t.duration })})" aria-label="Tocar ${esc(t.title)}">
              ${ICONS.play}
            </button>
          </li>`).join('')}
      </ol>
    </div>`;
}

/**
 * Replace initial placeholders with real artist photos and remember them on the user,
 * so the next render shows the photo immediately.
 * @param {HTMLElement} root
 * @param {string} userId
 */
export async function hydrateArtistImages(root, userId) {
  const slots = [...root.querySelectorAll('[data-artist-img]')];
  if (!slots.length) return;

  const found = {};
  await Promise.all(slots.map(async slot => {
    const name = slot.dataset.artistImg;
    const url = await getArtistImage(name);
    if (!url || !slot.isConnected) return;
    found[name.toLowerCase()] = url;
    const img = document.createElement('img');
    img.className = slot.className.replace('artist-photo-fallback', '').trim();
    img.alt = name;
    img.src = url;
    img.onerror = () => img.replaceWith(slot);
    slot.replaceWith(img);
  }));

  if (!Object.keys(found).length) return;
  const user = Storage.getUserById(userId);
  if (!user?.topArtistsMonth?.length) return;
  const topArtistsMonth = user.topArtistsMonth.map(a => {
    const url = found[(a.name || '').toLowerCase()];
    return url ? { ...a, imageUrl: url } : a;
  });
  Storage.updateUser(userId, { topArtistsMonth, topArtist: topArtistsMonth[0] });
}

function buildShowcaseHtml(user, isMe) {
  const showcase = user.songShowcase || [];
  const slots = Array.from({ length: 5 }, (_, i) => showcase[i] || null);

  const html = slots.map((song, i) => {
    if (song) {
      return `
        <div class="showcase-slot" title="${esc(song.title)} — ${esc(song.artist)}"
          onclick="window._playTrack(${jsArg(song)})">
          ${song.artwork ? `<img src="${safeUrl(song.artwork)}" alt="${esc(song.title)}" loading="lazy">` : `<div class="showcase-slot-add" style="display:flex;align-items:center;justify-content:center;">${ICONS.music}</div>`}
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
            coverHtml = `<img src="${safeUrl(pl.coverUrl)}" alt="${esc(pl.title)}" style="width:100%;height:100%;object-fit:cover;">`;
          } else if (songsWithArt.length >= 4) {
            coverHtml = `
              <div style="display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;width:100%;height:100%;">
                <img src="${safeUrl(songsWithArt[0].artwork)}" style="width:100%;height:100%;object-fit:cover;">
                <img src="${safeUrl(songsWithArt[1].artwork)}" style="width:100%;height:100%;object-fit:cover;">
                <img src="${safeUrl(songsWithArt[2].artwork)}" style="width:100%;height:100%;object-fit:cover;">
                <img src="${safeUrl(songsWithArt[3].artwork)}" style="width:100%;height:100%;object-fit:cover;">
              </div>`;
          } else if (songsWithArt.length > 0) {
            coverHtml = `<img src="${safeUrl(songsWithArt[0].artwork)}" style="width:100%;height:100%;object-fit:cover;">`;
          } else {
            coverHtml = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,var(--hover),var(--surface));color:var(--purple-light);font-size:1.8rem;">${ICONS.playlist}</div>`;
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
                  <div style="font-size:0.88rem;font-weight:800;color:var(--white);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(pl.title)}</div>
                  ${pl.description ? `<div style="font-size:0.75rem;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px;">${esc(pl.description)}</div>` : ''}
                </div>
                <div style="display:flex;align-items:center;justify-content:space-between;margin-top:8px;font-size:0.72rem;color:var(--purple-light);font-weight:600;">
                  <span>${songs.length} ${songs.length === 1 ? 'música' : 'músicas'}</span>
                  <span style="color:var(--muted);font-weight:normal;">${esc(pl.createdAt || '')}</span>
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
              <img src="${safeUrl(s.artwork || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80')}" 
                   alt="${esc(s.title || '')}" 
                   style="width:54px;height:54px;min-width:54px;border-radius:8px;object-fit:cover;border:1px solid var(--tint-2);cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.4);"
                   onclick="window._playTrack(${jsArg(trackObj)})"
                   title="Ouvir prévia">
              <div style="flex:1;min-width:0;">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px;">
                  <div style="min-width:0;flex:1;">
                    <div style="font-size:0.9rem;font-weight:800;color:var(--white);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;" onclick="window._playTrack(${jsArg(trackObj)})" title="Clique para ouvir">
                      ${esc(s.title || 'Sem título')}
                    </div>
                    <div style="font-size:0.75rem;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                      ${esc(s.artist || 'Artista desconhecido')} ${item.targetUserName ? `· <span style="color:var(--purple-light);">Lista de ${item.targetUserName}</span>` : ''}
                    </div>
                  </div>
                  <div class="post-rating-display" style="margin:0;padding:2px 8px;flex-shrink:0;">
                    ${renderRatingStars(item.rating, 14)}
                    <span style="font-size:0.8rem;font-weight:800;">${item.rating.toFixed(1)}</span>
                  </div>
                </div>
                ${item.comment ? `
                  <div style="font-size:0.82rem;color:var(--white);background:var(--bg-surface);border-radius:6px;padding:6px 10px;margin-top:6px;border-left:2.5px solid var(--purple-accent);">
                    "${esc(item.comment)}"
                  </div>` : ''}
                ${item.lyrics ? `
                  <div style="font-size:0.75rem;color:var(--purple-light);font-style:italic;margin-top:4px;">
                    "${esc(item.lyrics)}"
                  </div>` : ''}
                <div style="display:flex;align-items:center;justify-content:space-between;margin-top:6px;font-size:0.7rem;color:var(--purple-muted);">
                  <span>${item.isChallengeReview ? '⭐ Avaliação em Comparar' : (item.createdAt || '')}</span>
                  <button class="doodle-btn doodle-btn-ghost doodle-btn-sm" style="padding:2px 8px;font-size:0.72rem;display:inline-flex;align-items:center;gap:4px;" onclick="window._playTrack(${jsArg(trackObj)})">
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

function featuredEditRowHtml(user) {
  const song = user.featuredSong;
  return `
    <button type="button" class="doodle-btn doodle-btn-secondary doodle-btn-sm" onclick="window._editFeaturedSong()" style="max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
      ${song ? `Alterar: ${esc(song.title)} — ${esc(song.artist)}` : '+ Escolher Música'}
    </button>
    ${song ? `<button type="button" class="doodle-btn doodle-btn-danger doodle-btn-sm" onclick="window._removeFeaturedSong()">Remover</button>` : ''}`;
}

/** Refresh just the "Música em Destaque" row of the open edit modal (keeps what was typed in the other fields). */
export function refreshFeaturedEditRow() {
  const row = document.getElementById('edit-featured-row');
  if (row) row.innerHTML = featuredEditRowHtml(Storage.getActiveUser());
}

export function renderProfileEditModal() {
  const user = Storage.getActiveUser();
  const modal = document.getElementById('profile-edit-modal');
  if (!modal) return;

  modal.querySelector('.modal-body').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:14px;">

      <!-- BASIC INFO -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div>
          <label class="form-label">Nome</label>
          <input id="edit-name" class="doodle-input" value="${esc(user.name || '')}" placeholder="Seu nome">
        </div>
        <div>
          <label class="form-label">Handle</label>
          <input id="edit-handle" class="doodle-input" value="${esc(user.handle || '')}" placeholder="@voce">
        </div>
      </div>

      <div>
        <label class="form-label" for="edit-bio">Bio</label>
        <textarea id="edit-bio" class="doodle-input bio-edit-input" rows="3" maxlength="500" placeholder="Fale sobre você e o que anda ouvindo" style="${bioFontStyle(user.bioFont)}"
          oninput="document.getElementById('bio-count').textContent = this.value.length + '/500'">${esc(user.bio || '')}</textarea>
        <div class="bio-edit-foot">
          <div class="bio-font-picker" role="radiogroup" aria-label="Fonte da bio">
            ${BIO_FONTS.map(f => `
              <button type="button" role="radio" class="bio-font-chip${bioFont(user.bioFont).id === f.id ? ' active' : ''}" aria-checked="${bioFont(user.bioFont).id === f.id}"
                data-bio-font="${f.id}" style="${bioFontStyle(f.id)}" onclick="window._pickBioFont('${f.id}')">${f.label}</button>`).join('')}
          </div>
          <span id="bio-count" class="bio-count">${(user.bio || '').length}/500</span>
        </div>
      </div>

      <!-- REDES SOCIAIS -->
      <div style="border:1px solid var(--line);border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:10px;">
        <div style="font-size:0.85rem;font-weight:800;color:var(--white);display:flex;align-items:center;gap:6px;">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--purple-light);"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
          <span>Redes Sociais & Perfis de Música</span>
        </div>

        <div>
          <label class="form-label" style="display:flex;align-items:center;gap:6px;font-size:0.78rem;">
            Instagram (usuário ou link)
          </label>
          <input id="edit-instagram" class="doodle-input" value="${esc(user.instagram || user.socials?.instagram || '')}" placeholder="@usuario ou https://instagram.com/usuario">
        </div>

        <div>
          <label class="form-label" style="display:flex;align-items:center;gap:6px;font-size:0.78rem;">
            X / Twitter (usuário ou link)
          </label>
          <input id="edit-twitter" class="doodle-input" value="${esc(user.twitter || user.x || user.socials?.twitter || '')}" placeholder="@usuario ou https://x.com/usuario">
        </div>

        <div>
          <label class="form-label" style="display:flex;align-items:center;gap:6px;font-size:0.78rem;">
            Last.fm (usuário ou link)
          </label>
          <input id="edit-lastfm" class="doodle-input" value="${esc(user.lastfm || user.socials?.lastfm || (user.musicService === 'lastfm' ? user.spotifyUsername : '') || '')}" placeholder="usuario_lastfm">
        </div>
      </div>

      <div class="profile-edit-photos">
        <button type="button" class="doodle-btn doodle-btn-secondary" onclick="window._editAvatar()">${ICONS.image} Foto de perfil</button>
        <button type="button" class="doodle-btn doodle-btn-secondary" onclick="window._editBanner()">${ICONS.image} Banner</button>
      </div>

      <div>
        <label class="form-label">Música em Destaque</label>
        <div id="edit-featured-row" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">${featuredEditRowHtml(user)}</div>
      </div>

      <div style="display:flex;gap:8px;justify-content:flex-end;padding-top:6px;">
        <button type="button" class="doodle-btn doodle-btn-ghost" onclick="window._closeProfileEdit()">Cancelar</button>
        <button type="button" class="doodle-btn doodle-btn-primary" onclick="window._saveProfileEdit()">Salvar Alterações</button>
      </div>
    </div>`;

  openModal('profile-edit-modal');

  let pickedBioFont = bioFont(user.bioFont).id;
  window._pickBioFont = (id) => {
    pickedBioFont = bioFont(id).id;
    document.querySelectorAll('.bio-font-chip').forEach(b => {
      const on = b.dataset.bioFont === pickedBioFont;
      b.classList.toggle('active', on);
      b.setAttribute('aria-checked', String(on));
    });
    const input = document.getElementById('edit-bio');
    if (input) input.setAttribute('style', bioFontStyle(pickedBioFont));
  };

  window._saveProfileEdit = () => {
    const instaVal = document.getElementById('edit-instagram')?.value?.trim() || '';
    const twitVal = document.getElementById('edit-twitter')?.value?.trim() || '';
    const lastfmVal = document.getElementById('edit-lastfm')?.value?.trim() || '';

    const updates = {
      name:                 document.getElementById('edit-name')?.value?.trim() || user.name,
      handle:               document.getElementById('edit-handle')?.value?.trim() || user.handle,
      bio:                  (document.getElementById('edit-bio')?.value?.trim() || '').slice(0, 500),
      bioFont:              pickedBioFont,
      instagram:            instaVal,
      twitter:              twitVal,
      lastfm:               lastfmVal,
      socials: {
        instagram: instaVal,
        twitter: twitVal,
        lastfm: lastfmVal
      },
    };
    Storage.updateUser(user.id, updates);
    closeModal('profile-edit-modal');
    showToast('Perfil atualizado!');
    window._refreshSidebarUser?.();
    window._refreshProfile?.();
  };

  window._closeProfileEdit = () => closeModal('profile-edit-modal');
}

// ──────────────────────────────────────────
// FOLLOW LIST MODAL
// ──────────────────────────────────────────

export function renderFollowListModal(userId, mode) {
  const ids = mode === 'following' ? Storage.getFollowing(userId) : Storage.getFollowers(userId);
  renderPeopleListModal(mode === 'following' ? 'Seguindo' : 'Seguidores', ids);
}

/** A list of people (with follow buttons) in the shared modal: followers, who liked, who reposted... */
export function renderPeopleListModal(title, ids, emptyText = 'Ninguém aqui ainda.') {
  const modal = document.getElementById('follow-list-modal');
  if (!modal) return;

  modal.querySelector('.modal-header h3').textContent = title;
  const users = ids.map(id => Storage.getUserById(id)).filter(Boolean);

  modal.querySelector('.modal-body').innerHTML = users.length ? users.map(u => `
    <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:var(--border);cursor:pointer;" onclick="closeModal('follow-list-modal');window._goToProfile('${u.id}')">
      <div class="post-author-avatar" style="overflow:hidden;">${avatarInner(u.avatar, u.name)}</div>
      <div>
        <div style="font-size:0.88rem;font-weight:700;color:var(--white)">${esc(u.name)}</div>
        <div style="font-size:0.72rem;color:var(--muted)">${esc(u.handle || '')}</div>
      </div>
      ${u.id !== Storage.getActiveUserId() ? `
        <button class="doodle-btn doodle-btn-follow doodle-btn-sm${Storage.isFollowing(u.id) ? ' following' : ''}" data-follow-id="${u.id}" style="margin-left:auto;" onclick="event.stopPropagation();window._toggleFollow('${u.id}')">
          ${Storage.isFollowing(u.id) ? 'Seguindo' : 'Seguir'}
        </button>` : ''}
    </div>`).join('') :
    `<div class="empty-state"><div class="empty-state-sub">${esc(emptyText)}</div></div>`;

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
