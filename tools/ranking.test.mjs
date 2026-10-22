// Guards the star-ranking logic in js/ranking.js: run with node --test tools/ranking.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { editionBase, dedupeReleases, albumSearchResults, albumMatchScore, matchingArtist, groupReleases, rankItems, cleanRanking, snapshotRanking, rankingKey } from '../js/ranking.js';

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

// ── Feed card (js/rankingCard.js): motion.js needs window/matchMedia/document at load, so stub then import
globalThis.window = globalThis;
globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
globalThis.document ??= { createElement: () => ({}), head: { appendChild() {} }, getElementById: () => null };
const { rankingPostHtml, rankingSummaryHtml, averageLabel, podiumOrder } = await import('../js/rankingCard.js');

const snap = (mode, n) => ({ key: `${mode}:1`, mode, subject: { id: '1', title: 'Disco', artist: 'X', artwork: 'https://a/s.jpg', year: 2001 },
  items: Array.from({ length: n }, (_, i) => ({ id: `i${i}`, title: `Item ${i}`, kind: mode === 'album' ? 'track' : 'album', year: 2000 + i, released: '', artwork: `https://a/${i}.jpg`, order: i + 1, rating: 5 - i * 0.5 })) });

test('artist card: podium of 3, a row of the next 4 and the full count', () => {
  const html = rankingPostHtml({ id: 'p1', ranking: snap('artist', 9) });
  assert.equal((html.match(/class="ranking-podium-slot/g) || []).length, 3);
  assert.equal((html.match(/class="ranking-row-item/g) || []).length, 4);
  assert.match(html, /ver ranking completo \(9\)/);
});

test('album card: big cover and top 3 tracks, no row', () => {
  const html = rankingPostHtml({ id: 'p2', ranking: snap('album', 12) });
  assert.match(html, /ranking-album-cover/);
  assert.equal((html.match(/class="ranking-podium-slot/g) || []).length, 3);
  assert.doesNotMatch(html, /ranking-row-item/);
});

test('a ranking with one rated item still renders, without an empty podium slot', () => {
  assert.equal((rankingPostHtml({ id: 'p3', ranking: snap('artist', 1) }).match(/class="ranking-podium-slot/g) || []).length, 1);
});

test('every ranking post opens the full list: link always shown, the whole card is tappable', () => {
  for (const [mode, n] of [['artist', 1], ['artist', 3], ['album', 2], ['album', 9]]) {
    const html = rankingPostHtml({ id: 'px', ranking: snap(mode, n) });
    assert.ok(html.includes(`ver ranking completo (${n})`));
    assert.match(html, /class="post-ranking"[^>]*onclick="window\._openRankingView\(&quot;px&quot;\)"/);
    assert.equal((html.match(/_openRankingView/g) || []).length, 1); // the button bubbles: one open per tap
  }
});

test('a post without ranking renders nothing', () => assert.equal(rankingPostHtml({ id: 'p4' }), ''));

test('snapshot text is escaped and bad cover URLs are dropped', () => {
  const s = snap('artist', 2);
  s.items[0].title = '<img src=x onerror=alert(1)>';
  s.items[0].artwork = 'javascript:alert(1)';
  const html = rankingPostHtml({ id: 'p5', ranking: s });
  assert.doesNotMatch(html, /<img src=x/);
  assert.doesNotMatch(html, /javascript:/);
});

test('albumSearchResults: one edition per artist, other artists kept, singles last', () => {
  const r = (id, title, artist, released, kind = 'album') => ({ id, title, artist, kind, released });
  const out = albumSearchResults([
    r('1', 'Ok Computer', 'Lemaitre', '2020-01-01', 'single'),
    r('2', '1989 (Deluxe Edition)', 'Taylor Swift', '2014-11-03'), r('3', '1989', 'Taylor Swift', '2014-10-27'),
    r('4', '1989', 'Ryan Adams', '2015-09-21'), r('5', "1989 (Taylor's Version)", 'Taylor Swift', '2023-10-27')]);
  assert.deepEqual(out.map(a => a.id), ['3', '4', '5', '1']);
});

test('albumSearchResults with a query: title match first, editions merged, then albums before singles', () => {
  const r = (id, title, artist, released, kind = 'album') => ({ id, title, artist, kind, released });
  const list = [
    r('1', 'The Dark Side of the Moon', 'Chimera', '2020-01-01', 'single'),
    r('2', 'Metamorphosis', 'The Dark Side of the Moon', '2022-01-01'),
    r('3', 'The Dark Side of the Moon (50th Anniversary) [Remastered]', 'Pink Floyd', '2023-03-24'),
    r('4', 'The Dark Side of the Moon', 'Pink Floyd', '1973-03-01'),
    r('5', 'Dub Side of the Moon', 'Easy Star All-Stars', '2003-01-01')];
  assert.deepEqual(albumSearchResults(list, 'the dark side of the moon').map(a => a.id), ['4', '1', '2', '5']);
});

test('albumMatchScore: title + artist typed together, accents and case ignored', () => {
  const a = { title: 'For the Rest of Your Life', artist: 'twikipedia' };
  assert.equal(albumMatchScore(a, 'for the rest of your life'), 3);
  assert.equal(albumMatchScore(a, 'For the rest of your life twikipedia'), 3.5);
  assert.equal(albumMatchScore(a, 'twikipedia for the rest'), 2.5);
  assert.equal(albumMatchScore({ title: 'Malásia', artist: 'Djavan' }, 'djavan malasia'), 3.5);
  assert.equal(albumMatchScore(a, 'radiohead'), 0);
  const out = albumSearchResults([{ id: '1', title: 'Unfiltered', artist: 'X', kind: 'album' }, { id: '2', ...a, kind: 'album' }], 'for the rest of your life twikipedia');
  assert.equal(out[0].id, '2');
});

// ── Summary screen (rankingSummaryHtml): replaces the old full list everywhere
const places = (html) => [...html.matchAll(/class="rk-sum-slot" data-place="(\d)"/g)].map(m => m[1]).join(',');

test('average: pt-BR with one decimal, rounded half up', () => {
  const r = (...v) => v.map(rating => ({ rating }));
  assert.equal(averageLabel(r(4, 4, 4.5, 4, 4)), '4,1');
  assert.equal(averageLabel(r(5)), '5,0');
  assert.equal(averageLabel(r(4, 4.5)), '4,3'); // 4,25 → 4,3
  assert.equal(averageLabel(Array.from({ length: 20 }, (_, i) => ({ rating: i < 1 ? 4.5 : i < 2 ? 4.5 : 4 }))), '4,1'); // 4,05 → 4,1
  assert.equal(averageLabel([]), '');
});

test('podium reads 2nd, 1st, 3rd and keeps the winner in the middle with 1 or 2 items', () => {
  assert.equal(places(rankingSummaryHtml(snap('artist', 1))), '1');
  assert.equal(places(rankingSummaryHtml(snap('artist', 2))), '2,1');
  assert.equal(places(rankingSummaryHtml(snap('album', 3))), '2,1,3');
  assert.equal(places(rankingSummaryHtml(snap('artist', 9))), '2,1,3');
  assert.deepEqual(podiumOrder(['a', 'b', 'c', 'd']), [['b', 2], ['a', 1], ['c', 3]]);
});

test('summary lists every rated item with the average and count', () => {
  const html = rankingSummaryHtml(snap('artist', 9));
  assert.equal((html.match(/class="rk-sum-row"/g) || []).length, 9);
  assert.match(html, /9 com nota/);
  assert.match(html, /rk-sum-avg-n">3,0</);
  // The podium score carries a star so a bare "5" never reads as a count
  assert.match(html, /1º · <svg[^>]*doodle-star filled[^]*?<\/svg>5</);
  assert.match(html, /aria-label="1º, nota 5 de 5"/);
  const big = snap('album', 1);
  big.items = Array.from({ length: 300 }, (_, i) => ({ ...big.items[0], id: `t${i}`, order: i + 1, rating: 3 }));
  assert.equal((rankingSummaryHtml(big).match(/class="rk-sum-row"/g) || []).length, 300);
});

test('album summary uses the album cover when a track has none', () => {
  const s = snap('album', 2);
  s.items.forEach(i => { i.artwork = ''; });
  assert.equal((rankingSummaryHtml(s).match(/src="https:\/\/a\/s\.jpg"/g) || []).length, 1 + 2 + 2); // header, podium, rows
});

test('album summary without a cover shows the disc icon, not an empty box', () => {
  const s = snap('album', 1);
  s.subject.artwork = '';
  assert.match(rankingSummaryHtml(s), /class="rk-sum-pic rk-sum-icon"><svg/);
});

test('only my own summary gets Editar notas / Postar no feed', () => {
  const mine = rankingSummaryHtml(snap('artist', 3), { own: true });
  assert.match(mine, /Editar notas/);
  assert.match(mine, /Postar no feed/);
  for (const html of [rankingSummaryHtml(snap('artist', 3)), rankingSummaryHtml(snap('album', 3), { own: false })]) {
    assert.doesNotMatch(html, /rk-sum-actions|Editar notas|Postar no feed/);
  }
});

test('a summary already posted shows "Postado", disabled', () => {
  const html = rankingSummaryHtml(snap('artist', 3), { own: true, posted: true });
  assert.match(html, /disabled onclick="window\._rankPostSaved[^>]*>Postado</);
  assert.doesNotMatch(html, /Postar no feed/);
});

test('summary escapes hostile snapshot text and drops bad URLs', () => {
  const s = snap('artist', 4);
  s.subject.title = '"><script>alert(1)</script>';
  s.items[0].title = '<img src=x onerror=alert(1)>';
  s.items[3].title = '<b>x</b>';
  s.items[1].artwork = 'javascript:alert(1)';
  s.key = "artist:1');alert(1);//";
  const html = rankingSummaryHtml(s, { own: true });
  assert.doesNotMatch(html, /<script|<img src=x|<b>|javascript:/);
  assert.doesNotMatch(html, /'\);alert/);
});

test('an empty ranking shows a message, no podium or list', () => {
  const html = rankingSummaryHtml(snap('artist', 0));
  assert.match(html, /Nenhuma nota ainda/);
  assert.doesNotMatch(html, /rk-sum-slot|rk-sum-row|rk-sum-avg/);
});

test('matchingArtist: the band typed as the album query gets the discography row, an album title does not', () => {
  const artists = [{ id: '1', name: 'Pink Floyd' }, { id: '2', name: 'Radiohead' }];
  assert.equal(matchingArtist(artists, 'pink floyd')?.id, '1');
  assert.equal(matchingArtist(artists, 'Pink Flo')?.id, '1');
  assert.equal(matchingArtist([{ id: '3', name: 'Björk' }], 'bjork')?.id, '3');
  assert.equal(matchingArtist(artists, 'the dark side of the moon'), null);
  assert.equal(matchingArtist(artists, 'ok computer'), null);
  assert.equal(matchingArtist(artists, 'pin'), null); // 3 letters: too early to guess
  assert.equal(matchingArtist(artists, ''), null);
});
