// Guards the cleanup of iTunes results in js/musicResults.js: run with `node --test tools/search.test.mjs`
import { test, mock } from 'node:test';
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

test('relevantArtists matches names written without spaces or punctuation', () => {
  assert.deepEqual(relevantArtists([{ id: 1, name: 'AC/DC' }, { id: 2, name: 'Other' }], 'acdc').map(a => a.name), ['AC/DC']);
  assert.deepEqual(relevantArtists([{ id: 1, name: 'JAY-Z' }], 'jayz').map(a => a.name), ['JAY-Z']);
});

test('relevantArtists keeps iTunes first guess when nothing matches (misspelled query)', () => {
  assert.deepEqual(relevantArtists([{ id: 1, name: 'The Weeknd' }, { id: 2, name: 'Drake' }], 'the weekend').map(a => a.name), ['The Weeknd']);
});

test('lookupArtist merges the newest releases when iTunes caps the catalog at 200', async () => {
  const { lookupArtist } = await import('../js/api.js');
  const col = (id, name, artistId = 1) => ({ wrapperType: 'collection', collectionId: id, collectionName: name, artistId, artistName: 'A', releaseDate: '2020-01-01T00:00:00Z' });
  const full = Array.from({ length: 200 }, (_, i) => col(i, `Old ${i} - Single`));
  const urls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    urls.push(url);
    const results = url.includes('entity=song') ? [] : url.includes('sort=recent') ? [col(0, 'Old 0 - Single'), col(999, 'New Album')] : full;
    return { ok: true, text: async () => JSON.stringify({ results }) };
  };
  try {
    const { albums, singles } = await lookupArtist('1');
    assert.deepEqual(albums.map(a => a.title), ['New Album']);
    assert.equal(singles.length, 200);
    assert.equal(urls.filter(u => u.includes('sort=recent')).length, 1);
  } finally { globalThis.fetch = realFetch; }
});

test('lookupArtist does not wait on a hung "newest releases" lookup: the first page is used after the timeout', async () => {
  const { lookupArtist, RECENT_LOOKUP_TIMEOUT_MS } = await import('../js/api.js');
  const full = [{ wrapperType: 'artist', artistId: 1 }, ...Array.from({ length: 199 }, (_, i) => ({ wrapperType: 'collection', collectionId: i, collectionName: `Disco ${i}`, artistId: 1, artistName: 'A' }))];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (url) => url.includes('sort=recent') ? new Promise(() => {})
    : Promise.resolve({ ok: true, text: async () => JSON.stringify({ results: url.includes('entity=song') ? [] : full }) });
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const pending = lookupArtist('1');
    for (let i = 0; i < 20; i++) await new Promise(r => setImmediate(r));
    mock.timers.tick(RECENT_LOOKUP_TIMEOUT_MS);
    const { albums } = await pending;
    assert.equal(albums.length, 199); // artist row + 199 collections counts as capped, then falls back to page one
  } finally { mock.timers.reset(); globalThis.fetch = realFetch; }
});

// iPhone bug: /search?media=music answers 301 → musics:// for iOS User-Agents, so fetch and JSONP both
// fail and every music search broke on iPhone. AbortSignal.timeout is missing before Safari 16.
test('iTunes search URL has no media=music and js/ avoids AbortSignal.timeout', async () => {
  const { readFileSync, readdirSync } = await import('node:fs');
  const urls = [];
  mock.method(globalThis, 'fetch', async (url) => { urls.push(String(url)); return new Response('{"results":[]}'); });
  const { searchTracks, searchAlbums, searchArtists } = await import('../js/api.js');
  await searchTracks('anitta'); await searchAlbums('anitta'); await searchArtists('anitta');
  mock.restoreAll();
  assert.ok(urls.length >= 3);
  for (const u of urls) assert.doesNotMatch(u, /media=music/);
  const dir = new URL('../js/', import.meta.url);
  for (const f of readdirSync(dir).filter(f => f.endsWith('.js'))) {
    assert.doesNotMatch(readFileSync(new URL(f, dir), 'utf8'), /AbortSignal\.timeout\(/, f);
  }
});
