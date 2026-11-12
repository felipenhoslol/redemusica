// Guards js/feedBuffer.js (the "novos posts" pill): run with `node --test tools/feedBuffer.test.mjs`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sortNewest, applyCut, getCut, setCut, clearCut, remember } from '../js/feedBuffer.js';

const at = (min) => new Date(Date.UTC(2026, 10, 12, 12, min)).toISOString();
const post = (id, min, extra = {}) => ({ id, createdAtIso: at(min), ...extra });
const ids = (list) => list.map(p => p.id);

test('sortNewest puts the newest first, whatever order the posts came in', () => {
  const sorted = sortNewest([post('old', 1), post('new', 30), post('mid', 10)]);
  assert.deepEqual(ids(sorted), ['new', 'mid', 'old']);
});

test('sortNewest: a post written here without a server time sorts by the time in its id', () => {
  const mine = { id: `post_${Date.parse(at(20))}_ab12`, createdAt: 'agora mesmo' };
  assert.deepEqual(ids(sortNewest([post('a', 10), mine, post('b', 30)])), ['b', mine.id, 'a']);
});

test('applyCut: a newer post waits in the buffer; an older one not on screen falls in below', () => {
  const a = post('a', 20), b = post('b', 10), c = post('c', 30), d = post('d', 5);
  const cut = { shownIds: new Set(['a', 'b']), firstVisibleId: 'a' };
  const { visible, buffered } = applyCut(sortNewest([a, b, c, d]), cut);
  assert.deepEqual(ids(visible), ['a', 'b', 'd']);
  assert.deepEqual(ids(buffered), ['c']);
});

test('applyCut: no cut shows everything', () => {
  const posts = [post('a', 2), post('b', 1)];
  assert.deepEqual(applyCut(posts, null), { visible: posts, buffered: [] });
});

test('applyCut (Seguindo): a repost of an old post that sorts above the first visible item waits too', () => {
  // Scrolled to b; the repost r is not on screen and lands above b in the sorted list
  const a = post('a', 30), b = post('b', 10), r = post('r', 20, { isRepost: true });
  const cut = { shownIds: new Set(['a', 'b']), firstVisibleId: 'b' };
  const { visible, buffered } = applyCut(sortNewest([a, b, r]), cut);
  assert.deepEqual(ids(buffered), ['r']);
  assert.deepEqual(ids(visible), ['a', 'b']);
});

test('a post on screen that was deleted meanwhile stays (its last drawn copy) until the cut is cleared', () => {
  const a = post('a', 20, { text: 'drawn' }), b = post('b', 10);
  remember('all', [a, b]);
  setCut('all', { shownIds: new Set(['a', 'b']), firstVisibleId: 'a' });
  const { visible } = applyCut([b], getCut('all')); // a was deleted on the server
  assert.deepEqual(ids(visible), ['a', 'b']);
  assert.equal(visible[0].text, 'drawn');
  clearCut('all');
  assert.deepEqual(ids(applyCut([b], getCut('all')).visible), ['b']);
});

test('clearCut clears only its own filter', () => {
  setCut('all', { shownIds: new Set(['a']), firstVisibleId: 'a' });
  setCut('following', { shownIds: new Set(['b']), firstVisibleId: 'b' });
  clearCut('all');
  assert.equal(getCut('all'), null);
  assert.equal(getCut('following').firstVisibleId, 'b');
  clearCut('following');
});
