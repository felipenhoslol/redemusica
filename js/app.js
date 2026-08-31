// App.js — Main entry point: routing, sidebar, global event handlers
import { initStorage, getActiveUser, getAllUsers, getUserById,
         toggleFollow, isFollowing, toggleLikePost, toggleRepostPost,
         toggleBookmark, addCommentToPost, pinPost, deletePost,
         updatePost, getPostById,
         createPost, setFeaturedSong, addToShowcase, removeFromShowcase,
         getUnreadNotificationCount, getFeedPosts, getChallengeAnswers,
         getActiveChallengeId, getChallengeAnswers as getAnswers } from './storage.js';

import { globalAudio } from './audio.js';
import { ICONS } from './icons.js';
import {
  openDoodleModal, closeDoodleModal, showDoodleToast,
  initSearchModal, openSearchModalForFeed, openSearchModalForFeaturedSong,
  openSearchModalForChat, openSearchModalForShowcase,
  renderMusicAskGrid, renderChallengePills, renderCompareView,
  renderNotificationsPanel, renderPlayerBar, initGlobalSearch
} from './ui.js';
import {
  renderPostCreator, renderFeed, renderLyricWidget,
  renderTrendingWidget, renderFriendsWidget
} from './feed.js';
import {
  renderProfileView, renderProfileEditModal, renderFollowListModal,
  openModal, closeModal, showToast
} from './profile.js';
import { openDMWindow, closeDMWindow, toggleDMWindow, initChatBindings } from './chat.js';

// ──────────────────────────────────────────
// INIT
// ──────────────────────────────────────────

let activeTab = 'feed';
let feedFilterMode = 'all';

