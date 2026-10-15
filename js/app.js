import { esc, safeUrl, jsArg, avatarInner, isImageAvatar } from './dom.js';
import { initStorage, getActiveUser, getAllUsers, getUserById,
         toggleFollow, isFollowing, toggleLikePost, toggleRepostPost,
         toggleBookmark, addCommentToPost, pinPost, deletePost,
         updatePost, getPostById,
         createPost, setFeaturedSong, addToShowcase, removeFromShowcase,
         getUnreadNotificationCount, getFeedPosts, getChallengeAnswers,
         getActiveChallengeId, getChallengeAnswers as getAnswers,
         updateUserMusicStats, getAllPlaylists, getPlaylistById } from './storage.js';

import { globalAudio } from './audio.js';
import { ICONS } from './icons.js';
import { catLogoHtml, setCatMood, initCatLogo } from './logo.js';
import { auth, initAuth, logout } from './auth.js';
import { showAuthScreen } from './authScreen.js';
import { openFeedbackModal } from './feedback.js';
import { openDisplaySettings, initDisplay } from './display.js';
import { mountTabIndicator, tabDirection, animatePanel } from './tabs.js';
import { startSync, stopSync, pullNow } from './sync.js';
import { renderSearchPage, openSearch } from './search.js';
import { renderAdminTab } from './admin.js';
import { renderDailyLyric } from './dailyLyric.js';
import { searchTracks } from './api.js';
import { fetchLastFmUserTop, getArtistImage } from './lastfm.js';
import {
  openDoodleModal, closeDoodleModal, showDoodleToast,
  initSearchModal, openSearchModalForFeed, openSearchModalForLyrics, openSearchModalForFeaturedSong,
  openSearchModalForChat, openSearchModalForShowcase,
  renderMusicAskGrid, renderChallengePills, renderCompareView,
  renderNotificationsPanel, renderPlayerBar
} from './ui.js';
import {
  renderPostCreator, renderFeed,
  renderTrendingWidget, renderFriendsWidget, creatorState
} from './feed.js';
import {
  renderProfileView, renderProfileEditModal, renderFollowListModal,
  openModal, closeModal, showToast
} from './profile.js';
import { openDMWindow, closeDMWindow, toggleDMWindow, initChatBindings } from './chat.js';
import { renderPlaylistsTab } from './playlists.js';

// ──────────────────────────────────────────
// INIT
// ──────────────────────────────────────────

let activeTab = 'feed';
let feedFilterMode = 'all';

document.addEventListener('DOMContentLoaded', async () => {
  initStorage();
  initDisplay();
  initCatLogo();

  // Sign-in gate: the app boots only for a signed-in account (or local demo mode)
  const state = await initAuth((s, event) => {
    if (event === 'PASSWORD_RECOVERY') showAuthScreen('recovery', () => {});
    if (event === 'SIGNED_OUT') window.location.reload();
  });
  document.getElementById('boot-splash')?.remove();
  if (state.mode === 'signed-in' || state.mode === 'local') startApp();
  else showAuthScreen(state.mode === 'recovery' ? 'recovery' : state.mode === 'banned' ? 'banned' : 'login', startApp);
});

let appStarted = false;

function startApp() {
  if (appStarted) return;
  appStarted = true;
  renderSidebar();
  renderPlayerBar();
  initSearchModal();
  initChatBindings();
  bindGlobalHandlers();
  renderNotifBadge();

  // Expose switchTab for the HTML shim
  window._switchTabFn = switchTab;
  window.openSearchModalForChat = openSearchModalForChat;
  window.openSearchModalForFeed = openSearchModalForFeed;
  window.openSearchModalForLyrics = openSearchModalForLyrics;

  // Process pending tab from shim
  if (window._pendingTab) { switchTab(window._pendingTab); window._pendingTab = null; }
  else { switchTab('feed'); }

  if (auth.mode === 'signed-in') {
    startSync(auth.user.id, { onUpdate: refreshFromServer, onError: (msg) => showDoodleToast(msg) });
  }
}

// New data from the server: redraw what's on screen, unless the person is typing in it
function refreshFromServer() {
  renderNotifBadge();
  const active = document.activeElement;
  if (activeTab === 'feed') {
    const feedPosts = document.getElementById('feed-posts');
    const typing = feedPosts?.contains(active) || [...(feedPosts?.querySelectorAll('input, textarea') || [])].some(el => el.value);
    if (feedPosts && !typing) renderFeed(feedPosts, feedFilterMode);
  }
}

// ──────────────────────────────────────────
// SIDEBAR RENDER
// ──────────────────────────────────────────

function renderSidebar() {
  const user = getActiveUser();
  const unread = getUnreadNotificationCount();
  const sidebar = document.getElementById('app-sidebar');
  if (!sidebar) return;

  sidebar.innerHTML = `
    <!-- Logo -->
    <a class="sidebar-logo" onclick="switchTab('feed')" aria-label="rede de música sem nome, ir para o feed">
      <div class="sidebar-logo-icon">${catLogoHtml({ live: true })}</div>
      <div class="sidebar-logo-text">
        <h1>rede de música</h1>
        <span>sem nome</span>
      </div>
    </a>

    <!-- Nav: Comparar fica dentro de Desafios; Perfil fica no rodapé -->
    <nav class="sidebar-nav" id="sidebar-nav">
      <button class="nav-item active" id="nav-feed" onclick="switchTab('feed')">
        ${ICONS.feed} <span>Feed</span>
      </button>
      <button class="nav-item" id="nav-search" onclick="switchTab('search')">
        ${ICONS.search} <span>Pesquisar</span>
      </button>
      <button class="nav-item" id="nav-playlists" onclick="switchTab('playlists')">
        ${ICONS.playlist} <span>Playlists</span>
      </button>
      <button class="nav-item" id="nav-desafios" onclick="switchTab('desafios')">
        ${ICONS.star} <span>Desafios</span>
      </button>
      <button class="nav-item" id="nav-chat" onclick="switchTab('chat')">
        ${ICONS.chat} <span>Chat</span>
      </button>
      <button class="nav-item" id="nav-notif" onclick="toggleNotifPanel()">
        ${ICONS.bell}
        <span>Notificações</span>
        ${unread > 0 ? `<span class="nav-badge">${unread}</span>` : ''}
      </button>
      ${auth.isAdmin ? `
      <button class="nav-item" id="nav-admin" onclick="switchTab('admin')">
        ${ICONS.shield} <span>Admin</span>
      </button>` : ''}
    </nav>

    <button class="nav-post-btn" onclick="window._composeNew()" aria-label="Postar">
      <span class="label">Postar</span><span class="ico-only" aria-hidden="true">${ICONS.plus}</span>
    </button>

    <div class="sidebar-extra">
      <button class="nav-item nav-item-quiet" id="nav-display" onclick="window._openDisplay()">
        ${ICONS.palette} <span>Exibição</span>
      </button>
      <button class="nav-item nav-item-quiet" id="nav-feedback" onclick="window._openFeedback()">
        ${ICONS.feedback} <span>Enviar feedback</span>
      </button>
    </div>

    <!-- Bottom: active user info (abre o perfil) -->
    <div class="sidebar-footer">
      <div class="sidebar-active-user" id="nav-profile" role="button" tabindex="0" onclick="switchTab('profile')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();switchTab('profile');}">
${sidebarUserHtml(user)}
      </div>
      <button class="sidebar-logout" onclick="window._logout()" title="Sair da conta" aria-label="Sair da conta">${ICONS.logout}</button>
    </div>`;
}

