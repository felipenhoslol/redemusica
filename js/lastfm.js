// Last.fm client (top artists / top tracks of a user, global chart) + real artist photos (Deezer).
// Last.fm sends CORS headers, so it is called directly; Deezer does not, so it is called via JSONP.
import { LASTFM_API_KEY } from './config.js';
import { searchTracks } from './api.js';

const LASTFM_URL = 'https://ws.audioscrobbler.com/2.0/';
const REQUEST_TIMEOUT_MS = 10000;
const CACHE_TTL_MS = 5 * 60 * 1000;

export const LASTFM_PERIODS = {
  '1month': 'do mês',
  '3month': 'dos últimos 3 meses',
  '12month': 'do ano',
  'overall': 'de todos os tempos'
};

export class LastFmError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'LastFmError';
    this.code = code;
  }
}

// Last.fm error codes → messages the user can act on
const ERROR_MESSAGES = {
  6: (p) => `O usuário "${p.user || ''}" não existe no Last.fm. Confira o nome (é o que aparece em last.fm/user/…).`,
  10: () => 'A chave da API do Last.fm é inválida. Confira LASTFM_API_KEY em js/config.js.',
  26: () => 'A chave da API do Last.fm foi suspensa. Gere outra em last.fm/api/account/create.',
  29: () => 'O Last.fm limitou as requisições por agora. Tente de novo em alguns minutos.',
  11: () => 'O Last.fm está fora do ar no momento. Tente de novo em alguns minutos.',
  16: () => 'O Last.fm não conseguiu responder agora. Tente de novo em instantes.',
  17: (p) => `O perfil "${p.user || ''}" é privado no Last.fm. Deixe o histórico público nas configurações de privacidade do Last.fm.`
};

const responseCache = new Map(); // url → { at, data }

/**
 * Normalize what the user typed: accepts "nome", "@nome" or a profile URL.
 * @param {string} raw
 * @returns {string}
 */
