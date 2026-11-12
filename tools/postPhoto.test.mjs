// Guards the post photo box (js/feed.js) and its width/height through sync (js/sync.js):
// run with `node --test tools/postPhoto.test.mjs`
import { test, after } from 'node:test';
import assert from 'node:assert/strict';

// Bare-minimum browser stand-ins so feed.js and sync.js can load in Node
const store = new Map();
const el = () => ({
  innerHTML: '', style: {}, value: '', dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
  addEventListener() {}, removeEventListener() {}, setAttribute() {}, getAttribute: () => null, removeAttribute() {},
  querySelector: () => el(), querySelectorAll: () => [], appendChild() {}, append() {}, remove() {}, focus() {},
  closest: () => null, contains: () => false, getBoundingClientRect: () => ({}),
});
globalThis.window = globalThis;
globalThis.addEventListener ??= () => {};
globalThis.location ??= { hash: '', pathname: '/', search: '', origin: 'http://localhost', href: 'http://localhost/' };
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k), clear: () => store.clear(), key: () => null, length: 0 };
globalThis.sessionStorage = globalThis.localStorage;
globalThis.document = {
  visibilityState: 'hidden', getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
  createElement: el, addEventListener() {}, removeEventListener() {}, body: el(), head: el(), documentElement: el(), activeElement: null,
};
globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
globalThis.IntersectionObserver = globalThis.MutationObserver = globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
globalThis.requestAnimationFrame = fn => setTimeout(fn, 0);
globalThis.Audio = class { addEventListener() {} pause() {} play() { return Promise.resolve(); } };
try { globalThis.navigator ??= {}; } catch {}

// Fake Supabase (as in sync.test.mjs): `answer[table](st)` decides what a finished query returns
const answer = {};
const query = (table) => {
  const st = { table, ops: [] };
  const p = new Proxy(() => {}, {
    get(_, k) {
      if (k === 'then') return (res, rej) => Promise.resolve(answer[table]?.(st) ?? { data: [], error: null }).then(res, rej);
      return (...a) => { st.ops.push([k, a]); return p; };
    }
  });
  return p;
};
const db = { from: query, rpc: () => query('rpc'), channel: () => query('channel'), removeChannel() {}, storage: { from: () => query('storage') } };
globalThis.supabase = { createClient: () => db };
store.set('rmsn_active_v5', 'user_me');
store.set('rmsn_users_v5', JSON.stringify([{ id: 'user_me', name: 'eu', handle: '@eu' }]));

const { postPhotoStyle } = await import('../js/feed.js');
const Sync = await import('../js/sync.js');
after(() => Sync.stopSync());

test('postPhotoStyle: a caixa segue o formato da foto e estreita até caber na altura máxima', () => {
  assert.equal(postPhotoStyle({ width: 900, height: 1600 }),
    'aspect-ratio: 900 / 1600; width: min(100%, calc(var(--post-photo-max) * 900 / 1600)); min-height: 0');
  assert.match(postPhotoStyle({ width: 1600, height: 900 }), /^aspect-ratio: 1600 \/ 900;/);
});

test('postPhotoStyle: foto mais alta que 1:2 fica numa caixa 1:2 (contida, sem cortar)', () => {
  assert.match(postPhotoStyle({ width: 600, height: 1800 }), /^aspect-ratio: 1 \/ 2; width: min\(100%, calc\(var\(--post-photo-max\) \* 1 \/ 2\)\)/);
});

test('postPhotoStyle: sem dimensões (posts antigos) deixa a caixa 4:3 do CSS', () => {
  assert.equal(postPhotoStyle({}), '');
  assert.equal(postPhotoStyle({ width: 800 }), '');
  assert.equal(postPhotoStyle({ width: 0, height: 600 }), '');
});

test('sync: largura/altura vão no corpo do post e voltam na leitura', () => {
  const body = Sync.toBody({ text: 'oi', imageUrl: 'https://x/a.jpg', width: 900, height: 1600 });
  assert.equal(body.width, 900);
  assert.equal(body.height, 1600);
  const post = Sync.fromRow({ id: 'p1', author_id: 'user_me', created_at: '2026-11-12T00:00:00Z', body });
  assert.equal(post.width, 900);
  assert.equal(post.height, 1600);
});

test('sync: post sem dimensões (ou com lixo) não ganha width/height', () => {
  const body = Sync.toBody({ text: 'oi' });
  assert.equal('width' in body, false);
  const post = Sync.fromRow({ id: 'p2', author_id: 'user_me', created_at: '2026-11-12T00:00:00Z', body: { width: 'x', height: -3 } });
  assert.equal('width' in post, false);
});

test('sync: a consulta leve do feed pede width/height e o post chega com eles', async () => {
  let select = '';
  answer.posts = (st) => {
    const sel = st.ops.find(([k]) => k === 'select')?.[1][0] || '';
    if (sel.includes('author_id')) {
      select = sel;
      return { data: [{ id: 'p3', author_id: 'user_me', edited: false, created_at: '2026-11-12T00:00:00Z', text: 'foto',
        width: 1200, height: 1200, post_likes: [], post_reposts: [], post_comments: [] }], error: null };
    }
    return { data: sel.includes('url:body->>imageUrl') ? [{ id: 'p3', url: 'https://x/q.jpg' }] : [], error: null };
  };
  await Sync.startSync('user_me', {});
  const post = await Sync.fetchPostById('p3');
  assert.match(select, /width:body->width, height:body->height/);
  assert.equal(post.width, 1200);
  assert.equal(post.height, 1200);
  assert.equal(post.imageUrl, 'https://x/q.jpg');
});
