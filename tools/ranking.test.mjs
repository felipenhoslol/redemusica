// Guards the star-ranking logic in js/ranking.js: run with node --test tools/ranking.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { editionBase, dedupeReleases, groupReleases, rankItems, cleanRanking, snapshotRanking, rankingKey } from '../js/ranking.js';

const al = (id, title, released, kind = 'album') => ({ id, title, kind, artist: 'X', artwork: `https://a/${id}.jpg`, year: Number(released.slice(0, 4)), released });

test('editionBase strips edition suffixes only', () => {
  assert.equal(editionBase('1989 (Deluxe Edition)'), editionBase('1989'));
  assert.equal(editionBase('Abbey Road (Super Deluxe Edition)'), editionBase('Abbey Road'));
  assert.equal(editionBase('Rumours (Remastered)'), editionBase('Rumours'));
  assert.equal(editionBase('Disintegration (Expanded)'), editionBase('Disintegration'));
  assert.equal(editionBase('Acabou Chorare (Edição Especial)'), editionBase('Acabou Chorare'));
  assert.notEqual(editionBase("Fearless (Taylor's Version)"), editionBase('Fearless'));
  assert.notEqual(editionBase('MTV Unplugged in New York (Live)'), editionBase('MTV Unplugged in New York'));
  assert.notEqual(editionBase('Rumours (Live 40th Anniversary)'), editionBase('Rumours'));
  assert.notEqual(editionBase('Acabou Chorare (Ao Vivo - Edição Especial)'), editionBase('Acabou Chorare'));
});

test('dedupeReleases keeps the original version once', () => {
  const out = dedupeReleases([al('2', '1989 (Deluxe Edition)', '2014-10-27'), al('1', '1989', '2014-10-27'),
    al('3', '1989 (Taylor\'s Version)', '2023-10-27'), al('4', 'Rumours (Remastered)', '2004-01-01'), al('5', 'Rumours', '1977-02-04')]);
  assert.deepEqual(out.map(a => a.id).sort(), ['1', '3', '5']);
});

test('dedupeReleases keeps a single and an album with the same name apart', () => {
  assert.equal(dedupeReleases([al('1', 'Lover', '2019-08-23'), al('2', 'Lover', '2019-08-16', 'single')]).length, 2);
});

test('groupReleases splits albums, EPs and singles, newest first', () => {
  const g = groupReleases([al('1', 'A', '2001-01-01'), al('2', 'B', '2010-01-01'), al('3', 'C', '2005-01-01', 'ep'), al('4', 'D', '2003-01-01', 'single')]);
  assert.deepEqual([g.albums.map(a => a.id), g.eps.map(a => a.id), g.singles.map(a => a.id)], [['2', '1'], ['3'], ['4']]);
});

test('rankItems orders by stars, newer release breaks artist ties, disc order breaks album ties', () => {
  const it = (id, rating, released, order = 0) => ({ id, title: id, kind: 'album', year: '', released, artwork: '', order, rating });
  assert.deepEqual(rankItems([it('old', 5, '2001-01-01'), it('new', 5, '2020-01-01'), it('mid', 4.5, '2010-01-01'), it('none', 0, '2022-01-01')], 'artist').map(i => i.id), ['new', 'old', 'mid']);
  assert.deepEqual(rankItems([it('t3', 4, '', 3), it('t1', 4, '', 1), it('t2', 5, '', 2)], 'album').map(i => i.id), ['t2', 't1', 't3']);
  assert.equal(rankItems([it('a', 4, ''), it('a', 3, '')], 'artist').length, 1); // never twice
});

test('cleanRanking drops junk from untrusted rows', () => {
  assert.equal(cleanRanking('x'), null);
  assert.equal(cleanRanking({ mode: 'playlist', key: 'p:1', subject: {}, items: [] }), null);
  const r = cleanRanking({ key: 'artist:1', mode: 'artist', subject: { id: '1', title: 'X', artwork: 'javascript:alert(1)' },
    items: [{ id: 'a', title: 'A', rating: '9' }, { id: 'b', title: 'B', rating: 3.3 }, { id: 'c', rating: 4, artwork: 'https://ok/c.jpg' },
      ...Array.from({ length: 5000 }, (_, i) => ({ id: 'z' + i, rating: 1 }))] });
  assert.equal(r.subject.artwork, '');
  assert.deepEqual(r.items.map(i => [i.id, i.rating]).slice(0, 3), [['a', 5], ['b', 3.5], ['c', 4]]);
  assert.equal(r.items.length, 300);
});

test('cleanRanking clamps ratings to 1..5 in half steps and drops unrated items', () => {
  const r = cleanRanking({ key: 'album:2', mode: 'album', subject: { id: '2' }, items: [{ id: 'a', rating: 0.5 }, { id: 'b', rating: 'x' }, { id: 'c', rating: 0 }, { id: 'd', rating: null }, { id: 'e' }] });
  assert.deepEqual(r.items.map(i => [i.id, i.rating]), [['a', 1]]);
});

test('snapshotRanking is a ranked copy that later edits cannot touch', () => {
  const live = { key: rankingKey('album', '9'), mode: 'album', subject: { id: '9', title: 'S', artist: 'X', artwork: '', year: 2000 },
    items: [{ id: 't1', title: 'T1', kind: 'track', year: '', released: '', artwork: '', order: 1, rating: 3 }], updatedAt: '2026-10-20T00:00:00Z' };
  const snap = snapshotRanking(live);
  live.items[0].rating = 1;
  assert.equal(snap.items[0].rating, 3);
  assert.equal(snap.key, 'album:9');
});

test('snapshotRanking caps items', () => {
  const items = Array.from({ length: 400 }, (_, i) => ({ id: String(i), title: 't', kind: 'single', year: '', released: '', artwork: '', order: 0, rating: 3 }));
  assert.equal(snapshotRanking({ key: 'artist:1', mode: 'artist', subject: { id: '1', title: 'X' }, items }).items.length, 300);
});