export function normalizeLastFmUsername(raw) {
  return String(raw || '')
    .trim()
    .replace(/^https?:\/\/(www\.)?last\.fm\/(\w{2}\/)?user\//i, '')
    .replace(/^@/, '')
    .replace(/[/?#].*$/, '');
}

/**
 * Last.fm usernames: 2–15 chars, starting with a letter; letters, digits, "_" and "-".
 * @param {string} username
 */
export function isValidLastFmUsername(username) {
  return /^[A-Za-z][A-Za-z0-9_-]{1,14}$/.test(username);
}

async function callLastFm(method, params = {}) {
  if (!LASTFM_API_KEY) {
    throw new LastFmError('nokey', 'A integração com o Last.fm ainda não está configurada: falta a chave da API em js/config.js.');
  }

  const query = new URLSearchParams({ method, format: 'json', api_key: LASTFM_API_KEY, ...params });
  const url = `${LASTFM_URL}?${query}`;

  const cached = responseCache.get(url);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.data;

  let json;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    json = await res.json().catch(() => null);
    if (!json) throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    throw new LastFmError('network', timedOut
      ? 'O Last.fm demorou demais para responder. Tente de novo.'
      : 'Não foi possível falar com o Last.fm. Verifique sua conexão.');
  }

  if (json.error) {
    const msg = ERROR_MESSAGES[json.error]?.(params) || json.message || 'Erro desconhecido do Last.fm.';
    throw new LastFmError(json.error, msg);
  }

  responseCache.set(url, { at: Date.now(), data: json });
  return json;
}

// Last.fm returns a single object instead of an array when there is only one item
const asArray = (v) => (Array.isArray(v) ? v : v ? [v] : []);

// ──────────────────────────────────────────
// ARTIST PHOTOS
// ──────────────────────────────────────────

const ARTIST_IMG_CACHE_KEY = 'rmsn_artist_images_v1';
const artistImageMemo = new Map(); // lowercased name → Promise<string>

function readImageCache() {
  try { return JSON.parse(localStorage.getItem(ARTIST_IMG_CACHE_KEY)) || {}; }
  catch { return {}; }
}

function writeImageCache(name, url) {
  try {
    const all = readImageCache();
    all[name] = url;
    localStorage.setItem(ARTIST_IMG_CACHE_KEY, JSON.stringify(all));
  } catch { /* cache is optional */ }
}

function jsonp(url, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const cbName = `__dz_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement('script');
    const cleanup = () => { clearTimeout(timer); delete window[cbName]; script.remove(); };
    const timer = setTimeout(() => { cleanup(); reject(new Error('JSONP timeout')); }, timeoutMs);
    window[cbName] = (data) => { cleanup(); resolve(data); };
    script.onerror = () => { cleanup(); reject(new Error('JSONP load error')); };
    script.src = `${url}${url.includes('?') ? '&' : '?'}output=jsonp&callback=${cbName}`;
    document.head.appendChild(script);
  });
}

// Deezer's placeholder for artists without a photo: empty hash (/images/artist//) or the MD5 of "" (d41d8cd9…)
const isDeezerPlaceholder = (url) => !url || /\/images\/artist\/(\/|d41d8cd98f00b204e9800998ecf8427e)/.test(url);

async function lookupArtistImage(name) {
  // 1) Deezer: real artist photos
  try {
    const res = await jsonp(`https://api.deezer.com/search/artist?q=${encodeURIComponent(name)}&limit=5`);
    const list = Array.isArray(res?.data) ? res.data : [];
    const exact = list.find(a => a.name?.toLowerCase() === name.toLowerCase());
    const pick = exact || list[0];
    const url = pick?.picture_xl || pick?.picture_big || '';
    if (!isDeezerPlaceholder(url)) return url;
  } catch (err) {
    console.warn('Deezer artist image lookup failed:', err.message);
  }

  // 2) Fallback: an album cover from the artist on iTunes
  try {
    const tracks = await searchTracks(name, 5);
    const match = tracks.find(t => t.artist.toLowerCase() === name.toLowerCase());
    if (match?.artwork) return match.artwork;
  } catch { /* ignore */ }

  return '';
}

/**
 * Photo URL for an artist ('' when none is found). Cached in memory and in localStorage.
 * @param {string} name
 * @returns {Promise<string>}
 */
export function getArtistImage(name) {
  const key = String(name || '').trim().toLowerCase();
  if (!key) return Promise.resolve('');
  if (artistImageMemo.has(key)) return artistImageMemo.get(key);

  const cached = readImageCache()[key];
  const usable = cached !== undefined && !(cached && isDeezerPlaceholder(cached));
  const promise = usable
    ? Promise.resolve(cached)
    : lookupArtistImage(name).then(url => { writeImageCache(key, url); return url; });

  artistImageMemo.set(key, promise);
  return promise;
}

// ──────────────────────────────────────────
// USER TOP ARTISTS / TRACKS
// ──────────────────────────────────────────

/**
 * Sync a Last.fm profile: top 5 artists (with photos) and top 5 tracks (with covers and previews).
 * Tries the last month first and widens the period when the user has no scrobbles in it.
 * @param {string} rawUsername
 * @returns {Promise<{username:string, profileUrl:string, period:string, periodLabel:string, topArtist:object|null, topArtistsMonth:Array, topTracksMonth:Array}>}
 */
export async function fetchLastFmUserTop(rawUsername) {
  const username = normalizeLastFmUsername(rawUsername);
  if (!username) throw new LastFmError('input', 'Digite seu nome de usuário do Last.fm.');
  if (!isValidLastFmUsername(username)) {
    throw new LastFmError('input', `"${username}" não parece um usuário do Last.fm: use 2 a 15 letras, números, "_" ou "-", começando por letra.`);
  }

  // Confirms the user exists (error 6) and gives the canonical spelling and profile link
  const info = await callLastFm('user.getinfo', { user: username });
  const canonical = info.user?.name || username;

  let period = null;
  let rawArtists = [];
  for (const p of Object.keys(LASTFM_PERIODS)) {
    const json = await callLastFm('user.gettopartists', { user: canonical, period: p, limit: 5 });
    rawArtists = asArray(json.topartists?.artist);
    if (rawArtists.length) { period = p; break; }
  }
  if (!period) {
    throw new LastFmError('empty', `O perfil "${canonical}" existe, mas ainda não tem músicas registradas (scrobbles) no Last.fm.`);
  }

  const tracksJson = await callLastFm('user.gettoptracks', { user: canonical, period, limit: 5 });
  const rawTracks = asArray(tracksJson.toptracks?.track);

  const [topArtists, topTracks] = await Promise.all([
    Promise.all(rawArtists.slice(0, 5).map(async (a, i) => ({
      rank: i + 1,
      name: a.name,
      playcount: parseInt(a.playcount, 10) || 0,
      url: a.url || `https://www.last.fm/music/${encodeURIComponent(a.name)}`,
      imageUrl: await getArtistImage(a.name)
    }))),
    Promise.all(rawTracks.slice(0, 5).map(async (t, i) => {
      const artist = t.artist?.name || t.artist?.['#text'] || '';
      let match = null;
      try {
        const results = await searchTracks(`${t.name} ${artist}`, 3);
        match = results.find(r => r.artist.toLowerCase() === artist.toLowerCase()) || results[0] || null;
      } catch { /* cover and preview are optional */ }
      return {
        rank: i + 1,
        id: match?.id || `lfm_${canonical}_${i}`,
        title: t.name,
        artist,
        playcount: parseInt(t.playcount, 10) || 0,
        artwork: match?.artwork || '',
        previewUrl: match?.previewUrl || '',
        duration: match?.duration || '',
        url: t.url || ''
      };
    }))
  ]);

  return {
    username: canonical,
    profileUrl: info.user?.url || `https://www.last.fm/user/${encodeURIComponent(canonical)}`,
    period,
    periodLabel: LASTFM_PERIODS[period],
    topArtist: topArtists[0] || null,
    topArtistsMonth: topArtists,
    topTracksMonth: topTracks
  };
}

// ──────────────────────────────────────────
// GLOBAL CHART (feed "Em alta" widget)
// ──────────────────────────────────────────

/**
 * Global top tracks from Last.fm with iTunes cover/preview. Falls back to a static list.
 * @param {number} limit
 */
export async function fetchLastFmTrendingTracks(limit = 6) {
  try {
    const json = await callLastFm('chart.gettoptracks', { limit: 10 });
    const list = asArray(json.tracks?.track);
    if (!list.length) return getFallbackTrendingTracks();

    return await Promise.all(list.slice(0, limit).map(async (t, i) => {
      const artist = t.artist?.name || 'Artista';
      let match = null;
      try { match = (await searchTracks(`${t.name} ${artist}`, 1))[0] || null; } catch { /* optional */ }
      return {
        rank: i + 1,
        id: match?.id || `trend_${i}`,
        title: t.name,
        artist,
        playcount: t.playcount ? Number(t.playcount).toLocaleString('pt-BR') : '',
        listeners: t.listeners ? Number(t.listeners).toLocaleString('pt-BR') : '',
        artwork: match?.artwork || '',
        previewUrl: match?.previewUrl || '',
        duration: match?.duration || '',
        url: t.url || ''
      };
    }));
  } catch (err) {
    console.warn('Last.fm chart unavailable, using fallback list:', err.message);
    return getFallbackTrendingTracks();
  }
}

function getFallbackTrendingTracks() {
  return [
    { rank: 1, id: 'fb_tr1', title: 'Espresso', artist: 'Sabrina Carpenter', artwork: '', previewUrl: '', duration: '2:55' },
    { rank: 2, id: 'fb_tr2', title: 'Birds of a Feather', artist: 'Billie Eilish', artwork: '', previewUrl: '', duration: '3:18' },
    { rank: 3, id: 'fb_tr3', title: 'Good Luck, Babe!', artist: 'Chappell Roan', artwork: '', previewUrl: '', duration: '3:38' },
    { rank: 4, id: 'fb_tr4', title: 'Fortnight', artist: 'Taylor Swift', artwork: '', previewUrl: '', duration: '3:48' },
    { rank: 5, id: 'fb_tr5', title: 'Too Sweet', artist: 'Hozier', artwork: '', previewUrl: '', duration: '4:11' }
  ];
}
