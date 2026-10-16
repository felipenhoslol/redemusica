// LocalStorage state management — with follows, pins, bookmarks, notifications, reposts
import { DEFAULT_CHALLENGES } from './questions.js';

const STORAGE_KEYS = {
  USERS: 'rmsn_users_v5',
  ACTIVE_USER: 'rmsn_active_v5',
  POSTS: 'rmsn_posts_v5',
  MESSAGES: 'rmsn_messages_v5',
  CHALLENGES: 'rmsn_challenges_v5',
  ACTIVE_CHALLENGE: 'rmsn_active_challenge_v5',
  ANSWERS_PREFIX: 'rmsn_answers_v5_',
  REVIEWS: 'rmsn_reviews_v5',
  FOLLOWS: 'rmsn_follows_v5',
  BOOKMARKS: 'rmsn_bookmarks_v5',
  NOTIFICATIONS: 'rmsn_notifications_v5',
  BLOCKED: 'rmsn_blocked_v5',
  PLAYLISTS: 'rmsn_playlists_v5',
};

// Fresh install: just the local profile, no demo content
const INITIAL_USERS = [
  {
    id: 'user_me',
    name: 'Você',
    handle: '@voce',
    avatar: 'V',
    bannerUrl: '',
    bio: '',
    status: '',
    pinnedPostId: null,
    songShowcase: [],
    topArtistsMonth: [],
    featuredSong: null
  }
];

// Demo content shipped by earlier versions; removed from browsers that still have it
const DEMO_USER_IDS = ['user_clara', 'user_lucas'];
const DEMO_POST_IDS = ['post_seed_1', 'post_seed_2'];
const DEMO_PLAYLIST_IDS = ['pl_sample_1', 'pl_sample_2', 'pl_sample_3'];
const DEMO_CLEANUP_KEY = 'rmsn_demo_removed_v1';

// ─── Safe storage ───────────────────────────────────────────────────────────
// localStorage holds ~5 MB per site, shared with the Supabase session. The feed and chat caches
// (posts and messages carry images) can outgrow it: once full, the session token can't be saved
// (people had to log in again) and every later write threw, freezing feed and notifications.
// Big server caches live in memory instead (the server has them anyway), and any write that hits
// the quota moves those caches out of localStorage and retries.
const memStore = new Map();
const SERVER_CACHES = new Set([STORAGE_KEYS.POSTS, STORAGE_KEYS.MESSAGES]);
const MAX_PERSISTED_CACHE = 1_000_000; // chars

function lsGet(key) {
  if (memStore.has(key)) return memStore.get(key);
  try { return localStorage.getItem(key); } catch { return null; }
}

function freeServerCaches() {
  SERVER_CACHES.forEach(k => {
    if (memStore.has(k)) return;
    try {
      const v = localStorage.getItem(k);
      if (v !== null) { memStore.set(k, v); localStorage.removeItem(k); }
    } catch { /* nothing to free */ }
  });
}

// Parsed values of the hot read paths (users, posts, follows...), so rendering 150 post cards
// doesn't re-parse the whole cache several times per card. Any write to a key drops its entry.
const parsedCache = new Map();
function cachedJson(key, fallback) {
  if (!parsedCache.has(key)) {
    let value = null;
    try { value = JSON.parse(lsGet(key)); } catch { /* corrupt or missing */ }
    parsedCache.set(key, value);
  }
  return parsedCache.get(key) ?? fallback;
}
// Another tab changed something: forget what we parsed
window.addEventListener('storage', (e) => { if (e.key) parsedCache.delete(e.key); else parsedCache.clear(); });

function lsSet(key, value) {
  parsedCache.delete(key);
  if (SERVER_CACHES.has(key) && value.length > MAX_PERSISTED_CACHE) {
    memStore.set(key, value);
    try { localStorage.removeItem(key); } catch { /* ignore */ }
    return;
  }
  try {
    localStorage.setItem(key, value);
    memStore.delete(key);
  } catch {
    freeServerCaches();
    try { localStorage.setItem(key, value); memStore.delete(key); }
    catch {
      memStore.set(key, value); // still usable this session
      try { localStorage.removeItem(key); } catch { /* ignore */ }
    }
  }
}

// Browsers already full from earlier versions: move the oversized caches to memory right away,
// before the Supabase client tries to save the session
SERVER_CACHES.forEach(k => {
  try {
    const v = localStorage.getItem(k);
    if (v && v.length > MAX_PERSISTED_CACHE) { memStore.set(k, v); localStorage.removeItem(k); }
  } catch { /* storage unavailable */ }
});

function readJson(key, fallback) {
  try { return JSON.parse(lsGet(key)) ?? fallback; }
  catch { return fallback; }
}

function removeDemoContent() {
  if (lsGet(DEMO_CLEANUP_KEY)) return;
  const isDemoUser = (id) => DEMO_USER_IDS.includes(id);

  const users = readJson(STORAGE_KEYS.USERS, null);
  if (Array.isArray(users)) {
    const kept = users.filter(u => !isDemoUser(u.id));
    const me = kept.find(u => u.id === 'user_me');
    // The old demo self ("Você"/"Marina") came with fake stats: reset it to a blank profile
    if (me && (me.lastfm === 'voce_scrobbles' || me.handle === '@marina.ouve')) {
      Object.assign(me, INITIAL_USERS[0]);
    }
    lsSet(STORAGE_KEYS.USERS, JSON.stringify(kept));
  }

  const posts = readJson(STORAGE_KEYS.POSTS, null);
  if (Array.isArray(posts)) {
    lsSet(STORAGE_KEYS.POSTS, JSON.stringify(
      posts.filter(p => !DEMO_POST_IDS.includes(p.id) && !isDemoUser(p.authorId))
    ));
  }

  const playlists = readJson(STORAGE_KEYS.PLAYLISTS, null);
  if (Array.isArray(playlists)) {
    lsSet(STORAGE_KEYS.PLAYLISTS, JSON.stringify(
      playlists.filter(p => !DEMO_PLAYLIST_IDS.includes(p.id) && !isDemoUser(p.authorId))
    ));
  }

  const messages = readJson(STORAGE_KEYS.MESSAGES, null);
  if (Array.isArray(messages)) {
    lsSet(STORAGE_KEYS.MESSAGES, JSON.stringify(
      messages.filter(m => !isDemoUser(m.fromUserId) && !isDemoUser(m.toUserId))
    ));
  }

  const follows = readJson(STORAGE_KEYS.FOLLOWS, null);
  if (follows && typeof follows === 'object') {
    const clean = {};
    Object.entries(follows).forEach(([id, list]) => {
      if (!isDemoUser(id)) clean[id] = (list || []).filter(f => !isDemoUser(f));
    });
    lsSet(STORAGE_KEYS.FOLLOWS, JSON.stringify(clean));
  }

  const notifications = readJson(STORAGE_KEYS.NOTIFICATIONS, null);
  if (Array.isArray(notifications)) {
    lsSet(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(
      notifications.filter(n => !isDemoUser(n.fromUserId) && !isDemoUser(n.targetUserId))
    ));
  }

  Object.keys(localStorage)
    .filter(k => k.startsWith(STORAGE_KEYS.ANSWERS_PREFIX) && DEMO_USER_IDS.some(id => k.endsWith(`_${id}`)))
    .forEach(k => localStorage.removeItem(k));

  lsSet(DEMO_CLEANUP_KEY, '1');
}

