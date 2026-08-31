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
};

const INITIAL_USERS = [
  {
    id: 'user_me',
    name: 'Você',
    handle: '@voce',
    avatar: 'V',
    bannerUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=1200&auto=format&fit=crop&q=80',
    themeColor: '#2b1042',
    profileBgColor: '#130c1e',
    profileAccentColor: '#3a165a',
    profileTextColor: '#f5f0fa',
    profileStatusColor: '#bda2db',
    profileFeaturedColor: '#0a0610',
    bio: 'Viciado em descobrir músicas novas e postar letras de madrugada.',
    status: 'ouvindo pós-punk no volume máximo',
    pinnedPostId: null,
    songShowcase: [],
    spotifyConnected: true,
    musicService: 'spotify',
    spotifyUsername: 'voce_music',
    topArtist: {
      rank: 1,
      name: 'The Weeknd',
      playcount: 348,
      genre: 'R&B / Synthpop',
      imageUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80'
    },
    topArtistsMonth: [
      { rank: 1, name: 'The Weeknd', playcount: 348, genre: 'R&B / Synthpop', imageUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80' },
      { rank: 2, name: 'Coldplay', playcount: 285, genre: 'Alt Rock / Pop', imageUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80' },
      { rank: 3, name: 'Joy Division', playcount: 210, genre: 'Post-Punk', imageUrl: 'https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?w=600&auto=format&fit=crop&q=80' },
      { rank: 4, name: 'The Smiths', playcount: 178, genre: 'Indie Rock', imageUrl: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&auto=format&fit=crop&q=80' },
      { rank: 5, name: 'Deftones', playcount: 142, genre: 'Alt Metal / Shoegaze', imageUrl: 'https://images.unsplash.com/photo-1511735111819-9a3f7709049c?w=600&auto=format&fit=crop&q=80' }
    ],
    featuredSong: {
      id: 'itunes_coldplay_yellow',
      title: 'Yellow',
      artist: 'Coldplay',
      album: 'Parachutes',
      artwork: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80',
      previewUrl: '',
      duration: '4:29'
    }
  },
  {
    id: 'user_clara',
    name: 'Clara',
    handle: '@clara_vibes',
    avatar: 'C',
    bannerUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=1200&auto=format&fit=crop&q=80',
    themeColor: '#38133b',
    profileBgColor: '#130c1e',
    profileAccentColor: '#4e1b5e',
    profileTextColor: '#ffffff',
    profileStatusColor: '#c98bc9',
    profileFeaturedColor: '#0a0610',
    bio: 'MPB, Indie e café. Letras que doem no coração.',
    status: 'analisando letras antigas',
    pinnedPostId: null,
    songShowcase: [],
    spotifyConnected: true,
    musicService: 'lastfm',
    spotifyUsername: 'clara_scrobbles',
    topArtist: {
      rank: 1,
      name: 'Elis Regina',
      playcount: 290,
      genre: 'MPB / Bossa Nova',
      imageUrl: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=600&auto=format&fit=crop&q=80'
    },
    topArtistsMonth: [
      { rank: 1, name: 'Elis Regina', playcount: 290, genre: 'MPB / Bossa Nova', imageUrl: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=600&auto=format&fit=crop&q=80' },
      { rank: 2, name: 'Legião Urbana', playcount: 240, genre: 'Rock Nacional', imageUrl: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=600&auto=format&fit=crop&q=80' },
      { rank: 3, name: 'Gal Costa', playcount: 195, genre: 'Tropicália', imageUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80' },
      { rank: 4, name: 'Caetano Veloso', playcount: 170, genre: 'MPB', imageUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80' },
      { rank: 5, name: 'Belchior', playcount: 155, genre: 'MPB', imageUrl: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&auto=format&fit=crop&q=80' }
    ],
    featuredSong: null
  },
  {
    id: 'user_lucas',
    name: 'Lucas',
    handle: '@lucas_rock',
    avatar: 'L',
    bannerUrl: 'https://images.unsplash.com/photo-1511735111819-9a3f7709049c?w=1200&auto=format&fit=crop&q=80',
    themeColor: '#1e0828',
    profileBgColor: '#130c1e',
    profileAccentColor: '#3d164f',
    profileTextColor: '#e1bee7',
    profileStatusColor: '#b068be',
    profileFeaturedColor: '#0a0610',
    bio: 'Pós-punk dos anos 80, guitarras distorcidas e vinis velhos.',
    status: 'procurando fitas cassete raras',
    pinnedPostId: null,
    songShowcase: [],
    spotifyConnected: true,
    musicService: 'spotify',
    spotifyUsername: 'lucas_vinyl',
    topArtist: {
      rank: 1,
      name: 'Joy Division',
      playcount: 380,
      genre: 'Post-Punk',
      imageUrl: 'https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?w=600&auto=format&fit=crop&q=80'
    },
    topArtistsMonth: [
      { rank: 1, name: 'Joy Division', playcount: 380, genre: 'Post-Punk', imageUrl: 'https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?w=600&auto=format&fit=crop&q=80' },
      { rank: 2, name: 'The Cure', playcount: 310, genre: 'Goth / Post-Punk', imageUrl: 'https://images.unsplash.com/photo-1511735111819-9a3f7709049c?w=600&auto=format&fit=crop&q=80' },
      { rank: 3, name: 'New Order', playcount: 260, genre: 'Synthpop', imageUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80' },
      { rank: 4, name: 'Bauhaus', playcount: 185, genre: 'Gothic Rock', imageUrl: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&auto=format&fit=crop&q=80' },
      { rank: 5, name: 'The Smiths', playcount: 160, genre: 'Indie Rock', imageUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80' }
    ],
    featuredSong: null
  }
];

const INITIAL_POSTS = [
  {
    id: 'post_seed_1',
    authorId: 'user_clara',
    text: 'Alguém mais fica preso nessa letra o dia todo? Pura poesia.',
    lyrics: 'Look at the stars, look how they shine for you, and everything you do... yeah they were all yellow.',
    lyricsSong: 'Coldplay — Yellow',
    lyricsArt: 'https://images.unsplash.com/photo-1531306728370-e2ebd9d7bb99?w=400&auto=format&fit=crop&q=80',
    lyricsCardStyle: 'with-cover',
    tag: '#letra',
    rating: 4.5,
    song: {
      id: 'itunes_coldplay_yellow',
      title: 'Yellow',
      artist: 'Coldplay',
      artwork: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80',
      previewUrl: '',
      duration: '4:29'
    },
    imageUrl: '',
    likes: ['user_me', 'user_lucas'],
    comments: [
      { id: 'c1', userId: 'user_me', userName: 'Você', userAvatar: 'V', text: 'Clássico absoluto!', createdAt: 'há 10 min' }
    ],
    reposts: [],
    bookmarks: [],
    createdAt: 'há 25 min'
  },
  {
    id: 'post_seed_2',
    authorId: 'user_lucas',
    text: 'Joy Division acertou em cheio com essa. Quem mais acha que "Love Will Tear Us Apart" é atemporal?',
    lyrics: 'When routine bites hard and ambitions are low, and the resentment rides high...',
    lyricsSong: 'Joy Division — Love Will Tear Us Apart',
    lyricsArt: 'https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?w=400&auto=format&fit=crop&q=80',
    lyricsCardStyle: 'full-bleed',
    tag: '#música',
    rating: 5.0,
    song: {
      id: 'itunes_joy_division_love',
      title: 'Love Will Tear Us Apart',
      artist: 'Joy Division',
      artwork: 'https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?w=600&auto=format&fit=crop&q=80',
      previewUrl: '',
      duration: '3:25'
    },
    imageUrl: '',
    likes: ['user_me'],
    comments: [],
    reposts: [],
    bookmarks: [],
    createdAt: 'há 1h'
  }
];

const INITIAL_MESSAGES = [
  {
    id: 'm1',
    fromUserId: 'user_clara',
    toUserId: 'user_me',
    text: 'Oi! Vi que você colocou Yellow no destaque. Clássico!',
    song: null,
    createdAt: '15:30'
  }
];

// ──────────────────────────────────────────
//  INIT
// ──────────────────────────────────────────

export function initStorage() {
  if (!localStorage.getItem(STORAGE_KEYS.USERS)) {
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(INITIAL_USERS));
  } else {
    try {
      const existing = JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS)) || [];
      let modified = false;
      existing.forEach(u => {
        const init = INITIAL_USERS.find(i => i.id === u.id);
        if (init && (!u.topArtistsMonth || !u.topArtistsMonth.length)) {
          u.topArtistsMonth = init.topArtistsMonth || [];
          u.topArtist = init.topArtist || null;
          u.spotifyConnected = init.spotifyConnected ?? true;
          u.musicService = init.musicService || 'lastfm';
          modified = true;
        }
      });
      if (modified) {
        localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(existing));
      }
    } catch(e) {}
  }
  if (!localStorage.getItem(STORAGE_KEYS.ACTIVE_USER)) {
    localStorage.setItem(STORAGE_KEYS.ACTIVE_USER, 'user_me');
  }
  if (!localStorage.getItem(STORAGE_KEYS.POSTS)) {
    localStorage.setItem(STORAGE_KEYS.POSTS, JSON.stringify(INITIAL_POSTS));
  }
  if (!localStorage.getItem(STORAGE_KEYS.MESSAGES)) {
    localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(INITIAL_MESSAGES));
  }
  if (!localStorage.getItem(STORAGE_KEYS.CHALLENGES)) {
    localStorage.setItem(STORAGE_KEYS.CHALLENGES, JSON.stringify(DEFAULT_CHALLENGES));
  }
  if (!localStorage.getItem(STORAGE_KEYS.ACTIVE_CHALLENGE)) {
    localStorage.setItem(STORAGE_KEYS.ACTIVE_CHALLENGE, 'classic_30');
  }
  if (!localStorage.getItem(STORAGE_KEYS.FOLLOWS)) {
    // user_me follows clara and lucas by default
    localStorage.setItem(STORAGE_KEYS.FOLLOWS, JSON.stringify({ user_me: ['user_clara', 'user_lucas'], user_clara: ['user_me'], user_lucas: ['user_me'] }));
  }
  if (!localStorage.getItem(STORAGE_KEYS.BOOKMARKS)) {
    localStorage.setItem(STORAGE_KEYS.BOOKMARKS, JSON.stringify({}));
  }
  if (!localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS)) {
    localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify([]));
  }
  if (!localStorage.getItem(STORAGE_KEYS.BLOCKED)) {
    localStorage.setItem(STORAGE_KEYS.BLOCKED, JSON.stringify({}));
  }

  // Prepopulate sample challenge answers
  const claraKey = `${STORAGE_KEYS.ANSWERS_PREFIX}classic_30_user_clara`;
  if (!localStorage.getItem(claraKey)) {
    localStorage.setItem(claraKey, JSON.stringify({
      1: { title: 'Yellow', artist: 'Coldplay', artwork: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80', previewUrl: '', duration: '4:29' },
      2: { title: '7 Rings', artist: 'Ariana Grande', artwork: 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=600&auto=format&fit=crop&q=80', previewUrl: '', duration: '2:58' },
      3: { title: 'Cruel Summer', artist: 'Taylor Swift', artwork: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=600&auto=format&fit=crop&q=80', previewUrl: '', duration: '2:58' }
    }));
  }
}

// ──────────────────────────────────────────
//  USERS
// ──────────────────────────────────────────

export function getAllUsers() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS)) || []; }
  catch { return INITIAL_USERS; }
}

export function getActiveUserId() {
  return localStorage.getItem(STORAGE_KEYS.ACTIVE_USER) || 'user_me';
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
  localStorage.setItem(STORAGE_KEYS.ACTIVE_USER, userId);
}

export function updateUser(userId, updates) {
  const users = getAllUsers();
  const index = users.findIndex(u => u.id === userId);
  if (index !== -1) {
    users[index] = { ...users[index], ...updates };
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
  }
}

export function updateUserMusicStats(userId, stats) {
  const user = getUserById(userId);
  if (!user) return;
  const updated = {
    spotifyConnected: true,
    musicService: stats.service || 'lastfm',
    spotifyUsername: stats.username || '',
    topArtist: stats.topArtist || (stats.topArtistsMonth ? stats.topArtistsMonth[0] : null),
    topArtistsMonth: stats.topArtistsMonth || [],
    topTracksMonth: stats.topTracksMonth || []
  };
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
  try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.FOLLOWS)) || {}; }
  catch { return {}; }
}

