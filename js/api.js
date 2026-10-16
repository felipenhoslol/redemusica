// Music API service: iTunes Search API + rich link previews (Last.fm lives in lastfm.js)
import { esc, safeUrl, jsArg, avatarInner } from './dom.js';

/**
 * Format milliseconds to mm:ss
 * @param {number} ms 
 * @returns {string}
 */
export function formatDuration(ms) {
  if (!ms || isNaN(ms)) return "--:--";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Upgrade low-res iTunes artwork to HD
 * @param {string} url 
 * @param {number} size 
 * @returns {string}
 */
export function getHighResArtwork(url, size = 600) {
  if (!url) return '';
  return url
    .replace(/\/\d+x\d+bb\./, `/${size}x${size}bb.`)
    .replace(/\/\d+x\d+bf\./, `/${size}x${size}bb.`);
}

/**
 * Fetch helper for Apple iTunes API with multiple resilient fallbacks
 * @param {string} term 
 * @param {number} limit 
 * @returns {Promise<any>}
 */
async function fetchItunesData(term, limit = 25, entity = 'song') {
  const cleanTerm = term.trim();
  const directUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(cleanTerm)}&media=music&entity=${entity}&limit=${limit}&country=BR`;
  return fetchItunesUrl(directUrl);
}

async function fetchItunesUrl(directUrl) {

  // Strategy 1: Direct native fetch (supported by Apple with Access-Control-Allow-Origin: *)
  try {
    const res = await fetch(directUrl);
    if (res.ok) {
      const text = await res.text();
      if (text && text.trim()) {
        const data = JSON.parse(text.trim());
        if (data && Array.isArray(data.results)) return data;
      }
    }
  } catch (err) {
    console.warn('Direct iTunes fetch error, trying proxies...', err);
  }

  // Strategy 2: Fast HTTPS Proxies if direct request is blocked by browser/network
  const proxies = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(directUrl)}`,
    `https://corsproxy.io/?${encodeURIComponent(directUrl)}`
  ];

  for (const proxy of proxies) {
    try {
      const res = await fetch(proxy);
      if (res.ok) {
        const text = await res.text();
        if (text && text.trim()) {
          const data = JSON.parse(text.trim());
          if (data && Array.isArray(data.results)) return data;
        }
      }
    } catch (e) {
      console.warn('Proxy fetch error:', e);
    }
  }

  return null;
}

/**
 * Search songs on iTunes
 * @param {string} query 
 * @param {number} limit
 * @returns {Promise<Array>}
 */
export async function searchTracks(query, limit = 25) {
  if (!query || query.trim().length === 0) return [];

  const cleanQuery = query.trim();
  const data = await fetchItunesData(cleanQuery, limit);

  if (!data || !Array.isArray(data.results) || data.results.length === 0) {
    return [];
  }

  return data.results.filter(item => item.wrapperType === 'track' || item.kind === 'song').map(toTrack);
}

function toTrack(item) {
  return {
    id: item.trackId ? String(item.trackId) : `custom_${Date.now()}_${Math.random()}`,
    title: item.trackName || 'Sem título',
    artist: item.artistName || 'Artista desconhecido',
    artistId: item.artistId ? String(item.artistId) : '',
    album: item.collectionName || '',
    albumId: item.collectionId ? String(item.collectionId) : '',
    artwork: getHighResArtwork(item.artworkUrl100 || item.artworkUrl60, 600),
    artworkThumb: item.artworkUrl100 || item.artworkUrl60 || '',
    previewUrl: item.previewUrl || '',
    duration: formatDuration(item.trackTimeMillis),
    durationMs: item.trackTimeMillis || 0,
    releaseYear: item.releaseDate ? new Date(item.releaseDate).getFullYear() : '',
    genre: item.primaryGenreName || 'Música',
    itunesUrl: item.trackViewUrl || ''
  };
}

