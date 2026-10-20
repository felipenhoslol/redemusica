// Guards Comparar and the profile vitrine in js/ui.js + js/profile.js: run with `node --test tools/ui.test.mjs`
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Bare-minimum browser stand-ins so ui.js can load in Node
const store = new Map();
const el = () => ({
  innerHTML: '', style: {}, value: '', dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
  addEventListener() {}, removeEventListener() {}, setAttribute() {}, getAttribute: () => null, removeAttribute() {},
  querySelector: () => el(), querySelectorAll: () => [], appendChild() {}, append() {}, remove() {}, focus() {},
  closest: () => null, contains: () => false, getBoundingClientRect: () => ({}),
});
const byId = new Map();
globalThis.window = globalThis;
globalThis.addEventListener ??= () => {};
globalThis.location ??= { hash: '', pathname: '/', search: '', origin: 'http://localhost', href: 'http://localhost/' };
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k), clear: () => store.clear(), key: () => null, length: 0 };
globalThis.sessionStorage = globalThis.localStorage;
globalThis.document = {
  getElementById: id => byId.get(id) ?? null, querySelector: () => null, querySelectorAll: () => [],
  createElement: el, createRange: () => ({ selectNodeContents() {}, createContextualFragment: () => el(), getBoundingClientRect: () => ({}), getClientRects: () => [] }), addEventListener() {}, body: el(), head: el(), documentElement: el(), activeElement: null,
};
globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
globalThis.IntersectionObserver = globalThis.MutationObserver = globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
globalThis.requestAnimationFrame = fn => setTimeout(fn, 0);
globalThis.Audio = class { addEventListener() {} pause() {} play() { return Promise.resolve(); } };
try { globalThis.navigator ??= {}; } catch {}

// Me + two people I follow (seeded before storage.js caches anything)
const people = ['ana', 'bia'].map(n => ({ id: `u_${n}`, name: n, handle: `@${n}` }));
store.set('rmsn_active_v5', 'user_me');
store.set('rmsn_users_v5', JSON.stringify([{ id: 'user_me', name: 'eu', handle: '@eu',
  songShowcase: [{ id: 't1', title: 'Song Vitrine', artist: 'Artista', artwork: '' }] }, ...people]));
store.set('rmsn_follows_v5', JSON.stringify({ user_me: people.map(u => u.id) }));

const storage = await import('../js/storage.js');
const ui = await import('../js/ui.js');
const profile = await import('../js/profile.js');

test('rating a song in Comparar keeps the person you were comparing with', () => {
  const cid = storage.getAllChallenges()[0].id;
  const qid = storage.getAllChallenges()[0].questions[0].id;

  const container = el();
  byId.set('compare-view-content', container);
  byId.set('review-modal', el());
  ui.renderCompareView(container);
  window._setCompareUser('u_bia');
  assert.match(container.innerHTML, /compare-user-card selected[^>]*_setCompareUser\('u_bia'\)/);

  window._openReview('u_bia', cid, qid);
  window._setReviewRating?.(4);
  window._submitReview('u_bia', cid, qid);

  assert.match(container.innerHTML, /compare-user-card selected[^>]*_setCompareUser\('u_bia'\)/);
});

test('my profile shows the song showcase (vitrine) with my picks', () => {
  const container = el();
  profile.renderProfileView(container, 'user_me');
  assert.match(container.innerHTML, /Vitrine/);
  assert.match(container.innerHTML, /Song Vitrine/);
});

test('someone with an empty showcase shows no vitrine', () => {
  const container = el();
  profile.renderProfileView(container, 'u_ana');
  assert.doesNotMatch(container.innerHTML, /Vitrine/);
});

test('rating a release saves my ranking, and clearing the last one removes it', () => {
  const subject = { id: '1', title: 'Daft Punk', artist: 'Daft Punk', artwork: '', year: '' };
  const item = { id: 'd1', title: 'Discovery', kind: 'album', year: 2001, released: '2001-03-12', artwork: '', order: 0 };
  storage.setRankingRating('artist', subject, item, 4.5);
  assert.equal(storage.getRanking('artist:1').items[0].rating, 4.5);
  storage.setRankingRating('artist', subject, item, 0);
  assert.equal(storage.getRanking('artist:1'), null);
});

test('a post keeps the ranking as it was when posted', () => {
  const subject = { id: '2', title: 'Discovery', artist: 'Daft Punk', artwork: '', year: 2001 };
  const t = { id: 't1', title: 'One More Time', kind: 'track', year: '', released: '', artwork: '', order: 1 };
  storage.setRankingRating('album', subject, t, 5);
  const post = storage.createPost({ ranking: storage.getRanking('album:2') });
  storage.setRankingRating('album', subject, t, 2);
  assert.equal(storage.getPostById(post.id).ranking.items[0].rating, 5);
});

test('friends rankings come only from people I follow', () => {
  storage.mergeRemoteRankings([
    { user_id: 'u_ana', key: 'album:3', body: { key: 'album:3', mode: 'album', subject: { id: '3', title: 'A' }, items: [{ id: 'x', rating: 4 }] }, updated_at: '2026-10-19T00:00:00Z' },
    { user_id: 'u_stranger', key: 'album:4', body: { key: 'album:4', mode: 'album', subject: { id: '4', title: 'B' }, items: [{ id: 'y', rating: 4 }] }, updated_at: '2026-10-19T00:00:00Z' }
  ], ['u_ana', 'u_stranger']);
  assert.deepEqual(storage.getFriendsRankings().map(f => f.userId), ['u_ana']);
});

test('mergeRemoteRankings keeps my newer local ranking', () => {
  const me = storage.getActiveUserId();
  const subject = { id: '5', title: 'S', artist: 'X', artwork: '', year: '' };
  storage.setRankingRating('album', subject, { id: 'q', title: 'Q', kind: 'track', year: '', released: '', artwork: '', order: 1 }, 5);
  storage.mergeRemoteRankings([{ user_id: me, key: 'album:5', updated_at: '2000-01-01T00:00:00Z',
    body: { key: 'album:5', mode: 'album', subject: { id: '5', title: 'S' }, items: [{ id: 'q', rating: 1 }], updatedAt: '2000-01-01T00:00:00Z' } }], [me]);
  assert.equal(storage.getRanking('album:5').items[0].rating, 5);
});

test('mergeRemoteRankings keeps my local rankings missing from the server, and replaces friends wholesale', () => {
  const me = storage.getActiveUserId();
  storage.setRankingRating('album', { id: '6', title: 'L' }, { id: 'l1', title: 'L1', kind: 'track', order: 1 }, 3);
  storage.mergeRemoteRankings([], [me, 'u_ana']);
  assert.equal(storage.getRanking('album:6').items[0].rating, 3);
  assert.equal(storage.getRanking('album:3', 'u_ana'), null);
});