// Inner markup of the sidebar footer (avatar, name, handle of the active user)
function sidebarUserHtml(user) {
  return `
        <div class="sidebar-avatar">${avatarInner(user.avatar, user.name)}</div>
        <div class="sidebar-user-info">
          <div class="sidebar-user-name">${esc(user.name)}</div>
          <div class="sidebar-user-handle">${esc(user.handle || '')}</div>
        </div>`;
}

// Re-render the sidebar footer after the active user's profile changes
function refreshSidebarUser() {
  const el = document.getElementById('nav-profile');
  if (el) el.innerHTML = sidebarUserHtml(getActiveUser());
}
window._refreshSidebarUser = refreshSidebarUser;

// ──────────────────────────────────────────
// TAB SWITCHING
// ──────────────────────────────────────────

function switchTab(tabName) {
  if (tabName === 'admin' && !auth.isAdmin) tabName = 'feed';
  activeTab = tabName;

  // Update nav items
  document.querySelectorAll('.nav-item, .sidebar-active-user').forEach(el => el.classList.remove('active'));
  // Comparar não tem item próprio no menu: fica destacado como parte de Desafios
  const navEl = document.getElementById(`nav-${tabName === 'comparar' ? 'desafios' : tabName}`);
  if (navEl) navEl.classList.add('active');

  // Hide all tab contents
  document.querySelectorAll('.tab-view-content').forEach(el => el.classList.remove('active'));

  switch (tabName) {
    case 'feed':        renderFeedTab();      break;
    case 'search':      renderSearchTab();    break;
    case 'playlists':   renderPlaylistsTab(document.getElementById('tab-playlists')); break;
    case 'chat':        renderChatTab();      break;
    case 'desafios':    renderDesafiosTab();  break;
    case 'comparar':    renderCompararTab();  break;
    case 'profile':     renderProfileTab();   break;
    case 'admin':       renderAdminTab(document.getElementById('tab-admin')); break;
  }

  const el = document.getElementById(`tab-${tabName}`);
  if (el) el.classList.add('active');

  // Floating DM button visibility
  const dmFab = document.getElementById('dm-fab');
  if (dmFab) {
    if (tabName === 'chat' || tabName === 'admin') {
      dmFab.style.display = 'none';
      closeDMWindow();
    } else {
      dmFab.style.display = 'flex';
    }
  }

  window.switchTab = switchTab;
}

function renderChatTab() {
  const tab = document.getElementById('tab-chat');
  if (!tab) return;
  import('./chat.js').then(c => c.renderChatTab(tab));
}

// ──────────────────────────────────────────
// FEED TAB
// ──────────────────────────────────────────

function renderFeedTab() {
  const tab = document.getElementById('tab-feed');
  if (!tab) return;
  pullNow();

  tab.innerHTML = `
    <div class="feed-layout-cols">
      <!-- Main feed column -->
      <div class="feed-main">
        <!-- Cabeçalho fixo da linha do tempo -->
        <div class="timeline-header">
        <h1 class="timeline-title">Página inicial</h1>
        <div class="feed-filter-bar" role="tablist" aria-label="Filtrar feed">
          <button class="feed-filter-btn${feedFilterMode==='all'?' active':''}" data-filter="all" role="tab" onclick="setFeedFilter('all')">Para você</button>
          <button class="feed-filter-btn${feedFilterMode==='following'?' active':''}" data-filter="following" role="tab" onclick="setFeedFilter('following')">Seguindo</button>
        </div>
        </div>

        <!-- Post Creator -->
        <div id="creator-wrap"></div>

        <!-- Feed posts -->
        <div id="feed-posts"></div>
      </div>

      <!-- Right sidebar: Seguindo, Em alta, Letra do dia -->
      <div class="right-sidebar">
        <section class="sidebar-widget" aria-labelledby="w-following">
          <div class="widget-header">
            <h3 id="w-following">Seguindo</h3>
          </div>
          <div id="friends-widget"></div>
        </section>

        <section class="sidebar-widget" aria-labelledby="w-trending">
          <div class="widget-header">
            <h3 id="w-trending">Em alta</h3>
            <small>Last.fm</small>
          </div>
          <div id="trending-widget"></div>
        </section>

        <section class="sidebar-widget" aria-labelledby="w-lyric">
          <div class="widget-header">
            <h3 id="w-lyric">Letra do dia</h3>
          </div>
          <div id="lyric-widget-content"></div>
        </section>
      </div>
    </div>`;

  mountTabIndicator(tab.querySelector('.feed-filter-bar'), { key: 'feed' });

  // Render creator
  const creatorWrap = document.getElementById('creator-wrap');
  if (creatorWrap) renderPostCreator(creatorWrap);

  // Render feed
  const feedPosts = document.getElementById('feed-posts');
  if (feedPosts) renderFeed(feedPosts, feedFilterMode);


  window.setFeedFilter = (mode) => {
    const order = ['all', 'following'];
    const direction = tabDirection(order.indexOf(feedFilterMode), order.indexOf(mode));
    feedFilterMode = mode;
    const tabFeed = document.getElementById('tab-feed');
    if (tabFeed) {
      tabFeed.querySelectorAll('.feed-filter-btn').forEach(b => {
        const isTarget = b.dataset.filter === mode;
        b.classList.toggle('active', isTarget);
      });
    }
    const feedPostsEl = document.getElementById('feed-posts');
    if (feedPostsEl) {
      renderFeed(feedPostsEl, feedFilterMode);
      if (direction) animatePanel(feedPostsEl, direction);
    }
  };

  // Right sidebar
  renderDailyLyric(document.getElementById('lyric-widget-content'));
  const friendsEl = document.getElementById('friends-widget');
  if (friendsEl) renderFriendsWidget(friendsEl);
  const trendEl = document.getElementById('trending-widget');
  if (trendEl) renderTrendingWidget(trendEl);
}

// ──────────────────────────────────────────
// SEARCH TAB
// ──────────────────────────────────────────

function renderSearchTab() {
  const tab = document.getElementById('tab-search');
  if (tab) renderSearchPage(tab);
}

// ──────────────────────────────────────────
// DESAFIOS TAB
// ──────────────────────────────────────────