function saveAllFollows(data) {
  localStorage.setItem(STORAGE_KEYS.FOLLOWS, JSON.stringify(data));
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
  return !~idx; // returns true if now following
}

// ──────────────────────────────────────────
//  BLOCKED
// ──────────────────────────────────────────

function getAllBlocked() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.BLOCKED)) || {}; }
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
  localStorage.setItem(STORAGE_KEYS.BLOCKED, JSON.stringify(all));
}

// ──────────────────────────────────────────
//  BOOKMARKS
// ──────────────────────────────────────────

function getAllBookmarks() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.BOOKMARKS)) || {}; }
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
  localStorage.setItem(STORAGE_KEYS.BOOKMARKS, JSON.stringify(all));
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
  try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS)) || []; }
  catch { return []; }
}

export function getMyNotifications() {
  const activeId = getActiveUserId();
  return getAllNotifications().filter(n => n.targetUserId === activeId)
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
  localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(all));
}

export function addNotification(targetUserId, data) {
  if (targetUserId === getActiveUserId()) return; // don't notify yourself
  const all = getAllNotifications();
  all.unshift({ id: 'notif_' + Date.now(), targetUserId, read: false, ...data });
  localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(all.slice(0, 100)));
}

// ──────────────────────────────────────────
//  POSTS
// ──────────────────────────────────────────

