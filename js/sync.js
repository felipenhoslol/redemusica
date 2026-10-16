// Shared timeline: mirrors posts, likes, reposts, comments and follows to Supabase so everyone sees the same feed.
// storage.js stays the synchronous cache the UI reads; this module fills it from the server and pushes local writes up.
import { getSupabase } from './supabase.js';
import * as Storage from './storage.js';

const POLL_MS = 45000;
const PROFILE_FIELDS = 'id, name, handle, avatar_url';
const FULL_PROFILE_FIELDS = `${PROFILE_FIELDS}, banner_url, bio, status, extras, updated_at`;

const pending = new Set();  // post ids created here that the server hasn't confirmed yet
// Follows/likes/reposts clicked here and still on their way up: a pull that started before
// the write landed must not undo them on screen
const pendingFollows = new Map(); // targetId → following?
const pendingLikes = new Map();   // postId → liked?
const pendingReposts = new Map(); // postId → reposted?
let pullSoonTimer = null;
let pullFailures = 0;
let warnedPullFailure = false;
let me = null;
let handlers = {};
let lastSignature = '';
let timer = null;
let pulling = null;
let disabled = false;
let profileColumns = true;  // false until supabase/003_profiles_media.sql has been run
let profileDirty = false;   // your own profile has local changes not on the server yet
let profileTimer = null;
let warnedProfileSql = false;
let votesTable = true;      // false until supabase/004_polls.sql has been run
let commentLikesTable = true; // false until supabase/005_comment_likes.sql has been run
let presenceOn = true;      // false until supabase/006_presence.sql has been run
let presenceTimer = null;
let messagesOn = true;      // false until supabase/007_messages.sql has been run
let messagesTimer = null;
let messagesPulling = null;
let lastMessagesSignature = '';
const pendingMessages = new Set();
const MESSAGES_POLL_MS = 8000;
const PRESENCE_MS = 60000;
const ONLINE_WINDOW_MS = 2.5 * 60000; // a missed heartbeat or two still counts as online