function renderDesafiosTab() {
  const tab = document.getElementById('tab-desafios');
  if (!tab) return;

  tab.innerHTML = `
    <div class="challenges-wrap">
      <div class="page-header">
        <div>
          <div class="page-title">Desafios & Listas</div>
          <div class="page-sub">Escolha um desafio e complete sua lista de músicas</div>
        </div>
        <button class="doodle-btn doodle-btn-secondary" onclick="switchTab('comparar')">
          ${ICONS.compare} <span>Comparar listas</span>
        </button>
      </div>
      <div id="challenge-pills" style="margin-bottom:16px;display:flex;gap:6px;flex-wrap:wrap;"></div>
      <div id="questions-grid"></div>
    </div>`;

  const pillsContainer = document.getElementById('challenge-pills');
  renderChallengePills(pillsContainer, (id) => {
    const grid = document.getElementById('questions-grid');
    if (grid) renderMusicAskGrid(grid, id);
  });

  const grid = document.getElementById('questions-grid');
  if (grid) renderMusicAskGrid(grid);

  window._refreshChallenges = () => renderDesafiosTab();
}

// ──────────────────────────────────────────
// COMPARAR TAB
// ──────────────────────────────────────────

function renderCompararTab() {
  const tab = document.getElementById('tab-comparar');
  if (!tab) return;
  tab.innerHTML = `<div id="compare-view-content"></div>`;
  const container = document.getElementById('compare-view-content');
  renderCompareView(container);
}

// ──────────────────────────────────────────
// PROFILE TAB
// ──────────────────────────────────────────

let currentProfileUserId = null;

function renderProfileTab(userId) {
  const tab = document.getElementById('tab-profile');
  if (!tab) return;
  tab.innerHTML = '';

  const uid = userId || getActiveUser().id;
  currentProfileUserId = uid;

  renderProfileView(tab, uid);
}

// ──────────────────────────────────────────
// NOTIFICATIONS PANEL TOGGLE
// ──────────────────────────────────────────

function toggleNotifPanel() {
  const overlay = document.getElementById('notif-overlay');
  if (!overlay) return;
  const isActive = overlay.classList.contains('active');
  if (isActive) {
    overlay.classList.remove('active');
  } else {
    const panel = document.getElementById('notif-panel-content');
    if (panel) renderNotificationsPanel(panel);
    overlay.classList.add('active');
    setCatMood('alert', 1400);
    renderNotifBadge(); // clear badge
  }
}

window.toggleNotifPanel = toggleNotifPanel;

function renderNotifBadge() {
  const count = getUnreadNotificationCount();
  const badge = document.querySelector('#nav-notif .nav-badge');
  const parent = document.getElementById('nav-notif');
  if (count > 0) {
    if (!badge && parent) {
      const b = document.createElement('span');
      b.className = 'nav-badge';
      b.textContent = count;
      parent.appendChild(b);
    } else if (badge) {
      badge.textContent = count;
    }
  } else if (badge) {
    badge.remove();
  }
}

// ──────────────────────────────────────────
// GLOBAL HANDLERS
// ──────────────────────────────────────────