document.addEventListener('DOMContentLoaded', () => {
  initStorage();
  renderSidebar();
  renderPlayerBar();
  initSearchModal();
  initGlobalSearch();
  initChatBindings();
  bindGlobalHandlers();
  renderNotifBadge();

  // Expose switchTab for the HTML shim
  window._switchTabFn = switchTab;
  window.openSearchModalForChat = openSearchModalForChat;
  window.openSearchModalForFeed = openSearchModalForFeed;

  // Process pending tab from shim
  if (window._pendingTab) { switchTab(window._pendingTab); window._pendingTab = null; }
  else { switchTab('feed'); }
});

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
    <a class="sidebar-logo" onclick="switchTab('feed')">
      <div class="sidebar-logo-icon">${ICONS.logo}</div>
      <div class="sidebar-logo-text">
        <h1>rede de musica</h1>
        <span>sem nome</span>
      </div>
    </a>

    <!-- Nav -->
    <nav class="sidebar-nav" id="sidebar-nav">
      <button class="nav-item active" id="nav-feed" onclick="switchTab('feed')">
        ${ICONS.feed} <span>Feed</span>
      </button>
      <button class="nav-item" id="nav-search-tab" onclick="switchTab('search')">
        ${ICONS.search} <span>Pesquisar</span>
      </button>
      <button class="nav-item" id="nav-desafios" onclick="switchTab('desafios')">
        ${ICONS.music} <span>Desafios</span>
      </button>
      <button class="nav-item" id="nav-comparar" onclick="switchTab('comparar')">
        ${ICONS.compare} <span>Comparar</span>
      </button>
      <button class="nav-item" id="nav-notif" onclick="toggleNotifPanel()">
        ${ICONS.chat}
        <span>Notificações</span>
        ${unread > 0 ? `<span class="nav-badge">${unread}</span>` : ''}
      </button>
      <button class="nav-item" id="nav-profile" onclick="switchTab('profile')">
        ${ICONS.profile} <span>Perfil</span>
      </button>
    </nav>

    <!-- Bottom: active user info -->
    <div class="sidebar-footer">
      <div class="sidebar-active-user" onclick="switchTab('profile')">
        <div class="sidebar-avatar">${user.avatar && (user.avatar.startsWith('http') || user.avatar.startsWith('data:') || user.avatar.startsWith('/')) ? `<img src="${user.avatar}" alt="${user.name}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">` : (user.avatar || user.name[0])}</div>
        <div class="sidebar-user-info">
          <div class="sidebar-user-name">${user.name}</div>
          <div class="sidebar-user-handle">${user.handle || ''}</div>
        </div>
      </div>
    </div>`;
}

// ──────────────────────────────────────────
// TAB SWITCHING
// ──────────────────────────────────────────

function switchTab(tabName) {
  activeTab = tabName;

  // Update nav items
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const navEl = document.getElementById(`nav-${tabName}`);
  if (navEl) navEl.classList.add('active');

  // Hide all tab contents
  document.querySelectorAll('.tab-view-content').forEach(el => el.classList.remove('active'));

  switch (tabName) {
    case 'feed':     renderFeedTab();     break;
    case 'search':   renderSearchTab();   break;
    case 'desafios': renderDesafiosTab(); break;
    case 'comparar': renderCompararTab(); break;
    case 'profile':  renderProfileTab();  break;
  }

  const el = document.getElementById(`tab-${tabName}`);
  if (el) el.classList.add('active');

  window.switchTab = switchTab;
}

// ──────────────────────────────────────────
// FEED TAB
// ──────────────────────────────────────────

function renderFeedTab() {
  const tab = document.getElementById('tab-feed');
  if (!tab) return;

  tab.innerHTML = `
    <div style="display:flex;gap:20px;align-items:flex-start;">
      <!-- Main feed column -->
      <div style="flex:1;min-width:0;">
        <!-- Feed filter -->
        <div class="feed-filter-bar" style="margin-bottom:12px;border-radius:var(--radius-lg);overflow:hidden;border:var(--border);">
          <button class="feed-filter-btn${feedFilterMode==='all'?' active':''}" onclick="setFeedFilter('all')">Todos</button>
          <button class="feed-filter-btn${feedFilterMode==='following'?' active':''}" onclick="setFeedFilter('following')">Seguindo</button>
        </div>

        <!-- Post Creator -->
        <div id="creator-wrap"></div>

        <!-- Feed posts -->
        <div id="feed-posts"></div>
      </div>

      <!-- Right sidebar -->
      <div class="right-sidebar">
        <!-- Lyric of the day -->
        <div class="sidebar-widget">
          <div class="widget-header">
            Letra do Dia
            <button style="background:transparent;border:none;color:var(--muted);cursor:pointer;font-size:0.75rem;" onclick="renderLyricWidgetEl(true)">novo</button>
          </div>
          <div id="lyric-widget-content"></div>
        </div>

        <!-- Following -->
        <div class="sidebar-widget">
          <div class="widget-header">Seguindo</div>
          <div id="friends-widget"></div>
        </div>

        <!-- Trending -->
        <div class="sidebar-widget">
          <div class="widget-header">Tendências</div>
          <div id="trending-widget"></div>
        </div>
      </div>
    </div>`;

  // Render creator
  const creatorWrap = document.getElementById('creator-wrap');
  if (creatorWrap) renderPostCreator(creatorWrap);

  // Render feed
  const feedPosts = document.getElementById('feed-posts');
  if (feedPosts) renderFeed(feedPosts, feedFilterMode);

  // Define helper first, then call it
  window.renderLyricWidgetEl = (forceNew = false) => {
    const el = document.getElementById('lyric-widget-content');
    if (el) renderLyricWidget(el, forceNew);
  };

  window.setFeedFilter = (mode) => {
    feedFilterMode = mode;
    const tabFeed = document.getElementById('tab-feed');
    if (tabFeed) {
      tabFeed.querySelectorAll('.feed-filter-btn').forEach(b => {
        const isTarget = (mode === 'all' && b.textContent.trim().toLowerCase() === 'todos') ||
                         (mode === 'following' && b.textContent.trim().toLowerCase() === 'seguindo');
        b.classList.toggle('active', isTarget);
      });
    }
    const feedPostsEl = document.getElementById('feed-posts');
    if (feedPostsEl) renderFeed(feedPostsEl, feedFilterMode);
  };

  // Right sidebar
  renderLyricWidgetEl();
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
  if (!tab) return;

  tab.innerHTML = `
    <div style="max-width:600px;margin:0 auto;">
      <div class="page-header">
        <div class="page-title">Pesquisar</div>
      </div>
      <div class="global-search-container">
        <div class="global-search-wrap">
          ${ICONS.search}
          <input id="global-search-input" class="global-search-input" placeholder="Pesquisar músicas e usuários...">
        </div>
      </div>
      <div id="global-search-results"></div>

      <hr class="separator-line" style="margin:20px 0;">

      <div style="margin-bottom:10px;">
        <div class="page-title" style="font-size:0.95rem;margin-bottom:10px;">Usuários</div>
        <div id="all-users-list"></div>
      </div>
    </div>`;

  initGlobalSearch();
  renderAllUsersList();
}

function renderAllUsersList() {
  const container = document.getElementById('all-users-list');
  if (!container) return;
  const activeUser = getActiveUser();
  const users = getAllUsers().filter(u => u.id !== activeUser.id);

  container.innerHTML = users.map(u => {
    const fol = isFollowing(u.id);
    return `
      <div style="display:flex;align-items:center;gap:10px;padding:8px;background:var(--bg-card);border:var(--border);border-radius:var(--radius-md);margin-bottom:8px;cursor:pointer;" onclick="window._goToProfile('${u.id}')">
        <div class="post-author-avatar" style="width:38px;height:38px;font-size:16px;border-radius:50%;background:var(--purple-dark);color:var(--purple-light);display:flex;align-items:center;justify-content:center;font-weight:700;">${u.avatar || u.name[0]}</div>
        <div style="flex:1;">
          <div style="font-size:0.9rem;font-weight:700;color:var(--white)">${u.name}</div>
          <div style="font-size:0.75rem;color:var(--muted)">${u.handle||''} &bull; ${u.bio?.slice(0,40) || ''}</div>
        </div>
        <button class="doodle-btn doodle-btn-follow doodle-btn-sm${fol ? ' following' : ''}" onclick="event.stopPropagation();window._toggleFollow('${u.id}')">
          ${fol ? 'Seguindo' : 'Seguir'}
        </button>
      </div>`;
  }).join('');
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

  // Navigate to any profile
  window._goToProfile = (userId) => {
    switchTab('profile');
    renderProfileTab(userId);
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  };

  // Follow toggle
  window._toggleFollow = (userId) => {
    const nowFollowing = toggleFollow(userId);
    showToast(nowFollowing ? 'Seguindo!' : 'Deixou de seguir.');

    // Update follow button
    const btn = document.getElementById(`follow-btn-${userId}`);
    if (btn) {
      btn.textContent = nowFollowing ? 'Seguindo' : 'Seguir';
      btn.classList.toggle('following', nowFollowing);
    }

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
    if (btn) {
      btn.classList.toggle('liked', liked);
      const countEl = btn.querySelector('.like-count');
      if (countEl) countEl.textContent = post.likes.length;
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

  // Toggle comments
  window._toggleComments = (postId) => {
    const el = document.getElementById(`comments-${postId}`);
    if (el) el.style.display = el.style.display === 'none' ? 'flex' : 'none';
  };

  // Submit comment
  window._submitComment = (postId) => {
    const input = document.getElementById(`comment-input-${postId}`);
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
            <textarea id="edit-post-text-input" class="doodle-input" rows="4" placeholder="Escreva seu post...">${post.text || ''}</textarea>
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

  // Play track via globalAudio
  window._playTrack = (track) => {
    if (!track) return;
    globalAudio.playTrack(track);
  };

  window._togglePlayerPlay = () => globalAudio.togglePlayPause();
  window._seekPlayer = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const pct = (event.clientX - rect.left) / rect.width * 100;
    globalAudio.seekToPercent(pct);
  };

  // Submit post
  window._submitPost = () => {
    const text = document.getElementById('creator-text')?.value?.trim();
    const tag  = document.getElementById('creator-tag')?.value || '#música';

    // Gather from creator state (imported implicitly via module)
    const lyricsEl = document.getElementById('creator-lyrics');
    const lyricsSongEl = document.getElementById('creator-lyrics-song');
    const lyricsArtEl = document.getElementById('creator-lyrics-art');
    const lyricsStyleEl = document.getElementById('lyrics-style-sel');

    const lyrics = lyricsEl?.value?.trim() || '';
    const lyricsSong = lyricsSongEl?.value?.trim() || '';
    const lyricsArt = lyricsArtEl?.value?.trim() || '';
    const lyricsCardStyle = lyricsStyleEl?.value || 'compact';

    if (!text && !lyrics && !window._pendingCreatorSong) {
      showToast('Escreva algo ou anexe uma música.');
      return;
    }

    createPost({
      text,
      lyrics,
      lyricsSong,
      lyricsArt,
      lyricsCardStyle,
      tag,
      rating: window._pendingCreatorRating || 0,
      song: window._pendingCreatorSong || null,
    });

    window._pendingCreatorSong = null;
    window._pendingCreatorRating = 0;

    showToast('Post publicado!');
    renderFeedTab();
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
          ${track.artwork ? `<img src="${track.artwork}" style="width:32px;height:32px;border-radius:5px;object-fit:cover;">` : ''}
          <div>
            <div style="font-size:0.8rem;font-weight:700;color:var(--white)">${track.title}</div>
            <div style="font-size:0.72rem;color:var(--muted)">${track.artist}</div>
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

  // Creator search for song
  window._creatorOpenSearch = () => {
    openSearchModalForFeed();
  };

  // Star picker for creator
  window._pickStar = (val) => {
    window._pendingCreatorRating = val;
  };

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
    const current = getActiveUser().avatar || '';
    const url = prompt('Insira a URL da foto de perfil ou um emoji/letra:', current);
    if (url !== null) {
      import('./storage.js').then(m => {
        m.updateUser(m.getActiveUserId(), { avatar: url.trim() });
        showToast('Foto de perfil atualizada!');
        // Update sidebar avatar
        const sidebarAvatar = document.querySelector('.sidebar-avatar');
        if (sidebarAvatar) {
          const isImg = url.startsWith('http') || url.startsWith('data:') || url.startsWith('/');
          sidebarAvatar.innerHTML = isImg ? `<img src="${url}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">` : (url || 'V');
        }
        window._refreshProfile();
      });
    }
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
            <div id="banner-modal-preview" style="height:120px;border-radius:12px;overflow:hidden;border:var(--border);background-size:cover;background-position:center;${user.bannerUrl ? `background-image:url('${user.bannerUrl}');` : `background:linear-gradient(135deg, ${user.themeColor || '#130c1e'}, #000);`}"></div>
          </div>

          <!-- URL Input -->
          <div>
            <label class="form-label">URL da Imagem</label>
            <div style="display:flex;gap:8px;">
              <input id="banner-modal-input" class="doodle-input" value="${user.bannerUrl || ''}" placeholder="Cole o link da imagem (ex: https://...)" oninput="window._previewBannerModal(this.value)">
              <button type="button" class="doodle-btn doodle-btn-ghost doodle-btn-sm" onclick="document.getElementById('banner-modal-input').value='';window._previewBannerModal('');">Limpar</button>
            </div>
          </div>

          <!-- Presets -->
          <div>
            <label class="form-label" style="margin-bottom:6px;">Ou escolha um tema estético:</label>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
              <div class="preset-pill" style="justify-content:center;padding:8px 10px;background:linear-gradient(135deg, #1f0d3d, #4b1248);cursor:pointer;" onclick="window._setBannerPreset('https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1200&auto=format&fit=crop&q=80')">
                🌆 Synthwave Neon
              </div>
              <div class="preset-pill" style="justify-content:center;padding:8px 10px;background:linear-gradient(135deg, #09132b, #1d3557);cursor:pointer;" onclick="window._setBannerPreset('https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=1200&auto=format&fit=crop&q=80')">
                🎧 Studio Vinyl
              </div>
              <div class="preset-pill" style="justify-content:center;padding:8px 10px;background:linear-gradient(135deg, #10002b, #3c096c);cursor:pointer;" onclick="window._setBannerPreset('https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?w=1200&auto=format&fit=crop&q=80')">
                ✨ Deep Nebula
              </div>
              <div class="preset-pill" style="justify-content:center;padding:8px 10px;background:linear-gradient(135deg, #0d1b2a, #1b263b);cursor:pointer;" onclick="window._setBannerPreset('https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1200&auto=format&fit=crop&q=80')">
                🖤 Dark Minimal
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

  window._previewBannerModal = (val) => {
    const prev = document.getElementById('banner-modal-preview');
    if (!prev) return;
    const url = val?.trim();
    if (url) {
      prev.style.background = '';
      prev.style.backgroundImage = `url('${url}')`;
      prev.style.backgroundSize = 'cover';
      prev.style.backgroundPosition = 'center';
    } else {
      const user = getActiveUser();
      prev.style.backgroundImage = '';
      prev.style.background = `linear-gradient(135deg, ${user.themeColor || '#130c1e'}, #000)`;
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

  // DM
  window._openDMWith = (userId) => openDMWindow(userId);
  document.getElementById('dm-fab')?.addEventListener('click', () => toggleDMWindow());

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
