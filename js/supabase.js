// Supabase: client, auth, feedback, daily lyrics and admin CRUD.
// The supabase-js UMD build is loaded by index.html (window.supabase).
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const isSupabaseConfigured = () => Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export class AppError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'AppError';
    this.code = code;
  }
}

let client = null;

export function getSupabase() {
  if (!isSupabaseConfigured()) throw new AppError('config', 'O Supabase ainda não está configurado (js/config.js).');
  if (!window.supabase?.createClient) throw new AppError('config', 'A biblioteca do Supabase não carregou. Verifique sua conexão.');
  if (!client) {
    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
  }
  return client;
}

// Supabase/PostgREST errors → messages the user can act on
function friendly(error) {
  const msg = (error?.message || '').toLowerCase();
  const code = error?.code || error?.status;
  if (error instanceof AppError) return error;
  if (msg.includes('invalid login credentials')) return new AppError('auth', 'E-mail ou senha incorretos.');
  if (msg.includes('email not confirmed')) return new AppError('auth', 'Confirme seu e-mail antes de entrar: procure a mensagem de confirmação na sua caixa de entrada.');
  if (msg.includes('already been registered') || msg.includes('email_exists')) return new AppError('auth', 'Já existe uma conta com esse e-mail.');
  if (msg.includes('unable to validate email') || msg.includes('invalid format')) return new AppError('auth', 'Esse e-mail não parece válido. Confira e tente de novo.');
  if (msg.includes('user already registered')) return new AppError('auth', 'Já existe uma conta com esse e-mail. Tente entrar ou recuperar a senha.');
  if (msg.includes('password should be at least')) return new AppError('auth', 'A senha precisa ter pelo menos 8 caracteres.');
  if (msg.includes('should be different from the old')) return new AppError('auth', 'A nova senha precisa ser diferente da atual.');
  if (msg.includes('weak') || msg.includes('pwned')) return new AppError('auth', 'Essa senha é fácil de adivinhar. Use uma mais longa, misturando letras e números.');
  if (msg.includes('reauthentication') || msg.includes('session')) return new AppError('auth', 'Sua sessão expirou. Saia e entre de novo para mudar a senha.');
  if (msg.includes('rate limit') || code === 429) return new AppError('rate', 'Muitas tentativas seguidas. Espere um minuto e tente de novo.');
  if (msg.includes('failed to fetch') || msg.includes('network')) return new AppError('network', 'Sem conexão com o servidor. Verifique sua internet.');
  if (code === 'PGRST205' || code === 'PGRST202') return new AppError('setup', 'O banco ainda não foi preparado: rode supabase/001_auth_feedback_admin.sql no SQL Editor do Supabase.');
  if (code === '23505') return new AppError('duplicate', 'Esse valor já está em uso.');
  if (code === '23514') return new AppError('invalid', 'Algum campo está fora do formato permitido.');
  if (code === '42501' || msg.includes('row-level security')) return new AppError('forbidden', 'Você não tem permissão para fazer isso.');
  return new AppError('unknown', error?.message || 'Algo deu errado. Tente de novo.');
}

async function run(promise) {
  let result;
  try {
    result = await promise;
  } catch (err) {
    throw friendly(err);
  }
  if (result?.error) throw friendly(result.error);
  return result?.data;
}

// ──────────────────────────────────────────
// AUTH
// ──────────────────────────────────────────

export async function getSession() {
  const data = await run(getSupabase().auth.getSession());
  return data.session;
}

export function onAuthChange(callback) {
  return getSupabase().auth.onAuthStateChange((event, session) => callback(event, session));
}

/** @returns {Promise<{needsConfirmation: boolean}>} */
export async function signUp({ name, handle, email, password }) {
  const data = await run(getSupabase().auth.signUp({
    email,
    password,
    options: {
      data: { name, handle: handle.replace(/^@/, '') },
      emailRedirectTo: window.location.origin + window.location.pathname
    }
  }));
  return { needsConfirmation: !data.session };
}

export async function signIn({ email, password }) {
  return run(getSupabase().auth.signInWithPassword({ email, password }));
}

export async function sendPasswordReset(email) {
  return run(getSupabase().auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + window.location.pathname
  }));
}

export async function updatePassword(password) {
  return run(getSupabase().auth.updateUser({ password }));
}