/** Artists on iTunes (no photos there: callers fill them with getArtistImage). */
export async function searchArtists(query, limit = 20) {
  if (!query?.trim()) return [];
  const data = await fetchItunesData(query, limit, 'musicArtist');
  return (data?.results || []).filter(r => r.artistId).map(r => ({
    id: String(r.artistId),
    name: r.artistName,
    genre: r.primaryGenreName || ''
  }));
}

function toAlbum(r) {
  return {
    id: String(r.collectionId),
    title: r.collectionName,
    artist: r.artistName,
    artwork: getHighResArtwork(r.artworkUrl100 || r.artworkUrl60, 400),
    year: r.releaseDate ? new Date(r.releaseDate).getFullYear() : '',
    trackCount: r.trackCount || 0,
    genre: r.primaryGenreName || ''
  };
}

export async function searchAlbums(query, limit = 24) {
  if (!query?.trim()) return [];
  const data = await fetchItunesData(query, limit, 'album');
  return (data?.results || []).filter(r => r.collectionId).map(toAlbum);
}

/** An artist's most popular songs and albums. */
export async function lookupArtist(artistId) {
  const [songs, albums] = await Promise.all([
    fetchItunesUrl(`https://itunes.apple.com/lookup?id=${encodeURIComponent(artistId)}&entity=song&limit=25&country=BR`),
    fetchItunesUrl(`https://itunes.apple.com/lookup?id=${encodeURIComponent(artistId)}&entity=album&limit=24&country=BR`)
  ]);
  return {
    songs: (songs?.results || []).filter(r => r.wrapperType === 'track').map(toTrack),
    albums: (albums?.results || []).filter(r => r.wrapperType === 'collection').map(toAlbum)
  };
}

/** Album info plus its tracklist, in order. */
export async function lookupAlbum(albumId) {
  const data = await fetchItunesUrl(`https://itunes.apple.com/lookup?id=${encodeURIComponent(albumId)}&entity=song&country=BR`);
  const results = data?.results || [];
  const info = results.find(r => r.wrapperType === 'collection');
  return {
    album: info ? toAlbum(info) : null,
    tracks: results.filter(r => r.wrapperType === 'track')
      .sort((a, b) => (a.discNumber - b.discNumber) || (a.trackNumber - b.trackNumber))
      .map(r => ({ ...toTrack(r), trackNumber: r.trackNumber }))
  };
}

// Last.fm: see lastfm.js

// ──────────────────────────────────────────
// RICH LINK & OPEN GRAPH PREVIEW RESOLVER
// ──────────────────────────────────────────

const linkMetadataCache = new Map();

/**
 * Extract first HTTP/HTTPS/WWW URL found in text
 * @param {string} text 
 * @returns {string|null}
 */