export function getFeedPosts(filterBy = 'all') {
  try {
    const posts = JSON.parse(localStorage.getItem(STORAGE_KEYS.POSTS)) || [];
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
  const posts = JSON.parse(localStorage.getItem(STORAGE_KEYS.POSTS)) || [];
  return posts.find(p => p.id === postId) || null;
}

export function createPost(postData) {
  const posts = JSON.parse(localStorage.getItem(STORAGE_KEYS.POSTS)) || [];
  const activeUser = getActiveUser();

  const newPost = {
    id: 'post_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
    authorId: activeUser.id,
    text: postData.text || '',
    lyrics: postData.lyrics || '',
    lyricsSong: postData.lyricsSong || '',
    lyricsArt: postData.lyricsArt || '',
    lyricsCardStyle: postData.lyricsCardStyle || 'compact',
    tag: postData.tag || '#música',
    rating: typeof postData.rating === 'number' ? postData.rating : 0,
    song: postData.song || null,
    imageUrl: postData.imageUrl || '',
    likes: [],
    comments: [],
    reposts: [],
    bookmarks: [],
    createdAt: 'agora mesmo'
  };

  posts.unshift(newPost);
  localStorage.setItem(STORAGE_KEYS.POSTS, JSON.stringify(posts));
  return newPost;
}

export function updatePost(postId, updates) {
  const posts = JSON.parse(localStorage.getItem(STORAGE_KEYS.POSTS)) || [];
  const idx = posts.findIndex(p => p.id === postId);
  if (idx !== -1) {
    posts[idx] = { ...posts[idx], ...updates, updatedAt: 'editado agora' };
    localStorage.setItem(STORAGE_KEYS.POSTS, JSON.stringify(posts));
    return posts[idx];
  }
  return null;
}

export function toggleLikePost(postId) {
  const posts = JSON.parse(localStorage.getItem(STORAGE_KEYS.POSTS)) || [];
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
    localStorage.setItem(STORAGE_KEYS.POSTS, JSON.stringify(posts));
  }
}

