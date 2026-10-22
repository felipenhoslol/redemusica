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

test('opening a modal moves it to the end of body, so it shows above a dialog opened before it (post view)', () => {
  const added = [];
  const modal = { ...el(), classList: { add: c => added.push(c), remove() {}, toggle() {}, contains: () => false } };
  byId.set('comment-image-modal', modal);
  const appended = [];
  const orig = document.body.appendChild;
  document.body.appendChild = n => appended.push(n);
  try { window.openDoodleModal('comment-image-modal'); } finally { document.body.appendChild = orig; }
  assert.deepEqual(appended, [modal]);
  assert.deepEqual(added, ['active']);
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

test('tapping a ranking card does not open the post', async () => {
  const { POST_TAP_IGNORE } = await import('../js/feed.js');
  assert.match(POST_TAP_IGNORE, /\.post-ranking/);
});

const rankingUi = await import('../js/rankingUi.js'); // real import: node --check misses broken modules

test('tapping the same star value again clears the rating', () => {
  assert.equal(rankingUi.rateFromStarTap(3.5, 3.5), 0);
  assert.equal(rankingUi.rateFromStarTap(3.5, 4), 4);
});

test('posting an empty ranking is refused', () => {
  assert.equal(rankingUi.postRanking('artist:nobody'), null);
});

test('posting locks Postar ("Postado") until the ranking gets a new rating', async () => {
  const subject = { id: 'dup', title: 'Disco Duplo' };
  const t = { id: 'd1', title: 'Faixa', kind: 'track', order: 1 };
  storage.setRankingRating('album', subject, t, 4);
  const btn = { disabled: false, textContent: 'Postar no feed' };
  window._rankPostSaved('album:dup', btn);
  assert.deepEqual([btn.disabled, btn.textContent], [true, 'Postado']);
  assert.equal(rankingUi.postRanking('album:dup'), null); // a second tap cannot post again
  await new Promise(r => setTimeout(r, 5)); // a new updatedAt
  storage.setRankingRating('album', subject, t, 3);
  assert.equal(rankingUi.isPosted('album:dup'), false);
  assert.ok(rankingUi.postRanking('album:dup'));
});

test('opening the ranking pill keeps the active question challenge', () => {
  const before = storage.getActiveChallengeId();
  const box = { innerHTML: '' };
  ui.renderChallengePills(box, () => {});
  assert.match(box.innerHTML, /Ranking por estrelas/);
  window._switchChallenge(rankingUi.RANKING_CHALLENGE_ID);
  assert.equal(storage.getActiveChallengeId(), before);
});

test('the ranking area lists my rankings and the ones from people I follow', () => {
  storage.mergeRemoteRankings([{ user_id: 'u_ana', key: 'album:7', updated_at: '2026-10-19T00:00:00Z',
    body: { key: 'album:7', mode: 'album', subject: { id: '7', title: 'Disco da Ana' }, items: [{ id: 'z', title: 'Faixa', rating: 4 }] } }], ['u_ana']);
  const box = { innerHTML: '', querySelector: () => null, querySelectorAll: () => [] };
  rankingUi.renderRankingChallenge(box);
  assert.match(box.innerHTML, /Meus rankings/);
  assert.match(box.innerHTML, /Amigos/);
  assert.match(box.innerHTML, /ana/);
  assert.match(box.innerHTML, /Disco da Ana/);
});

test('a saved ranking without items still renders in "Meus rankings"', () => {
  const all = JSON.parse(store.get('rmsn_rankings_v1') || '{}');
  all.user_me = { ...all.user_me, 'artist:quebrado': { key: 'artist:quebrado', mode: 'artist', subject: { id: 'quebrado', title: 'Sem Itens' } } };
  store.set('rmsn_rankings_v1', JSON.stringify(all));
  // Any ranking write re-reads storage and drops the parsed cache
  storage.setRankingRating('album', { id: 'tmp' }, { id: 'x', title: 'x' }, 1);
  storage.setRankingRating('album', { id: 'tmp' }, { id: 'x', title: 'x' }, 0);
  const box = { innerHTML: '', querySelector: () => null, querySelectorAll: () => [] };
  rankingUi.renderRankingChallenge(box);
  assert.match(box.innerHTML, /Sem Itens/);
  assert.match(box.innerHTML, /0 com nota/);
});

test('opening the full ranking of a post that cannot be fetched shows an error toast', async () => {
  const toasts = [];
  byId.set('toast-container', { appendChild: t => toasts.push(t.textContent) });
  await window._openRankingView('post-que-nao-existe');
  byId.delete('toast-container');
  assert.deepEqual(toasts, ['Não foi possível abrir o ranking.']);
});

test('"Apagar" in Meus rankings asks first, then deletes only my saved ranking', () => {
  storage.setRankingRating('album', { id: 'del', title: 'Disco Apagável' }, { id: 'f1', title: 'Faixa' }, 4);
  const box = { innerHTML: '', querySelector: () => null, querySelectorAll: () => [] };
  rankingUi.renderRankingChallenge(box);
  assert.match(box.innerHTML, /aria-label="Apagar o ranking de Disco Apagável"/);
  const asked = [];
  globalThis.confirm = (msg) => { asked.push(msg); return false; };
  window._rankDelete('album:del', null);
  assert.ok(storage.getRanking('album:del'));
  globalThis.confirm = () => true;
  window._rankDelete('album:del', null);
  assert.equal(storage.getRanking('album:del'), null);
  assert.match(asked[0], /Apagar o ranking de Disco Apagável\? Os posts que você já publicou continuam no feed\./);
});

// ── Album search in the ranking area: a fake DOM just big enough for the pick box
function rankingArea() {
  const list = { innerHTML: '', hidden: false, querySelectorAll: () => [],
    insertAdjacentHTML(_, html) { this.innerHTML += html; },
    querySelector(sel) { return sel === '.rk-more-row' && this.innerHTML.includes('rk-more-row') ? { remove: () => { list.innerHTML = list.innerHTML.replace(/<li class="rk-more-row">[\s\S]*?<\/li>/, ''); } } : null; } };
  const disco = { innerHTML: '', hidden: true, setAttribute() {}, querySelector: () => null };
  const bar = { hidden: false };
  const host = { innerHTML: '' };
  const input = { value: '', focus() {}, setAttribute() {} };
  const parts = { '.search-bar': bar, '.rk-results': list, '.rk-disco': disco };
  const pick = { hidden: true, querySelector: sel => parts[sel] };
  const box = { innerHTML: '', querySelectorAll: () => [],
    querySelector: sel => ({ '.rk-pick': pick, '.rk-results': list, '.rk-disco': disco, '.rk-editor-host': host,
      '.rk-pick-input': input })[sel] ?? null };
  return { box, list, disco, bar, host, input };
}

const rows = (html) => (html.match(/data-flip-key="r\d+"/g) || []).length;
const settle = () => new Promise(r => setTimeout(r, 400));
const json = (results) => ({ ok: true, text: async () => JSON.stringify({ results }) });
const col = (id, name, extra = {}) => ({ wrapperType: 'collection', collectionId: id, collectionName: name, artistId: 9, artistName: 'Pink Floyd', releaseDate: '1975-01-01T00:00:00Z', ...extra });

test('album search: "Ver mais" shows 20 more each tap from the same results, then goes away', async () => {
  const urls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    urls.push(url);
    return json(url.includes('entity=album') ? Array.from({ length: 45 }, (_, i) => col(100 + i, `Disco ${i}`, { artistName: `Banda ${i}` }))
      : url.includes('entity=musicArtist') ? [{ artistId: 9, artistName: 'Pink Floyd' }] : []);
  };
  try {
    const { box, list } = rankingArea();
    rankingUi.renderRankingChallenge(box);
    window._rankPick('album', null);
    window._rankSearch('pink floyd');
    await settle();
    assert.equal(rows(list.innerHTML), 20);
    assert.match(list.innerHTML, /Ver discografia/);
    assert.match(list.innerHTML, />Ver mais</);
    const asked = urls.length;
    window._rankMore(null);
    assert.equal(rows(list.innerHTML), 40);
    window._rankMore(null);
    assert.equal(rows(list.innerHTML), 45);
    assert.doesNotMatch(list.innerHTML, /Ver mais/);
    assert.equal(urls.length, asked); // paging never asks iTunes again
  } finally { globalThis.fetch = realFetch; }
});

test('album search → artist discography: covers without stars, Voltar keeps the results, a cover opens the album editor', async () => {
  const urls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    urls.push(url);
    if (url.includes('lookup?id=9&entity=album')) return json([{ wrapperType: 'artist', artistId: 9 }, col(1, 'Wish You Were Here'),
      col(2, 'Wish You Were Here (Deluxe Edition)', { releaseDate: '2011-01-01T00:00:00Z' }), col(3, 'Have a Cigar - Single')]);
    if (url.includes('lookup?id=1&entity=song')) return json([col(1, 'Wish You Were Here'), { wrapperType: 'track', trackId: 11, trackName: 'Shine On', collectionId: 1, artistName: 'Pink Floyd', trackNumber: 1, discNumber: 1 }]);
    return json(url.includes('entity=musicArtist') ? [{ artistId: 9, artistName: 'Pink Floyd' }] : []);
  };
  try {
    const { box, list, disco, bar, host, input } = rankingArea();
    rankingUi.renderRankingChallenge(box);
    window._rankPick('album', null);
    input.value = 'pink floyd';
    window._rankSearch(input.value);
    await settle();
    const results = list.innerHTML;
    await window._rankDisco(null);
    assert.equal(disco.hidden, false);
    assert.equal(bar.hidden, true);
    assert.equal((disco.innerHTML.match(/rk-cell-pick/g) || []).length, 1); // the deluxe edition is the same album
    assert.match(disco.innerHTML, /Wish You Were Here/);
    assert.doesNotMatch(disco.innerHTML, /rk-stars|rk-half|_rankStar/);
    assert.match(disco.innerHTML, />Voltar</);
    window._rankDiscoBack(null);
    assert.equal(disco.hidden, true);
    assert.equal(list.innerHTML, results);
    await window._rankDisco(null);
    window._rankDiscoPick(0, null);
    assert.match(box.innerHTML, /rk-editor-host/);
    await settle();
    assert.ok(urls.some(u => u.includes('lookup?id=1&entity=song')));
    assert.match(host.innerHTML, /data-mode="album"/);
  } finally { globalThis.fetch = realFetch; }
});

