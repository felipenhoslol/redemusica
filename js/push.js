// Avisos com o app fechado (só no app Android): o token do FCM do aparelho vai para push_devices
// (supabase/015_push.sql) e a Edge Function push-notify manda os avisos. No navegador nada disso roda.
import { getSupabase } from './supabase.js';

const PREFS_KEY = 'rmsn_push_prefs_v1';
const TOKEN_KEY = 'rmsn_push_token_v1';
const ASKED_KEY = 'rmsn_push_asked_v1';
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* optional */ } },
  del: (k) => { try { localStorage.removeItem(k); } catch { /* optional */ } }
};
const plugin = () => window.Capacitor?.isNativePlatform?.() ? window.Capacitor.Plugins?.PushNotifications : null;

/** 'on' (avisos chegam), 'denied' (o Android bloqueou) ou 'off' (navegador / app sem Firebase) */
export let pushState = 'off';

export function getPushPrefs() {
  try { return { posts: true, messages: true, ...JSON.parse(store.get(PREFS_KEY) || '{}') }; }
  catch { return { posts: true, messages: true }; }
}

async function saveDevice(token) {
  const p = getPushPrefs();
  const { error } = await getSupabase().rpc('save_push_device', { p_token: token, p_posts: p.posts, p_messages: p.messages });
  if (error) console.warn('push:', error.message);
  else store.set(TOKEN_KEY, token);
}

export function setPushPrefs(prefs) {
  store.set(PREFS_KEY, JSON.stringify({ ...getPushPrefs(), ...prefs }));
  const token = store.get(TOKEN_KEY);
  if (token) saveDevice(token);
}

function openFromNotification(d = {}) {
  if (d.type === 'post' && d.postId) window._openPostView?.(d.postId);
  else if (d.type === 'message' && d.fromId) {
    window.switchTab?.('chat');
    setTimeout(() => window._selectChatContact?.(d.fromId), 60); // same as the bell's message card
  }
}

/** Call once, signed in, after the first sync (taps need the posts and people loaded). */
export async function initPush() {
  const P = plugin();
  if (!P) return;
  // Built without google-services.json (tools/build-app.mjs): no Firebase, and register() would crash the app
  try { if (!(await (await fetch('app-version.json', { cache: 'no-store' })).json()).push) return; } catch { return; }

  P.addListener('registration', ({ value }) => saveDevice(value)); // also fires when FCM rotates the token
  P.addListener('registrationError', (e) => console.warn('push:', e?.error));
  P.addListener('pushNotificationActionPerformed', ({ notification }) => openFromNotification(notification?.data));

  let perm = await P.checkPermissions();
  // Ask once, on the first open: refusing keeps the bell inside the app, as before
  if (perm.receive !== 'granted' && !store.get(ASKED_KEY)) {
    store.set(ASKED_KEY, '1');
    perm = await P.requestPermissions();
  }
  if (perm.receive !== 'granted') { pushState = 'denied'; return; }
  pushState = 'on';
  await P.createChannel({ id: 'avisos', name: 'Avisos', description: 'Posts de quem você segue e mensagens', importance: 4, visibility: 0 }).catch(() => {});
  await P.register();
}

/** Logout: this phone stops getting the account's notices. */
export async function forgetDevice() {
  const token = store.get(TOKEN_KEY);
  if (!token) return;
  store.del(TOKEN_KEY);
  await getSupabase().from('push_devices').delete().eq('token', token);
}
