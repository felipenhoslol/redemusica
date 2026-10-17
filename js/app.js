import { esc, safeUrl, jsArg, avatarInner, isImageAvatar } from './dom.js';
import { initStorage, getActiveUser, getAllUsers, getUserById,
         toggleFollow, isFollowing, toggleLikePost, toggleRepostPost,
         toggleBookmark, addCommentToPost, pinPost, deletePost,
         updatePost, getPostById,
         createPost, setFeaturedSong, addToShowcase, removeFromShowcase,
         getUnreadNotificationCount, getUnreadMessageCount, getFeedPosts, getChallengeAnswers,
         getActiveChallengeId, getChallengeAnswers as getAnswers,
         updateUserMusicStats, updateUser, addAdminId, getAllPlaylists, getPlaylistById, publishChallengeAnswers } from './storage.js';

import { globalAudio } from './audio.js';
import { ICONS } from './icons.js';
import { catLogoHtml, setCatMood, initCatLogo } from './logo.js';
import { auth, initAuth, logout, emailReminderUnread } from './auth.js';
import { showAuthScreen } from './authScreen.js';
import { openFeedbackModal } from './feedback.js';
import { openDisplaySettings, initDisplay } from './display.js';
import { mountTabIndicator, tabDirection, animatePanel } from './tabs.js';
import { startSync, stopSync, pullNow } from './sync.js';
import { renderSearchPage, openSearch } from './search.js';
import { mentionedIds } from './mentions.js';
import { openPhotoEditor } from './photoEditor.js';
import { initDragScroll } from './dragScroll.js';
import { bindSwipeTabs } from './swipeTabs.js';
import { flip, popIcon, rollNumber, swapContent } from './motion.js';
import { openAccountSettings } from './account.js';
import { openPollBuilder } from './poll.js';
import { creditHtml } from './credit.js';
import { adminBadge } from './badges.js';
import { renderAdminTab } from './admin.js';
import { renderDailyLyric } from './dailyLyric.js';
import { searchTracks } from './api.js';
import { fetchLastFmUserTop, getArtistImage } from './lastfm.js';
import {
  openDoodleModal, closeDoodleModal, showDoodleToast,
  initSearchModal, openSearchModalForFeed, openSearchModalForLyrics, openSearchModalForFeaturedSong,
  openSearchModalForChat, openSearchModalForShowcase,
  renderMusicAskGrid, renderChallengePills, renderCompareView,
  renderNotificationsPanel, renderPlayerBar, showNotificationPopups
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
  // You are an admin (checked with is_admin at sign-in): show your gear right away,
  // even before the server's admin list (supabase/010_admin_badge.sql) arrives
  if (auth.isAdmin && auth.user) addAdminId(auth.user.id);
  renderSidebar();
  renderMobileNav();
  initDragScroll();
  renderPlayerBar();
  initSearchModal();
  initChatBindings();
  bindGlobalHandlers();
  renderNotifBadge();
  renderChatBadge();

  // Expose switchTab for the HTML shim
  window._switchTabFn = switchTab;
  window.openSearchModalForChat = openSearchModalForChat;
  window.openSearchModalForFeed = openSearchModalForFeed;
  window.openSearchModalForLyrics = openSearchModalForLyrics;

  // Process pending tab from shim
  if (window._pendingTab) { switchTab(window._pendingTab); window._pendingTab = null; }
  else { switchTab('feed'); }

  if (auth.mode === 'signed-in') {
    startSync(auth.user.id, {
      onUpdate: refreshFromServer,
      onTyping: (from) => { import('./chat.js').then(c => c.showTyping(from)); },
      onMessages: () => { import('./chat.js').then(c => c.refreshChatFromServer()); renderChatBadge(); renderNotifBadge(); showNotificationPopups(); },
      onError: (msg) => showDoodleToast(msg)
    }).then(() => publishChallengeAnswers()); // answers saved before this version become visible to others
  }
}

