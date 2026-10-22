// Star ranking ("ranking por estrelas"): rate an artist's releases or an album's tracks, 1 to 5 stars.
import { normalize } from './musicResults.js';

export const RANKING_MAX_ITEMS = 300;
export const RANKING_CHALLENGE_ID = 'stars_ranking';

const EDITION_SUFFIX = /\s*(\([^()]*\)|\[[^[\]]*\]| - [^-()[\]]*)$/;
// "version", "live" and "ao vivo" stay: Taylor's Version and live albums are different records.
const LIVE_WORD = /\b(live|ao vivo)\b/;
const EDITION_WORD = /\b(deluxe|remaster|expanded|edition|edicao|anniversary|bonus|special|especial|explicit|clean|collector|platinum)/;

/** Lowercase, accent-free title with edition suffixes ("(Deluxe Edition)", "- Remastered") stripped. */
export function editionBase(title) {
  let base = normalize(title);
  for (let m; (m = base.match(EDITION_SUFFIX)) && EDITION_WORD.test(m[1]) && !LIVE_WORD.test(m[1]);) base = base.slice(0, m.index);
  return base.trim();
}

const byId = (a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true });
const newestFirst = (a, b) => String(b.released || b.year || '').localeCompare(String(a.released || a.year || ''));

/** One release per kind + edition-free title: the earliest released (then smallest id) wins. */
export function dedupeReleases(releases, keyOf = (r) => `${r.kind}|${editionBase(r.title)}`) {
  const kept = new Map();
  for (const r of releases) {
    const key = keyOf(r);
    const old = kept.get(key);
    if (!old || String(r.released || '').localeCompare(String(old.released || '')) < 0 || (r.released === old.released && byId(r, old) < 0)) kept.set(key, r);
  }
  return [...kept.values()];
}

const titleMatch = (base, q) => !q ? 0 : base === q ? 3 : base.startsWith(q) ? 2 : base.includes(q) ? 1 : 0;

/** How well a release answers the query: title exact > starts with > contains; "title artist" typed together counts too. */
export function albumMatchScore(album, query) {
  const q = normalize(query).trim();
  const base = editionBase(album.title);
  const artist = normalize(album.artist).trim();
  const withArtist = artist && q.includes(artist) ? titleMatch(base, q.replace(artist, ' ').replace(/\s+/g, ' ').trim()) : 0;
  return Math.max(titleMatch(base, q), withArtist) + (withArtist ? 0.5 : 0);
}

/** Album search for a ranking: editions (deluxe, explicit/clean) once per artist, best title match first, then albums and EPs before singles. */
export function albumSearchResults(albums, query = '') {
  const unique = dedupeReleases(albums, (a) => `${a.kind}|${normalize(a.artist)}|${editionBase(a.title)}`);
  const score = new Map(unique.map(a => [a, albumMatchScore(a, query)]));
  return unique.sort((a, b) => score.get(b) - score.get(a) || (a.kind === 'single') - (b.kind === 'single'));
}

/** Album search: the artist whose name is the query (or starts with it, from 4 letters on), shown above the albums; else null. */
export function matchingArtist(artists, query) {
  const q = normalize(query).trim();
  return (q && artists.find(a => { const m = titleMatch(normalize(a.name).trim(), q); return m === 3 || (m === 2 && q.length >= 4); })) || null;
}

export function groupReleases(releases) {
  const sorted = [...releases].sort(newestFirst);
  return {
    albums: sorted.filter(r => r.kind === 'album'),
    eps: sorted.filter(r => r.kind === 'ep'),
    singles: sorted.filter(r => r.kind !== 'album' && r.kind !== 'ep')
  };
}

/** Rated items only, each id once, best first; ties: newer release (artist) or disc order (album). */
export function rankItems(items, mode) {
  const seen = new Set();
  const rated = items.filter(i => Number(i.rating) > 0 && !seen.has(i.id) && seen.add(i.id));
  return rated.sort((a, b) => b.rating - a.rating || (mode === 'album' ? (a.order || 0) - (b.order || 0) : newestFirst(a, b)));
}

export const rankingKey = (mode, subjectId) => `${mode}:${subjectId}`;

const str = (v) => (typeof v === 'string' || typeof v === 'number' ? String(v).slice(0, 200) : '');
const url = (v) => (typeof v === 'string' && /^https:\/\//.test(v) ? v.slice(0, 500) : '');
const year = (v) => (Number.isInteger(v) ? v : '');
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

/** Validates a ranking from storage or another user's row; null when it is unusable. */
export function cleanRanking(raw) {
  if (!isObj(raw) || !['artist', 'album'].includes(raw.mode) || !isObj(raw.subject)) return null;
  if (typeof raw.key !== 'string' || !/^(artist|album):[\w-]{1,40}$/.test(raw.key) || !raw.key.startsWith(raw.mode + ':')) return null;
  const s = raw.subject;
  const seen = new Set();
  const items = [];
  for (const i of Array.isArray(raw.items) ? raw.items : []) {
    if (items.length >= RANKING_MAX_ITEMS) break;
    const n = Number(i?.rating); // 0/null/missing = unrated: dropped below, never clamped up to 1 star
    const id = str(i?.id);
    if (!(n > 0) || !id || seen.has(id)) continue;
    seen.add(id);
    items.push({ id, title: str(i.title), kind: str(i.kind), year: year(i.year), released: str(i.released), artwork: url(i.artwork),
      order: Number.isFinite(i.order) ? i.order : 0, rating: Math.min(5, Math.max(1, Math.round(n * 2) / 2)) });
  }
  const updatedAt = Number.isFinite(Date.parse(raw.updatedAt)) ? raw.updatedAt : '';
  return { key: raw.key, mode: raw.mode, subject: { id: str(s.id), title: str(s.title), artist: str(s.artist), artwork: url(s.artwork), year: year(s.year) },
    items, updatedAt, ...(updatedAt && raw.postedUpdatedAt === updatedAt ? { postedUpdatedAt: updatedAt } : {}) }; // posted marker: stale once a rating bumps updatedAt
}

/** Frozen copy for a post: ranked, validated, capped; later edits to the live ranking don't reach it. */
export const snapshotRanking = (ranking) => cleanRanking({ ...ranking, items: rankItems(ranking.items || [], ranking.mode) });
