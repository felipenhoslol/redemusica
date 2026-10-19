// Cleans iTunes results before they reach the screen: no repeated songs, no unrelated artists,
// albums apart from singles/EPs. Pure functions (tested in tools/search.test.mjs).

/** Lowercase, no accents, single spaces: how two names are compared. */
export const normalize = (text) => String(text || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

const keyOf = (item) => `${normalize(item.title)}|${normalize(item.artist)}`;
const dedupe = (items, key) => {
  const seen = new Set();
  return items.filter(item => !seen.has(key(item)) && seen.add(key(item)));
};

/** iTunes lists the same song several times (singles, compilations): keep the first. */
export const dedupeTracks = (tracks) => dedupe(tracks, keyOf);

/** iTunes "artist" search returns loosely related artists: keep those whose name matches the query. */
export function relevantArtists(artists, query) {
  const q = normalize(query);
  const words = q.split(' ').filter(Boolean);
  const squash = (text) => text.replace(/[^\p{L}\p{N}]/gu, ''); // "ac/dc" and "acdc", "jay-z" and "jayz"
  const matches = (name) => words.every(w => name.includes(w)) || (name && q.includes(name))
    || (squash(q).length > 1 && squash(name).includes(squash(q)));
  const found = artists.filter(a => matches(normalize(a.name)));
  // A misspelled query ("the weekend") matches no name: keep iTunes's own first guess
  return dedupe(found.length ? found : artists.slice(0, 1), a => normalize(a.name));
}

/** iTunes marks singles and EPs only in the title: "Name - Single", "Name - EP". */
export function albumKind(rawTitle) {
  const m = String(rawTitle || '').match(/ - (single|ep)$/i);
  return m ? m[1].toLowerCase() : 'album';
}

export const cleanAlbumTitle = (rawTitle) => String(rawTitle || '').replace(/ - (single|ep)$/i, '');

/** Albums first and singles/EPs apart, each without repeats (explicit/clean editions) and newest first. */
export function organizeAlbums(albums) {
  const byYear = (a, b) => (Number(b.year) || 0) - (Number(a.year) || 0);
  return {
    albums: dedupe(albums.filter(a => a.kind === 'album'), keyOf).sort(byYear),
    singles: dedupe(albums.filter(a => a.kind !== 'album'), keyOf).sort(byYear)
  };
}