// New data from the server: redraw what's on screen, unless the person is typing in it
function refreshFromServer() {
  renderNotifBadge();
  showNotificationPopups();
  renderChatBadge();
  const friendsEl = document.getElementById('friends-widget');
  if (friendsEl) renderFriendsWidget(friendsEl);
  import('./profile.js').then(m => m.refreshProfileFollowState());
  if (activeTab === 'comparar') window._refreshCompareView?.(); // someone's challenge answers may have arrived
  const active = document.activeElement;
  if (activeTab === 'feed') {
    const feedPosts = document.getElementById('feed-posts');
    const typing = feedPosts?.contains(active) || [...(feedPosts?.querySelectorAll('input, textarea') || [])].some(el => el.value);
    // Redraw only when what the feed shows really changed: a sync with nothing new must not
    // interrupt animations, close open comments or swap elements under the finger
    const signature = feedSignature();
    if (feedPosts && !typing && signature !== lastFeedSignature) {
      lastFeedSignature = signature;
      flip(feedPosts, '.post-card', () => renderFeed(feedPosts, feedFilterMode));
    }
  }
}

let lastFeedSignature = '';
/** The feed on screen now matches the data (after a render or an in-place update). */
function markFeedShown() { lastFeedSignature = feedSignature(); }
function feedSignature() {
  return JSON.stringify([feedFilterMode, getFeedPosts(feedFilterMode).map(p => [
    p.id, (p.likes || []).length, (p.reposts || []).length, (p.comments || []).length,
    p.updatedAt || '', p.text?.length || 0, JSON.stringify(p.votes || {}).length
  ])]);
}

// ──────────────────────────────────────────
// SIDEBAR RENDER
// ──────────────────────────────────────────