test('discography opened before the typed search ran: Voltar runs the search for what is in the box', async () => {
  const urls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => (urls.push(url), json(url.includes('lookup?id=9&entity=album') ? [col(1, 'Animals')]
    : url.includes('entity=musicArtist') ? [{ artistId: 9, artistName: 'Pink Floyd' }] : []));
  try {
    const { box, list, input } = rankingArea();
    rankingUi.renderRankingChallenge(box);
    window._rankPick('album', null);
    input.value = 'pink floyd';
    window._rankSearch(input.value);
    await settle();
    assert.match(list.innerHTML, /Ver discografia/);
    input.value = 'wish you were here';
    window._rankSearch(input.value); // still in the 300ms debounce when the artist row is tapped
    await window._rankDisco(null);
    window._rankDiscoBack(null);
    await settle();
    assert.ok(urls.some(u => u.includes('wish')));
    assert.doesNotMatch(list.innerHTML, /Ver discografia/); // results now belong to "wish you were here"
  } finally { globalThis.fetch = realFetch; }
});

test('switched to Artista, then opened the old album search discography: Voltar runs the artist search', async () => {
  const urls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => (urls.push(url), json(url.includes('lookup?id=9&entity=album') ? [col(1, 'Animals')]
    : url.includes('entity=musicArtist') ? [{ artistId: 9, artistName: 'Pink Floyd', primaryGenreName: 'Rock' }] : []));
  try {
    const { box, list, input } = rankingArea();
    rankingUi.renderRankingChallenge(box);
    window._rankPick('album', null);
    input.value = 'pink floyd';
    window._rankSearch(input.value);
    await settle();
    window._rankPick('artist', null); // the album rows and artist row stay on screen during the debounce
    await window._rankDisco(null);
    const asked = urls.length;
    window._rankDiscoBack(null);
    await settle();
    assert.ok(urls.slice(asked).some(u => u.includes('entity=musicArtist')));
    assert.doesNotMatch(list.innerHTML, /Ver discografia/);
    assert.equal(rows(list.innerHTML), 1);
    assert.match(list.innerHTML, /Pink Floyd/);
  } finally { globalThis.fetch = realFetch; }
});
