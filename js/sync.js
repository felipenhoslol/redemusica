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
    images: (post.images || []).filter(u => /^https:\/\//.test(u)).slice(0, 4),
    mentions: (post.mentions || []).filter(isAccountId).slice(0, 20),
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
      parentId: c.body?.parentId || null,
      likes: (c.comment_likes || []).map(l => l.user_id),
      ...(c.body?.imageInline ? { imageLazy: true } : {}),
      createdAt: relativeTime(c.created_at), createdAtIso: c.created_at
    }));
  return {
    id: row.id, authorId: row.author_id,
    text: b.text || '', lyrics: b.lyrics || '', lyricsSong: b.lyricsSong || '', lyricsArt: b.lyricsArt || '',
    tag: '', rating: Number(b.rating) || 0, song: b.song || null, imageUrl: b.imageUrl || '',
    images: Array.isArray(b.images) ? b.images.filter(u => typeof u === 'string' && /^https:\/\//.test(u)).slice(0, 4) : [],
    mentions: Array.isArray(b.mentions) ? b.mentions.filter(isAccountId) : [],
    ...(b.imageInline ? { imageLazy: true } : {}),
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
    edited: Boolean(r.edited), createdAt: messageTime(r.created_at), createdAtIso: r.created_at, synced: true,
    readAt: r.read_at || null
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

// Messages outbox: anything you sent that the server never got (sent before the chat had a table,
// or an insert that failed) is sent again on each full read, in the background. Messages that came
// from the server carry synced: true and are never re-sent, so deletions stay deleted.
let messageOutboxRunning = false;
function flushMessageOutbox(db, serverIds) {
  if (messageOutboxRunning) return;
  const out = Storage.getLocalMessagesFrom(me).filter(m => !m.synced && !serverIds.has(m.id) && !pendingMessages.has(m.id)
    && isAccountId(m.toUserId) && /^msg_[A-Za-z0-9_]{4,60}$/.test(m.id)).slice(0, OUTBOX_BATCH);
  if (!out.length) return;
  out.forEach(m => pendingMessages.add(m.id));
  messageOutboxRunning = true;
  (async () => {
    for (const m of out) {
      try {
        const imageUrl = await hostImage(m.imageUrl, 'chat');
        await must(db.from('messages').insert({ id: m.id, from_id: me, to_id: m.toUserId, body: messageBody({ ...m, imageUrl }) }));
      } catch (err) {
        pendingMessages.delete(m.id);
        if (!alreadyThere(err)) console.warn('Mensagem não reenviada:', m.id, err?.code, err?.message);
      }
    }
  })().finally(() => { messageOutboxRunning = false; setTimeout(pullMessages, 1000); });
}

let readReceiptsOn = true; // false until supabase/011_chat_read.sql has been run
const messageFields = () => `id, from_id, to_id, body, edited, created_at${readReceiptsOn ? ', read_at' : ''}`;
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
    let q = db.from('messages').select(messageFields()).or(`from_id.eq.${me},to_id.eq.${me}`);
    // In between, only what arrived after the newest message we have
    q = full ? q.order('created_at', { ascending: false }).limit(500) : q.gt('created_at', newestMessageAt).order('created_at', { ascending: false }).limit(200);
    const { data, error } = await q;
    if (error && readReceiptsOn && isMissingColumn(error)) { readReceiptsOn = false; return; } // retried next poll without read_at
    if (error) {
      if (isMissingTable(error)) {
        messagesOn = false;
        handlers.onError?.('O chat ainda não está no banco: rode supabase/007_messages.sql no SQL Editor do Supabase. Até lá as mensagens não chegam.');
      }
      return;
    }
    data.forEach(r => pendingMessages.delete(r.id));
    if (full) flushMessageOutbox(db, new Set(data.map(r => r.id))); // background
    // "Visto": read marks on your latest sent messages (an incremental read only brings new rows)
    let readChanged = false;
    if (!full && readReceiptsOn) {
      const { data: reads } = await db.from('messages').select('id, read_at').eq('from_id', me)
        .not('read_at', 'is', null).order('created_at', { ascending: false }).limit(30);
      readChanged = Storage.applyMessageReads(Object.fromEntries((reads || []).map(r => [r.id, r.read_at])));
    }
    if (!full && !data.length) { if (readChanged) handlers.onMessages?.(); return; } // nothing new: no rewrite

    const incoming = data.reverse().map(fromMessageRow);
    if (data.length) {
      const latest = incoming[incoming.length - 1].createdAtIso;
      if (!newestMessageAt || latest > newestMessageAt) newestMessageAt = latest;
    }
    const all = full ? Storage.replaceMessagesCache(me, incoming, [...pendingMessages]) : Storage.addMessagesToCache(me, incoming);
    Storage.seedChatRead(me, all); // first sync on this browser: history counts as read
    Storage.mergeRemoteNotifications(me, buildMessageNotifications(all), 'messages');

    const signature = all.map(m => `${m.id}:${m.edited ? 1 : 0}:${m.text.length}:${m.readAt ? 1 : 0}`).join(',');
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
    preview: snippet(m.text) || (m.song ? `Música: ${m.song.title}` : m.imageUrl ? 'Imagem' : m.gifUrl ? 'GIF' : '')
  }));
}