function bindGlobalHandlers() {

  window._openFeedback = () => openFeedbackModal(activeTab);
  window._openDisplay = () => openDisplaySettings();
  window._composeNew = () => {
    switchTab('feed');
    requestAnimationFrame(() => document.getElementById('creator-text')?.focus());
  };
  window._logout = () => { stopSync(); logout(); };

  // Navigate to any profile
  window._goToProfile = (userId) => {
    switchTab('profile');
    renderProfileTab(userId);
    // The sidebar footer stands for the user's own profile: only keep it highlighted there
    const isOwn = !userId || userId === getActiveUser().id;
    document.getElementById('nav-profile')?.classList.toggle('active', isOwn);
  };

  // Follow toggle
  window._toggleFollow = (userId) => {
    const nowFollowing = toggleFollow(userId);
    showToast(nowFollowing ? 'Seguindo!' : 'Deixou de seguir.');

    // Update every follow button for this user (profile header, search list, follow-list modal)
    document.querySelectorAll(`[data-follow-id="${userId}"]`).forEach(btn => {
      btn.textContent = nowFollowing ? 'Seguindo' : 'Seguir';
      btn.classList.toggle('following', nowFollowing);
    });

    // Update friend list
    const friendsEl = document.getElementById('friends-widget');
    if (friendsEl) renderFriendsWidget(friendsEl);
  };

  // Like post
  window._likePost = (postId, btn) => {
    toggleLikePost(postId);
    const posts = getFeedPosts('all');
    const post = posts.find(p => p.id === postId);
    if (!post) return;
    const activeUser = getActiveUser();
    const liked = post.likes.includes(activeUser.id);
    if (liked) setCatMood('love', 1400);
    if (btn) {
      btn.classList.toggle('liked', liked);
      btn.innerHTML = (liked ? ICONS.heartFilled : ICONS.heartEmpty) + `<span class="like-count">${post.likes.length}</span>`;
    }
  };

  const refreshPostsView = () => {
    if (activeTab === 'feed') {
      const feedEl = document.getElementById('feed-posts');
      if (feedEl) renderFeed(feedEl, feedFilterMode);
    } else if (activeTab === 'profile') {
      window._refreshProfile?.();
    }
  };

  // Repost
  window._repostPost = (postId, btn) => {
    toggleRepostPost(postId);
    const post = getPostById(postId);
    const activeUser = getActiveUser();
    const isNowReposted = post && Array.isArray(post.reposts) && post.reposts.includes(activeUser.id);
    showToast(isNowReposted ? 'Repostado!' : 'Repost removido.');
    refreshPostsView();
  };

  // Bookmark
  window._bookmarkPost = (postId) => {
    const saved = toggleBookmark(postId);
    showToast(saved ? 'Post salvo!' : 'Removido dos salvos.');
    // Close options dropdown
    document.querySelectorAll('.post-options-dropdown').forEach(d => d.style.display = 'none');
    refreshPostsView();
  };

  // Toggle comments: window._toggleComments is defined in feed.js

  // Submit comment
  window._submitComment = (postId, btn) => {
    if (window._submitRichComment) {
      window._submitRichComment(postId, btn);
      return;
    }
    let postCard = btn ? btn.closest('.post-card') : null;
    if (!postCard) {
      const cards = Array.from(document.querySelectorAll(`.post-card[data-post-id="${postId}"]`));
      postCard = cards.find(c => c.offsetParent !== null) || cards[0];
    }
    const input = postCard ? postCard.querySelector('.doodle-input') : document.getElementById(`comment-input-${postId}`);
    const text = input?.value?.trim();
    if (!text) return;
    addCommentToPost(postId, text);
    if (input) input.value = '';
    refreshPostsView();
  };

  // Edit post modal
  window._closeEditPost = () => {
    window.closeModal('edit-post-modal');
    window.closeDoodleModal('edit-post-modal');
  };

  window._openEditPost = (postId) => {
    document.querySelectorAll('.post-options-dropdown').forEach(d => d.style.display = 'none');
    const post = getPostById(postId);
    if (!post) return;

    let modal = document.getElementById('edit-post-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'edit-post-modal';
      modal.className = 'modal-overlay';
      modal.innerHTML = `
        <div class="modal-box" style="max-width:480px;">
          <div class="modal-header">
            <h3>Editar Publicação</h3>
            <button class="modal-close" onclick="window._closeEditPost()">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
          <div class="modal-body" id="edit-post-modal-body"></div>
        </div>`;
      document.body.appendChild(modal);
    }

    const body = document.getElementById('edit-post-modal-body');
    if (body) {
      body.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:12px;">
          <div>
            <label class="form-label">Texto da publicação</label>
            <textarea id="edit-post-text-input" class="doodle-input" rows="4" placeholder="Escreva seu post...">${esc(post.text || '')}</textarea>
          </div>
          <div>
            <label class="form-label">Tag</label>
            <select id="edit-post-tag-select" class="doodle-input" style="width:auto;padding:4px 8px;font-size:0.8rem;">
              <option value="#música"${post.tag==='#música'?' selected':''}>#música</option>
              <option value="#letra"${post.tag==='#letra'?' selected':''}>#letra</option>
              <option value="#desabafo"${post.tag==='#desabafo'?' selected':''}>#desabafo</option>
              <option value="#descoberta"${post.tag==='#descoberta'?' selected':''}>#descoberta</option>
              <option value="#recomendo"${post.tag==='#recomendo'?' selected':''}>#recomendo</option>
            </select>
          </div>
          <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:6px;">
            <button type="button" class="doodle-btn doodle-btn-ghost" onclick="window._closeEditPost()">Cancelar</button>
            <button type="button" class="doodle-btn doodle-btn-primary" onclick="window._saveEditedPost('${post.id}')">Salvar Alterações</button>
          </div>
        </div>`;
    }

    window.openModal('edit-post-modal');
  };

  window._saveEditedPost = (postId) => {
    const text = document.getElementById('edit-post-text-input')?.value || '';
    const tag = document.getElementById('edit-post-tag-select')?.value || '#música';
    updatePost(postId, { text, tag });
    window._closeEditPost();
    showToast('Post atualizado!');
    refreshPostsView();
  };

  // Pin post
  window._pinPost = (postId) => {
    pinPost(postId);
    const activeUser = getActiveUser();
    showToast(activeUser.pinnedPostId === postId ? 'Post fixado!' : 'Post desfixado.');
    document.querySelectorAll('.post-options-dropdown').forEach(d => d.style.display = 'none');
    refreshPostsView();
  };

  // Delete post
  window._deletePost = (postId) => {
    document.querySelectorAll('.post-options-dropdown').forEach(d => d.style.display = 'none');
    if (!confirm('Excluir este post?')) return;
    deletePost(postId);
    showToast('Post excluído.');
    refreshPostsView();
  };

  // Report user
  window._reportUser = (userId) => {
    showToast('Usuário reportado. Obrigado.');
    document.querySelectorAll('.post-options-dropdown').forEach(d => d.style.display = 'none');
  };

  // Post options dropdown — contextual to clicked card
  window._togglePostOptions = (postId, event) => {
    if (event) event.stopPropagation();
    const btn = event ? (event.currentTarget || event.target.closest('.post-options-btn')) : null;
    const postCard = btn ? btn.closest('.post-card') : null;
    const dropdown = postCard ? postCard.querySelector('.post-options-dropdown') : document.getElementById(`post-options-${postId}`);
    if (!dropdown) return;
    const wasOpen = dropdown.style.display === 'block';
    document.querySelectorAll('.post-options-dropdown').forEach(d => d.style.display = 'none');
    if (!wasOpen) dropdown.style.display = 'block';
  };

  // Cache for resolved iTunes tracks to avoid repeated network requests
  const _trackSearchCache = new Map();

  // Play track via globalAudio with dynamic iTunes search & HD artwork enrichment
  window._playTrack = async (track) => {
    if (!track) return;

    // Check if this track is already active in globalAudio
    const cur = globalAudio.getCurrentTrack();
    const isSameTrack = cur && (
      (track.id && cur.id && String(track.id) === String(cur.id)) ||
      (track.previewUrl && cur.previewUrl && track.previewUrl === cur.previewUrl) ||
      (track.title && cur.title && track.title.trim().toLowerCase() === cur.title.trim().toLowerCase() &&
       track.artist && cur.artist && track.artist.trim().toLowerCase() === cur.artist.trim().toLowerCase())
    );

    if (isSameTrack) {
      globalAudio.playTrack(cur);
      return;
    }

    let trackToPlay = { ...track };
    const cacheKey = `${track.title || ''} ${track.artist || ''}`.trim().toLowerCase();

    if (!trackToPlay.previewUrl && cacheKey) {
      if (_trackSearchCache.has(cacheKey)) {
        const cached = _trackSearchCache.get(cacheKey);
        trackToPlay = { ...trackToPlay, ...cached };
      } else {
        showToast(`Buscando áudio de "${track.title || 'Música'}" no iTunes...`);
        try {
          const results = await searchTracks(cacheKey, 1);
          if (results && results.length > 0) {
            const enriched = {
              ...trackToPlay,
              previewUrl: results[0].previewUrl,
              artwork: results[0].artwork || trackToPlay.artwork,
              duration: results[0].duration || trackToPlay.duration,
              id: results[0].id || trackToPlay.id
            };
            _trackSearchCache.set(cacheKey, enriched);
            trackToPlay = enriched;
          } else {
            showToast(`Prévia não encontrada para "${track.title}".`);
            return;
          }
        } catch (e) {
          console.warn('iTunes track enrichment error:', e);
          showToast(`Erro ao buscar áudio no iTunes.`);
          return;
        }
      }
    }

    globalAudio.playTrack(trackToPlay);
  };

  window._togglePlayerPlay = () => globalAudio.togglePlayPause();
  window._seekPlayer = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const pct = (event.clientX - rect.left) / rect.width * 100;
    globalAudio.seekToPercent(pct);
  };


  // Global helper to search for artist songs in iTunes catalog
  window._searchArtistInCatalog = (artistName) => openSearch(artistName);

  // Submit post
  window._submitPost = () => {
    const textEl = document.getElementById('creator-text');
    const text = textEl?.value?.trim() || '';
    const tag  = document.getElementById('creator-tag')?.value || '#música';

    // Only include lyrics if the lyrics attachment container is active and visible
    const lyricsBox = document.getElementById('creator-lyrics-attach');
    const isLyricsActive = lyricsBox && lyricsBox.style.display !== 'none' && lyricsBox.innerHTML.trim() !== '';

    let lyrics = '';
    let lyricsSong = '';
    let lyricsArt = '';

    if (isLyricsActive) {
      const lyricsEl = document.getElementById('creator-lyrics');
      const lyricsSongEl = document.getElementById('creator-lyrics-song');
      const lyricsArtEl = document.getElementById('creator-lyrics-art');

      lyrics = lyricsEl?.value?.trim() || '';
      lyricsSong = lyricsSongEl?.value?.trim() || '';
      lyricsArt = lyricsArtEl?.value?.trim() || '';
    }

    // Check rating active
    const ratingBox = document.getElementById('creator-rating-attach');
    const isRatingActive = ratingBox && ratingBox.style.display !== 'none';

    if (!text && !lyrics && !window._pendingCreatorSong && !window._pendingCreatorImage && !window._pendingCreatorPlaylist) {
      showToast('Escreva algo ou anexe uma música, foto, playlist ou letra.');
      return;
    }

    {
      const finalRating = isRatingActive ? (creatorState.rating || 0) : 0;

      createPost({
        text,
        lyrics,
        lyricsSong,
        lyricsArt,
        tag,
        rating: finalRating,
        imageUrl: window._pendingCreatorImage || '',
        song: window._pendingCreatorSong || null,
        playlistId: window._pendingCreatorPlaylist?.id || null
      });

      // Cleanup creator
      if (textEl) textEl.value = '';
      window._pendingCreatorSong = null;
      window._pendingCreatorPlaylist = null;
      window._pendingCreatorImage = null;
      if (window._creatorRemoveLyrics) window._creatorRemoveLyrics();
      if (window._removeCreatorSong) window._removeCreatorSong();
      if (window._removeCreatorPlaylist) window._removeCreatorPlaylist();
      if (window._removeCreatorImage) window._removeCreatorImage();
      if (ratingBox) ratingBox.style.display = 'none';
      creatorState.rating = 0;

      showToast('Post publicado!');
      setCatMood('happy', 1600);
      renderFeedTab();
    }
  };

  // Creator attach song (set from search modal)
  window._setCreatorSong = (track) => {
    window._pendingCreatorSong = track;
    const el = document.getElementById('creator-song-attach');
    if (!el) return;
    el.style.display = 'block';
    el.innerHTML = `
      <div class="creator-attached-song">
        <div style="display:flex;align-items:center;gap:6px;">
          ${track.artwork ? `<img src="${safeUrl(track.artwork)}" style="width:32px;height:32px;border-radius:5px;object-fit:cover;">` : ''}
          <div>
            <div style="font-size:0.8rem;font-weight:700;color:var(--white)">${esc(track.title)}</div>
            <div style="font-size:0.72rem;color:var(--muted)">${esc(track.artist)}</div>
          </div>
        </div>
        <button class="doodle-btn doodle-btn-ghost doodle-btn-sm" onclick="window._removeCreatorSong()">Remover</button>
      </div>`;
  };

  window._removeCreatorSong = () => {
    window._pendingCreatorSong = null;
    const el = document.getElementById('creator-song-attach');
    if (el) { el.style.display = 'none'; el.innerHTML = ''; }
  };

  // Creator attach playlist
  window._creatorOpenPlaylistPicker = () => {
    const modal = document.getElementById('playlist-picker-modal');
    if (!modal) return;
    const body = modal.querySelector('.modal-body');
    const user = getActiveUser();
    const all = getAllPlaylists();
    
    // Put user playlists first
    const myPlaylists = all.filter(p => p.authorId === user.id);
    const otherPlaylists = all.filter(p => p.authorId !== user.id);
    const sorted = [...myPlaylists, ...otherPlaylists];

    if (!sorted.length) {
      body.innerHTML = `
        <div style="text-align:center;padding:30px 10px;color:var(--muted);">
          <div style="font-size:2rem;color:var(--purple-light);margin-bottom:8px;">${ICONS.playlist}</div>
          <p style="margin-bottom:14px;font-size:0.88rem;">Nenhuma playlist encontrada.</p>
          <button class="doodle-btn doodle-btn-primary doodle-btn-sm" onclick="closeDoodleModal('playlist-picker-modal');switchTab('playlists');window._openCreatePlaylistModal();">
            Criar Nova Playlist
          </button>
        </div>`;
    } else {
      body.innerHTML = `
        <div style="font-size:0.82rem;color:var(--muted);margin-bottom:12px;">
          Selecione uma playlist para anexar ao seu post:
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;max-height:340px;overflow-y:auto;padding-right:4px;">
          ${sorted.map(pl => {
            const isMine = pl.authorId === user.id;
            const songs = pl.songs || [];
            const coverArt = pl.coverUrl || (songs.find(s => !!s.artwork)?.artwork || '');
            return `
              <div class="playlist-picker-item" onclick="window._setCreatorPlaylist('${pl.id}')" style="display:flex;align-items:center;gap:12px;padding:10px 12px;background:var(--bg-surface);border:1px solid var(--border-accent);border-radius:10px;cursor:pointer;transition:all 0.15s ease;">
                <div style="width:46px;height:46px;border-radius:6px;overflow:hidden;background:#000;flex-shrink:0;display:flex;align-items:center;justify-content:center;">
                  ${coverArt ? `<img src="${safeUrl(coverArt)}" style="width:100%;height:100%;object-fit:cover;">` : `<span style="color:var(--purple-light);">${ICONS.playlist}</span>`}
                </div>
                <div style="flex:1;min-width:0;">
                  <div style="font-size:0.88rem;font-weight:700;color:var(--white);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(pl.title)}</div>
                  <div style="font-size:0.75rem;color:var(--purple-light);">${isMine ? 'Sua playlist' : 'Da comunidade'} &bull; ${songs.length} faixas</div>
                </div>
                <button class="doodle-btn doodle-btn-secondary doodle-btn-sm" style="flex-shrink:0;">
                  Selecionar
                </button>
              </div>`;
          }).join('')}
        </div>`;
    }

    openDoodleModal('playlist-picker-modal');
  };

  window._setCreatorPlaylist = (playlistId) => {
    const pl = getPlaylistById(playlistId);
    if (!pl) return;
    window._pendingCreatorPlaylist = pl;
    closeDoodleModal('playlist-picker-modal');
    const el = document.getElementById('creator-playlist-attach');
    if (!el) return;
    const songs = pl.songs || [];
    const coverArt = pl.coverUrl || (songs.find(s => !!s.artwork)?.artwork || '');

    el.style.display = 'block';
    el.innerHTML = `
      <div class="creator-attached-playlist" style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;background:linear-gradient(135deg,color-mix(in srgb, var(--hover) 85%, transparent),color-mix(in srgb, var(--surface) 95%, transparent));border:1px solid var(--purple-accent);border-radius:10px;margin-top:10px;">
        <div style="display:flex;align-items:center;gap:10px;min-width:0;">
          <div style="width:40px;height:40px;border-radius:6px;overflow:hidden;background:#000;flex-shrink:0;display:flex;align-items:center;justify-content:center;">
            ${coverArt ? `<img src="${safeUrl(coverArt)}" style="width:100%;height:100%;object-fit:cover;">` : `<span style="color:var(--purple-light);">${ICONS.playlist}</span>`}
          </div>
          <div style="min-width:0;">
            <div style="font-size:0.7rem;font-weight:800;color:var(--purple-light);">Playlist Anexada</div>
            <div style="font-size:0.86rem;font-weight:700;color:var(--white);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(pl.title)}</div>
          </div>
        </div>
        <button type="button" class="doodle-btn doodle-btn-ghost doodle-btn-sm" style="color:var(--danger);" onclick="window._removeCreatorPlaylist()">Remover</button>
      </div>`;

    const sel = document.getElementById('creator-tag');
    if (sel && sel.value === '#música') {
      sel.value = '#recomendo';
    }
    showToast(`Playlist "${pl.title}" anexada!`);
  };

  window._removeCreatorPlaylist = () => {
    window._pendingCreatorPlaylist = null;
    const el = document.getElementById('creator-playlist-attach');
    if (el) { el.style.display = 'none'; el.innerHTML = ''; }
  };

  window._goToSharedPlaylist = (playlistId) => {
    switchTab('playlists');
    window._viewPlaylist?.(playlistId);
  };

  // Creator search for song
  window._creatorOpenSearch = () => {
    openSearchModalForFeed();
  };

  // Creator search for lyrics song
  window._openSearchForLyrics = () => {
    openSearchModalForLyrics();
  };

  // Star picker for creator: window._pickStar is defined by renderCreatorRating() in feed.js

  // Profile actions
  window._openProfileEdit = () => renderProfileEditModal();
  window._editFeaturedSong = () => {
    openSearchModalForFeaturedSong();
  };
  window._removeFeaturedSong = () => {
    setFeaturedSong(null);
    showToast('Música em destaque removida.');
    window._refreshProfile();
  };
  window._editAvatar = () => {
    const user = getActiveUser();
    let modal = document.getElementById('avatar-modal');
    if (!modal) return;

    const body = document.getElementById('avatar-modal-body');
    if (body) {
      const isImg = isImageAvatar(user.avatar);
      const initialAvatarHtml = isImg
        ? `<img id="avatar-modal-preview-img" src="${safeUrl(user.avatar)}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`
        : `<span id="avatar-modal-preview-text" style="font-size:36px;font-weight:800;color:var(--purple-light);">${esc(user.avatar || user.name[0])}</span>`;

      body.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:16px;">
          <!-- Live Avatar Preview -->
          <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;">
            <div id="avatar-modal-preview-box" style="width:90px;height:90px;border-radius:50%;background:var(--purple-dark);border:3px solid var(--purple-accent);display:flex;align-items:center;justify-content:center;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.5);">
              ${initialAvatarHtml}
            </div>
            <span style="font-size:0.75rem;color:var(--muted);">Prévia da Foto</span>
          </div>

          <!-- Upload from Device -->
          <div>
            <label class="form-label" style="font-weight:700;margin-bottom:6px;display:block;">Enviar do Dispositivo:</label>
            <label class="doodle-btn doodle-btn-secondary" style="width:100%;display:flex;align-items:center;justify-content:center;gap:8px;padding:10px;cursor:pointer;font-weight:700;">
              ${ICONS.image || ''}
              <span>Escolher foto do computador / celular</span>
              <input type="file" id="avatar-modal-file" accept="image/*" style="display:none;" onchange="window._handleDirectAvatarUpload(event)">
            </label>
          </div>

          <div style="display:flex;align-items:center;gap:10px;">
            <div style="flex:1;height:1px;background:var(--tint-2);"></div>
            <span style="font-size:0.75rem;color:var(--muted);font-weight:700;">OU LINK DA WEB / EMOJI</span>
            <div style="flex:1;height:1px;background:var(--tint-2);"></div>
          </div>

          <!-- URL or Emoji Input -->
          <div>
            <label class="form-label">URL da Foto ou Letra/Emoji</label>
            <div style="display:flex;gap:8px;">
              <input id="avatar-modal-input" class="doodle-input" value="${esc(user.avatar || '')}" placeholder="https://exemplo.com/foto.jpg ou emoji" oninput="window._previewAvatarModal(this.value)">
              <button type="button" class="doodle-btn doodle-btn-ghost doodle-btn-sm" onclick="document.getElementById('avatar-modal-input').value='';window._previewAvatarModal('');">Limpar</button>
            </div>
          </div>

          <!-- Actions -->
          <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:6px;">
            <button type="button" class="doodle-btn doodle-btn-ghost" onclick="window.closeModal('avatar-modal')">Cancelar</button>
            <button type="button" class="doodle-btn doodle-btn-primary" onclick="window._saveAvatarModal()">Salvar Foto</button>
          </div>
        </div>`;
    }

    window.openModal('avatar-modal');
  };

  window._handleDirectAvatarUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      const input = document.getElementById('avatar-modal-input');
      if (input) input.value = dataUrl;
      window._previewAvatarModal(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  window._previewAvatarModal = (val) => {
    const box = document.getElementById('avatar-modal-preview-box');
    if (!box) return;
    const clean = (val || '').trim();
    const isImg = isImageAvatar(clean);
    if (isImg) {
      box.innerHTML = `<img src="${safeUrl(clean)}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
    } else {
      const fallback = clean || getActiveUser().name?.[0] || 'V';
      box.innerHTML = `<span style="font-size:36px;font-weight:800;color:var(--purple-light);">${esc(fallback)}</span>`;
    }
  };

  window._saveAvatarModal = () => {
    const input = document.getElementById('avatar-modal-input');
    const val = (input?.value || '').trim() || getActiveUser().name?.[0] || 'V';
    import('./storage.js').then(m => {
      m.updateUser(m.getActiveUserId(), { avatar: val });
      window.closeModal('avatar-modal');
      showToast('Foto de perfil atualizada!');
      refreshSidebarUser();
      window._refreshProfile?.();
    });
  };

  window._openBannerModal = () => {
    const user = getActiveUser();
    let modal = document.getElementById('banner-modal');
    if (!modal) return;

    const body = document.getElementById('banner-modal-body');
    if (body) {
      body.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:14px;">
          <!-- Mini Preview -->
          <div>
            <label class="form-label" style="margin-bottom:6px;">Pré-visualização do Banner</label>
            <div id="banner-modal-preview" style="height:120px;border-radius:12px;overflow:hidden;border:var(--border);background-size:cover;background-position:center;${user.bannerUrl && safeUrl(user.bannerUrl) ? `background-image:url(&quot;${safeUrl(user.bannerUrl)}&quot;);` : `background:linear-gradient(135deg, var(--accent-soft), var(--surface));`}"></div>
          </div>

          <!-- Upload from Device -->
          <div>
            <label class="form-label" style="font-weight:700;margin-bottom:6px;display:block;">Enviar do Dispositivo:</label>
            <label class="doodle-btn doodle-btn-secondary" style="width:100%;display:flex;align-items:center;justify-content:center;gap:8px;padding:10px;cursor:pointer;font-weight:700;">
              ${ICONS.image || ''}
              <span>Escolher banner do computador / celular</span>
              <input type="file" id="banner-modal-file" accept="image/*" style="display:none;" onchange="window._handleDirectBannerUpload(event)">
            </label>
          </div>

          <div style="display:flex;align-items:center;gap:10px;">
            <div style="flex:1;height:1px;background:var(--tint-2);"></div>
            <span style="font-size:0.75rem;color:var(--muted);font-weight:700;">OU LINK DA WEB</span>
            <div style="flex:1;height:1px;background:var(--tint-2);"></div>
          </div>

          <!-- URL Input -->
          <div>
            <label class="form-label">URL da Imagem da Web</label>
            <div style="display:flex;gap:8px;">
              <input id="banner-modal-input" class="doodle-input" value="${user.bannerUrl || ''}" placeholder="Cole o link da imagem (ex: https://...)" oninput="window._previewBannerModal(this.value)">
              <button type="button" class="doodle-btn doodle-btn-ghost doodle-btn-sm" onclick="document.getElementById('banner-modal-input').value='';window._previewBannerModal('');">Limpar</button>
            </div>
          </div>

          <!-- Presets -->
          <div>
            <label class="form-label" style="margin-bottom:6px;">Ou escolha um tema estético:</label>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
              <div class="preset-pill" style="justify-content:center;padding:8px 10px;background:linear-gradient(135deg, var(--hover), var(--hover));cursor:pointer;display:flex;align-items:center;gap:6px;" onclick="window._setBannerPreset('https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1200&auto=format&fit=crop&q=80')">
                ${ICONS.sparkles} Synthwave Neon
              </div>
              <div class="preset-pill" style="justify-content:center;padding:8px 10px;background:linear-gradient(135deg, var(--surface), var(--surface));cursor:pointer;display:flex;align-items:center;gap:6px;" onclick="window._setBannerPreset('https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=1200&auto=format&fit=crop&q=80')">
                ${ICONS.headphones} Studio Vinyl
              </div>
              <div class="preset-pill" style="justify-content:center;padding:8px 10px;background:linear-gradient(135deg, var(--surface), var(--hover));cursor:pointer;display:flex;align-items:center;gap:6px;" onclick="window._setBannerPreset('https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?w=1200&auto=format&fit=crop&q=80')">
                ${ICONS.disc} Deep Nebula
              </div>
              <div class="preset-pill" style="justify-content:center;padding:8px 10px;background:linear-gradient(135deg, var(--surface), var(--surface));cursor:pointer;display:flex;align-items:center;gap:6px;" onclick="window._setBannerPreset('https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1200&auto=format&fit=crop&q=80')">
                ${ICONS.moon} Dark Minimal
              </div>
            </div>
          </div>

          <!-- Actions -->
          <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:6px;">
            <button type="button" class="doodle-btn doodle-btn-ghost" onclick="window.closeModal('banner-modal')">Cancelar</button>
            <button type="button" class="doodle-btn doodle-btn-primary" onclick="window._saveBannerModal()">Salvar Banner</button>
          </div>
        </div>`;
    }

    window.openModal('banner-modal');
  };

  window._handleDirectBannerUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      const input = document.getElementById('banner-modal-input');
      if (input) input.value = dataUrl;
      window._previewBannerModal(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  window._previewBannerModal = (val) => {
    const prev = document.getElementById('banner-modal-preview');
    if (!prev) return;
    const url = val?.trim();
    if (url) {
      prev.style.background = '';
      prev.style.backgroundImage = `url(${JSON.stringify(url)})`;
      prev.style.backgroundSize = 'cover';
      prev.style.backgroundPosition = 'center';
    } else {
      const user = getActiveUser();
      prev.style.backgroundImage = '';
      prev.style.background = 'linear-gradient(135deg, var(--accent-soft), var(--surface))';
    }
  };

  window._setBannerPreset = (url) => {
    const input = document.getElementById('banner-modal-input');
    if (input) {
      input.value = url;
      window._previewBannerModal(url);
    }
  };

  window._saveBannerModal = () => {
    const input = document.getElementById('banner-modal-input');
    const url = input ? input.value.trim() : '';
    const user = getActiveUser();
    import('./storage.js').then(m => {
      m.updateUser(user.id, { bannerUrl: url });
      window.closeModal('banner-modal');
      showToast(url ? 'Banner atualizado com sucesso!' : 'Banner padrão restaurado.');
      window._refreshProfile();
    });
  };

  window._editBanner = () => {
    window._openBannerModal();
  };

  // ──────────────────────────────────────────
  // SPOTIFY / LAST.FM / CUSTOM TOP ARTISTS HANDLERS
  // ──────────────────────────────────────────
  let currentMusicServiceTab = 'lastfm';
  let tempPickerArtists = [];

  window._openSpotifyModal = () => {
    const user = getActiveUser();
    const input = document.getElementById('music-service-input');
    if (input) input.value = user.spotifyUsername || '';
    tempPickerArtists = user.topArtistsMonth ? [...user.topArtistsMonth] : [];
    const syncError = document.getElementById('music-service-error');
    if (syncError) { syncError.textContent = ''; syncError.hidden = true; }
    renderPickerSelectedList();
    window._setMusicServiceTab(user.musicService || 'lastfm');
    openModal('spotify-modal');
  };

  window._setMusicServiceTab = (service) => {
    currentMusicServiceTab = service === 'picker' ? 'picker' : 'lastfm';
    const btnLm = document.getElementById('tab-btn-lastfm');
    const btnPk = document.getElementById('tab-btn-picker');
    const inputMode = document.getElementById('service-input-mode');
    const pickerMode = document.getElementById('service-picker-mode');
    const label = document.getElementById('music-service-label');
    const hint = document.getElementById('music-service-hint');

    // Reset styles
    [btnLm, btnPk].forEach(b => { if (b) b.className = 'doodle-btn doodle-btn-secondary doodle-btn-sm'; });

    if (currentMusicServiceTab === 'picker') {
      if (btnPk) btnPk.className = 'doodle-btn doodle-btn-primary doodle-btn-sm';
      if (inputMode) inputMode.style.display = 'none';
      if (pickerMode) pickerMode.style.display = 'block';
    } else {
      if (btnLm) btnLm.className = 'doodle-btn doodle-btn-primary doodle-btn-sm';
      if (inputMode) inputMode.style.display = 'block';
      if (pickerMode) pickerMode.style.display = 'none';
      if (label) label.textContent = 'Nome de usuário no Last.fm (scrobbles)';
      if (hint) hint.innerHTML = 'Dica: Busca seus <strong>Top 5 Artistas do Mês</strong> e scrobbles reais em tempo real via Last.fm API.';
    }
  };

  function renderPickerSelectedList() {
    const listEl = document.getElementById('picker-selected-list');
    if (!listEl) return;

    if (!tempPickerArtists.length) {
      listEl.innerHTML = `<div style="font-size:0.75rem;color:var(--muted);padding:6px;">Nenhum artista selecionado ainda. Pesquise acima!</div>`;
      return;
    }

    listEl.innerHTML = tempPickerArtists.map((a, i) => `
      <div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--bg-card);border:var(--border);border-radius:var(--radius-md);">
        <span style="font-size:0.75rem;font-weight:800;color:var(--purple-light);width:18px;">#${i + 1}</span>
        <img src="${safeUrl(a.imageUrl || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80')}" style="width:30px;height:30px;border-radius:50%;object-fit:cover;">
        <div style="flex:1;min-width:0;">
          <div style="font-size:0.82rem;font-weight:700;color:var(--white);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(a.name)}</div>
          <div style="font-size:0.68rem;color:var(--muted);">${esc(a.genre || 'Artista')}</div>
        </div>
        <button class="doodle-btn doodle-btn-ghost doodle-btn-sm" style="padding:2px 6px;color:var(--danger);" onclick="window._removeArtistFromPicker(${i})">&times;</button>
      </div>
    `).join('');
  }

  window._removeArtistFromPicker = (idx) => {
    tempPickerArtists.splice(idx, 1);
    tempPickerArtists.forEach((a, i) => { a.rank = i + 1; });
    renderPickerSelectedList();
  };

  window._searchArtistForPicker = async () => {
    const inp = document.getElementById('picker-artist-search');
    const q = inp ? inp.value.trim() : '';
    const resEl = document.getElementById('picker-search-results');
    if (!q || !resEl) return;

    resEl.innerHTML = `<div style="font-size:0.75rem;color:var(--purple-light);padding:8px;">Buscando "${esc(q)}" no catálogo...</div>`;

    try {
      const tracks = await searchTracks(q, 8);
      if (!tracks.length) {
        resEl.innerHTML = `<div style="font-size:0.75rem;color:var(--muted);padding:8px;">Nenhum artista encontrado para "${esc(q)}".</div>`;
        return;
      }

      // Deduplicate artists
      const uniqueArtists = [];
      const seen = new Set();
      tracks.forEach(t => {
        if (!seen.has(t.artist.toLowerCase())) {
          seen.add(t.artist.toLowerCase());
          uniqueArtists.push({
            name: t.artist,
            imageUrl: t.artwork,
            genre: t.genre || 'Música'
          });
        }
      });

      // Real artist photos instead of album covers (falls back to the cover when none is found)
      await Promise.all(uniqueArtists.map(async a => {
        a.imageUrl = (await getArtistImage(a.name)) || a.imageUrl;
      }));

      resEl.innerHTML = uniqueArtists.map(a => `
        <div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--bg-card);border:var(--border);border-radius:var(--radius-md);margin-bottom:4px;">
          <img src="${safeUrl(a.imageUrl)}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;">
          <div style="flex:1;min-width:0;">
            <div style="font-size:0.82rem;font-weight:700;color:var(--white);">${esc(a.name)}</div>
            <div style="font-size:0.68rem;color:var(--muted);">${esc(a.genre)}</div>
          </div>
          <button class="doodle-btn doodle-btn-primary doodle-btn-sm" onclick="window._addArtistToPicker(${jsArg(a)})">+ Adicionar</button>
        </div>
      `).join('');
    } catch (err) {
      resEl.innerHTML = `<div style="font-size:0.75rem;color:var(--danger);padding:8px;">Erro na busca: ${esc(err.message)}</div>`;
    }
  };

  window._addArtistToPicker = (artist) => {
    if (tempPickerArtists.length >= 5) {
      showToast('Seu Top 5 já está completo. Remova um para adicionar outro.');
      return;
    }
    if (tempPickerArtists.some(a => a.name.toLowerCase() === artist.name.toLowerCase())) {
      showToast('Este artista já está na lista.');
      return;
    }

    tempPickerArtists.push({
      rank: tempPickerArtists.length + 1,
      name: artist.name,
      imageUrl: artist.imageUrl,
      genre: artist.genre,
      playcount: 0
    });

    renderPickerSelectedList();
    showToast(`"${artist.name}" adicionado ao Top 5!`);
  };

  window._submitMusicServiceSync = async () => {
    const input = document.getElementById('music-service-input');
    const username = input ? input.value.trim() : '';
    const btn = document.getElementById('btn-sync-music-service');
    const activeUser = getActiveUser();

    if (currentMusicServiceTab === 'picker') {
      if (tempPickerArtists.length === 0) {
        showToast('Adicione pelo menos 1 artista à lista.');
        return;
      }

      updateUserMusicStats(activeUser.id, {
        service: 'custom',
        username: activeUser.handle || 'me',
        topArtist: tempPickerArtists[0],
        topArtistsMonth: tempPickerArtists,
        topTracksMonth: []
      });

      closeModal('spotify-modal');
      showToast('Top 5 Artistas atualizados com sucesso!');
      if (activeTab !== 'profile') {
        switchTab('profile');
      } else {
        renderProfileTab(activeUser.id);
      }
      return;
    }

    const errorEl = document.getElementById('music-service-error');
    const showSyncError = (msg) => {
      if (errorEl) { errorEl.textContent = msg; errorEl.hidden = !msg; }
    };
    showSyncError('');

    if (!username) {
      showSyncError('Digite seu nome de usuário do Last.fm.');
      input?.focus();
      return;
    }

    if (btn) {
      btn.textContent = 'Buscando no Last.fm…';
      btn.disabled = true;
    }

    try {
      const result = await fetchLastFmUserTop(username);

      updateUserMusicStats(activeUser.id, {
        service: 'lastfm',
        username: result.username,
        profileUrl: result.profileUrl,
        period: result.period,
        periodLabel: result.periodLabel,
        topArtist: result.topArtist,
        topArtistsMonth: result.topArtistsMonth,
        topTracksMonth: result.topTracksMonth
      });

      closeModal('spotify-modal');
      showToast(`Last.fm de ${result.username} sincronizado!`);
      
      if (activeTab !== 'profile') {
        switchTab('profile');
      } else {
        renderProfileTab(activeUser.id);
      }
    } catch (err) {
      console.warn('Last.fm sync failed:', err);
      showSyncError(err.message || 'Não foi possível sincronizar com o Last.fm.');
    } finally {
      if (btn) {
        btn.textContent = 'Sincronizar Artistas';
        btn.disabled = false;
      }
    }
  };

  window._refreshProfile = () => {
    if (activeTab === 'profile') renderProfileTab(currentProfileUserId);
  };

  window._showFollowList = (userId, mode) => {
    renderFollowListModal(userId, mode);
    openModal('follow-list-modal');
  };

  window._addToShowcase = () => openSearchModalForShowcase();
  window._removeShowcase = (trackId) => {
    removeFromShowcase(trackId);
    if (activeTab === 'profile') renderProfileTab(currentProfileUserId);
  };

  // DM & Chat
  window._openDMWith = (userId) => {
    switchTab('chat');
    import('./chat.js').then(c => {
      window._selectChatContact?.(userId);
    });
  };
  document.getElementById('dm-fab')?.addEventListener('click', () => {
    toggleDMWindow();
  });

  // Close options dropdowns on outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.post-options-btn') && !e.target.closest('.post-options-dropdown')) {
      document.querySelectorAll('.post-options-dropdown').forEach(d => d.style.display = 'none');
    }
  });

  // Close overlays on outside click
  document.getElementById('notif-overlay')?.addEventListener('click', (e) => {
    if (!e.target.closest('.notifications-panel')) {
      document.getElementById('notif-overlay')?.classList.remove('active');
    }
  });

  // Close modals on overlay click
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.remove('active');
    });
  });

  // Search from challenges list posts via quick actions
  window._refreshChallenges = () => {
    if (activeTab === 'desafios') renderDesafiosTab();
  };
}