function renderSidebar() {
  const user = getActiveUser();
  const unread = (getUnreadNotificationCount() + emailReminderUnread());
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
      <button class="nav-item nav-item-quiet" id="nav-account" onclick="window._openAccount()">
        ${ICONS.lock} <span>Conta</span>
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
          <div class="sidebar-user-name">${esc(user.name)}${adminBadge(user.id)}</div>
          <div class="sidebar-user-handle">${esc(user.handle || '')}</div>
        </div>`;
}

// Re-render the sidebar footer after the active user's profile changes
function refreshSidebarUser() {
  const el = document.getElementById('nav-profile');
  if (el) el.innerHTML = sidebarUserHtml(getActiveUser());
  renderMobileNav();
}

// ──────────────────────────────────────────
// PHONE NAVIGATION: bottom tab bar + "você" sheet (the sidebar is hidden below 700px)
// ──────────────────────────────────────────

function renderMobileNav() {
  const user = getActiveUser();
  const unread = (getUnreadNotificationCount() + emailReminderUnread());
  const badge = unread ? `<span class="mobile-badge">${unread > 9 ? '9+' : unread}</span>` : '';

  // Top bar: the cat (reacts like the sidebar one) and notifications
  let header = document.getElementById('mobile-header');
  if (!header) {
    header = document.createElement('header');
    header.id = 'mobile-header';
    header.className = 'mobile-header';
    document.querySelector('.app-main')?.prepend(header);
  }
  header.innerHTML = `
    <button type="button" class="mobile-brand" data-tab="feed" aria-label="rede de música, ir para o início">
      <span class="mobile-brand-cat">${catLogoHtml({ live: true })}</span>
      <span class="mobile-brand-name">rede de música</span>
    </button>
    <button type="button" class="mobile-tab mobile-header-btn" data-tab="notif" aria-label="Notificações">${ICONS.bell}${badge}</button>`;

  // Bottom bar: five slots with "Postar" in the middle
  let bar = document.getElementById('mobile-tabbar');
  if (!bar) {
    bar = document.createElement('nav');
    bar.id = 'mobile-tabbar';
    bar.className = 'mobile-tabbar';
    bar.setAttribute('aria-label', 'Navegação');
    document.body.appendChild(bar);
  }
  bar.innerHTML = `
    <button type="button" class="mobile-tab" data-tab="feed" aria-label="Início">${ICONS.feed}</button>
    <button type="button" class="mobile-tab" data-tab="search" aria-label="Pesquisar">${ICONS.search}</button>
    <button type="button" class="mobile-tab mobile-tab-post" data-action="post" aria-label="Postar">${ICONS.plus}</button>
    <button type="button" class="mobile-tab" data-tab="chat" aria-label="Chat">${ICONS.chat}</button>
    <button type="button" class="mobile-tab mobile-tab-me" data-action="me" aria-label="Você: perfil e mais opções" aria-haspopup="dialog">
      <span class="post-author-avatar">${avatarInner(user.avatar, user.name)}</span>
    </button>`;

  const onNav = (e) => {
    const b = e.target.closest('[data-tab], [data-action]');
    if (!b) return;
    // Notifications open as a page on phones: any other destination closes it
    const notifOpen = document.getElementById('notif-overlay')?.classList.contains('active');
    if (notifOpen && b.dataset.tab !== 'notif') toggleNotifPanel();
    if (b.dataset.action === 'post') window._composeNew();
    else if (b.dataset.action === 'me') openMeSheet();
    else if (b.dataset.tab === 'notif') toggleNotifPanel();
    else switchTab(b.dataset.tab);
  };
  bar.onclick = onNav;
  header.onclick = onNav;
  syncMobileNav();
}

function syncMobileNav() {
  // The avatar stands for your own profile and everything in the "você" sheet
  const meActive = (activeTab === 'profile' && currentProfileUserId === getActiveUser().id)
    || ['playlists', 'desafios', 'comparar', 'admin'].includes(activeTab);
  document.querySelectorAll('#mobile-tabbar .mobile-tab, #mobile-header .mobile-tab').forEach(b => {
    const on = b.dataset.tab ? b.dataset.tab === activeTab : (b.dataset.action === 'me' && meActive);
    b.classList.toggle('active', on);
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
}

function openMeSheet() {
  const user = getActiveUser();
  let sheet = document.getElementById('me-sheet');
  if (!sheet) {
    sheet = document.createElement('div');
    sheet.id = 'me-sheet';
    sheet.className = 'me-sheet';
    document.body.appendChild(sheet);
  }
  const item = (action, icon, label, current) => `
    <button type="button" class="me-sheet-item${current ? ' active' : ''}" data-go="${action}">${icon}<span>${label}</span></button>`;
  sheet.innerHTML = `
    <div class="me-sheet-scrim" data-close></div>
    <div class="me-sheet-panel" role="dialog" aria-modal="true" aria-label="Você">
      <div class="me-sheet-grip" aria-hidden="true"></div>
      <button type="button" class="me-sheet-user" data-go="profile">
        <span class="post-author-avatar">${avatarInner(user.avatar, user.name)}</span>
        <span><strong>${esc(user.name)}${adminBadge(user.id)}</strong><small>${esc(user.handle || '')} · ver perfil</small></span>
      </button>
      <div class="me-sheet-list">
        ${item('playlists', ICONS.playlist, 'Playlists', activeTab === 'playlists')}
        ${item('desafios', ICONS.star, 'Desafios', activeTab === 'desafios' || activeTab === 'comparar')}
        ${auth.isAdmin ? item('admin', ICONS.shield, 'Admin', activeTab === 'admin') : ''}
        ${item('display', ICONS.palette, 'Exibição')}
        ${item('account', ICONS.lock, 'Conta e senha')}
        ${item('feedback', ICONS.feedback, 'Enviar feedback')}
        ${item('logout', ICONS.logout, 'Sair da conta')}
      </div>
      ${creditHtml('me-sheet-credit')}
    </div>`;
  const close = () => { sheet.classList.remove('open'); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  sheet.onclick = (e) => {
    if (e.target.closest('[data-close]')) return close();
    const go = e.target.closest('[data-go]')?.dataset.go;
    if (!go) return;
    close();
    if (go === 'profile') window._goToProfile(getActiveUser().id);
    else if (go === 'display') window._openDisplay();
    else if (go === 'feedback') window._openFeedback();
    else if (go === 'account') window._openAccount();
    else if (go === 'logout') window._logout();
    else switchTab(go);
  };
  document.addEventListener('keydown', onKey);
  requestAnimationFrame(() => {
    sheet.classList.add('open');
    sheet.querySelector('.me-sheet-user')?.focus({ preventScroll: true });
  });
}
window._refreshSidebarUser = refreshSidebarUser;

// ──────────────────────────────────────────
// TAB SWITCHING
// ──────────────────────────────────────────

function switchTab(tabName) {
  if (tabName === 'admin' && !auth.isAdmin) tabName = 'feed';
  // A different tab opens at its top, not at the previous tab's scroll position
  if (tabName !== activeTab) window.scrollTo({ top: 0 });
  activeTab = tabName;
  document.body.dataset.tab = tabName; // lets the layout differ per tab (the feed uses the full width)

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
  syncMobileNav();

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
        ${creditHtml()}
      </div>
    </div>`;

  mountTabIndicator(tab.querySelector('.feed-filter-bar'), { key: 'feed' });

  // Render creator
  const creatorWrap = document.getElementById('creator-wrap');
  if (creatorWrap) renderPostCreator(creatorWrap);

  // Render feed
  const feedPosts = document.getElementById('feed-posts');
  if (feedPosts) { renderFeed(feedPosts, feedFilterMode); markFeedShown(); }
  // Swipe sideways on the posts to move between "Para você" and "Seguindo"
  bindSwipeTabs(feedPosts, {
    tabs: ['all', 'following'],
    current: () => feedFilterMode,
    onSwitch: (mode) => window.setFeedFilter(mode)
  });


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
      feedPostsEl.dataset.shown = ''; // another list: start from the first page
      renderFeed(feedPostsEl, feedFilterMode);
      markFeedShown();
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
  syncMobileNav();
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
  // Phone tab bar: the bell is the current "page" while the panel is open
  syncMobileNav();
  if (!isActive) {
    document.querySelectorAll('#mobile-tabbar .mobile-tab, #mobile-header .mobile-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === 'notif'));
  }
}

window.toggleNotifPanel = toggleNotifPanel;

// Unread messages on the Chat buttons (sidebar and phone tab bar)
function renderChatBadge() {
  const count = getUnreadMessageCount();
  document.querySelectorAll('#nav-chat, #mobile-tabbar [data-tab="chat"]').forEach(btn => {
    let badge = btn.querySelector('.chat-nav-badge');
    if (!count) { badge?.remove(); return; }
    if (!badge) {
      badge = document.createElement('span');
      badge.className = `${btn.id === 'nav-chat' ? 'nav-badge' : 'mobile-badge'} chat-nav-badge`;
      btn.appendChild(badge);
    }
    badge.textContent = count > 9 ? '9+' : String(count);
  });
}
window._renderChatBadge = renderChatBadge;
window._renderNotifBadge = () => renderNotifBadge();

function renderNotifBadge() {
  const count = (getUnreadNotificationCount() + emailReminderUnread());
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
  const mobileBell = document.querySelector('#mobile-header [data-tab="notif"]');
  if (mobileBell) {
    mobileBell.querySelector('.mobile-badge')?.remove();
    if (count > 0) mobileBell.insertAdjacentHTML('beforeend', `<span class="mobile-badge">${count > 9 ? '9+' : count}</span>`);
  }
}

// ──────────────────────────────────────────
// GLOBAL HANDLERS
// ──────────────────────────────────────────

function bindGlobalHandlers() {

  window._openFeedback = () => openFeedbackModal(activeTab);
  window._openDisplay = () => openDisplaySettings();
  window._openAccount = () => openAccountSettings();
  window._composeNew = () => {
    switchTab('feed');
    window.scrollTo({ top: 0 });
    setTimeout(() => document.getElementById('creator-text')?.focus(), 0);
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
    // Mensagens só com quem você segue; números do perfil aberto na hora
    document.querySelectorAll(`[data-dm-id="${userId}"]`).forEach(btn => { btn.hidden = !nowFollowing; });
    import('./profile.js').then(m => m.refreshProfileFollowState());

    // Update friend list
    const friendsEl = document.getElementById('friends-widget');
    if (friendsEl) renderFriendsWidget(friendsEl);
  };

  // Like post
  window._likePost = (postId, btn) => {
    toggleLikePost(postId);
    const post = getPostById(postId);
    if (!post) return;
    const liked = post.likes.includes(getActiveUser().id);
    if (liked) setCatMood('love', 1400);
    // Every copy of this post on screen (feed, profile, open post) changes in place: nothing reflows
    document.querySelectorAll(`.post-card[data-post-id="${CSS.escape(postId)}"] .btn-post-action[onclick*="_likePost"]`).forEach(b => {
      b.classList.toggle('liked', liked);
      const icon = b.querySelector('svg');
      if (icon) icon.outerHTML = liked ? ICONS.heartFilled : ICONS.heartEmpty;
      rollNumber(b.querySelector('.like-count'), post.likes.length, liked ? 1 : -1);
      if (liked) popIcon(b);
    });
    markFeedShown();
  };

  const refreshPostsView = () => {
    if (activeTab === 'feed') {
      const feedEl = document.getElementById('feed-posts');
      // Posts glide to their new places instead of jumping (FLIP)
      if (feedEl) { flip(feedEl, '.post-card', () => renderFeed(feedEl, feedFilterMode)); markFeedShown(); }
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
    document.querySelectorAll(`.post-card[data-post-id="${CSS.escape(postId)}"] .btn-post-action[onclick*="_repostPost"]`).forEach(b => {
      b.classList.toggle('reposted', isNowReposted);
      rollNumber(b.querySelector('.repost-count'), (post?.reposts || []).length, isNowReposted ? 1 : -1);
      if (isNowReposted) popIcon(b);
    });
    markFeedShown();
    // "Seguindo" lists reposts, so there the list itself changes
    if (activeTab === 'feed' && feedFilterMode === 'following') refreshPostsView();
    else if (activeTab === 'profile') refreshPostsView();
  };

  // Bookmark
  window._bookmarkPost = (postId) => {
    const saved = toggleBookmark(postId);
    showToast(saved ? 'Post salvo!' : 'Removido dos salvos.');
    // Close options dropdown
    document.querySelectorAll('.post-options-dropdown').forEach(d => d.style.display = 'none');
    document.querySelectorAll(`.post-card[data-post-id="${CSS.escape(postId)}"] .btn-post-action[onclick*="_bookmarkPost"]`).forEach(b => {
      b.classList.toggle('bookmarked', saved);
      if (saved) popIcon(b);
    });
    if (activeTab === 'profile') refreshPostsView();
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
    updatePost(postId, { text });
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

    const pollOptions = window._pendingCreatorPoll || null;
    const images = [...(window._pendingCreatorImages || [])];
    if (!text && !lyrics && !window._pendingCreatorSong && !images.length && !window._pendingCreatorPlaylist && !pollOptions) {
      showToast('Escreva algo ou anexe uma música, foto, playlist, letra ou votação.');
      return;
    }

    {
      const finalRating = isRatingActive ? (creatorState.rating || 0) : 0;

      createPost({
        text,
        lyrics,
        lyricsSong,
        lyricsArt,
        rating: finalRating,
        imageUrl: images[0] || '',
        images,
        mentions: mentionedIds(text),
        song: window._pendingCreatorSong || null,
        playlistId: window._pendingCreatorPlaylist?.id || null,
        poll: pollOptions ? { options: pollOptions } : null
      });

      // Cleanup creator
      if (textEl) textEl.value = '';
      window._pendingCreatorSong = null;
      window._pendingCreatorPlaylist = null;
      window._pendingCreatorImages = [];
      window._removeCreatorPoll();
      if (window._creatorRemoveLyrics) window._creatorRemoveLyrics();
      if (window._removeCreatorSong) window._removeCreatorSong();
      if (window._removeCreatorPlaylist) window._removeCreatorPlaylist();
      if (window._removeCreatorImage) window._removeCreatorImage();
      if (ratingBox) ratingBox.style.display = 'none';
      creatorState.rating = 0;

      showToast('Post publicado!');
      setCatMood('happy', 1600);
      // Fresh composer, and the new post slides in on top while the rest move down (no full redraw)
      const creatorWrap = document.getElementById('creator-wrap');
      const feedEl = document.getElementById('feed-posts');
      if (creatorWrap && feedEl) {
        renderPostCreator(creatorWrap);
        flip(feedEl, '.post-card', () => renderFeed(feedEl, feedFilterMode));
        markFeedShown();
      } else {
        renderFeedTab();
      }
    }
  };

  // Creator: song poll (2–4 songs people vote on)
  window._creatorOpenPoll = () => openPollBuilder(window._pendingCreatorPoll || [], (options) => {
    window._pendingCreatorPoll = options;
    const el = document.getElementById('creator-poll-attach');
    if (!el) return;
    el.style.display = 'block';
    el.innerHTML = `
      <div class="creator-attached-song creator-attached-poll">
        <div>
          <div style="font-size:.85rem;font-weight:700;color:var(--text)">${ICONS.poll} Votação com ${options.length} músicas</div>
          <div style="font-size:.78rem;color:var(--text-2)">${options.map(o => esc(o.title)).join(' · ')}</div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0;">
          <button class="doodle-btn doodle-btn-ghost doodle-btn-sm" onclick="window._creatorOpenPoll()">Editar</button>
          <button class="doodle-btn doodle-btn-ghost doodle-btn-sm" onclick="window._removeCreatorPoll()">Remover</button>
        </div>
      </div>`;
  });
  window._removeCreatorPoll = () => {
    window._pendingCreatorPoll = null;
    const el = document.getElementById('creator-poll-attach');
    if (el) { el.style.display = 'none'; el.innerHTML = ''; }
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
    window._refreshProfile?.();
    import('./profile.js').then(m => m.refreshFeaturedEditRow());
  };
  // Profile photo and banner: both open the photo editor (position + zoom); the result syncs to the server
  const savePhoto = (field, value, message) => {
    const user = getActiveUser();
    const fallback = field === 'avatar' ? (user.name || '?').trim()[0]?.toUpperCase() || '?' : '';
    updateUser(user.id, { [field]: value || fallback });
    showToast(message);
    refreshSidebarUser();
    window._refreshProfile?.();
  };

  window._editAvatar = () => {
    const user = getActiveUser();
    openPhotoEditor({
      kind: 'avatar',
      src: isImageAvatar(user.avatar) ? user.avatar : '',
      onSave: (url) => savePhoto('avatar', url, url ? 'Foto de perfil atualizada.' : 'Foto de perfil removida.')
    });
  };

  window._editBanner = () => {
    openPhotoEditor({
      kind: 'banner',
      src: getActiveUser().bannerUrl || '',
      onSave: (url) => savePhoto('bannerUrl', url, url ? 'Banner atualizado.' : 'Banner removido.')
    });
  };
  window._openBannerModal = window._editBanner;

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
    if (!isFollowing(userId)) { showToast('Siga essa pessoa para mandar mensagem.'); return; }
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

  // Ctrl+Enter (Cmd+Enter no Mac) publica o post que está sendo escrito
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey) || e.isComposing) return;
    if (!e.target.closest?.('.create-post-card')) return;
    e.preventDefault();
    window._submitPost?.();
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
