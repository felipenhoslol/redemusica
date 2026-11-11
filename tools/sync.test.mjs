// Guards ranking sync in js/sync.js against a fake Supabase: run with `node --test tools/sync.test.mjs`
import { test, after } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.window = globalThis;
globalThis.addEventListener ??= () => {};
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k), clear: () => store.clear(), key: () => null, length: 0 };
globalThis.sessionStorage = globalThis.localStorage;
globalThis.document = { visibilityState: 'hidden', addEventListener() {}, removeEventListener() {}, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] };
try { globalThis.navigator ??= {}; } catch {}

// Fake Supabase: every chain is thenable; `answer[table](calls)` decides what a finished query returns
const calls = [];
const answer = {};
const query = (table) => {
  const st = { table, ops: [] };
  const p = new Proxy(() => {}, {
    get(_, k) {
      if (k === 'then') return (res, rej) => { calls.push(st); return Promise.resolve(answer[table]?.(st) ?? { data: [], error: null }).then(res, rej); };
      return (...a) => { st.ops.push([k, a]); return p; };
    }
  });
  return p;
};
const db = { from: query, rpc: () => query('rpc'), channel: () => query('channel'), removeChannel() {}, storage: { from: () => query('storage') } };
globalThis.supabase = { createClient: () => db };

store.set('rmsn_active_v5', 'user_me');
store.set('rmsn_users_v5', JSON.stringify([{ id: 'user_me', name: 'eu', handle: '@eu' }, { id: 'u_ana', name: 'ana', handle: '@ana' }]));
store.set('rmsn_follows_v5', JSON.stringify({ user_me: ['u_ana'] }));

const Storage = await import('../js/storage.js');
const Sync = await import('../js/sync.js');
after(() => Sync.stopSync());

const album = { id: '1', title: 'Disco', artist: 'X', artwork: '', year: 2020 };
const item = (id, rating) => ({ id, title: 't' + id, kind: 'song', year: 2020, released: '2020-01-01', artwork: '', order: 1, rating });
const row = (user_id, key, rating, at) => ({ user_id, key, updated_at: at,
  body: { key, mode: 'album', subject: album, items: [item('s1', rating)], updatedAt: at } });
const tick = () => new Promise(r => setTimeout(r, 20));
const errors = [];
const ops = (table, op) => calls.filter(c => c.table === table && c.ops.some(([k]) => k === op));

test('pull brings friends\' rankings from the rankings table', async () => {
  answer.star_rankings = () => ({ data: [row('u_ana', 'album:1', 4, '2026-10-01T00:00:00Z')], error: null });
  await Sync.startSync('user_me', { onError: m => errors.push(m) });
  const sel = ops('star_rankings', 'select').at(-1);
  assert.deepEqual(sel.ops.find(([k]) => k === 'in')[1], ['user_id', ['user_me', 'u_ana']]);
  assert.equal(Storage.getRanking('album:1', 'u_ana').items[0].rating, 4);
});

test('a save goes up as an upsert of the ranking body', async () => {
  Storage.setRankingRating('album', album, item('s1'), 3);
  await tick();
  const up = ops('star_rankings', 'upsert').at(-1);
  const [payload, opts] = up.ops.find(([k]) => k === 'upsert')[1];
  assert.equal(payload.key, 'album:1');
  assert.equal(payload.user_id, 'user_me');
  assert.equal(payload.body.items[0].rating, 3);
  assert.equal(payload.updated_at, payload.body.updatedAt);
  assert.equal(opts.onConflict, 'user_id,key');
});

test('a pull while my delete is still on its way does not bring the ranking back', async () => {
  let release;
  answer.star_rankings = (st) => (st.ops.some(([k]) => k === 'delete')
    ? new Promise(r => { release = () => r({ data: null, error: null }); })
    : { data: [row('user_me', 'album:1', 3, '2026-10-19T00:00:00Z')], error: null });
  Storage.setRankingRating('album', album, item('s1'), 0); // empties it → deleteRanking
  assert.equal(Storage.getRanking('album:1'), null);
  await tick();
  await Sync.pullNow();
  assert.equal(Storage.getRanking('album:1'), null);
  release();
  await tick();
  assert.equal(ops('star_rankings', 'delete').length, 1);
});

test('deleteRanking removes it, sends the delete (a pull meanwhile cannot bring it back) and posts keep their snapshot', async () => {
  const other = { ...album, id: '5' };
  Storage.setRankingRating('album', other, item('s1'), 4);
  const post = Storage.createPost({ text: '', ranking: Storage.getRanking('album:5') });
  await tick();
  let release;
  answer.star_rankings = (st) => (st.ops.some(([k]) => k === 'delete')
    ? new Promise(r => { release = () => r({ data: null, error: null }); })
    : { data: [{ ...row('user_me', 'album:5', 4, '2026-10-19T00:00:00Z') }], error: null });
  const deletesBefore = ops('star_rankings', 'delete').length;
  assert.equal(Storage.deleteRanking('album:5'), true);
  assert.ok(!Storage.getUserRankings().some(r => r.key === 'album:5'));
  await tick();
  await Sync.pullNow();
  assert.equal(Storage.getRanking('album:5'), null);
  release();
  await tick();
  const del = ops('star_rankings', 'delete').slice(deletesBefore);
  assert.equal(del.length, 1);
  assert.ok(del[0].ops.some(([k, a]) => k === 'eq' && a[0] === 'key' && a[1] === 'album:5'));
  const kept = Storage.getPostById(post.id);
  assert.equal(kept.ranking.key, 'album:5');
  assert.equal(kept.ranking.items[0].rating, 4);
  assert.equal(Storage.deleteRanking('album:5'), false); // already gone: nothing sent
});