// ─── live channel for the open conversation: typing, read and "new message" pings ───
// Supabase Realtime broadcast (nothing stored): the channel name is the pair of ids, so both
// sides of a conversation meet there. Without Realtime the chat still works by polling.
let liveChannel = null;
let liveContact = null;
let lastTypingSent = 0;
const pairName = (a, b) => `dm:${[a, b].sort().join(':')}`;

export function openChatChannel(contactId) {
  if (!me || disabled || !isAccountId(contactId) || liveContact === contactId) return;
  closeChatChannel();
  liveContact = contactId;
  try {
    liveChannel = getSupabase().channel(pairName(me, contactId), { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'typing' }, ({ payload }) => { if (payload?.from === contactId) handlers.onTyping?.(contactId); })
      .on('broadcast', { event: 'read' }, ({ payload }) => { if (payload?.from === contactId) { Storage.markSentRead(contactId); handlers.onMessages?.(); } })
      .on('broadcast', { event: 'message' }, ({ payload }) => { if (payload?.from === contactId) pullMessages(); })
      .subscribe();
  } catch { liveChannel = null; }
}

export function closeChatChannel() {
  if (liveChannel) { try { getSupabase().removeChannel(liveChannel); } catch { /* already gone */ } }
  liveChannel = null;
  liveContact = null;
}

const ping = (event) => { try { liveChannel?.send({ type: 'broadcast', event, payload: { from: me } }); } catch { /* best effort */ } };

/** You are typing in the open conversation (sent at most every 2.5 s). */
export function sendTyping() {
  if (!liveChannel || Date.now() - lastTypingSent < 2500) return;
  lastTypingSent = Date.now();
  ping('typing');
}