export function toggleRepostPost(postId) {
  const posts = JSON.parse(localStorage.getItem(STORAGE_KEYS.POSTS)) || [];
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
    localStorage.setItem(STORAGE_KEYS.POSTS, JSON.stringify(posts));
  }
}

export function addCommentToPost(postId, text) {
  if (!text || !text.trim()) return;
  const posts = JSON.parse(localStorage.getItem(STORAGE_KEYS.POSTS)) || [];
  const activeUser = getActiveUser();
  const post = posts.find(p => p.id === postId);
  if (post) {
    if (!Array.isArray(post.comments)) post.comments = [];
    post.comments.push({
      id: 'c_' + Date.now(),
      userId: activeUser.id,
      userName: activeUser.name,
      userAvatar: activeUser.avatar || 'U',
      text: text.trim(),
      createdAt: 'agora'
    });
    addNotification(post.authorId, {
      type: 'comment',
      fromUserId: activeUser.id,
      fromName: activeUser.name,
      postId,
      text: `comentou em seu post`,
      createdAt: new Date().toISOString()
    });
    localStorage.setItem(STORAGE_KEYS.POSTS, JSON.stringify(posts));
  }
}

export function pinPost(postId) {
  const activeUser = getActiveUser();
  // Toggle: if already pinned, unpin
  const newPinned = activeUser.pinnedPostId === postId ? null : postId;
  updateUser(activeUser.id, { pinnedPostId: newPinned });
}

export function deletePost(postId) {
  const posts = JSON.parse(localStorage.getItem(STORAGE_KEYS.POSTS)) || [];
  const filtered = posts.filter(p => p.id !== postId);
  localStorage.setItem(STORAGE_KEYS.POSTS, JSON.stringify(filtered));

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
  localStorage.setItem(STORAGE_KEYS.BOOKMARKS, JSON.stringify(bookmarks));
}

// ──────────────────────────────────────────
//  CHALLENGES
// ──────────────────────────────────────────

export function getAllChallenges() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.CHALLENGES)) || DEFAULT_CHALLENGES; }
  catch { return DEFAULT_CHALLENGES; }
}

export function getActiveChallengeId() {
  return localStorage.getItem(STORAGE_KEYS.ACTIVE_CHALLENGE) || 'classic_30';
}

