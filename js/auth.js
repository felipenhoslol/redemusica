// Session state: links the Supabase account to the local app user and exposes who is signed in.
import * as sb from './supabase.js';
import { ensureAccountUser } from './storage.js';

export const auth = {
  mode: 'signed-out',   // 'signed-in' | 'signed-out' | 'local' (Supabase not configured) | 'recovery' | 'banned'
  user: null,           // Supabase auth user
  profile: null,        // row from public.profiles
  isAdmin: false
};

const LOCAL_MODE_KEY = 'rmsn_local_mode_v1';

/** Demo mode is only offered while Supabase is not configured. */
export function isLocalModeOn() {
  try { return !sb.isSupabaseConfigured() && localStorage.getItem(LOCAL_MODE_KEY) === '1'; }
  catch { return false; }
}

export function enterLocalMode() {
  try { localStorage.setItem(LOCAL_MODE_KEY, '1'); } catch { /* optional */ }
  auth.mode = 'local';
}

async function applySession(session) {
  if (!session) {
    Object.assign(auth, { mode: 'signed-out', user: null, profile: null, isAdmin: false });
    return auth;
  }
  const profile = await sb.getMyProfile(session.user.id);
  const isAdmin = await sb.checkIsAdmin();
  Object.assign(auth, { user: session.user, profile, isAdmin });

  if (profile?.banned) {
    auth.mode = 'banned';
    return auth;
  }
  auth.mode = 'signed-in';
  ensureAccountUser({
    id: session.user.id,
    name: profile?.name || session.user.user_metadata?.name || session.user.email.split('@')[0],
    handle: profile?.handle || ('@' + (session.user.user_metadata?.handle || 'voce'))
  });
  return auth;
}

/**
 * Resolve the initial auth state. Resolves once; later sign-out/recovery events call onChange.
 * @param {(state: typeof auth, event: string) => void} [onChange]
 */
export async function initAuth(onChange) {
  if (!sb.isSupabaseConfigured()) {
    auth.mode = isLocalModeOn() ? 'local' : 'signed-out';
    return auth;
  }

  sb.onAuthChange(async (event, session) => {
    if (event === 'PASSWORD_RECOVERY') {
      auth.mode = 'recovery';
      onChange?.(auth, event);
    } else if (event === 'SIGNED_OUT') {
      await applySession(null);
      onChange?.(auth, event);
    }
  });

  // A saved session whose token is being refreshed (or a flaky mobile connection) can come back empty
  // for a moment: retry before showing the login screen. Visitors without a saved session don't wait.
  const hasSavedSession = Object.keys(localStorage).some(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
  const attempts = hasSavedSession ? 3 : 1;
  for (let i = 0; i < attempts; i++) {
    try {
      const session = await sb.getSession();
      if (session || i === attempts - 1) { await applySession(session); break; }
    } catch (err) {
      if (i === attempts - 1) {
        console.warn('Could not restore session:', err);
        await applySession(null);
        break;
      }
    }
    await new Promise(r => setTimeout(r, 600 * (i + 1)));
  }
  // A recovery link opens the app with a session plus a recovery marker in the URL
  if (/type=recovery/.test(window.location.hash)) auth.mode = 'recovery';
  return auth;
}

export async function loginWithPassword(email, password) {
  const data = await sb.signIn({ email, password });
  return applySession(data.session);
}

export async function logout() {
  if (auth.mode === 'local') {
    try { localStorage.removeItem(LOCAL_MODE_KEY); } catch { /* optional */ }
  } else if (sb.isSupabaseConfigured()) {
    await sb.signOut();
  }
  window.location.reload();
}