/** Mark what this person sent you as read (server + a live ping so they see "Visto" right away). */
export async function markConversationRead(contactId) {
  if (!me || disabled || !readReceiptsOn || !isAccountId(contactId)) return;
  if (!Storage.hasUnreadFrom(me, contactId)) return;
  Storage.markReceivedRead(contactId);
  try {
    const { error } = await getSupabase().rpc('mark_messages_read', { p_from: contactId });
    if (error && (error.code === 'PGRST202' || error.code === '42883')) { readReceiptsOn = false; return; }
    if (liveContact === contactId) ping('read');
  } catch { /* next time */ }
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
    if (row.author_id !== me && Array.isArray(row.body?.mentions) && row.body.mentions.includes(me)) {
      add('mention', row.author_id, row.created_at, 'te marcou em um post', { key: row.id, postId: row.id, preview });
    }
    const commentAuthor = new Map((row.post_comments || []).map(c => [c.id, c.user_id]));
    const repliesToMe = (c) => !!c.body?.parentId && commentAuthor.get(c.body.parentId) === me;
    if (row.author_id === me) {
      (row.post_likes || []).forEach(l => add('like', l.user_id, l.created_at, 'curtiu seu post', { key: row.id, postId: row.id, preview }));
      (row.post_reposts || []).forEach(r => add('repost', r.user_id, r.created_at, 'repostou seu post', { key: row.id, postId: row.id, preview }));
      (row.post_comments || []).forEach(c => repliesToMe(c) || add('comment', c.user_id, c.created_at, 'comentou no seu post',
        { key: c.id, postId: row.id, commentId: c.id, preview: snippet(c.body?.text) || preview }));
    }
    (row.post_comments || []).forEach(c => {
      if (repliesToMe(c)) add('reply', c.user_id, c.created_at, 'respondeu seu comentário',
        { key: c.id, postId: row.id, commentId: c.id, preview: snippet(c.body?.text) || preview });
      if (c.user_id !== me) return;
      (c.comment_likes || []).forEach(l => add('comment_like', l.user_id, l.created_at, 'curtiu seu comentário',
        { key: c.id, postId: row.id, commentId: c.id, preview: snippet(c.body?.text) }));
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

/** What a comment saves in post_comments.body (parentId: the comment it answers, if any). */
function commentBody(c, imageUrl) {
  return { text: c.text || '', song: c.song || null, imageUrl, gifUrl: c.gifUrl || '', ...(c.parentId ? { parentId: c.parentId } : {}) };
}

// Posts written in this browser before the shared feed existed go up once
// ─── outbox: what this person wrote that the server never got ───────────────
// A post or comment whose insert failed (offline, or the feed timing out) used to live only in its
// author's browser, and the next successful pull dropped it from the cache. Now every pull looks for
// them and sends them again. "Never on the server" = written here (no server timestamp, createdAtIso)
// and not among the server's rows; things the server had and then deleted are never resurrected.
const pendingComments = new Set(); // comment ids written here that no pull has seen yet
const OUTBOX_BATCH = 30;
let outboxRunning = false;
const alreadyThere = (err) => err?.code === '23505'; // duplicate key: it was on the server after all

function findPostOutbox(rows) {
  const serverPosts = new Map(rows.map(r => [r.id, r]));
  const posts = Storage.getFeedPosts('all');
  // (ids already pending are on their way up right now)
  const outPosts = posts.filter(p => p.authorId === me && !p.createdAtIso && !serverPosts.has(p.id) && !pending.has(p.id) && /^post_[A-Za-z0-9_]{4,60}$/.test(p.id));
  const outComments = [];
  posts.forEach(p => {
    const server = serverPosts.get(p.id);
    if (!server && !outPosts.includes(p)) return; // post gone from the server (or outside the window)
    const known = new Set((server?.post_comments || []).map(c => c.id));
    (p.comments || []).forEach(c => {
      if (c.userId === me && !c.createdAtIso && !known.has(c.id) && !pendingComments.has(c.id) && /^c_[A-Za-z0-9_]{4,60}$/.test(c.id)) outComments.push({ postId: p.id, comment: c });
    });
  });
  return { outPosts: outPosts.slice(0, OUTBOX_BATCH), outComments: outComments.slice(0, OUTBOX_BATCH) };
}

/** Marks the outbox as pending right away (so the cache keeps it) and sends it in the background. */
function flushPostOutbox(db, rows) {
  if (outboxRunning) return;
  const { outPosts, outComments } = findPostOutbox(rows);
  if (!outPosts.length && !outComments.length) return;
  outPosts.forEach(p => pending.add(p.id));
  outComments.forEach(({ comment }) => pendingComments.add(comment.id));
  outboxRunning = true;
  (async () => {
    for (const post of outPosts) {
      try {
        const images = await hostImages(post.images);
        const imageUrl = images[0] || await hostImage(post.imageUrl, 'post');
        await must(db.from('posts').insert({ id: post.id, author_id: me, body: toBody({ ...post, imageUrl, images }) }));
      } catch (err) {
        pending.delete(post.id); // already there (older than the feed window) or failed: next pull decides again
        if (!alreadyThere(err)) console.warn('Post não reenviado:', post.id, err?.code, err?.message);
      }
    }
    for (const { postId, comment: c } of outComments) {
      try {
        const imageUrl = await hostImage(c.imageUrl || '', 'comment');
        await must(db.from('post_comments').insert({ id: c.id, post_id: postId, user_id: me, body: commentBody(c, imageUrl) }));
      } catch (err) {
        pendingComments.delete(c.id);
        if (!alreadyThere(err)) console.warn('Comentário não reenviado:', c.id, err?.code, err?.message);
      }
    }
  })().finally(() => {
    outboxRunning = false;
    clearTimeout(pullSoonTimer);
    pullSoonTimer = setTimeout(() => (pulling ? pulling.then(pullNow) : pullNow()), 1500);
  });
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

async function migrateLegacyImages(db) {
  if (legacyImagesStarted) return;
  legacyImagesStarted = true;
  // Only this person's own heavy rows: first just their ids, then each body alone (the feed itself
  // never downloads them, and fetching them all at once could be several MB)
  const [posts, comments] = await Promise.all([
    db.from('posts').select('id').eq('author_id', me).like('body->>imageUrl', 'data:image/%').limit(LEGACY_IMAGES_PER_SESSION),
    db.from('post_comments').select('id').eq('user_id', me).like('body->>imageUrl', 'data:image/%').limit(LEGACY_IMAGES_PER_SESSION)
  ]);
  const jobs = [
    ...(posts.data || []).map(r => ({ kind: 'post', id: r.id })),
    ...(comments.data || []).map(r => ({ kind: 'comment', id: r.id }))
  ];
  Storage.getLocalMessagesFrom(me).forEach(m => { if (isInlineImage(m.imageUrl) && !pendingMessages.has(m.id)) jobs.push({ kind: 'message', row: m }); });

  for (const job of jobs.slice(0, LEGACY_IMAGES_PER_SESSION)) {
    try {
      if (job.kind === 'message') {
        const m = job.row;
        const imageUrl = await uploadPhoto(m.imageUrl, 'chat');
        await must(db.from('messages').update({ body: messageBody({ ...m, imageUrl }) }).eq('id', m.id));
        Storage.patchMessageCache(m.id, { imageUrl });
      } else {
        const table = job.kind === 'post' ? 'posts' : 'post_comments';
        const row = await must(db.from(table).select('id, body').eq('id', job.id).maybeSingle());
        if (!row || !isInlineImage(row.body?.imageUrl)) continue;
        const imageUrl = await uploadPhoto(row.body.imageUrl, job.kind);
        await must(db.from(table).update({ body: { ...row.body, imageUrl } }).eq('id', row.id));
        if (job.kind === 'post') Storage.patchPostCache(row.id, { imageUrl, imageLazy: false });
      }
    } catch (err) {
      // No permission yet (comments need supabase/009_performance.sql) or offline: try next session
      if (err?.code === '42501' || /row-level/i.test(err?.message || '')) continue;
    }
  }
}

// Profile ids of the admins (gear badge). Without supabase/010 the function doesn't exist: keep what we had
let adminIdsOn = true;
async function refreshAdminIds(db) {
  if (!adminIdsOn) return;
  try {
    const { data, error } = await db.rpc('admin_profile_ids');
    if (error) { if (error.code === 'PGRST202' || error.code === '42883') adminIdsOn = false; return; }
    const ids = (data || []).map(r => (typeof r === 'string' ? r : r?.admin_profile_ids || Object.values(r || {})[0])).filter(isAccountId);
    const before = JSON.stringify([...ids].sort());
    if (before !== adminIdsSignature) { adminIdsSignature = before; Storage.setAdminIds(ids); handlers.onUpdate?.(); }
  } catch { /* offline: next full pull */ }
}
let adminIdsSignature = '';

export function pullNow() {
  if (!me || disabled) return Promise.resolve();
  if (pulling) return pulling;
  pulling = (async () => {
    const db = getSupabase();
    if (!legacyProfileChecked) { legacyProfileChecked = true; await uploadLegacyProfile(db); }
    const fullProfiles = !profilesSince || profilePulls % FULL_PROFILES_EVERY === 0;
    profilePulls++;
    // Each part stands on its own: if the posts fail, followers, profiles and who's online still update
    if (fullProfiles) refreshAdminIds(db); // background: rarely changes
    const [postsRes, followsRes, profilesRes, presenceRes] = await Promise.allSettled([
      fetchPosts(db, q => q.order('created_at', { ascending: false }).limit(150)),
      must(db.from('follows').select('follower_id, following_id, created_at').limit(5000)),
      fetchProfiles(db, q => (fullProfiles ? q : q.gt('updated_at', profilesSince)).eq('banned', false).limit(1000)),
      fetchPresence(db)
    ]);
    const rows = postsRes.status === 'fulfilled' ? postsRes.value : null;
    const follows = followsRes.status === 'fulfilled' ? followsRes.value : null;
    const profiles = profilesRes.status === 'fulfilled' ? profilesRes.value : [];
    const presence = presenceRes.status === 'fulfilled' ? presenceRes.value : [];
    if (profilesRes.status === 'rejected') profilePulls = 0; // retry a full read next time
    if (profilesRes.status === 'rejected') console.warn('Perfis não atualizados:', profilesRes.reason?.code, profilesRes.reason?.message);
    if (followsRes.status === 'rejected') console.warn('Seguidores não atualizados:', followsRes.reason?.code, followsRes.reason?.message);

    let posts = null;
    if (rows) {
      rows.forEach(r => {
        pending.delete(r.id);
        (r.post_comments || []).forEach(c => pendingComments.delete(c.id));
      });
      flushPostOutbox(db, rows);
      migrateLegacyImages(db).catch(() => {}); // background
      posts = rows.map(fromRow);
      const overlay = (list, on) => { const rest = list.filter(id => id !== me); return on ? [...rest, me] : rest; };
      posts.forEach(p => {
        if (pendingLikes.has(p.id)) p.likes = overlay(p.likes, pendingLikes.get(p.id));
        if (pendingReposts.has(p.id)) p.reposts = overlay(p.reposts, pendingReposts.get(p.id));
      });
    }
    const profilesChanged = trackProfiles(profiles);
    const others = presence.filter(p => p.id !== me);

    // Same data as last time (the usual case): nothing to write, nothing to redraw
    const signature = JSON.stringify([
      posts ? posts.map(p => [p.id, p.likes, p.reposts, p.updatedAt || '', p.votes,
        p.comments.map(c => `${c.id}:${c.likes.length}`).join(','), p.text.length, p.imageUrl.length, Boolean(p.imageLazy)]) : 'posts?',
      follows ? follows.map(f => `${f.follower_id}>${f.following_id}`).sort().join(',') : 'follows?',
      others.map(p => [p.id, presenceOf({ lastSeenAt: p.last_seen_at }).online]),
      profilesVersion, [...pending], [...pendingComments]
    ]);
    if (signature !== lastSignature) {
      lastSignature = signature;
      if (profilesChanged) Storage.mergeRemoteProfiles(profiles, { skipId: profileDirty ? me : null });
      Storage.setPresence(Object.fromEntries(others.map(p => [p.id, p.last_seen_at])));
      if (follows) {
        const graph = {};
        follows.forEach(f => { (graph[f.follower_id] ||= []).push(f.following_id); });
        pendingFollows.forEach((on, target) => {
          const list = (graph[me] ||= []).filter(id => id !== target);
          graph[me] = on ? [...list, target] : list;
        });
        Storage.replaceFollows(graph);
      }
      if (posts) Storage.replacePostsCache(posts, [...pending], [...pendingComments]);
      if (rows && follows) Storage.mergeRemoteNotifications(me, buildNotifications(rows, follows), 'feed');
      handlers.onUpdate?.();
    }
    if (!rows) throw postsRes.reason; // reported below (the rest already updated)
    pullFailures = 0;
  })().catch(err => {
    if (isMissingTable(err)) {
      disabled = true;
      handlers.onError?.('O feed compartilhado ainda não foi criado no banco: rode supabase/002_posts.sql no SQL Editor do Supabase.');
      return;
    }
    // Network blips: the next poll tries again. Anything that keeps failing gets reported (once)
    // instead of silently freezing the feed and the notifications.
    console.warn('Feed sync failed:', err?.code, err?.message || err, err?.details || '', err?.hint || '');
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

// The feed query never carries pictures: old posts keep base64 images inside body (hundreds of KB
// each), and 150 of them made the query time out, freezing the feed. It asks for each body field
// by name, leaving out imageUrl and the playlist cover; https pictures come in a second, tiny query,
// and posts still holding a base64 image are marked so the card loads it alone when it scrolls in.
const POST_FIELDS = `id, author_id, edited, created_at,
  text:body->>text, lyrics:body->>lyrics, lyricsSong:body->>lyricsSong, lyricsArt:body->>lyricsArt,
  tag:body->>tag, rating:body->rating, song:body->song, playlistId:body->>playlistId, poll:body->poll,
  images:body->images, mentions:body->mentions,
  plId:body->playlist->>id, plTitle:body->playlist->>title, plDescription:body->playlist->>description,
  plAuthorId:body->playlist->>authorId, plSongs:body->playlist->songs`;
const COMMENT_FIELDS = `id, user_id, created_at, text:body->>text, song:body->song, gifUrl:body->>gifUrl, parentId:body->>parentId`;
const LIGHT_KEYS = ['text', 'lyrics', 'lyricsSong', 'lyricsArt', 'tag', 'rating', 'song', 'playlistId', 'poll', 'images', 'mentions'];

async function fetchPostRows(db, refine) {
  for (;;) {
    const select = `${POST_FIELDS},
      post_likes(user_id, created_at), post_reposts(user_id, created_at),
      post_comments(${COMMENT_FIELDS}, author:profiles!user_id(${PROFILE_FIELDS})${commentLikesTable ? ', comment_likes(user_id, created_at)' : ''})
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

// Picture links (https only) and which rows still hold a base64 picture, for a set of ids
// Picture links (https only) and which rows still hold a base64 picture, for a set of ids.
// Ids go in small batches (a URL with hundreds of ids is refused by the server), and a failed batch
// only costs those pictures: the feed itself still loads.
const PICTURE_BATCH = 40;
async function fetchPictures(db, table, ids) {
  const result = { urls: new Map(), covers: new Map(), inline: new Set() };
  const batches = [];
  for (let i = 0; i < Math.min(ids.length, 400); i += PICTURE_BATCH) batches.push(ids.slice(i, i + PICTURE_BATCH));
  const safe = (q) => q.then(({ data, error }) => {
    if (error) { console.warn(`Fotos de ${table} indisponíveis:`, error.code, error.message); return []; }
    return data || [];
  }, () => []);
  await Promise.all(batches.map(async (batch) => {
    const [urls, inline, covers] = await Promise.all([
      safe(db.from(table).select('id, url:body->>imageUrl').in('id', batch).like('body->>imageUrl', 'https://%')),
      safe(db.from(table).select('id').in('id', batch).like('body->>imageUrl', 'data:image/%')),
      table === 'posts'
        ? safe(db.from(table).select('id, url:body->playlist->>coverUrl').in('id', batch).like('body->playlist->>coverUrl', 'https://%'))
        : Promise.resolve([])
    ]);
    urls.forEach(r => result.urls.set(r.id, r.url));
    covers.forEach(r => result.covers.set(r.id, r.url));
    inline.forEach(r => result.inline.add(r.id));
  }));
  return result;
}

// If the field-by-field query is ever refused, fall back to the plain one (whole body), which is
// heavier but always worked: the feed must never go blank because of an optimization
let lightQueryOk = true;
async function fetchFullRows(db, refine) {
  const select = `id, author_id, body, edited, created_at,
    post_likes(user_id, created_at), post_reposts(user_id, created_at),
    post_comments(id, user_id, body, created_at, author:profiles!user_id(${PROFILE_FIELDS})${commentLikesTable ? ', comment_likes(user_id, created_at)' : ''})
    ${votesTable ? ', post_votes(user_id, option)' : ''}`;
  return must(refine(db.from('posts').select(select)));
}

/** Posts with likes, reposts, comments (and poll votes / comment likes once 004/005 are run), in the row shape fromRow reads. */
async function fetchPosts(db, refine) {
  let rows;
  if (lightQueryOk) {
    try { rows = await fetchPostRows(db, refine); }
    catch (err) {
      if (isMissingTable(err) && !/post_votes|comment_likes/.test(`${err?.message} ${err?.details}`)) throw err;
      console.warn('Consulta leve do feed recusada, usando a completa:', err?.code, err?.message);
      lightQueryOk = false;
    }
  }
  if (!rows) return fetchFullRows(db, refine);

  const commentIds = rows.flatMap(r => (r.post_comments || []).map(c => c.id));
  const [postPics, commentPics] = await Promise.all([
    fetchPictures(db, 'posts', rows.map(r => r.id)),
    fetchPictures(db, 'post_comments', commentIds)
  ]);
  return rows.map(r => {
    const body = {};
    LIGHT_KEYS.forEach(k => { if (r[k] !== null && r[k] !== undefined) body[k] = r[k]; });
    body.imageUrl = postPics.urls.get(r.id) || '';
    if (postPics.inline.has(r.id)) body.imageInline = true;
    if (r.plId || r.plTitle) {
      body.playlist = { id: r.plId, title: r.plTitle || '', description: r.plDescription || '', authorId: r.plAuthorId, songs: r.plSongs || [], coverUrl: postPics.covers.get(r.id) || '' };
    }
    const comments = (r.post_comments || []).map(c => ({
      ...c,
      body: { text: c.text || '', song: c.song || null, gifUrl: c.gifUrl || '', parentId: c.parentId || null, imageUrl: commentPics.urls.get(c.id) || '', ...(commentPics.inline.has(c.id) ? { imageInline: true } : {}) }
    }));
    return { id: r.id, author_id: r.author_id, edited: r.edited, created_at: r.created_at, body,
      post_likes: r.post_likes, post_reposts: r.post_reposts, post_comments: comments, post_votes: r.post_votes };
  });
}

// One base64 picture at a time, only for cards that actually scroll into view (kept in memory)
const inlinePictures = new Map(); // "table:id" → Promise<string>
export function loadInlinePicture(table, id) {
  if (!['posts', 'post_comments'].includes(table) || !me) return Promise.resolve('');
  const key = `${table}:${id}`;
  if (!inlinePictures.has(key)) {
    inlinePictures.set(key, getSupabase().from(table).select('url:body->>imageUrl').eq('id', id).maybeSingle()
      .then(({ data }) => data?.url || '').catch(() => { inlinePictures.delete(key); return ''; }));
  }
  return inlinePictures.get(key);
}

/** One post from the server (e.g. opened from a notification but older than the feed window). */
export async function fetchPostById(postId) {
  if (!me || disabled) return null;
  try {
    const rows = await fetchPosts(getSupabase(), q => q.eq('id', postId).limit(1));
    if (!rows.length) return null;
    const post = fromRow(rows[0]);
    Storage.upsertPostsCache([post]);
    return post;
  } catch { return null; }
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

/** Host every picture of a post; ones that fail to upload are dropped from the gallery (never inlined). */
async function hostImages(list) {
  const out = [];
  for (const url of (list || []).slice(0, 4)) {
    const hosted = await hostImage(url, 'post');
    if (/^https:\/\//.test(hosted)) out.push(hosted);
  }
  return out;
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


// Writes for the same thing (one post's like, one follow...) run one after another, in click order.
// Sent in parallel, a quick like→unlike could reach the server reversed and leave the like on.
const writeQueues = new Map(); // pending map → Map(key → last queued promise)

// A write whose optimistic state stays on screen until the server has it, then a quick re-pull
function tracked(map, key, on, task, failMessage) {
  map.set(key, on);
  if (!writeQueues.has(map)) writeQueues.set(map, new Map());
  const queue = writeQueues.get(map);
  write(async db => {
    const run = (queue.get(key) || Promise.resolve()).catch(() => {}).then(() => task(db));
    queue.set(key, run);
    try { await run; }
    finally {
      if (queue.get(key) === run) queue.delete(key);
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
        const images = await hostImages(post.images);
        // The first picture also goes in imageUrl, so older versions of the app still show one
        const imageUrl = images[0] || await hostImage(post.imageUrl, 'post');
        if (imageUrl !== post.imageUrl || images.length !== (post.images || []).length || images.some((u, i) => u !== post.images[i])) {
          Storage.patchPostCache(post.id, { imageUrl, images });
        }
        await must(db.from('posts').insert({ id: post.id, author_id: me, body: toBody({ ...post, imageUrl, images }) }));
      } catch (err) { pending.delete(post.id); throw err; }
      // stays pending until a pull sees it, so a pull that read the server just before can't drop it
    }, 'Não foi possível publicar o post. Verifique sua conexão.');
  },
  updatePost(post) {
    write(async db => {
      // The feed never downloaded this post's base64 picture: fetch it so the edit doesn't drop it
      const original = !post.imageUrl && post.imageLazy ? await loadInlinePicture('posts', post.id) : post.imageUrl;
      const imageUrl = await hostImage(original, 'post');
      if (imageUrl !== post.imageUrl) Storage.patchPostCache(post.id, { imageUrl });
      await must(db.from('posts').update({ body: toBody({ ...post, imageUrl }), edited: true }).eq('id', post.id));
    }, 'Não foi possível salvar a edição.');
  },
  deletePost(postId) {
    pending.delete(postId);
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
    pendingComments.add(c.id);
    write(async db => {
      try {
        const imageUrl = await hostImage(c.imageUrl || '', 'comment');
        await must(db.from('post_comments').insert({ id: c.id, post_id: postId, user_id: me, body: commentBody(c, imageUrl) }));
      } catch (err) { if (!alreadyThere(err)) { pendingComments.delete(c.id); throw err; } }
      // stays pending until a pull sees it (the outbox resends it if it never arrives)
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
        if (liveContact === m.toUserId) ping('message'); // the other side fetches it right away
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
    pendingComments.delete(commentId);
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
  adminIdsOn = true;
  adminIdsSignature = '';
  newestMessageAt = null;
  readReceiptsOn = true;
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
  closeChatChannel();
  clearTimeout(pullSoonTimer);
  pendingFollows.clear();
  pendingComments.clear();
  pendingLikes.clear();
  pendingReposts.clear();
  document.removeEventListener('visibilitychange', onVisible);
  me = null;
}
