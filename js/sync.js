// Shared timeline: mirrors posts, likes, reposts, comments and follows to Supabase so everyone sees the same feed.
// storage.js stays the synchronous cache the UI reads; this module fills it from the server and pushes local writes up.
import { getSupabase } from './supabase.js';
import * as Storage from './storage.js';

const POLL_MS = 45000;
const PROFILE_FIELDS = 'id, name, handle, avatar_url';

const pending = new Set();  // post ids created here that the server hasn't confirmed yet
let me = null;
let handlers = {};
let lastSignature = '';
let timer = null;
let pulling = null;
let disabled = false;

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
    playlistId: post.playlistId || null, playlist: playlistSnapshot(post)
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
      createdAt: relativeTime(c.created_at), createdAtIso: c.created_at
    }));
  return {
    id: row.id, authorId: row.author_id,
    text: b.text || '', lyrics: b.lyrics || '', lyricsSong: b.lyricsSong || '', lyricsArt: b.lyricsArt || '',
    tag: b.tag || '#música', rating: Number(b.rating) || 0, song: b.song || null, imageUrl: b.imageUrl || '',
    playlistId: b.playlistId || null, playlist: b.playlist || null,
    likes: (row.post_likes || []).map(l => l.user_id),
    reposts: (row.post_reposts || []).map(r => r.user_id),
    bookmarks: [], comments,
    createdAt: relativeTime(row.created_at), createdAtIso: row.created_at,
    ...(row.edited ? { updatedAt: 'editado' } : {})
  };
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

export function pullNow() {
  if (!me || disabled) return Promise.resolve();
  if (pulling) return pulling;
  pulling = (async () => {
    const db = getSupabase();
    const postSelect = `id, author_id, body, edited, created_at,
      post_likes(user_id), post_reposts(user_id),
      post_comments(id, user_id, body, created_at, author:profiles(${PROFILE_FIELDS}))`;
    const [rows, follows, profiles] = await Promise.all([
      must(db.from('posts').select(postSelect).order('created_at', { ascending: false }).limit(150)),
      must(db.from('follows').select('follower_id, following_id').limit(5000)),
      must(db.from('profiles').select(PROFILE_FIELDS).eq('banned', false).limit(1000))
    ]);

    await uploadLegacyPosts(db, new Set(rows.map(r => r.id)));

    Storage.mergeRemoteProfiles(profiles);
    const graph = {};
    follows.forEach(f => { (graph[f.follower_id] ||= []).push(f.following_id); });
    Storage.replaceFollows(graph);
    const posts = rows.map(fromRow);
    Storage.replacePostsCache(posts, [...pending]);

    const signature = JSON.stringify([posts.map(p => [p.id, p.likes.length, p.reposts.length, p.comments.length, p.updatedAt || '']), follows.length, profiles.length]);
    if (signature !== lastSignature) {
      lastSignature = signature;
      handlers.onUpdate?.();
    }
  })().catch(err => {
    if (isMissingTable(err)) {
      disabled = true;
      handlers.onError?.('O feed compartilhado ainda não foi criado no banco: rode supabase/002_posts.sql no SQL Editor do Supabase.');
    }
    // Network blips: the next poll tries again; the cache keeps the app usable meanwhile
  }).finally(() => { pulling = null; });
  return pulling;
}

// ─── push ───────────────────────────────────────────────────────────────────

function write(task, failMessage) {
  if (!me || disabled) return;
  task(getSupabase()).catch(err => {
    handlers.onError?.(err?.code === '42501' ? 'Sua conta não pode publicar no momento.' : failMessage);
    pullNow(); // put the cache back in line with the server
  });
}

const isAccountId = (id) => /^[0-9a-f-]{36}$/i.test(id || '');

const hooks = {
  createPost(post) {
    pending.add(post.id);
    write(async db => {
      try { await must(db.from('posts').insert({ id: post.id, author_id: me, body: toBody(post) })); }
      finally { pending.delete(post.id); }
    }, 'Não foi possível publicar o post. Verifique sua conexão.');
  },
  updatePost(post) {
    write(db => must(db.from('posts').update({ body: toBody(post), edited: true }).eq('id', post.id)), 'Não foi possível salvar a edição.');
  },
  deletePost(postId) {
    write(db => must(db.from('posts').delete().eq('id', postId)), 'Não foi possível apagar o post.');
  },
  like(postId, on) {
    write(db => must(on
      ? db.from('post_likes').upsert({ post_id: postId, user_id: me }, { onConflict: 'post_id,user_id', ignoreDuplicates: true })
      : db.from('post_likes').delete().eq('post_id', postId).eq('user_id', me)), 'Não foi possível salvar a curtida.');
  },
  repost(postId, on) {
    write(db => must(on
      ? db.from('post_reposts').upsert({ post_id: postId, user_id: me }, { onConflict: 'post_id,user_id', ignoreDuplicates: true })
      : db.from('post_reposts').delete().eq('post_id', postId).eq('user_id', me)), 'Não foi possível salvar o repost.');
  },
  addComment(postId, c) {
    const body = { text: c.text || '', song: c.song || null, imageUrl: c.imageUrl || '', gifUrl: c.gifUrl || '' };
    write(db => must(db.from('post_comments').insert({ id: c.id, post_id: postId, user_id: me, body })), 'Não foi possível enviar o comentário.');
  },
  deleteComment(commentId) {
    write(db => must(db.from('post_comments').delete().eq('id', commentId)), 'Não foi possível apagar o comentário.');
  },
  follow(targetId, on) {
    if (!isAccountId(targetId)) return;
    write(db => must(on
      ? db.from('follows').upsert({ follower_id: me, following_id: targetId }, { onConflict: 'follower_id,following_id', ignoreDuplicates: true })
      : db.from('follows').delete().eq('follower_id', me).eq('following_id', targetId)), 'Não foi possível atualizar quem você segue.');
  }
};

const onVisible = () => { if (document.visibilityState === 'visible') pullNow(); };

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
  lastSignature = '';
  Storage.setRemoteHooks(hooks);
  timer = setInterval(pullNow, POLL_MS);
  document.addEventListener('visibilitychange', onVisible);
  return pullNow();
}

export function stopSync() {
  Storage.setRemoteHooks(null);
  clearInterval(timer);
  timer = null;
  document.removeEventListener('visibilitychange', onVisible);
  me = null;
}