test('without the rankings table: no error toast, writes skipped, local ranking kept', async () => {
  answer.star_rankings = () => ({ data: null, error: { code: 'PGRST205', message: 'Could not find the table public.star_rankings' } });
  await Sync.pullNow();
  const before = calls.length;
  assert.ok(Storage.setRankingRating('album', album, item('s2'), 5));
  await tick();
  assert.equal(calls.slice(before).filter(c => c.table === 'star_rankings').length, 0);
  assert.equal(Storage.getRanking('album:1').items[0].rating, 5);
  assert.deepEqual(errors, []);
});

test('a post carries its ranking snapshot in body.ranking', async () => {
  Storage.createPost({ text: '', ranking: Storage.getRanking('album:1') });
  await tick();
  const ins = ops('posts', 'insert').at(-1);
  assert.equal(ins.ops.find(([k]) => k === 'insert')[1][0].body.ranking.key, 'album:1');
});

// ─── failed writes revert (T5) ──────────────────────────────────────────────
const reverts = [];
const restart = () => Sync.startSync('user_me', {
  onError: m => errors.push(m),
  onRevert: e => { reverts.push(e); Storage.withoutRemote(() => {
    if (e.kind === 'like') Storage.toggleLikePost(e.key);
    if (e.kind === 'vote') Storage.votePoll(e.postId, e.prev);
  }); }
});
const seedPost = (extra = {}) => {
  const p = Storage.createPost({ text: 'oi', ...extra });
  Storage.replacePostsCache([{ ...Storage.getPostById(p.id), createdAtIso: '2026-11-11T00:00:00Z' }]);
  return p.id;
};
const offline = () => ({ data: null, error: { message: 'offline' } });

test('a failed like reverts once', async () => {
  answer.star_rankings = () => ({ data: [], error: null });
  await restart();
  const id = seedPost();
  await tick();
  answer.post_likes = offline;
  reverts.length = 0;
  const ups = ops('post_likes', 'upsert').length, errs = errors.length;
  Storage.toggleLikePost(id);
  await tick();
  assert.ok(!Storage.getPostById(id).likes.includes('user_me'));
  assert.deepEqual(reverts, [{ kind: 'like', key: id, on: true }]);
  assert.equal(ops('post_likes', 'upsert').length, ups + 1); // the revert did not go to the server
  assert.equal(errors.length, errs + 1);
  delete answer.post_likes;
});

test('like→unlike→like with the middle failing reverts nothing stale', async () => {
  const id = seedPost();
  await tick();
  reverts.length = 0;
  answer.post_likes = st => (st.ops.some(([k]) => k === 'delete') ? offline() : { data: null, error: null });
  Storage.toggleLikePost(id); Storage.toggleLikePost(id); Storage.toggleLikePost(id);
  await tick(); await tick();
  assert.deepEqual(reverts, []);
  assert.ok(Storage.getPostById(id).likes.includes('user_me'));
  delete answer.post_likes;
});

test('likeComment and vote go through tracked', async () => {
  const id = seedPost({ poll: { options: [{ title: 'a' }, { title: 'b' }] } });
  Storage.addCommentToPost(id, 'c');
  const cid = Storage.getPostById(id).comments.at(-1).id;
  await tick();
  for (const [table, act] of [['comment_likes', () => Storage.toggleLikeComment(id, cid)], ['post_votes', o => Storage.votePoll(id, o)]]) {
    const log = [];
    let release;
    answer[table] = st => { log.push('start'); return new Promise(r => { release = () => { log.push('end'); r({ data: null, error: null }); }; }); };
    act(0); act(1);
    await tick();
    assert.deepEqual(log, ['start']); // the second waits for the first
    release(); await tick();
    assert.deepEqual(log, ['start', 'end', 'start']);
    release(); await tick();
    delete answer[table];
  }
});

test('a failed vote restores the previous option', async () => {
  const id = seedPost({ poll: { options: [{ title: 'a' }, { title: 'b' }] } });
  Storage.votePoll(id, 0);
  await tick();
  reverts.length = 0;
  answer.post_votes = offline;
  Storage.votePoll(id, 1);
  await tick();
  assert.deepEqual(reverts, [{ kind: 'vote', key: id, postId: id, on: 1, prev: 0 }]);
  assert.equal(Storage.getPostById(id).votes.user_me, 0);
  delete answer.post_votes;
});
