// Guards the cleanup of iTunes results in js/musicResults.js: run with `node --test tools/search.test.mjs`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dedupeTracks, relevantArtists, albumKind, cleanAlbumTitle, organizeAlbums } from '../js/musicResults.js';

test('dedupeTracks keeps one of each song', () => {
  const t = (title, artist) => ({ title, artist });
  assert.equal(dedupeTracks([t('Get Lucky', 'Daft Punk'), t('get lucky ', 'DAFT PUNK'), t('Get Lucky', 'Other')]).length, 2);
});

test('relevantArtists drops unrelated and repeated artists', () => {
  const a = (name) => ({ id: name, name });
  const out = relevantArtists([a('Daft Punk'), a('blink-182'), a('Daft Punk Experience'), a('Daft Punk')], 'daft punk');
  assert.deepEqual(out.map(x => x.name), ['Daft Punk', 'Daft Punk Experience']);
});

test('relevantArtists ignores accents and case', () => {
  assert.equal(relevantArtists([{ id: 1, name: 'Beyoncé' }], 'BEYONCE').length, 1);
});

test('relevantArtists keeps the artist when the query also has a song name', () => {
  assert.equal(relevantArtists([{ id: 1, name: 'Daft Punk' }], 'one more time daft punk').length, 1);
});

test('albumKind only reads the " - Single" / " - EP" suffix', () => {
  assert.equal(albumKind('One More Time - Single'), 'single');
  assert.equal(albumKind('Around the World - EP'), 'ep');
  assert.equal(albumKind('Single Ladies'), 'album');
  assert.equal(albumKind('EPIC'), 'album');
  assert.equal(cleanAlbumTitle('Da Funk - Single'), 'Da Funk');
});

test('organizeAlbums splits, dedupes and sorts newest first', () => {
  const al = (title, year) => ({ title: cleanAlbumTitle(title), artist: 'Daft Punk', year, kind: albumKind(title) });
  const { albums, singles } = organizeAlbums([al('Discovery', 2001), al('Random Access Memories', 2013),
    al('One More Time - Single', 2000), al('Discovery', 2001), al('Revolution 909 - EP', 1998)]);
  assert.deepEqual(albums.map(a => a.title), ['Random Access Memories', 'Discovery']);
  assert.deepEqual(singles.map(a => a.title), ['One More Time', 'Revolution 909']);
});