/** Ask to move the account to a new e-mail; Supabase sends the confirmation link(s). */
export async function updateEmail(email) {
  return run(getSupabase().auth.updateUser(
    { email },
    { emailRedirectTo: window.location.origin + window.location.pathname }
  ));
}

export async function signOut() {
  return run(getSupabase().auth.signOut());
}

export async function getMyProfile(userId) {
  try {
    return await run(getSupabase().from('profiles').select('id, name, handle, avatar_url, banned, email_verified_at').eq('id', userId).maybeSingle());
  } catch {
    // Before supabase/008_email_verified.sql the column doesn't exist
    return run(getSupabase().from('profiles').select('id, name, handle, avatar_url, banned').eq('id', userId).maybeSingle());
  }
}

/**
 * Record the e-mail as confirmed when this session came from an e-mail link.
 * @returns {Promise<boolean|null>} confirmed?, or null when the server doesn't support it yet
 */
export async function markEmailVerified() {
  const { data, error } = await getSupabase().rpc('mark_email_verified');
  return error ? null : Boolean(data);
}

/** E-mail a sign-in link; opening it proves the address belongs to the person. */
export async function sendVerificationLink(email) {
  return run(getSupabase().auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: window.location.origin + window.location.pathname }
  }));
}

export async function checkIsAdmin() {
  try {
    return Boolean(await run(getSupabase().rpc('is_admin')));
  } catch {
    return false;
  }
}

/** Handle availability for the sign-up form (true when free). */
export async function isHandleAvailable(handle) {
  const value = '@' + handle.replace(/^@/, '').toLowerCase();
  const rows = await run(getSupabase().from('profiles').select('id').eq('handle', value).limit(1));
  return rows.length === 0;
}

// ──────────────────────────────────────────
// FEEDBACK
// ──────────────────────────────────────────

export async function sendFeedback({ category, message, page }) {
  return run(getSupabase().from('feedback').insert({ category, message, page }));
}

export async function adminListFeedback({ status = 'todos', category = 'todas' } = {}) {
  let q = getSupabase()
    .from('feedback')
    .select('id, category, message, page, status, admin_note, created_at, updated_at, user:profiles(id, name, handle)')
    .order('created_at', { ascending: false })
    .limit(200);
  if (status !== 'todos') q = q.eq('status', status);
  if (category !== 'todas') q = q.eq('category', category);
  return run(q);
}

export async function adminUpdateFeedback(id, changes) {
  return run(getSupabase().from('feedback').update(changes).eq('id', id));
}

export async function adminDeleteFeedback(id) {
  return run(getSupabase().from('feedback').delete().eq('id', id));
}

// ──────────────────────────────────────────
// DAILY LYRICS
// ──────────────────────────────────────────

export async function fetchDailyLyric(isoDate) {
  return run(getSupabase().from('daily_lyrics').select('id, show_on, excerpt, song, artist, note').eq('show_on', isoDate).maybeSingle());
}

export async function adminListLyrics() {
  return run(getSupabase().from('daily_lyrics').select('id, show_on, excerpt, song, artist, note').order('show_on', { ascending: false }).limit(366));
}

export async function adminSaveLyric(lyric) {
  const row = { show_on: lyric.show_on, excerpt: lyric.excerpt, song: lyric.song, artist: lyric.artist, note: lyric.note || null };
  if (lyric.id) return run(getSupabase().from('daily_lyrics').update(row).eq('id', lyric.id));
  return run(getSupabase().from('daily_lyrics').insert(row));
}

export async function adminDeleteLyric(id) {
  return run(getSupabase().from('daily_lyrics').delete().eq('id', id));
}

// ──────────────────────────────────────────
// USERS & ADMINS (admin)
// ──────────────────────────────────────────

export async function adminListProfiles() {
  return run(getSupabase().from('profiles').select('id, name, handle, banned, created_at').order('created_at', { ascending: false }).limit(500));
}

export async function adminUpdateProfile(id, changes) {
  return run(getSupabase().from('profiles').update(changes).eq('id', id));
}

export async function adminListAdmins() {
  return run(getSupabase().from('app_admins').select('email, added_at').order('added_at'));
}

export async function adminAddAdmin(email) {
  return run(getSupabase().from('app_admins').insert({ email: email.trim().toLowerCase() }));
}

export async function adminRemoveAdmin(email) {
  return run(getSupabase().from('app_admins').delete().eq('email', email));
}