// ──────────────────────────────────────────
//  INIT
// ──────────────────────────────────────────

export function initStorage() {
  removeDemoContent();
  const defaults = {
    [STORAGE_KEYS.USERS]: INITIAL_USERS,
    [STORAGE_KEYS.POSTS]: [],
    [STORAGE_KEYS.MESSAGES]: [],
    [STORAGE_KEYS.CHALLENGES]: DEFAULT_CHALLENGES,
    [STORAGE_KEYS.FOLLOWS]: {},
    [STORAGE_KEYS.BOOKMARKS]: {},
    [STORAGE_KEYS.NOTIFICATIONS]: [],
    [STORAGE_KEYS.BLOCKED]: {},
    [STORAGE_KEYS.PLAYLISTS]: [],
  };
  Object.entries(defaults).forEach(([key, value]) => {
    if (!lsGet(key)) lsSet(key, JSON.stringify(value));
  });
  if (!lsGet(STORAGE_KEYS.ACTIVE_USER)) {
    lsSet(STORAGE_KEYS.ACTIVE_USER, 'user_me');
  }
  if (!lsGet(STORAGE_KEYS.ACTIVE_CHALLENGE)) {
    lsSet(STORAGE_KEYS.ACTIVE_CHALLENGE, 'classic_30');
  }
}

// ──────────────────────────────────────────
//  REMOTE SYNC HOOKS
// ──────────────────────────────────────────

// sync.js registers these while a Supabase account is signed in; every local write also goes to the server
let remote = null;
export function setRemoteHooks(hooks) { remote = hooks; }
const toRemote = (name, ...args) => { try { remote?.[name]?.(...args); } catch { /* sync is best-effort */ } };

/** Replace the cached feed with the server's copy (keeps posts still on their way up). */
export function replacePostsCache(posts, keepIds = [], keepCommentIds = []) {
  const current = JSON.parse(lsGet(STORAGE_KEYS.POSTS)) || [];
  const me = getActiveUserId();
  const onServer = new Set(posts.map(p => p.id));
  // Kept: posts on their way up, and anything you wrote that the server never confirmed (no server
  // timestamp): the outbox in sync.js keeps resending those, so they must not vanish from the cache
  const unsent = (p) => p.authorId === me && !p.createdAtIso;
  const pending = current.filter(p => !onServer.has(p.id) && (keepIds.includes(p.id) || unsent(p)));
  const byId = new Map(current.map(p => [p.id, p]));
  posts.forEach(p => {
    const local = (byId.get(p.id)?.comments || []).filter(c =>
      (keepCommentIds.includes(c.id) || (c.userId === me && !c.createdAtIso)) && !p.comments.some(sc => sc.id === c.id));
    if (local.length) p.comments = [...p.comments, ...local];
  });
  lsSet(STORAGE_KEYS.POSTS, JSON.stringify([...pending, ...posts]));
}

/** Change fields of a cached post without syncing it (e.g. its image now lives at a URL). */
export function patchPostCache(postId, fields) {
  const posts = readJson(STORAGE_KEYS.POSTS, []);
  const post = posts.find(p => p.id === postId);
  if (!post) return;
  Object.assign(post, fields);
  lsSet(STORAGE_KEYS.POSTS, JSON.stringify(posts));
}

/** Change fields of a cached message without syncing it. */
export function patchMessageCache(messageId, fields) {
  const all = readJson(STORAGE_KEYS.MESSAGES, []);
  const msg = all.find(m => m.id === messageId);
  if (!msg) return;
  Object.assign(msg, fields);
  lsSet(STORAGE_KEYS.MESSAGES, JSON.stringify(all));
}

/** Add or refresh posts fetched outside the feed (e.g. search results) without dropping the others. */
export function upsertPostsCache(posts) {
  const current = JSON.parse(lsGet(STORAGE_KEYS.POSTS)) || [];
  posts.forEach(p => {
    const i = current.findIndex(c => c.id === p.id);
    if (i === -1) current.push(p); else current[i] = p;
  });
  lsSet(STORAGE_KEYS.POSTS, JSON.stringify(current));
}

/** Add or refresh other people's public profiles in the local user list. */
// Profile data kept in profiles.extras on the server (everything that isn't its own column)
export const PROFILE_EXTRA_KEYS = [
  'instagram', 'twitter', 'lastfm', 'socials', 'featuredSong', 'songShowcase', 'pinnedPostId', 'bioFont',
  'topArtist', 'topArtistsMonth', 'topTracksMonth', 'musicService', 'spotifyUsername', 'spotifyConnected',
  'musicPeriod', 'musicPeriodLabel', 'musicProfileUrl', 'musicSyncedAt', 'challengeAnswers'
];

/**
 * Add or refresh public profiles in the local user list.
 * @param {Array} profiles rows from public.profiles (extra columns are optional)
 * @param {{ skipId?: string }} [opts] skipId: a profile with local changes still on their way up
 */
export function mergeRemoteProfiles(profiles, opts = {}) {
  const users = getAllUsers();
  profiles.forEach(p => {
    if (p.id === opts.skipId) return;
    const existing = users.find(u => u.id === p.id);
    const initial = (p.name || '?').trim()[0]?.toUpperCase() || '?';
    const full = 'extras' in p; // the 003 columns exist on the server
    // Without the 003 columns the server knows nothing about photos: keep the local one
    const localPhoto = !full && existing && /^(data:image|https?:)/.test(existing.avatar || '') ? existing.avatar : null;
    const fields = { name: p.name, handle: p.handle, avatar: p.avatar_url || localPhoto || initial };
    if (full) {
      Object.assign(fields, { bannerUrl: p.banner_url || '', bio: p.bio || '', status: p.status || '' });
      const extras = p.extras || {};
      PROFILE_EXTRA_KEYS.forEach(k => { fields[k] = extras[k] ?? (Array.isArray(existing?.[k]) ? [] : null); });
      ['songShowcase', 'topArtistsMonth', 'topTracksMonth'].forEach(k => { if (!Array.isArray(fields[k])) fields[k] = []; });
    }
    if (existing) Object.assign(existing, fields);
    else users.push({ id: p.id, bio: '', status: '', pinnedPostId: null, songShowcase: [], topArtistsMonth: [], featuredSong: null, ...fields });
  });
  lsSet(STORAGE_KEYS.USERS, JSON.stringify(users));
}

// Who is an admin (profile ids, from supabase/010_admin_badge.sql): shown as a gear by the name
const ADMIN_IDS_KEY = 'rmsn_admin_ids_v1';
export function setAdminIds(ids) {
  lsSet(ADMIN_IDS_KEY, JSON.stringify([...new Set(ids)].slice(0, 200)));
}
export function isAdminUser(userId) {
  return Boolean(userId) && (cachedJson(ADMIN_IDS_KEY, null) || []).includes(userId);
}

/** Store when people were last seen online ({ userId: isoDate }). */
export function setPresence(map) {
  const users = getAllUsers();
  let changed = false;
  users.forEach(u => {
    if (map[u.id] && map[u.id] !== u.lastSeenAt) { u.lastSeenAt = map[u.id]; changed = true; }
  });
  if (changed) lsSet(STORAGE_KEYS.USERS, JSON.stringify(users));
}