export function setActiveChallengeId(id) {
  localStorage.setItem(STORAGE_KEYS.ACTIVE_CHALLENGE, id);
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
  localStorage.setItem(STORAGE_KEYS.CHALLENGES, JSON.stringify(all));
  setActiveChallengeId(newChallenge.id);
  return newChallenge;
}

export function deleteCustomChallenge(challengeId) {
  let all = getAllChallenges();
  if (all.length <= 1) return;
  all = all.filter(c => c.id !== challengeId);
  localStorage.setItem(STORAGE_KEYS.CHALLENGES, JSON.stringify(all));
  if (getActiveChallengeId() === challengeId) setActiveChallengeId(all[0].id);
}

export function getChallengeAnswers(challengeId = getActiveChallengeId(), userId = getActiveUserId()) {
  const key = `${STORAGE_KEYS.ANSWERS_PREFIX}${challengeId}_${userId}`;
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : {}; }
  catch { return {}; }
}

export function saveChallengeAnswer(challengeId, questionId, trackData, userNote = '') {
  const userId = getActiveUserId();
  const answers = getChallengeAnswers(challengeId, userId);
  answers[questionId] = { ...trackData, userNote, answeredAt: new Date().toISOString() };
  const key = `${STORAGE_KEYS.ANSWERS_PREFIX}${challengeId}_${userId}`;
  localStorage.setItem(key, JSON.stringify(answers));
}

export function removeChallengeAnswer(challengeId, questionId) {
  const userId = getActiveUserId();
  const answers = getChallengeAnswers(challengeId, userId);
  delete answers[questionId];
  const key = `${STORAGE_KEYS.ANSWERS_PREFIX}${challengeId}_${userId}`;
  localStorage.setItem(key, JSON.stringify(answers));
}

// ──────────────────────────────────────────
//  MESSAGES
// ──────────────────────────────────────────

export function getChatMessages(userId1, userId2) {
  try {
    const all = JSON.parse(localStorage.getItem(STORAGE_KEYS.MESSAGES)) || [];
    return all.filter(m =>
      (m.fromUserId === userId1 && m.toUserId === userId2) ||
      (m.fromUserId === userId2 && m.toUserId === userId1)
    );
  } catch { return []; }
}

export function sendMessage(fromUserId, toUserId, text, song = null) {
  try {
    const all = JSON.parse(localStorage.getItem(STORAGE_KEYS.MESSAGES)) || [];
    const now = new Date();
    const timeStr = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
    const newMsg = { id: 'msg_' + Date.now(), fromUserId, toUserId, text: text.trim(), song, createdAt: timeStr };
    all.push(newMsg);
    localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(all));
    addNotification(toUserId, {
      type: 'message',
      fromUserId,
      fromName: getUserById(fromUserId)?.name || 'Alguém',
      text: `te enviou uma mensagem`,
      createdAt: new Date().toISOString()
    });
    return newMsg;
  } catch (e) { console.error(e); }
}

export function getUnreadMessageCount(userId = getActiveUserId()) {
  try {
    const all = JSON.parse(localStorage.getItem(STORAGE_KEYS.MESSAGES)) || [];
    return all.filter(m => m.toUserId === userId && !m.read).length;
  } catch { return 0; }
}

// ──────────────────────────────────────────
//  REVIEWS
// ──────────────────────────────────────────

export function getAllReviews() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.REVIEWS)) || {}; }
  catch { return {}; }
}

export function getSongReviews(targetUserId, challengeId, questionId) {
  const all = getAllReviews();
  const key = `${challengeId}_${targetUserId}_${questionId}`;
  return all[key] || {};
}

export function saveSongReview(targetUserId, challengeId, questionId, rating, comment) {
  const all = getAllReviews();
  const activeUser = getActiveUser();
  const key = `${challengeId}_${targetUserId}_${questionId}`;
  if (!all[key]) all[key] = {};
  all[key][activeUser.id] = {
    reviewerId: activeUser.id,
    reviewerName: activeUser.name,
    reviewerAvatar: activeUser.avatar || 'U',
    rating: parseFloat(rating),
    comment: comment.trim(),
    createdAt: 'agora'
  };
  localStorage.setItem(STORAGE_KEYS.REVIEWS, JSON.stringify(all));
  addNotification(targetUserId, {
    type: 'review',
    fromUserId: activeUser.id,
    fromName: activeUser.name,
    text: `avaliou uma de suas músicas com ${parseFloat(rating).toFixed(1)}`,
    createdAt: new Date().toISOString()
  });
  return all[key][activeUser.id];
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
