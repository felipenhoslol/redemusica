// Supabase Client, Auth & Storage Management
// Configure com sua URL e Anon Key do painel Supabase (Project Settings > API)

export const SUPABASE_CONFIG = {
  url: 'https://mtfxigkjevxhwpjscwwh.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10ZnhpZ2tqZXZ4aHdwanNjd3doIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgxOTI1NjUsImV4cCI6MjEwMzc2ODU2NX0.3RT4oWYXjWKLp9lrhWz4SCrwysK5724zyByEankO4lg'
};

// CDN Supabase JS loader (permite uso sem bundler/node)
let supabaseClient = null;

export async function getSupabase() {
  if (supabaseClient) return supabaseClient;

  if (window.supabase) {
    supabaseClient = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
    return supabaseClient;
  }

  // Load dynamically if not loaded in HTML
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
    script.onload = () => {
      supabaseClient = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
      resolve(supabaseClient);
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// ──────────────────────────────────────────
// AUTHENTICATION METHODS
// ──────────────────────────────────────────

export async function signUp({ email, password, name, handle, avatarUrl }) {
  const sb = await getSupabase();
  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: {
      data: {
        name,
        handle: handle.startsWith('@') ? handle : `@${handle}`,
        avatar_url: avatarUrl || ''
      }
    }
  });

  if (error) throw error;
  return data;
}

export async function signIn({ email, password }) {
  const sb = await getSupabase();
  const { data, error } = await sb.auth.signInWithPassword({
    email,
    password
  });

  if (error) throw error;
  return data;
}

export async function signOut() {
  const sb = await getSupabase();
  const { error } = await sb.auth.signOut();
  if (error) throw error;
}

export async function getCurrentUser() {
  const sb = await getSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;

  const { data: profile } = await sb
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  return { ...user, profile };
}

// ──────────────────────────────────────────
// STORAGE FILE UPLOADS (AVATAR, BANNER, POSTS)
// ──────────────────────────────────────────

/**
 * Upload file directly to Supabase Storage bucket
 * @param {'avatars'|'banners'|'post_images'|'playlist_covers'} bucket 
 * @param {File} file 
 * @param {string} userId 
 * @returns {Promise<string>} Public URL of the uploaded image
 */
export async function uploadImage(bucket, file, userId) {
  if (!file) throw new Error('Nenhum arquivo selecionado.');

  const sb = await getSupabase();
  const fileExt = file.name.split('.').pop();
  const fileName = `${userId || 'anon'}_${Date.now()}.${fileExt}`;
  const filePath = `${fileName}`;

  const { data, error } = await sb.storage
    .from(bucket)
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: true
    });

  if (error) throw error;

  const { data: { publicUrl } } = sb.storage
    .from(bucket)
    .getPublicUrl(filePath);

  return publicUrl;
}

// ──────────────────────────────────────────
// POSTS & REVIEWS CRUD (SUPABASE)
// ──────────────────────────────────────────

export async function createPostSupabase({ text, lyrics, lyricsSong, lyricsArt, lyricsCardStyle, tag, rating, song, imageUrl }) {
  const sb = await getSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error('Usuário não autenticado.');

  const { data, error } = await sb.from('posts').insert({
    author_id: user.id,
    text,
    lyrics,
    lyrics_song: lyricsSong,
    lyrics_art: lyricsArt,
    lyrics_card_style: lyricsCardStyle || 'compact',
    tag: tag || '#música',
    rating: parseFloat(rating) || 0.0, // Suporte a notas decimais como 3.5
    song,
    image_url: imageUrl
  }).select().single();

  if (error) throw error;
  return data;
}

export async function createReviewSupabase({ trackId, trackTitle, trackArtist, trackArtwork, trackPreviewUrl, challengeId, questionId, rating, comment, targetUserId }) {
  const sb = await getSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error('Usuário não autenticado.');

  const { data, error } = await sb.from('reviews').insert({
    reviewer_id: user.id,
    target_user_id: targetUserId || null,
    track_id: trackId,
    track_title: trackTitle,
    track_artist: trackArtist,
    track_artwork: trackArtwork,
    track_preview_url: trackPreviewUrl,
    challenge_id: challengeId || null,
    question_id: questionId || null,
    rating: parseFloat(rating), // Suporte a notas decimais como 3.5, 4.5
    comment
  }).select().single();

  if (error) throw error;
  return data;
}