/** Replace the follow graph with the server's copy ({ followerId: [followingId] }). */
export function replaceFollows(map) {
  lsSet(STORAGE_KEYS.FOLLOWS, JSON.stringify(map));
}

// ──────────────────────────────────────────
//  USERS
// ──────────────────────────────────────────

export function getAllUsers() {
  return cachedJson(STORAGE_KEYS.USERS, null) || [];
}

export function getActiveUserId() {
  return lsGet(STORAGE_KEYS.ACTIVE_USER) || 'user_me';
}

export function getActiveUser() {
  const users = getAllUsers();
  const id = getActiveUserId();
  return users.find(u => u.id === id) || users[0];
}

export function getUserById(userId) {
  return getAllUsers().find(u => u.id === userId) || null;
}

export function setActiveUser(userId) {
  lsSet(STORAGE_KEYS.ACTIVE_USER, userId);
}

/**
 * @param {{ silent?: boolean }} [opts] silent: local-only change (e.g. sync swapping a photo for its uploaded URL)
 */
export function updateUser(userId, updates, opts = {}) {
  const users = getAllUsers();
  const index = users.findIndex(u => u.id === userId);
  if (index !== -1) {
    users[index] = { ...users[index], ...updates };
    lsSet(STORAGE_KEYS.USERS, JSON.stringify(users));
    if (!opts.silent && userId === getActiveUserId()) toRemote('profileChanged');
  }
}

/**
 * Create or refresh the local record of a signed-in account and make it the active user.
 * Local data (posts, playlists...) keeps living in localStorage, keyed by this id.
 * @param {{id:string, name:string, handle:string}} account
 */
export function ensureAccountUser(account) {
  let users = getAllUsers();
  // The offline profile would show up as a stranger in search and chat once a real account is in
  if (account.id !== 'user_me') users = users.filter(u => u.id !== 'user_me');
  const existing = users.find(u => u.id === account.id);
  if (existing) {
    existing.name = account.name;
    existing.handle = account.handle;
  } else {
    users.push({
      id: account.id,
      name: account.name,
      handle: account.handle,
      avatar: (account.name || '?').trim()[0]?.toUpperCase() || '?',
      bio: '',
      status: '',
      pinnedPostId: null,
      songShowcase: [],
      topArtistsMonth: [],
      featuredSong: null
    });
  }
  lsSet(STORAGE_KEYS.USERS, JSON.stringify(users));
  setActiveUser(account.id);
}

export function updateUserMusicStats(userId, stats) {
  const user = getUserById(userId);
  if (!user) return;
  const service = stats.service || 'lastfm';
  const updated = {
    spotifyConnected: true,
    musicService: service,
    spotifyUsername: stats.username || '',
    musicPeriod: stats.period || null,
    musicPeriodLabel: stats.periodLabel || '',
    musicProfileUrl: stats.profileUrl || '',
    musicSyncedAt: new Date().toISOString(),
    topArtist: stats.topArtist || (stats.topArtistsMonth ? stats.topArtistsMonth[0] : null),
    topArtistsMonth: stats.topArtistsMonth || [],
    topTracksMonth: stats.topTracksMonth || []
  };
  // A synced Last.fm account also fills the Last.fm link on the profile
  if (service === 'lastfm' && stats.username) updated.lastfm = stats.username;
  updateUser(userId, updated);
  return getUserById(userId);
}

export function setFeaturedSong(track) {
  updateUser(getActiveUserId(), { featuredSong: track });
}

export function addToShowcase(track) {
  const user = getActiveUser();
  const showcase = user.songShowcase || [];
  if (showcase.length >= 5) return false;
  if (showcase.find(s => s.id === track.id)) return false;
  showcase.push(track);
  updateUser(user.id, { songShowcase: showcase });
  return true;
}

export function removeFromShowcase(trackId) {
  const user = getActiveUser();
  const showcase = (user.songShowcase || []).filter(s => s.id !== trackId);
  updateUser(user.id, { songShowcase: showcase });
}

// ──────────────────────────────────────────
//  FOLLOWS
// ──────────────────────────────────────────

function getAllFollows() {
  try { return cachedJson(STORAGE_KEYS.FOLLOWS, null) || {}; }
  catch { return {}; }
}

function saveAllFollows(data) {
  lsSet(STORAGE_KEYS.FOLLOWS, JSON.stringify(data));
}

export function getFollowing(userId = getActiveUserId()) {
  const all = getAllFollows();
  return all[userId] || [];
}

export function getFollowers(userId) {
  const all = getAllFollows();
  return Object.entries(all)
    .filter(([uid, following]) => Array.isArray(following) && following.includes(userId))
    .map(([uid]) => uid);
}

export function isFollowing(targetUserId, fromUserId = getActiveUserId()) {
  return getFollowing(fromUserId).includes(targetUserId);
}

export function toggleFollow(targetUserId) {
  const activeId = getActiveUserId();
  const all = getAllFollows();
  if (!all[activeId]) all[activeId] = [];
  const idx = all[activeId].indexOf(targetUserId);
  if (idx === -1) {
    all[activeId].push(targetUserId);
    addNotification(targetUserId, {
      type: 'follow',
      fromUserId: activeId,
      fromName: getActiveUser().name,
      text: `começou a te seguir`,
      createdAt: new Date().toISOString()
    });
  } else {
    all[activeId].splice(idx, 1);
  }
  saveAllFollows(all);
  toRemote('follow', targetUserId, idx === -1);
  return !~idx; // returns true if now following
}

// ──────────────────────────────────────────
//  BLOCKED
// ──────────────────────────────────────────

function getAllBlocked() {
  try { return cachedJson(STORAGE_KEYS.BLOCKED, null) || {}; }
  catch { return {}; }
}

export function isBlocked(userId) {
  const all = getAllBlocked();
  const activeId = getActiveUserId();
  return (all[activeId] || []).includes(userId);
}

export function toggleBlock(userId) {
  const all = getAllBlocked();
  const activeId = getActiveUserId();
  if (!all[activeId]) all[activeId] = [];
  const idx = all[activeId].indexOf(userId);
  if (idx === -1) {
    all[activeId].push(userId);
  } else {
    all[activeId].splice(idx, 1);
  }
  lsSet(STORAGE_KEYS.BLOCKED, JSON.stringify(all));
}

// ──────────────────────────────────────────
//  BOOKMARKS
// ──────────────────────────────────────────

function getAllBookmarks() {
  try { return cachedJson(STORAGE_KEYS.BOOKMARKS, null) || {}; }
  catch { return {}; }
}

export function isBookmarked(postId) {
  const all = getAllBookmarks();
  const activeId = getActiveUserId();
  return (all[activeId] || []).includes(postId);
}

export function toggleBookmark(postId) {
  const all = getAllBookmarks();
  const activeId = getActiveUserId();
  if (!all[activeId]) all[activeId] = [];
  const idx = all[activeId].indexOf(postId);
  if (idx === -1) {
    all[activeId].push(postId);
  } else {
    all[activeId].splice(idx, 1);
  }
  lsSet(STORAGE_KEYS.BOOKMARKS, JSON.stringify(all));
  return !~idx;
}

