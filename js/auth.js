// Session state: links the Supabase account to the local app user and exposes who is signed in.
import * as sb from './supabase.js';
import { ensureAccountUser, getUserById } from './storage.js';

export const auth = {
  mode: 'signed-out',   // 'signed-in' | 'signed-out' | 'local' (Supabase not configured) | 'recovery' | 'banned'
  user: null,           // Supabase auth user
  profile: null,        // row from public.profiles
  isAdmin: false,
  emailVerified: true   // false: signed in without confirming the e-mail yet (reminder in notifications)
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
    Object.assign(auth, { mode: 'signed-out', user: null, profile: null, isAdmin: false, emailVerified: true });
    return auth;
  }
  // A slow or flaky connection must not turn a valid saved session into "logged out":
  // without the profile row the app still works from the session's own data
  let profile = null;
  try { profile = await sb.getMyProfile(session.user.id); }
  catch (err) { console.warn('Profile unavailable, continuing with the session:', err); }
  const isAdmin = await sb.checkIsAdmin();
  Object.assign(auth, { user: session.user, profile, isAdmin, emailVerified: await resolveEmailVerified(profile) });

  if (profile?.banned) {
    auth.mode = 'banned';
    return auth;
  }
  auth.mode = 'signed-in';
  const known = profile ? null : getUserById(session.user.id); // keep the cached name/@ if the row didn't load
  ensureAccountUser({
    id: session.user.id,
    name: profile?.name || known?.name || session.user.user_metadata?.name || (session.user.email || 'você').split('@')[0],
    handle: profile?.handle || known?.handle || ('@' + (session.user.user_metadata?.handle || 'voce'))
  });
  return auth;
}

// Confirmed already, or this session came from an e-mail link (which confirms it now)?
async function resolveEmailVerified(profile) {
  if (!profile || !('email_verified_at' in profile)) return true; // server without 008: nothing to remind
  if (profile.email_verified_at) return true;
  try {
    const verified = await sb.markEmailVerified();
    return verified === null ? true : verified;
  } catch { return true; }
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

/** Signed in without having confirmed the e-mail yet. */
export const needsEmailConfirmation = () => auth.mode === 'signed-in' && !auth.emailVerified && Boolean(auth.user?.email);

const REMINDER_SEEN_KEY = 'rmsn_email_reminder_seen';
/** The reminder counts on the bell once a day, until the notifications are opened that day. */
export function emailReminderUnread() {
  if (!needsEmailConfirmation()) return 0;
  try { return localStorage.getItem(REMINDER_SEEN_KEY) === new Date().toDateString() ? 0 : 1; }
  catch { return 1; }
}
export function markEmailReminderSeen() {
  try { localStorage.setItem(REMINDER_SEEN_KEY, new Date().toDateString()); } catch { /* optional */ }
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