/** "agora", "há 5 min", "há 3 h", "há 2 d", or a date for older posts. */
export function relativeTime(iso) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (!Number.isFinite(diff)) return '';
  if (diff < 60) return 'agora';
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)} h`;
  if (diff < 7 * 86400) return `há ${Math.floor(diff / 86400)} d`;
  return new Date(iso).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' });
}

/**
 * Online status from the last heartbeat.
 * @returns {{ online: boolean, known: boolean, label: string }}
 */
export function presenceOf(user) {
  if (!user?.lastSeenAt) return { online: false, known: false, label: '' };
  const online = Date.now() - new Date(user.lastSeenAt).getTime() < ONLINE_WINDOW_MS;
  if (online) return { online: true, known: true, label: 'online' };
  const rel = relativeTime(user.lastSeenAt);
  return { online: false, known: true, label: rel === 'agora' ? 'visto agora' : `visto ${/^há/.test(rel) ? rel : 'em ' + rel}` };
}

async function heartbeat() {
  if (!me || disabled || !presenceOn || document.visibilityState !== 'visible') return;
  Storage.setPresence({ [me]: new Date().toISOString() });
  try {
    const { error } = await getSupabase().rpc('touch_presence');
    if (error && (error.code === 'PGRST202' || error.code === '42883')) presenceOn = false;
  } catch { /* offline for a moment: the next beat tries again */ }
}

// Who was around in the last 30 days (older "visto" dates aren't worth showing)
async function fetchPresence(db) {
  if (!presenceOn) return [];
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const { data, error } = await db.from('profiles').select('id, last_seen_at').gte('last_seen_at', since).limit(1000);
  if (error) {
    if (error.code === '42703' || error.code === 'PGRST204') presenceOn = false;
    return [];
  }
  return data || [];
}

/** Shrink a picked image so posts stay light: max 1280px, JPEG. Small GIFs keep their animation. */
export function compressImage(file, maxSide = 1280, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
    reader.onload = () => {
      const dataUrl = reader.result;
      if (file.type === 'image/gif' && file.size < 450000) return resolve(dataUrl);
      const img = new Image();
      img.onerror = () => reject(new Error('Esse arquivo não é uma imagem válida.'));
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

const isAccountId = (id) => /^[0-9a-f-]{36}$/i.test(id || '');

// ─── local ⇄ server shapes ──────────────────────────────────────────────────

function playlistSnapshot(post) {
  const pl = post.playlistId ? Storage.getPlaylistById(post.playlistId) : null;
  if (!pl) return post.playlist || null;
  return {
    id: pl.id, title: pl.title, description: pl.description || '', coverUrl: pl.coverUrl || '', authorId: pl.authorId,
    songs: (pl.songs || []).slice(0, 50).map(s => ({
      id: s.id, title: s.title, artist: s.artist, album: s.album || '', artwork: s.artwork || '', previewUrl: s.previewUrl || '', duration: s.duration || ''
    }))
  };
}

function toBody(post) {
  return {
    text: post.text || '', lyrics: post.lyrics || '', lyricsSong: post.lyricsSong || '', lyricsArt: post.lyricsArt || '',
    tag: post.tag || '', rating: Number(post.rating) || 0, song: post.song || null, imageUrl: post.imageUrl || '',
    playlistId: post.playlistId || null, playlist: playlistSnapshot(post),
    poll: post.poll?.options?.length ? { options: post.poll.options.slice(0, 4) } : null
  };
}

const initialOf = (name) => (name || '?').trim()[0]?.toUpperCase() || '?';

function fromRow(row) {
  const b = row.body || {};
  const comments = (row.post_comments || [])
    .sort((x, y) => new Date(x.created_at) - new Date(y.created_at))
    .map(c => ({
      id: c.id, userId: c.user_id,
      userName: c.author?.name || 'Alguém', userAvatar: c.author?.avatar_url || initialOf(c.author?.name),
      text: c.body?.text || '', song: c.body?.song || null, imageUrl: c.body?.imageUrl || '', gifUrl: c.body?.gifUrl || '',
      likes: (c.comment_likes || []).map(l => l.user_id),
      createdAt: relativeTime(c.created_at), createdAtIso: c.created_at
    }));
  return {
    id: row.id, authorId: row.author_id,
    text: b.text || '', lyrics: b.lyrics || '', lyricsSong: b.lyricsSong || '', lyricsArt: b.lyricsArt || '',
    tag: '', rating: Number(b.rating) || 0, song: b.song || null, imageUrl: b.imageUrl || '',
    playlistId: b.playlistId || null, playlist: b.playlist || null,
    poll: Array.isArray(b.poll?.options) && b.poll.options.length >= 2 ? { options: b.poll.options.slice(0, 4) } : null,
    votes: Object.fromEntries((row.post_votes || []).map(v => [v.user_id, v.option])),
    likes: (row.post_likes || []).map(l => l.user_id),
    reposts: (row.post_reposts || []).map(r => r.user_id),
    bookmarks: [], comments,
    createdAt: relativeTime(row.created_at), createdAtIso: row.created_at,
    ...(row.edited ? { updatedAt: 'editado' } : {})
  };
}

// ─── messages ───────────────────────────────────────────────────────────────

function messageTime(iso) {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  const hm = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  return sameDay ? hm : `${d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })} ${hm}`;
}

function fromMessageRow(r) {
  const b = r.body || {};
  return {
    id: r.id, fromUserId: r.from_id, toUserId: r.to_id,
    text: b.text || '', song: b.song || null, imageUrl: b.imageUrl || '', gifUrl: b.gifUrl || '',
    link: b.link || null, replyTo: b.replyTo || null,
    edited: Boolean(r.edited), createdAt: messageTime(r.created_at), createdAtIso: r.created_at
  };
}

function messageBody(m) {
  const reply = m.replyTo ? {
    id: m.replyTo.id, fromUserId: m.replyTo.fromUserId, text: (m.replyTo.text || '').slice(0, 300),
    song: m.replyTo.song ? { title: m.replyTo.song.title, artist: m.replyTo.song.artist } : null,
    imageUrl: /^https?:/.test(m.replyTo.imageUrl || '') ? m.replyTo.imageUrl : (m.replyTo.imageUrl ? 'imagem' : ''),
    gifUrl: m.replyTo.gifUrl || ''
  } : null;
  return { text: m.text || '', song: m.song || null, imageUrl: m.imageUrl || '', gifUrl: m.gifUrl || '', link: m.link || null, replyTo: reply };
}

// Messages written while the chat was local-only never reached anyone: send them once, in the
// background. The flag is only set when every message was accepted or refused for good (a network
// failure leaves it for the next session), and they stay in the cache while they go up.
let legacyUploading = false;
async function uploadLegacyMessages(db, serverIds) {
  const key = `rmsn_messages_uploaded_${me}`;
  if (legacyUploading || localStorage.getItem(key)) return;
  const mine = Storage.getLocalMessagesFrom(me).filter(m => !serverIds.has(m.id) && isAccountId(m.toUserId) && /^msg_[A-Za-z0-9_]{4,60}$/.test(m.id));
  if (!mine.length) { localStorage.setItem(key, '1'); return; }
  legacyUploading = true;
  mine.forEach(m => pendingMessages.add(m.id));
  let retryLater = false;
  try {
    for (const m of mine) {
      try {
        const imageUrl = await hostImage(m.imageUrl, 'chat');
        await must(db.from('messages').insert({ id: m.id, from_id: me, to_id: m.toUserId, body: messageBody({ ...m, imageUrl }) }));
      } catch (err) {
        // Constraint errors (too big, bad data, duplicate) won't get better: let it go.
        // Anything else may: keep it in the cache and try again next session.
        if (/^(23|42)/.test(err?.code || '')) pendingMessages.delete(m.id);
        else retryLater = true;
      }
    }
  } finally { legacyUploading = false; }
  if (!retryLater) localStorage.setItem(key, '1');
}

const MESSAGE_FIELDS = 'id, from_id, to_id, body, edited, created_at';
const FULL_MESSAGES_EVERY = 15; // polls (~2 min): a full re-read catches edits and deletions
let messagePolls = 0;
let newestMessageAt = null;

export function pullMessages() {
  if (!me || disabled || !messagesOn) return Promise.resolve();
  if (messagesPulling) return messagesPulling;
  messagesPulling = (async () => {
    const db = getSupabase();
    const full = !newestMessageAt || messagePolls % FULL_MESSAGES_EVERY === 0;
    messagePolls++;
    let q = db.from('messages').select(MESSAGE_FIELDS).or(`from_id.eq.${me},to_id.eq.${me}`);
    // In between, only what arrived after the newest message we have
    q = full ? q.order('created_at', { ascending: false }).limit(500) : q.gt('created_at', newestMessageAt).order('created_at', { ascending: false }).limit(200);
    const { data, error } = await q;
    if (error) {
      if (isMissingTable(error)) {
        messagesOn = false;
        handlers.onError?.('O chat ainda não está no banco: rode supabase/007_messages.sql no SQL Editor do Supabase. Até lá as mensagens não chegam.');
      }
      return;
    }
    if (full) uploadLegacyMessages(db, new Set(data.map(r => r.id))); // background
    data.forEach(r => pendingMessages.delete(r.id));
    if (!full && !data.length) return; // nothing new: no rewrite, no re-render

    const incoming = data.reverse().map(fromMessageRow);
    if (data.length) {
      const latest = incoming[incoming.length - 1].createdAtIso;
      if (!newestMessageAt || latest > newestMessageAt) newestMessageAt = latest;
    }
    const all = full ? Storage.replaceMessagesCache(me, incoming, [...pendingMessages]) : Storage.addMessagesToCache(me, incoming);
    Storage.seedChatRead(me, all); // first sync on this browser: history counts as read
    Storage.mergeRemoteNotifications(me, buildMessageNotifications(all), 'messages');

    const signature = all.map(m => `${m.id}:${m.edited ? 1 : 0}:${m.text.length}`).join(',');
    if (signature !== lastMessagesSignature) {
      lastMessagesSignature = signature;
      handlers.onMessages?.();
    }
  })().catch(err => console.warn('Chat sync failed:', err)).finally(() => { messagesPulling = null; });
  return messagesPulling;
}

// One notification per person: the latest message they sent you
function buildMessageNotifications(messages) {
  const latest = new Map();
  messages.forEach(m => {
    if (m.toUserId !== me || !m.createdAtIso) return;
    const prev = latest.get(m.fromUserId);
    if (!prev || m.createdAtIso > prev.createdAtIso) latest.set(m.fromUserId, m);
  });
  return [...latest.values()].map(m => ({
    id: `message:${m.id}`, type: 'message', fromUserId: m.fromUserId, createdAt: m.createdAtIso,
    text: 'te enviou uma mensagem',
    preview: snippet(m.text) || (m.song ? `🎵 ${m.song.title}` : m.imageUrl ? 'Imagem' : m.gifUrl ? 'GIF' : '')
  }));
}

const pollMessages = () => { if (document.visibilityState === 'visible') pullMessages(); };

// ─── notifications ──────────────────────────────────────────────────────────

const snippet = (text, max = 60) => {
  const t = (text || '').replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
};
const postLabel = (b = {}) => snippet(b.text || b.lyrics || (b.song ? `${b.song.title} — ${b.song.artist}` : '') || b.playlist?.title || '');

/** What other people did to you (likes, reposts, comments, follows), straight from the server rows. */
function buildNotifications(rows, follows) {
  const list = [];
  const add = (type, fromUserId, createdAt, text, extra = {}) => {
    if (!fromUserId || fromUserId === me || !createdAt) return;
    list.push({ id: `${type}:${extra.key}:${fromUserId}`, type, fromUserId, text, createdAt, ...extra });
  };
  follows.forEach(f => {
    if (f.following_id === me) add('follow', f.follower_id, f.created_at, 'começou a te seguir', { key: me });
  });
  rows.forEach(row => {
    const preview = postLabel(row.body);
    if (row.author_id === me) {
      (row.post_likes || []).forEach(l => add('like', l.user_id, l.created_at, 'curtiu seu post', { key: row.id, postId: row.id, preview }));
      (row.post_reposts || []).forEach(r => add('repost', r.user_id, r.created_at, 'repostou seu post', { key: row.id, postId: row.id, preview }));
      (row.post_comments || []).forEach(c => add('comment', c.user_id, c.created_at, 'comentou no seu post',
        { key: c.id, postId: row.id, preview: snippet(c.body?.text) || preview }));
    }
    (row.post_comments || []).forEach(c => {
      if (c.user_id !== me) return;
      (c.comment_likes || []).forEach(l => add('comment_like', l.user_id, l.created_at, 'curtiu seu comentário',
        { key: c.id, postId: row.id, preview: snippet(c.body?.text) }));
    });
  });
  return list;
}

// ─── pull ───────────────────────────────────────────────────────────────────

async function must(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

function isMissingTable(err) {
  return err?.code === 'PGRST205' || err?.code === 'PGRST200' || err?.code === '42P01';
}

// Posts written in this browser before the shared feed existed go up once
async function uploadLegacyPosts(db, serverIds) {
  const key = `rmsn_posts_uploaded_${me}`;
  if (localStorage.getItem(key)) return;
  const mine = Storage.getFeedPosts().filter(p => p.authorId === me && !serverIds.has(p.id) && /^post_[A-Za-z0-9_]{4,60}$/.test(p.id));
  for (const post of mine) {
    pending.add(post.id);
    try { await must(db.from('posts').insert({ id: post.id, author_id: me, body: toBody(post) })); }
    catch { /* a single bad post shouldn't block the rest */ }
    finally { pending.delete(post.id); }
  }
  localStorage.setItem(key, '1');
}

// Profiles come in full once, then only the ones changed since (updated_at); a full re-read every
// ~10 pulls catches anything missed. Each profile's last version is remembered to tell real changes.
const FULL_PROFILES_EVERY = 10;
let profilePulls = 0;
let profilesSince = null;
const profileVersions = new Map(); // id → hash of the shared fields
let profilesVersion = 0;
let legacyProfileChecked = false;

function trackProfiles(rows) {
  let changed = false;
  rows.forEach(p => {
    const hash = JSON.stringify([p.name, p.handle, p.avatar_url, p.banner_url, p.bio, p.status, p.extras]);
    if (profileVersions.get(p.id) !== hash) { profileVersions.set(p.id, hash); changed = true; }
    if (p.updated_at && (!profilesSince || p.updated_at > profilesSince)) profilesSince = p.updated_at;
  });
  if (changed) profilesVersion++;
  return changed;
}

// Posts, comments and messages saved before images went to Storage still carry base64 pictures
// (hundreds of KB each, re-downloaded by everyone on every pull). Each author moves their own to
// Storage in the background, a few per session, and the rows get a short link instead.
let legacyImagesStarted = false;
const LEGACY_IMAGES_PER_SESSION = 25;
const isInlineImage = (u) => typeof u === 'string' && u.startsWith('data:image/');

async function migrateLegacyImages(db, rows) {
  if (legacyImagesStarted) return;
  legacyImagesStarted = true;
  const jobs = [];
  rows.forEach(r => {
    if (r.author_id === me && isInlineImage(r.body?.imageUrl)) jobs.push({ kind: 'post', row: r });
    (r.post_comments || []).forEach(c => { if (c.user_id === me && isInlineImage(c.body?.imageUrl)) jobs.push({ kind: 'comment', row: c }); });
  });
  Storage.getLocalMessagesFrom(me).forEach(m => { if (isInlineImage(m.imageUrl) && !pendingMessages.has(m.id)) jobs.push({ kind: 'message', row: m }); });

  for (const job of jobs.slice(0, LEGACY_IMAGES_PER_SESSION)) {
    try {
      if (job.kind === 'message') {
        const m = job.row;
        const imageUrl = await uploadPhoto(m.imageUrl, 'chat');
        await must(db.from('messages').update({ body: messageBody({ ...m, imageUrl }) }).eq('id', m.id));
        Storage.patchMessageCache(m.id, { imageUrl });
      } else {
        const { row } = job;
        const imageUrl = await uploadPhoto(row.body.imageUrl, job.kind);
        const table = job.kind === 'post' ? 'posts' : 'post_comments';
        await must(db.from(table).update({ body: { ...row.body, imageUrl } }).eq('id', row.id));
        if (job.kind === 'post') Storage.patchPostCache(row.id, { imageUrl });
      }
    } catch (err) {
      // No permission yet (comments need supabase/009_performance.sql) or offline: try next session
      if (err?.code === '42501' || /row-level/i.test(err?.message || '')) continue;
    }
  }
}

export function pullNow() {
  if (!me || disabled) return Promise.resolve();
  if (pulling) return pulling;
  pulling = (async () => {
    const db = getSupabase();
    if (!legacyProfileChecked) { legacyProfileChecked = true; await uploadLegacyProfile(db); }
    const fullProfiles = !profilesSince || profilePulls % FULL_PROFILES_EVERY === 0;
    profilePulls++;
    const [rows, follows, profiles, presence] = await Promise.all([
      fetchPosts(db, q => q.order('created_at', { ascending: false }).limit(150)),
      must(db.from('follows').select('follower_id, following_id, created_at').limit(5000)),
      fetchProfiles(db, q => (fullProfiles ? q : q.gt('updated_at', profilesSince)).eq('banned', false).limit(1000)),
      fetchPresence(db).catch(() => [])
    ]);

    await uploadLegacyPosts(db, new Set(rows.map(r => r.id)));
    rows.forEach(r => pending.delete(r.id));
    migrateLegacyImages(db, rows).catch(() => {}); // background
    const profilesChanged = trackProfiles(profiles);

    const posts = rows.map(fromRow);
    const overlay = (list, on) => { const rest = list.filter(id => id !== me); return on ? [...rest, me] : rest; };
    posts.forEach(p => {
      if (pendingLikes.has(p.id)) p.likes = overlay(p.likes, pendingLikes.get(p.id));
      if (pendingReposts.has(p.id)) p.reposts = overlay(p.reposts, pendingReposts.get(p.id));
    });
    const others = presence.filter(p => p.id !== me);

    // Same data as last time (the usual case): nothing to write, nothing to redraw
    const signature = JSON.stringify([
      posts.map(p => [p.id, p.likes, p.reposts, p.updatedAt || '', p.votes,
        p.comments.map(c => `${c.id}:${c.likes.length}`).join(','), p.text.length, p.imageUrl.length]),
      follows.map(f => `${f.follower_id}>${f.following_id}`).sort().join(','),
      others.map(p => [p.id, presenceOf({ lastSeenAt: p.last_seen_at }).online]),
      profilesVersion, [...pending]
    ]);
    if (signature === lastSignature) { pullFailures = 0; return; }
    lastSignature = signature;

    if (profilesChanged) Storage.mergeRemoteProfiles(profiles, { skipId: profileDirty ? me : null });
    Storage.setPresence(Object.fromEntries(others.map(p => [p.id, p.last_seen_at])));
    const graph = {};
    follows.forEach(f => { (graph[f.follower_id] ||= []).push(f.following_id); });
    pendingFollows.forEach((on, target) => {
      const list = (graph[me] ||= []).filter(id => id !== target);
      graph[me] = on ? [...list, target] : list;
    });
    Storage.replaceFollows(graph);
    Storage.replacePostsCache(posts, [...pending]);
    Storage.mergeRemoteNotifications(me, buildNotifications(rows, follows), 'feed');
    handlers.onUpdate?.();
    pullFailures = 0;
  })().catch(err => {
    if (isMissingTable(err)) {
      disabled = true;
      handlers.onError?.('O feed compartilhado ainda não foi criado no banco: rode supabase/002_posts.sql no SQL Editor do Supabase.');
      return;
    }
    // Network blips: the next poll tries again. Anything that keeps failing gets reported (once)
    // instead of silently freezing the feed and the notifications.
    console.warn('Feed sync failed:', err);
    pullFailures++;
    if (pullFailures === 3 && !warnedPullFailure) {
      warnedPullFailure = true;
      handlers.onError?.(/jwt|token|401/i.test(`${err?.message || ''} ${err?.code || ''}`)
        ? 'Sua sessão expirou: saia e entre de novo para o feed voltar a atualizar.'
        : 'Não estamos conseguindo atualizar o feed. Verifique sua conexão; tentamos de novo sozinhos.');
    }
  }).finally(() => { pulling = null; });
  return pulling;
}

// Posts with likes, reposts, comments and, once 004/005 are run, poll votes and comment likes
async function fetchPosts(db, refine) {
  for (;;) {
    const select = `id, author_id, body, edited, created_at,
      post_likes(user_id, created_at), post_reposts(user_id, created_at),
      post_comments(id, user_id, body, created_at, author:profiles(${PROFILE_FIELDS})${commentLikesTable ? ', comment_likes(user_id, created_at)' : ''})
      ${votesTable ? ', post_votes(user_id, option)' : ''}`;
    try { return await must(refine(db.from('posts').select(select))); }
    catch (err) {
      const text = `${err?.message || ''} ${err?.details || ''} ${err?.hint || ''}`;
      if (err?.code !== 'PGRST200') throw err;
      if (votesTable && /post_votes/.test(text)) {
        votesTable = false;
        handlers.onError?.('A votação de músicas ainda não está no banco: rode supabase/004_polls.sql no SQL Editor do Supabase.');
      } else if (commentLikesTable && /comment_likes/.test(text)) {
        commentLikesTable = false;
        handlers.onError?.('Curtir comentários ainda não está no banco: rode supabase/005_comment_likes.sql no SQL Editor do Supabase.');
      } else throw err;
    }
  }
}

// ─── profile ────────────────────────────────────────────────────────────────

const isMissingColumn = (err) => err?.code === '42703' || err?.code === 'PGRST204';

/** Profiles with every shared field; falls back to the basic columns until 003 is run. */
async function fetchProfiles(db, refine) {
  if (profileColumns) {
    try { return await must(refine(db.from('profiles').select(FULL_PROFILE_FIELDS))); }
    catch (err) {
      if (!isMissingColumn(err)) throw err;
      profileColumns = false;
      if (!warnedProfileSql) {
        warnedProfileSql = true;
        handlers.onError?.('Fotos e dados do perfil ainda não são compartilhados: rode supabase/003_profiles_media.sql no SQL Editor do Supabase.');
      }
    }
  }
  return must(refine(db.from('profiles').select(PROFILE_FIELDS)));
}

const isOurUpload = (url) => typeof url === 'string' && url.includes(`/storage/v1/object/public/media/${me}/`);

/** Send a picked photo (data: URL) to the media bucket and return its public URL. */
async function uploadPhoto(dataUrl, kind) {
  const blob = await (await fetch(dataUrl)).blob();
  const ext = { 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp' }[blob.type] || 'jpg';
  const path = `${me}/${kind}-${Date.now()}.${ext}`;
  const bucket = getSupabase().storage.from('media');
  const { error } = await bucket.upload(path, blob, { contentType: blob.type || 'image/jpeg', cacheControl: '31536000', upsert: false });
  if (error) throw error;
  return bucket.getPublicUrl(path).data.publicUrl;
}

async function removeOldUpload(url) {
  if (!isOurUpload(url)) return;
  const path = url.split('/storage/v1/object/public/media/')[1];
  try { await getSupabase().storage.from('media').remove([decodeURIComponent(path)]); } catch { /* leftovers are harmless */ }
}

/**
 * Pictures attached to posts, comments and messages go to the media bucket as files, so rows
 * (and every poll and the local cache) carry a short https link instead of a base64 image.
 * Falls back to the inline image if the upload fails.
 */
async function hostImage(url, kind) {
  if (!/^data:image\//.test(url || '')) return url || '';
  try { return await uploadPhoto(url, kind); }
  catch { return url; }
}

let serverPhotos = { avatar: null, banner: null }; // what the server had, to clean up replaced files

async function pushProfile() {
  profileTimer = null;
  if (!me || disabled || !profileColumns) { profileDirty = false; return; }
  const user = Storage.getUserById(me);
  if (!user) { profileDirty = false; return; }
  try {
    let avatar = user.avatar || '';
    let banner = user.bannerUrl || '';
    if (/^data:image\//.test(avatar)) avatar = await uploadPhoto(avatar, 'avatar');
    if (/^data:image\//.test(banner)) banner = await uploadPhoto(banner, 'banner');
    // Keep the light URL locally instead of the heavy data: URL
    if (avatar !== (user.avatar || '') || banner !== (user.bannerUrl || '')) {
      Storage.updateUser(me, { avatar, bannerUrl: banner }, { silent: true });
    }

    const extras = {};
    Storage.PROFILE_EXTRA_KEYS.forEach(k => { if (user[k] !== undefined && user[k] !== null) extras[k] = user[k]; });
    const https = (u) => (/^https:\/\//.test(u) ? u.slice(0, 1000) : null);
    const row = {
      name: (user.name || '').trim().slice(0, 60) || 'Sem nome',
      avatar_url: https(avatar),
      banner_url: https(banner),
      bio: (user.bio || '').slice(0, 500) || null,
      status: (user.status || '').slice(0, 80) || null,
      extras
    };
    if (/^@[a-z0-9_.]{2,24}$/.test(user.handle || '')) row.handle = user.handle;
    await must(getSupabase().from('profiles').update(row).eq('id', me));

    if (serverPhotos.avatar && serverPhotos.avatar !== row.avatar_url) removeOldUpload(serverPhotos.avatar);
    if (serverPhotos.banner && serverPhotos.banner !== row.banner_url) removeOldUpload(serverPhotos.banner);
    serverPhotos = { avatar: row.avatar_url, banner: row.banner_url };
    handlers.onProfileSaved?.();
  } catch (err) {
    handlers.onError?.(err?.code === '23505'
      ? 'Esse @ já está em uso. Escolha outro no editar perfil.'
      : 'Não foi possível salvar seu perfil no servidor. Tente de novo.');
  } finally {
    profileDirty = Boolean(profileTimer); // another change may have arrived meanwhile
  }
}

function scheduleProfilePush() {
  if (!me || disabled) return;
  profileDirty = true;
  clearTimeout(profileTimer);
  profileTimer = setTimeout(pushProfile, 700);
}

// First sync on this account: send what this browser already had (photo, bio, Last.fm...)
// only when the server profile is still empty, so a new device never wipes real data
async function uploadLegacyProfile(db) {
  if (!profileColumns) return;
  const key = `rmsn_profile_uploaded_${me}`;
  let mine;
  try { [mine] = await fetchProfiles(db, q => q.eq('id', me).limit(1)); }
  catch { return; }
  if (!mine || !profileColumns) return;
  serverPhotos = { avatar: mine.avatar_url || null, banner: mine.banner_url || null };
  if (localStorage.getItem(key)) return;
  const serverEmpty = !mine.avatar_url && !mine.banner_url && !mine.bio && !mine.status && !Object.keys(mine.extras || {}).length;
  const local = Storage.getUserById(me) || {};
  const localHasData = /^(data:image|https:)/.test(local.avatar || '') || local.bannerUrl || local.bio || local.status
    || (local.topArtistsMonth || []).length || local.featuredSong || (local.songShowcase || []).length || local.lastfm;
  if (serverEmpty && localHasData) {
    profileDirty = true;
    await pushProfile();
  }
  localStorage.setItem(key, '1');
}

// ─── search ─────────────────────────────────────────────────────────────────

// PostgREST filter strings treat , ( ) as syntax and * % as wildcards: keep only what the person meant to search
const cleanTerm = (q) => q.replace(/[,()*%\\:"']/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);

export const isSyncing = () => Boolean(me) && !disabled;

/** People whose name or @handle contains the term. */
export async function searchPeople(q, limit = 30) {
  const term = cleanTerm(q.replace(/^@/, ''));
  if (!isSyncing() || term.length < 1) return null;
  const rows = await fetchProfiles(getSupabase(), q => q.eq('banned', false)
    .or(`name.ilike.*${term}*,handle.ilike.*${term}*`)
    .limit(limit));
  Storage.mergeRemoteProfiles(rows, { skipId: profileDirty ? me : null });
  return rows.map(r => r.id);
}

/** Posts whose text, lyric, song, artist or #tag contains the term; results also land in the cache. */
export async function searchPosts(q, limit = 40) {
  const term = cleanTerm(q);
  if (!isSyncing() || term.length < 2) return null;
  const fields = ['body->>text', 'body->>lyrics', 'body->>lyricsSong', 'body->>tag', 'body->song->>title', 'body->song->>artist', 'body->playlist->>title'];
  const rows = await fetchPosts(getSupabase(), q => q
    .or(fields.map(f => `${f}.ilike.*${term}*`).join(','))
    .order('created_at', { ascending: false })
    .limit(limit));
  const posts = rows.map(fromRow);
  Storage.upsertPostsCache(posts);
  return posts;
}

// ─── push ───────────────────────────────────────────────────────────────────

function write(task, failMessage) {
  if (!me || disabled) return;
  task(getSupabase()).catch(err => {
    handlers.onError?.(err?.code === '42501' ? 'Sua conta não pode publicar no momento.' : failMessage);
    pullNow(); // put the cache back in line with the server
  });
}


// A write whose optimistic state stays on screen until the server has it, then a quick re-pull
function tracked(map, key, on, task, failMessage) {
  map.set(key, on);
  write(async db => {
    try { await task(db); }
    finally {
      if (map.get(key) === on) map.delete(key);
      clearTimeout(pullSoonTimer);
      // A pull already running may have read the server before this write: chain a fresh one
      pullSoonTimer = setTimeout(() => (pulling ? pulling.then(pullNow) : pullNow()), 1200);
    }
  }, failMessage);
}

const hooks = {
  vote(postId, option) {
    if (!votesTable) return;
    write(db => must(option === null
      ? db.from('post_votes').delete().eq('post_id', postId).eq('user_id', me)
      : db.from('post_votes').upsert({ post_id: postId, user_id: me, option }, { onConflict: 'post_id,user_id' })),
      'Não foi possível registrar seu voto.');
  },
  profileChanged() {
    scheduleProfilePush();
  },
  createPost(post) {
    pending.add(post.id);
    write(async db => {
      try {
        const imageUrl = await hostImage(post.imageUrl, 'post');
        if (imageUrl !== post.imageUrl) Storage.patchPostCache(post.id, { imageUrl });
        await must(db.from('posts').insert({ id: post.id, author_id: me, body: toBody({ ...post, imageUrl }) }));
      } catch (err) { pending.delete(post.id); throw err; }
      // stays pending until a pull sees it, so a pull that read the server just before can't drop it
    }, 'Não foi possível publicar o post. Verifique sua conexão.');
  },
  updatePost(post) {
    write(async db => {
      const imageUrl = await hostImage(post.imageUrl, 'post');
      if (imageUrl !== post.imageUrl) Storage.patchPostCache(post.id, { imageUrl });
      await must(db.from('posts').update({ body: toBody({ ...post, imageUrl }), edited: true }).eq('id', post.id));
    }, 'Não foi possível salvar a edição.');
  },
  deletePost(postId) {
    write(db => must(db.from('posts').delete().eq('id', postId)), 'Não foi possível apagar o post.');
  },
  like(postId, on) {
    tracked(pendingLikes, postId, on, db => must(on
      ? db.from('post_likes').upsert({ post_id: postId, user_id: me }, { onConflict: 'post_id,user_id', ignoreDuplicates: true })
      : db.from('post_likes').delete().eq('post_id', postId).eq('user_id', me)), 'Não foi possível salvar a curtida.');
  },
  repost(postId, on) {
    tracked(pendingReposts, postId, on, db => must(on
      ? db.from('post_reposts').upsert({ post_id: postId, user_id: me }, { onConflict: 'post_id,user_id', ignoreDuplicates: true })
      : db.from('post_reposts').delete().eq('post_id', postId).eq('user_id', me)), 'Não foi possível salvar o repost.');
  },
  addComment(postId, c) {
    write(async db => {
      const imageUrl = await hostImage(c.imageUrl || '', 'comment');
      const body = { text: c.text || '', song: c.song || null, imageUrl, gifUrl: c.gifUrl || '' };
      await must(db.from('post_comments').insert({ id: c.id, post_id: postId, user_id: me, body }));
    }, 'Não foi possível enviar o comentário.');
  },
  likeComment(commentId, on) {
    if (!commentLikesTable) return;
    write(db => must(on
      ? db.from('comment_likes').upsert({ comment_id: commentId, user_id: me }, { onConflict: 'comment_id,user_id', ignoreDuplicates: true })
      : db.from('comment_likes').delete().eq('comment_id', commentId).eq('user_id', me)), 'Não foi possível salvar a curtida.');
  },
  sendMessage(m) {
    if (!messagesOn || !isAccountId(m.toUserId)) return;
    pendingMessages.add(m.id);
    write(async db => {
      try {
        const imageUrl = await hostImage(m.imageUrl, 'chat');
        if (imageUrl !== m.imageUrl) Storage.patchMessageCache(m.id, { imageUrl });
        await must(db.from('messages').insert({ id: m.id, from_id: me, to_id: m.toUserId, body: messageBody({ ...m, imageUrl }) }));
      } catch (err) { pendingMessages.delete(m.id); throw err; }
      // stays pending until pullMessages sees it on the server
    }, 'Não foi possível enviar a mensagem. Verifique sua conexão.');
  },
  editMessage(m) {
    if (!messagesOn) return;
    write(db => must(db.from('messages').update({ body: messageBody(m), edited: true }).eq('id', m.id)), 'Não foi possível editar a mensagem.');
  },
  deleteMessage(id) {
    if (!messagesOn) return;
    write(db => must(db.from('messages').delete().eq('id', id)), 'Não foi possível apagar a mensagem.');
  },
  deleteComment(commentId) {
    write(db => must(db.from('post_comments').delete().eq('id', commentId)), 'Não foi possível apagar o comentário.');
  },
  follow(targetId, on) {
    if (!isAccountId(targetId)) return;
    tracked(pendingFollows, targetId, on, db => must(on
      ? db.from('follows').upsert({ follower_id: me, following_id: targetId }, { onConflict: 'follower_id,following_id', ignoreDuplicates: true })
      : db.from('follows').delete().eq('follower_id', me).eq('following_id', targetId)), 'Não foi possível atualizar quem você segue.');
  }
};

const onVisible = () => { if (document.visibilityState === 'visible') { heartbeat(); pullNow(); pullMessages(); } };

/**
 * Start mirroring the feed for a signed-in account.
 * @param {string} userId Supabase user id
 * @param {{ onUpdate?: () => void, onError?: (message: string) => void }} opts
 */
export function startSync(userId, opts = {}) {
  stopSync();
  me = userId;
  handlers = opts;
  disabled = false;
  profileColumns = true;
  warnedProfileSql = false;
  votesTable = true;
  commentLikesTable = true;
  presenceOn = true;
  messagesOn = true;
  lastSignature = '';
  lastMessagesSignature = '';
  profilesSince = null;
  profilePulls = 0;
  profileVersions.clear();
  legacyProfileChecked = false;
  legacyImagesStarted = false;
  newestMessageAt = null;
  messagePolls = 1; // the first pull is full anyway (nothing cached yet)
  pullFailures = 0;
  warnedPullFailure = false;
  Storage.setRemoteHooks(hooks);
  timer = setInterval(() => { if (document.visibilityState === 'visible') pullNow(); }, POLL_MS);
  presenceTimer = setInterval(heartbeat, PRESENCE_MS);
  heartbeat();
  messagesTimer = setInterval(pollMessages, MESSAGES_POLL_MS);
  pullMessages();
  document.addEventListener('visibilitychange', onVisible);
  return pullNow();
}

export function stopSync() {
  Storage.setRemoteHooks(null);
  clearTimeout(profileTimer);
  profileTimer = null;
  profileDirty = false;
  clearInterval(timer);
  timer = null;
  clearInterval(presenceTimer);
  presenceTimer = null;
  clearInterval(messagesTimer);
  messagesTimer = null;
  clearTimeout(pullSoonTimer);
  pendingFollows.clear();
  pendingLikes.clear();
  pendingReposts.clear();
  document.removeEventListener('visibilitychange', onVisible);
  me = null;
}