export function extractFirstUrl(text) {
  if (!text) return null;
  const match = text.match(/(https?:\/\/[^\s]+|www\.[a-zA-Z0-9-]+\.[a-zA-Z0-9-.~:/?#[\]@!$&'()*+,;=%]+)/i);
  if (!match) return null;
  let url = match[0];
  if (url.toLowerCase().startsWith('www.')) url = 'https://' + url;
  url = url.replace(/[.,;:!?)]+$/, '');
  return url;
}

/**
 * Fetch rich metadata (Open Graph / Twitter Card) for any URL
 * @param {string} rawUrl 
 * @returns {Promise<object>}
 */
const linkMetadataInflight = new Map(); // url → Promise: a link shown in many cards is fetched once

export function fetchLinkMetadata(rawUrl) {
  if (!rawUrl || !rawUrl.trim()) return Promise.resolve(null);
  let url = rawUrl.trim();
  if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'https://' + url;
  if (linkMetadataCache.has(url)) return Promise.resolve(linkMetadataCache.get(url));
  if (!linkMetadataInflight.has(url)) {
    linkMetadataInflight.set(url, loadLinkMetadata(url).finally(() => linkMetadataInflight.delete(url)));
  }
  return linkMetadataInflight.get(url);
}

async function loadLinkMetadata(url) {

  let domain = '';
  try {
    const u = new URL(url);
    domain = u.hostname.replace(/^www\./, '');
  } catch {
    domain = url.split('/')[0];
  }

  // 1. Try Microlink Open Graph API
  try {
    const res = await fetch(`https://api.microlink.io?url=${encodeURIComponent(url)}`);
    if (res.ok) {
      const json = await res.json();
      if (json.status === 'success' && json.data) {
        const d = json.data;
        const result = {
          url: url,
          title: d.title || domain,
          description: d.description || '',
          image: d.image?.url || d.logo?.url || '',
          siteName: d.publisher || domain,
          favicon: `https://www.google.com/s2/favicons?domain=${domain}&sz=32`
        };
        linkMetadataCache.set(url, result);
        return result;
      }
    }
  } catch (e) {
    console.warn('Microlink error, using client fallback:', e);
  }

  // 2. Client-side domain-specific fallback
  let image = '';
  let title = domain;
  let description = url;

  if (domain.includes('youtube.com') || domain.includes('youtu.be')) {
    const ytMatch = url.match(/(?:youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=)([^#&?]*)/);
    if (ytMatch && ytMatch[1]) {
      image = `https://img.youtube.com/vi/${ytMatch[1]}/hqdefault.jpg`;
      title = 'Vídeo no YouTube';
      description = `Assista agora no YouTube`;
    }
  }

  const fallback = {
    url: url,
    title: title,
    description: description,
    image: image || '',
    siteName: domain,
    favicon: `https://www.google.com/s2/favicons?domain=${domain}&sz=32`
  };
  linkMetadataCache.set(url, fallback);
  return fallback;
}

/**
 * Render HTML card for a rich link preview or auto-resolves URL
 * @param {object|string} linkOrUrl 
 * @returns {string}
 */
export function renderRichLinkCard(linkOrUrl) {
  if (!linkOrUrl) return '';

  let linkData = typeof linkOrUrl === 'object' ? linkOrUrl : null;
  const rawUrl = typeof linkOrUrl === 'string' ? linkOrUrl : linkData?.url;

  if (!rawUrl) return '';

  if (!linkData) {
    const normalized = /^https?:\/\//.test(rawUrl) ? rawUrl : 'https://' + rawUrl;
    linkData = linkMetadataCache.get(rawUrl) || linkMetadataCache.get(normalized) || null;
  }

  if (!linkData) {
    // Schedule asynchronous auto-fetch for this slot
    setTimeout(async () => {
      const fetched = await fetchLinkMetadata(rawUrl);
      if (fetched) {
        document.querySelectorAll(`.auto-link-slot[data-url="${encodeURIComponent(rawUrl)}"]`).forEach(el => {
          el.outerHTML = renderRichLinkCard(fetched);
        });
      }
    }, 10);

    return `<div class="auto-link-slot" data-url="${encodeURIComponent(rawUrl)}" style="min-height:4px;"></div>`;
  }

  let domain = linkData.siteName || '';
  try {
    domain = domain || new URL(linkData.url).hostname.replace(/^www\./, '');
  } catch {}

  return `
    <a href="${safeUrl(linkData.url)}" target="_blank" rel="noopener noreferrer" class="rich-link-card" onclick="event.stopPropagation();">
      ${linkData.image ? `
        <div class="rich-link-cover">
          <img src="${safeUrl(linkData.image)}" alt="${esc(linkData.title || '')}" loading="lazy" decoding="async" onerror="this.parentElement.style.display='none'">
        </div>` : ''}
      <div class="rich-link-body">
        <div class="rich-link-header">
          <img src="${safeUrl(linkData.favicon || `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`)}" class="rich-link-favicon" alt="" onerror="this.style.display='none'">
          <span class="rich-link-domain">${esc(domain)}</span>
        </div>
        <div class="rich-link-title">${esc(linkData.title || domain)}</div>
        ${linkData.description ? `<div class="rich-link-desc">${esc(linkData.description)}</div>` : ''}
        <div class="rich-link-footer">
          <span>Abrir link</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>
        </div>
      </div>
    </a>`;
}
