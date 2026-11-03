// Edge Function push-notify: chamada pelo gatilho de supabase/015_push.sql quando entra um post ou
// uma mensagem. Descobre quem recebe, respeita as preferências de cada aparelho e manda pelo FCM.
//
// Segredos da função (painel → Edge Functions → Secrets):
//   FIREBASE_SERVICE_ACCOUNT  JSON da conta de serviço do Firebase (inteiro)
//   PUSH_WEBHOOK_SECRET       o mesmo texto guardado no Vault como push_notify_secret
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já vêm no ambiente de toda Edge Function.
// Publicar sem verificação de JWT (quem chama é o banco, com o cabeçalho x-push-secret).

import { createClient } from 'jsr:@supabase/supabase-js@2';

type ServiceAccount = { project_id: string; client_email: string; private_key: string };
type Device = { token: string };
type Push = { title: string; body: string; data: Record<string, string>; tag: string };

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false }
});

const sameText = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

const short = (s: string | null | undefined, n = 120) => {
  const t = (s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
};

// ─── OAuth do Google: JWT assinado com a chave da conta de serviço (WebCrypto) ───
const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64urlJson = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)));

let cachedToken: { value: string; exp: number } | null = null;

async function googleAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.value;
  const der = Uint8Array.from(
    atob(sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')),
    (c) => c.charCodeAt(0)
  );
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const unsigned = `${b64urlJson({ alg: 'RS256', typ: 'JWT' })}.${b64urlJson({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  })}`;
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned)));
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${b64url(sig)}`
    })
  });
  if (!res.ok) throw new Error(`oauth ${res.status}: ${await res.text()}`);
  const json = await res.json();
  cachedToken = { value: json.access_token, exp: now + Number(json.expires_in || 3600) };
  return cachedToken.value;
}

// ─── FCM HTTP v1 ───
async function sendAll(devices: Device[], push: Push) {
  if (!devices.length) return { sent: 0, removed: 0 };
  const sa: ServiceAccount = JSON.parse(Deno.env.get('FIREBASE_SERVICE_ACCOUNT') || '{}');
  if (!sa.private_key) throw new Error('FIREBASE_SERVICE_ACCOUNT ausente');
  const access = await googleAccessToken(sa);
  const url = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;
  const dead: string[] = [];
  let sent = 0;

  await Promise.all(devices.map(async ({ token }) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          token,
          notification: { title: push.title, body: push.body },
          data: push.data,
          android: {
            priority: 'HIGH',
            // Mesmo tag/collapse_key: o aviso novo substitui o anterior (mensagens seguidas da mesma pessoa viram uma só)
            collapse_key: push.tag,
            notification: { tag: push.tag, channel_id: 'avisos', icon: 'ic_stat_notify', color: '#9b5cf6' }
          }
        }
      })
    });
    if (res.ok) { sent++; return; }
    const err = await res.text();
    if (res.status === 404 || err.includes('UNREGISTERED')) dead.push(token);
    else console.warn('fcm', res.status, err.slice(0, 300));
  }));

  if (dead.length) await db.from('push_devices').delete().in('token', dead);
  return { sent, removed: dead.length };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function senderName(id: string) {
  const { data } = await db.from('profiles').select('name').eq('id', id).maybeSingle();
  return data?.name || 'Alguém';
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('PUSH_WEBHOOK_SECRET') || '';
  if (req.method !== 'POST' || !secret || !sameText(req.headers.get('x-push-secret') || '', secret)) {
    return json(401, { error: 'unauthorized' });
  }

  let event: { table?: string; id?: string };
  try { event = await req.json(); } catch { return json(400, { error: 'bad json' }); }
  const { table, id } = event;
  if ((table !== 'posts' && table !== 'messages') || typeof id !== 'string') return json(400, { error: 'bad event' });

  // Lê do banco em vez de confiar no corpo: o evento só diz qual linha é
  let recipients: string[] = [];
  let pref: 'notify_posts' | 'notify_messages';
  let push: Push;

  if (table === 'posts') {
    const { data: post } = await db.from('posts').select('id, author_id, text:body->>text').eq('id', id).maybeSingle();
    if (!post) return json(200, { skipped: 'not found' });
    // shortcut: lê todos os seguidores numa consulta; com milhares de seguidores, paginar e enviar em lotes
    const { data: follows, error } = await db.from('follows').select('follower_id').eq('following_id', post.author_id);
    if (error) return json(500, { error: error.message });
    recipients = (follows || []).map((f) => f.follower_id).filter((u) => u !== post.author_id);
    pref = 'notify_posts';
    push = {
      title: `${await senderName(post.author_id)} postou`,
      body: short(post.text as string) || 'Toque para ver o post.',
      data: { type: 'post', postId: post.id },
      tag: `post_${post.id}`
    };
  } else {
    const { data: msg } = await db.from('messages').select('id, from_id, to_id, text:body->>text').eq('id', id).maybeSingle();
    if (!msg) return json(200, { skipped: 'not found' });
    recipients = msg.to_id !== msg.from_id ? [msg.to_id] : [];
    pref = 'notify_messages';
    push = {
      title: `${await senderName(msg.from_id)} mandou mensagem`,
      body: short(msg.text as string) || 'Toque para abrir a conversa.',
      data: { type: 'message', fromId: msg.from_id },
      tag: `msg_${msg.from_id}`
    };
  }
  if (!recipients.length) return json(200, { sent: 0 });

  // Cada evento manda uma vez só, mesmo que o gatilho repita a chamada
  const { data: fresh, error: dupErr } = await db.from('push_sent')
    .upsert({ event_id: `${table}:${id}` }, { onConflict: 'event_id', ignoreDuplicates: true })
    .select('event_id');
  if (dupErr) return json(500, { error: dupErr.message });
  if (!fresh?.length) return json(200, { skipped: 'duplicate' });

  const { data: devices, error } = await db.from('push_devices').select('token')
    .in('user_id', recipients).eq(pref, true);
  if (error) return json(500, { error: error.message });

  try {
    return json(200, await sendAll(devices || [], push));
  } catch (e) {
    console.error(e);
    return json(500, { error: String(e) });
  }
});