export function getUserBookmarkedPosts() {
  const all = getAllBookmarks();
  const activeId = getActiveUserId();
  const bookmarkedIds = all[activeId] || [];
  return getFeedPosts().filter(p => bookmarkedIds.includes(p.id));
}

// ──────────────────────────────────────────
//  NOTIFICATIONS
// ──────────────────────────────────────────

export function getAllNotifications() {
  try { return cachedJson(STORAGE_KEYS.NOTIFICATIONS, null) || []; }
  catch { return []; }
}

export function getMyNotifications() {
  const activeId = getActiveUserId();
  const seen = new Set();
  return getAllNotifications().filter(n => n.targetUserId === activeId)
    // A like made in this same browser also comes back from the server: show it once
    .filter(n => {
      const key = n.remote || !['like', 'repost', 'follow'].includes(n.type) ? n.id : `${n.type}:${n.type === 'follow' ? activeId : n.postId}:${n.fromUserId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 30);
}

export function getUnreadNotificationCount() {
  return getMyNotifications().filter(n => !n.read).length;
}

export function markNotificationsRead() {
  const all = getAllNotifications();
  const activeId = getActiveUserId();
  all.forEach(n => { if (n.targetUserId === activeId) n.read = true; });
  lsSet(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(all));
}

/**
 * Replace your server-made notifications (likes, reposts, comments, follows) with a fresh list,
 * keeping what you already read. The first sync on a browser starts with everything read.
 */
export function mergeRemoteNotifications(userId, list, source = 'feed') {
  const all = getAllNotifications();
  const seededKey = `rmsn_notifs_seeded_${userId}${source === 'feed' ? '' : '_' + source}`;
  const seeded = Boolean(lsGet(seededKey));
  const sourceOf = (n) => n.source || 'feed';
  const readIds = new Set(all.filter(n => n.remote && n.read).map(n => n.id));
  const kept = all.filter(n => !(n.remote && n.targetUserId === userId && sourceOf(n) === source));
  const fresh = list
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 60)
    .map(n => ({ ...n, source, remote: true, targetUserId: userId, read: !seeded || readIds.has(n.id) }));
  lsSet(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify([...fresh, ...kept].slice(0, 160)));
  if (!seeded) lsSet(seededKey, '1');
}

/** Mark one notification as read (e.g. after opening it from a pop-up). */
export function markNotificationRead(id) {
  const all = getAllNotifications();
  const n = all.find(x => x.id === id);
  if (!n || n.read) return;
  n.read = true;
  lsSet(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(all));
}

export function addNotification(targetUserId, data) {
  if (targetUserId === getActiveUserId()) return; // don't notify yourself
  const all = getAllNotifications();
  all.unshift({ id: 'notif_' + Date.now(), targetUserId, read: false, ...data });
  lsSet(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(all.slice(0, 100)));
}

// ──────────────────────────────────────────
//  POSTS
// ──────────────────────────────────────────

export function getFeedPosts(filterBy = 'all') {
  try {
    const posts = cachedJson(STORAGE_KEYS.POSTS, null) || [];
    const activeId = getActiveUserId();
    const blocked = getAllBlocked()[activeId] || [];
    const filtered = posts.filter(p => !blocked.includes(p.authorId));

    if (filterBy === 'following') {
      const following = getFollowing();
      const relevant = [];
      filtered.forEach(p => {
        const isAuthor = following.includes(p.authorId) || p.authorId === activeId;
        const reposterId = Array.isArray(p.reposts) ? p.reposts.find(r => following.includes(r) || r === activeId) : null;
        if (isAuthor || reposterId) {
          if (!isAuthor && reposterId) {
            const reposter = getUserById(reposterId);
            relevant.push({
              ...p,
              isRepost: true,
              reposterId,
              reposterName: reposterId === activeId ? 'Você' : (reposter?.name || 'Alguém')
            });
          } else {
            relevant.push(p);
          }
        }
      });
      return relevant;
    }
    return filtered;
  } catch { return []; }
}

export function getPostById(postId) {
  const posts = cachedJson(STORAGE_KEYS.POSTS, null) || [];
  return posts.find(p => p.id === postId) || null;
}

export function createPost(postData) {
  const posts = JSON.parse(lsGet(STORAGE_KEYS.POSTS)) || [];
  const activeUser = getActiveUser();

  const newPost = {
    id: 'post_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
    authorId: activeUser.id,
    text: postData.text || '',
    lyrics: postData.lyrics || '',
    lyricsSong: postData.lyricsSong || '',
    lyricsArt: postData.lyricsArt || '',
    tag: '',
    rating: typeof postData.rating === 'number' ? postData.rating : 0,
    song: postData.song || null,
    // Only the id is stored: the card reads the live playlist, so posts never carry a stale or heavy copy
    playlistId: postData.playlistId || null,
    poll: postData.poll || null,
    votes: {},
    imageUrl: postData.imageUrl || (postData.images || [])[0] || '',
    images: (postData.images || []).slice(0, 4),
    mentions: (postData.mentions || []).slice(0, 20),
    likes: [],
    comments: [],
    reposts: [],
    bookmarks: [],
    createdAt: 'agora mesmo'
  };

  posts.unshift(newPost);
  lsSet(STORAGE_KEYS.POSTS, JSON.stringify(posts));
  toRemote('createPost', newPost);
  return newPost;
}

export function updatePost(postId, updates) {
  const posts = JSON.parse(lsGet(STORAGE_KEYS.POSTS)) || [];
  const idx = posts.findIndex(p => p.id === postId);
  if (idx !== -1) {
    posts[idx] = { ...posts[idx], ...updates, updatedAt: 'editado agora' };
    lsSet(STORAGE_KEYS.POSTS, JSON.stringify(posts));
    toRemote('updatePost', posts[idx]);
    return posts[idx];
  }
  return null;
}

export function toggleLikePost(postId) {
  const posts = JSON.parse(lsGet(STORAGE_KEYS.POSTS)) || [];
  const activeUser = getActiveUser();
  const post = posts.find(p => p.id === postId);
  if (post) {
    if (!Array.isArray(post.likes)) post.likes = [];
    const idx = post.likes.indexOf(activeUser.id);
    if (idx === -1) {
      post.likes.push(activeUser.id);
      addNotification(post.authorId, {
        type: 'like',
        fromUserId: activeUser.id,
        fromName: activeUser.name,
        postId,
        text: `curtiu seu post`,
        createdAt: new Date().toISOString()
      });
    } else {
      post.likes.splice(idx, 1);
    }
    lsSet(STORAGE_KEYS.POSTS, JSON.stringify(posts));
    toRemote('like', postId, idx === -1);
  }
}

export function toggleRepostPost(postId) {
  const posts = JSON.parse(lsGet(STORAGE_KEYS.POSTS)) || [];
  const activeUser = getActiveUser();
  const post = posts.find(p => p.id === postId);
  if (post) {
    if (!Array.isArray(post.reposts)) post.reposts = [];
    const idx = post.reposts.indexOf(activeUser.id);
    if (idx === -1) {
      post.reposts.push(activeUser.id);
      addNotification(post.authorId, {
        type: 'repost',
        fromUserId: activeUser.id,
        fromName: activeUser.name,
        postId,
        text: `repostou seu post`,
        createdAt: new Date().toISOString()
      });
    } else {
      post.reposts.splice(idx, 1);
    }
    lsSet(STORAGE_KEYS.POSTS, JSON.stringify(posts));
    toRemote('repost', postId, idx === -1);
  }
}

export function addCommentToPost(postId, commentData) {
  let text = '';
  let song = null;
  let imageUrl = '';
  let gifUrl = '';

  if (typeof commentData === 'string') {
    text = commentData.trim();
  } else if (commentData && typeof commentData === 'object') {
    text = (commentData.text || '').trim();
    song = commentData.song || null;
    imageUrl = commentData.imageUrl || '';
    gifUrl = commentData.gifUrl || '';
  }
  const parentId = (commentData && typeof commentData === 'object' && commentData.parentId) || null;

  if (!text && !song && !imageUrl && !gifUrl) return null;

  const posts = JSON.parse(lsGet(STORAGE_KEYS.POSTS)) || [];
  const activeUser = getActiveUser();
  const post = posts.find(p => p.id === postId);
  if (post) {
    if (!Array.isArray(post.comments)) post.comments = [];
    const newComment = {
      id: 'c_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      userId: activeUser.id,
      userName: activeUser.name,
      userAvatar: activeUser.avatar || 'U',
      text: text,
      song: song,
      imageUrl: imageUrl,
      gifUrl: gifUrl,
      ...(parentId && post.comments.some(c => c.id === parentId) ? { parentId } : {}),
      createdAt: 'agora'
    };
    post.comments.push(newComment);
    addNotification(post.authorId, {
      type: 'comment',
      fromUserId: activeUser.id,
      fromName: activeUser.name,
      postId,
      text: `comentou em seu post`,
      createdAt: new Date().toISOString()
    });
    lsSet(STORAGE_KEYS.POSTS, JSON.stringify(posts));
    toRemote('addComment', postId, newComment);
    return newComment;
  }
  return null;
}

/** Like or unlike a comment. Returns the updated comment (null if it no longer exists). */
export function toggleLikeComment(postId, commentId) {
  const posts = JSON.parse(lsGet(STORAGE_KEYS.POSTS)) || [];
  const comment = posts.find(p => p.id === postId)?.comments?.find(c => c.id === commentId);
  if (!comment) return null;
  const me = getActiveUserId();
  if (!Array.isArray(comment.likes)) comment.likes = [];
  const idx = comment.likes.indexOf(me);
  if (idx === -1) comment.likes.push(me); else comment.likes.splice(idx, 1);
  lsSet(STORAGE_KEYS.POSTS, JSON.stringify(posts));
  toRemote('likeComment', commentId, idx === -1);
  return comment;
}

/** Delete a comment: allowed for its author, the post's author, or anyone with opts.force (admins). */
export function deleteComment(postId, commentId, opts = {}) {
  const posts = JSON.parse(lsGet(STORAGE_KEYS.POSTS)) || [];
  const activeUser = getActiveUser();
  const post = posts.find(p => p.id === postId);
  if (post && Array.isArray(post.comments)) {
    const idx = post.comments.findIndex(c => c.id === commentId);
    if (idx !== -1) {
      const comment = post.comments[idx];
      if (opts.force || comment.userId === activeUser.id || post.authorId === activeUser.id) {
        post.comments.splice(idx, 1);
        lsSet(STORAGE_KEYS.POSTS, JSON.stringify(posts));
        toRemote('deleteComment', commentId);
        return true;
      }
    }
  }
  return false;
}

/**
 * Vote on a song poll (null removes your vote). Returns the updated post.
 */
export function votePoll(postId, option) {
  const posts = JSON.parse(lsGet(STORAGE_KEYS.POSTS)) || [];
  const post = posts.find(p => p.id === postId);
  const count = post?.poll?.options?.length || 0;
  if (!post || (option !== null && !(option >= 0 && option < count))) return null;
  const me = getActiveUserId();
  post.votes = { ...(post.votes || {}) };
  if (option === null) delete post.votes[me]; else post.votes[me] = option;
  lsSet(STORAGE_KEYS.POSTS, JSON.stringify(posts));
  toRemote('vote', postId, option);
  return post;
}

export function pinPost(postId) {
  const activeUser = getActiveUser();
  // Toggle: if already pinned, unpin
  const newPinned = activeUser.pinnedPostId === postId ? null : postId;
  updateUser(activeUser.id, { pinnedPostId: newPinned });
}

export function deletePost(postId) {
  const posts = JSON.parse(lsGet(STORAGE_KEYS.POSTS)) || [];
  const filtered = posts.filter(p => p.id !== postId);
  lsSet(STORAGE_KEYS.POSTS, JSON.stringify(filtered));
  toRemote('deletePost', postId);

  // Clean up user pin if this was pinned
  const activeUser = getActiveUser();
  if (activeUser.pinnedPostId === postId) {
    updateUser(activeUser.id, { pinnedPostId: null });
  }

  // Clean up bookmarks
  const bookmarks = getAllBookmarks();
  Object.keys(bookmarks).forEach(uid => {
    bookmarks[uid] = (bookmarks[uid] || []).filter(id => id !== postId);
  });
  lsSet(STORAGE_KEYS.BOOKMARKS, JSON.stringify(bookmarks));
}

// ──────────────────────────────────────────
//  CHALLENGES
// ──────────────────────────────────────────

export function getAllChallenges() {
  try { return JSON.parse(lsGet(STORAGE_KEYS.CHALLENGES)) || DEFAULT_CHALLENGES; }
  catch { return DEFAULT_CHALLENGES; }
}

export function getActiveChallengeId() {
  return lsGet(STORAGE_KEYS.ACTIVE_CHALLENGE) || 'classic_30';
}

export function setActiveChallengeId(id) {
  lsSet(STORAGE_KEYS.ACTIVE_CHALLENGE, id);
}

export function getActiveChallenge() {
  const all = getAllChallenges();
  const activeId = getActiveChallengeId();
  return all.find(c => c.id === activeId) || all[0];
}

export function createCustomChallenge(title, description, questions) {
  const all = getAllChallenges();
  const newChallenge = {
    id: 'custom_' + Date.now(),
    title: title.trim() || 'Minha Lista Personalizada',
    description: description ? description.trim() : '',
    questions: questions.map((q, idx) => ({
      id: idx + 1,
      title: q.title.trim(),
      subtitle: q.subtitle ? q.subtitle.trim() : '',
      category: q.category ? q.category.trim() : 'Música'
    }))
  };
  all.push(newChallenge);
  lsSet(STORAGE_KEYS.CHALLENGES, JSON.stringify(all));
  setActiveChallengeId(newChallenge.id);
  return newChallenge;
}

export function deleteCustomChallenge(challengeId) {
  let all = getAllChallenges();
  if (all.length <= 1) return;
  all = all.filter(c => c.id !== challengeId);
  lsSet(STORAGE_KEYS.CHALLENGES, JSON.stringify(all));
  if (getActiveChallengeId() === challengeId) setActiveChallengeId(all[0].id);
}

// Challenge answers: kept per browser (key per challenge) and published in the profile
// (extras.challengeAnswers) so other people can see and compare them.
const answersKey = (challengeId, userId) => `${STORAGE_KEYS.ANSWERS_PREFIX}${challengeId}_${userId}`;
const liteTrack = (t) => ({
  id: t.id, title: t.title, artist: t.artist, album: t.album || '', artwork: t.artwork || '',
  previewUrl: t.previewUrl || '', duration: t.duration || '', userNote: (t.userNote || '').slice(0, 200)
});

export function getChallengeAnswers(challengeId = getActiveChallengeId(), userId = getActiveUserId()) {
  const raw = lsGet(answersKey(challengeId, userId));
  if (raw) { try { return JSON.parse(raw) || {}; } catch { return {}; } }
  // Nothing saved in this browser (someone else, or you on another device): what the profile published
  const published = getUserById(userId)?.challengeAnswers?.[challengeId];
  return published && typeof published === 'object' ? { ...published } : {};
}

/** Put your answers in your profile (synced), if they changed. */
export function publishChallengeAnswers() {
  const me = getActiveUserId();
  const prefix = STORAGE_KEYS.ANSWERS_PREFIX;
  const all = {};
  let keys = [];
  try { keys = Object.keys(localStorage).filter(k => k.startsWith(prefix) && k.endsWith(`_${me}`)); } catch { /* storage unavailable */ }
  keys.forEach(k => {
    const cid = k.slice(prefix.length, k.length - me.length - 1);
    try {
      const answers = JSON.parse(lsGet(k)) || {};
      const lite = Object.fromEntries(Object.entries(answers).map(([q, t]) => [q, liteTrack(t)]));
      if (Object.keys(lite).length) all[cid] = lite;
    } catch { /* skip a broken entry */ }
  });
  const user = getUserById(me);
  if (!user) return;
  const published = user.challengeAnswers || {};
  // Answers that only exist in the profile (another device) stay published
  Object.keys(published).forEach(cid => { if (!(cid in all) && !keys.includes(answersKey(cid, me))) all[cid] = published[cid]; });
  // The profile's extras have a size limit on the server (~60 KB): trim the least important bits if needed
  const size = () => JSON.stringify(all).length;
  if (size() > 40000) Object.values(all).forEach(ans => Object.values(ans).forEach(t => { delete t.previewUrl; delete t.album; delete t.duration; }));
  if (size() > 40000) Object.keys(all).filter(cid => cid !== getActiveChallengeId()).forEach(cid => { if (size() > 40000) delete all[cid]; });
  if (JSON.stringify(all) !== JSON.stringify(published)) updateUser(me, { challengeAnswers: all });
}

export function saveChallengeAnswer(challengeId, questionId, trackData, userNote = '') {
  const userId = getActiveUserId();
  const answers = getChallengeAnswers(challengeId, userId);
  answers[questionId] = { ...trackData, userNote, answeredAt: new Date().toISOString() };
  lsSet(answersKey(challengeId, userId), JSON.stringify(answers));
  publishChallengeAnswers();
}

export function removeChallengeAnswer(challengeId, questionId) {
  const userId = getActiveUserId();
  const answers = getChallengeAnswers(challengeId, userId);
  delete answers[questionId];
  lsSet(answersKey(challengeId, userId), JSON.stringify(answers));
  publishChallengeAnswers();
}

// ──────────────────────────────────────────
//  MESSAGES
// ──────────────────────────────────────────

export function getChatMessages(userId1, userId2) {
  try {
    const all = JSON.parse(lsGet(STORAGE_KEYS.MESSAGES)) || [];
    return all.filter(m =>
      (m.fromUserId === userId1 && m.toUserId === userId2) ||
      (m.fromUserId === userId2 && m.toUserId === userId1)
    );
  } catch { return []; }
}

export function sendMessage(fromUserId, toUserId, text, song = null, imageUrl = '', gifUrl = '', replyTo = null, link = null) {
  try {
    const all = JSON.parse(lsGet(STORAGE_KEYS.MESSAGES)) || [];
    const now = new Date();
    const timeStr = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
    const newMsg = {
      id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      fromUserId,
      toUserId,
      text: (text || '').trim(),
      song: song || null,
      imageUrl: imageUrl || '',
      gifUrl: gifUrl || '',
      link: link || null,
      replyTo: replyTo || null,
      edited: false,
      createdAt: timeStr,
      createdAtIso: now.toISOString()
    };
    all.push(newMsg);
    lsSet(STORAGE_KEYS.MESSAGES, JSON.stringify(all));
    toRemote('sendMessage', newMsg);
    // The recipient's notification comes from the server (sync.js), not from this browser
    return newMsg;
  } catch (e) { console.error(e); }
}

export function editMessage(messageId, newText) {
  try {
    const all = JSON.parse(lsGet(STORAGE_KEYS.MESSAGES)) || [];
    const msg = all.find(m => m.id === messageId);
    if (msg) {
      msg.text = (newText || '').trim();
      msg.edited = true;
      lsSet(STORAGE_KEYS.MESSAGES, JSON.stringify(all));
      toRemote('editMessage', msg);
      return msg;
    }
  } catch (e) { console.error(e); }
  return null;
}

export function deleteMessage(messageId) {
  try {
    let all = JSON.parse(lsGet(STORAGE_KEYS.MESSAGES)) || [];
    all = all.filter(m => m.id !== messageId);
    lsSet(STORAGE_KEYS.MESSAGES, JSON.stringify(all));
    toRemote('deleteMessage', messageId);
    return true;
  } catch (e) { console.error(e); return false; }
}

// When each conversation was last read ({ contactId: iso }), per account. The time stored is the
// server timestamp of the newest message seen, so a phone with a wrong clock still counts right.
const chatReadKey = () => `rmsn_chat_read_${getActiveUserId()}`;
const getChatRead = () => readJson(chatReadKey(), {});

/** Mark a conversation as read up to its newest message. */
export function markChatRead(contactId) {
  if (!contactId) return;
  const me = getActiveUserId();
  // Only messages they sent count: those carry server timestamps (ours may still have the local clock's)
  const newest = getChatMessages(me, contactId).filter(m => m.fromUserId === contactId)
    .reduce((max, m) => (m.createdAtIso && m.createdAtIso > max ? m.createdAtIso : max), '');
  if (!newest) return;
  const read = getChatRead();
  if (read[contactId] && read[contactId] >= newest) return;
  read[contactId] = newest;
  lsSet(chatReadKey(), JSON.stringify(read));
}

/** First sync on this browser: everything already in the history counts as read. */
export function seedChatRead(userId, messages) {
  const key = `rmsn_chat_read_${userId}`;
  if (lsGet(key) !== null) return;
  const read = {};
  messages.forEach(m => {
    const other = m.fromUserId === userId ? m.toUserId : m.fromUserId;
    if (m.createdAtIso && (!read[other] || m.createdAtIso > read[other])) read[other] = m.createdAtIso;
  });
  lsSet(key, JSON.stringify(read));
}

/** Messages received after the conversation was last read (all contacts, or one). */
export function getUnreadMessageCount(userId = getActiveUserId(), fromUserId = null) {
  try {
    const all = readJson(STORAGE_KEYS.MESSAGES, []);
    const read = getChatRead();
    return all.filter(m => m.toUserId === userId && m.createdAtIso
      && (!fromUserId || m.fromUserId === fromUserId)
      && (!read[m.fromUserId] || m.createdAtIso > read[m.fromUserId])).length;
  } catch { return 0; }
}

/**
 * Replace the cached conversations of an account with the server's copy, keeping messages still
 * on their way up and other accounts' local messages. Returns the account's messages.
 */
export function replaceMessagesCache(userId, messages, keepIds = []) {
  const current = readJson(STORAGE_KEYS.MESSAGES, []);
  const mine = (m) => m.fromUserId === userId || m.toUserId === userId;
  const others = current.filter(m => !mine(m));
  // Kept: messages on their way up and anything you sent that the server never had (the outbox resends it)
  const onServer = new Set(messages.map(r => r.id));
  const pending = current.filter(m => mine(m) && !onServer.has(m.id) && (keepIds.includes(m.id) || (m.fromUserId === userId && !m.synced)));
  lsSet(STORAGE_KEYS.MESSAGES, JSON.stringify([...others, ...messages, ...pending]));
  return [...messages, ...pending];
}

/** Add newly arrived messages (or refresh ones already cached). Returns the account's messages. */
export function addMessagesToCache(userId, messages) {
  const current = readJson(STORAGE_KEYS.MESSAGES, []);
  messages.forEach(m => {
    const i = current.findIndex(c => c.id === m.id);
    if (i === -1) current.push(m); else current[i] = m;
  });
  lsSet(STORAGE_KEYS.MESSAGES, JSON.stringify(current));
  return current.filter(m => m.fromUserId === userId || m.toUserId === userId);
}

/** Apply read marks ({ messageId: iso }) to your sent messages; true if anything changed. */
export function applyMessageReads(map) {
  const all = readJson(STORAGE_KEYS.MESSAGES, []);
  let changed = false;
  all.forEach(m => { if (map[m.id] && !m.readAt) { m.readAt = map[m.id]; changed = true; } });
  if (changed) lsSet(STORAGE_KEYS.MESSAGES, JSON.stringify(all));
  return changed;
}

/** The other side opened the conversation: everything you sent them counts as seen. */
export function markSentRead(contactId) {
  const me = getActiveUserId();
  const all = readJson(STORAGE_KEYS.MESSAGES, []);
  const now = new Date().toISOString();
  let changed = false;
  all.forEach(m => { if (m.fromUserId === me && m.toUserId === contactId && !m.readAt) { m.readAt = now; changed = true; } });
  if (changed) lsSet(STORAGE_KEYS.MESSAGES, JSON.stringify(all));
}

/** You opened the conversation: what they sent you is read (locally; the server is told by sync.js). */
export function markReceivedRead(contactId) {
  const me = getActiveUserId();
  const all = readJson(STORAGE_KEYS.MESSAGES, []);
  const now = new Date().toISOString();
  let changed = false;
  all.forEach(m => { if (m.toUserId === me && m.fromUserId === contactId && !m.readAt) { m.readAt = now; changed = true; } });
  if (changed) lsSet(STORAGE_KEYS.MESSAGES, JSON.stringify(all));
}

export function hasUnreadFrom(userId, contactId) {
  return readJson(STORAGE_KEYS.MESSAGES, []).some(m => m.toUserId === userId && m.fromUserId === contactId && m.synced && !m.readAt);
}

/** Messages this account wrote while the chat was still local-only. */
export function getLocalMessagesFrom(userId) {
  return readJson(STORAGE_KEYS.MESSAGES, []).filter(m => m.fromUserId === userId);
}

// ──────────────────────────────────────────
//  REVIEWS
// ──────────────────────────────────────────

export function getAllReviews() {
  try { return JSON.parse(lsGet(STORAGE_KEYS.REVIEWS)) || {}; }
  catch { return {}; }
}

export function getSongReviews(targetUserId, challengeId, questionId) {
  const all = getAllReviews();
  const key = `${challengeId}_${targetUserId}_${questionId}`;
  return all[key] || {};
}

export function saveSongReview(targetUserId, challengeId, questionId, rating, comment, song = null) {
  const all = getAllReviews();
  const activeUser = getActiveUser();
  const key = `${challengeId}_${targetUserId}_${questionId}`;
  if (!all[key]) all[key] = {};

  // Lookup song from challenge answers if not provided
  if (!song) {
    const answers = getChallengeAnswers(challengeId, targetUserId);
    song = answers?.[questionId] || null;
  }

  all[key][activeUser.id] = {
    reviewerId: activeUser.id,
    reviewerName: activeUser.name,
    reviewerAvatar: activeUser.avatar || 'U',
    rating: parseFloat(rating),
    comment: (comment || '').trim(),
    song: song || null,
    targetUserId: targetUserId,
    challengeId: challengeId,
    questionId: questionId,
    createdAt: 'agora'
  };
  lsSet(STORAGE_KEYS.REVIEWS, JSON.stringify(all));
  addNotification(targetUserId, {
    type: 'review',
    fromUserId: activeUser.id,
    fromName: activeUser.name,
    text: `avaliou uma de suas músicas com ${parseFloat(rating).toFixed(1)} estrelas`,
    createdAt: new Date().toISOString()
  });
  return all[key][activeUser.id];
}

// ──────────────────────────────────────────
//  PLAYLISTS
// ──────────────────────────────────────────

export function getAllPlaylists() {
  try {
    const list = JSON.parse(lsGet(STORAGE_KEYS.PLAYLISTS));
    if (Array.isArray(list)) return list;
    return [];
  } catch {
    return [];
  }
}

export function getPlaylistById(id) {
  const all = getAllPlaylists();
  return all.find(p => p.id === id) || null;
}

export function createPlaylist({ title, description = '', coverUrl = '' }) {
  const all = getAllPlaylists();
  const activeUser = getActiveUser();
  const newPl = {
    id: 'pl_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
    title: title.trim(),
    description: description.trim(),
    coverUrl: coverUrl.trim(),
    authorId: activeUser.id,
    createdAt: 'agora mesmo',
    likes: [],
    songs: []
  };
  all.unshift(newPl);
  lsSet(STORAGE_KEYS.PLAYLISTS, JSON.stringify(all));
  return newPl;
}

export function updatePlaylist(id, updates) {
  const all = getAllPlaylists();
  const idx = all.findIndex(p => p.id === id);
  if (idx !== -1) {
    all[idx] = { ...all[idx], ...updates, updatedAt: 'editado agora' };
    lsSet(STORAGE_KEYS.PLAYLISTS, JSON.stringify(all));
    return all[idx];
  }
  return null;
}

export function deletePlaylist(id) {
  const all = getAllPlaylists();
  const filtered = all.filter(p => p.id !== id);
  lsSet(STORAGE_KEYS.PLAYLISTS, JSON.stringify(filtered));
  return true;
}

export function addSongToPlaylist(playlistId, track, note = '') {
  const all = getAllPlaylists();
  const pl = all.find(p => p.id === playlistId);
  if (!pl) return null;
  if (!Array.isArray(pl.songs)) pl.songs = [];

  const songEntry = {
    id: track.id || ('trk_' + Date.now()),
    title: track.title,
    artist: track.artist,
    album: track.album || '',
    artwork: track.artwork || '',
    previewUrl: track.previewUrl || '',
    duration: track.duration || '0:00',
    note: note ? note.trim() : '',
    addedAt: new Date().toISOString()
  };

  pl.songs.push(songEntry);
  lsSet(STORAGE_KEYS.PLAYLISTS, JSON.stringify(all));
  return songEntry;
}

export function removeSongFromPlaylist(playlistId, songIndex) {
  const all = getAllPlaylists();
  const pl = all.find(p => p.id === playlistId);
  if (!pl || !Array.isArray(pl.songs)) return false;
  if (songIndex >= 0 && songIndex < pl.songs.length) {
    pl.songs.splice(songIndex, 1);
    lsSet(STORAGE_KEYS.PLAYLISTS, JSON.stringify(all));
    return true;
  }
  return false;
}

export function reorderPlaylistSongs(playlistId, fromIndex, toIndex) {
  const all = getAllPlaylists();
  const pl = all.find(p => p.id === playlistId);
  if (!pl || !Array.isArray(pl.songs)) return false;
  if (fromIndex < 0 || fromIndex >= pl.songs.length || toIndex < 0 || toIndex >= pl.songs.length) return false;
  const [moved] = pl.songs.splice(fromIndex, 1);
  pl.songs.splice(toIndex, 0, moved);
  lsSet(STORAGE_KEYS.PLAYLISTS, JSON.stringify(all));
  return true;
}

export function toggleLikePlaylist(playlistId) {
  const all = getAllPlaylists();
  const activeUser = getActiveUser();
  const pl = all.find(p => p.id === playlistId);
  if (pl) {
    if (!Array.isArray(pl.likes)) pl.likes = [];
    const idx = pl.likes.indexOf(activeUser.id);
    if (idx === -1) {
      pl.likes.push(activeUser.id);
      if (pl.authorId !== activeUser.id) {
        addNotification(pl.authorId, {
          type: 'like_playlist',
          fromUserId: activeUser.id,
          fromName: activeUser.name,
          text: `curtiu sua playlist "${pl.title}"`,
          createdAt: new Date().toISOString()
        });
      }
    } else {
      pl.likes.splice(idx, 1);
    }
    lsSet(STORAGE_KEYS.PLAYLISTS, JSON.stringify(all));
    return pl;
  }
  return null;
}

// ──────────────────────────────────────────
//  REAL MUSICAL AFFINITY / COMPATIBILITY ENGINE
// ──────────────────────────────────────────

export function calculateMusicalAffinity(userId1, userId2) {
  const user1 = getUserById(userId1);
  const user2 = getUserById(userId2);
  if (!user1 || !user2) return { hasEnoughData: false, percentage: 0 };

  const allChallenges = getAllChallenges();
  
  // 1. Gather all songs and artists for User 1
  const tracks1 = [];
  const artists1 = new Set();
  const genres1 = new Set();

  allChallenges.forEach(c => {
    const ans = getChallengeAnswers(c.id, userId1);
    Object.values(ans).forEach(s => {
      if (s && s.title) {
        tracks1.push(s);
        if (s.artist) artists1.add(s.artist.toLowerCase().trim());
        if (s.genre) genres1.add(s.genre.toLowerCase().trim());
      }
    });
  });

  if (user1.featuredSong?.artist) artists1.add(user1.featuredSong.artist.toLowerCase().trim());
  if (user1.topArtistsMonth && Array.isArray(user1.topArtistsMonth)) {
    user1.topArtistsMonth.forEach(a => { if (a?.name) artists1.add(a.name.toLowerCase().trim()); });
  }

  // 2. Gather all songs and artists for User 2
  const tracks2 = [];
  const artists2 = new Set();
  const genres2 = new Set();

  allChallenges.forEach(c => {
    const ans = getChallengeAnswers(c.id, userId2);
    Object.values(ans).forEach(s => {
      if (s && s.title) {
        tracks2.push(s);
        if (s.artist) artists2.add(s.artist.toLowerCase().trim());
        if (s.genre) genres2.add(s.genre.toLowerCase().trim());
      }
    });
  });

  if (user2.featuredSong?.artist) artists2.add(user2.featuredSong.artist.toLowerCase().trim());
  if (user2.topArtistsMonth && Array.isArray(user2.topArtistsMonth)) {
    user2.topArtistsMonth.forEach(a => { if (a?.name) artists2.add(a.name.toLowerCase().trim()); });
  }

  // Check if there is enough data
  if (artists1.size === 0 || artists2.size === 0) {
    return {
      hasEnoughData: false,
      percentage: 0,
      reason: 'Ainda sem respostas suficientes para calcular a sintonia'
    };
  }

  // 3. Shared artists
  const sharedArtists = [];
  artists1.forEach(a => {
    if (artists2.has(a)) sharedArtists.push(a);
  });

  // 4. Shared genres
  const sharedGenres = [];
  genres1.forEach(g => {
    if (genres2.has(g)) sharedGenres.push(g);
  });

  // 5. Shared exact tracks
  const sharedTracks = [];
  tracks1.forEach(t1 => {
    const t1Clean = (t1.title || '').toLowerCase().trim();
    const match = tracks2.find(t2 => (t2.title || '').toLowerCase().trim() === t1Clean);
    if (match && !sharedTracks.includes(t1.title)) sharedTracks.push(t1.title);
  });

  // 6. Mutual ratings given
  const allReviews = getAllReviews();
  let ratingSum = 0;
  let ratingCount = 0;
  
  Object.values(allReviews).forEach(questionReviews => {
    if (questionReviews[userId1] && questionReviews[userId1].targetUserId === userId2) {
      ratingSum += questionReviews[userId1].rating;
      ratingCount++;
    }
    if (questionReviews[userId2] && questionReviews[userId2].targetUserId === userId1) {
      ratingSum += questionReviews[userId2].rating;
      ratingCount++;
    }
  });

  // Weighted calculation
  const minArtistPool = Math.min(artists1.size, artists2.size);
  const artistScore = minArtistPool > 0 ? (sharedArtists.length / minArtistPool) * 100 : 0;

  const minGenrePool = Math.min(genres1.size, genres2.size);
  const genreScore = minGenrePool > 0 ? (sharedGenres.length / minGenrePool) * 100 : (sharedArtists.length > 0 ? 50 : 20);

  const minTrackPool = Math.min(tracks1.length, tracks2.length);
  const trackScore = minTrackPool > 0 ? (sharedTracks.length / minTrackPool) * 100 : 0;

  let finalPercentage;
  let avgRating = ratingCount > 0 ? (ratingSum / ratingCount).toFixed(1) : null;

  if (ratingCount > 0) {
    const ratingScore = (ratingSum / ratingCount / 5.0) * 100;
    finalPercentage = Math.round(artistScore * 0.40 + genreScore * 0.25 + trackScore * 0.15 + ratingScore * 0.20);
  } else {
    finalPercentage = Math.round(artistScore * 0.55 + genreScore * 0.30 + trackScore * 0.15);
  }

  // Baseline calibration: clamp between 10% and 100%
  finalPercentage = Math.min(100, Math.max(12, finalPercentage));

  return {
    hasEnoughData: true,
    percentage: finalPercentage,
    sharedArtists,
    sharedGenres,
    sharedTracks,
    avgRating,
    ratingCount,
    totalAnswers1: tracks1.length,
    totalAnswers2: tracks2.length
  };
}

// ──────────────────────────────────────────
//  LEGACY COMPAT HELPERS
// ──────────────────────────────────────────

export function getUserChallengeAnswers(userId = getActiveUserId()) {
  return getChallengeAnswers(getActiveChallengeId(), userId);
}

export function getQuestions() {
  return getActiveChallenge().questions;
}

