// Music API service using iTunes Search API with JSONP & CORS proxy fallbacks

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
 * JSONP Fetch helper for browser requests to Apple iTunes API
 * @param {string} url 
 * @param {number} timeoutMs 
 * @returns {Promise<any>}
 */
function fetchJSONP(url, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const callbackName = 'itunes_jsonp_' + Math.random().toString(36).substring(2, 9) + Date.now();
    const script = document.createElement('script');
    let timer = null;

    window[callbackName] = (data) => {
      cleanup();
      resolve(data);
    };

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      if (script.parentNode) script.parentNode.removeChild(script);
      delete window[callbackName];
    };

    timer = setTimeout(() => {
      cleanup();
      reject(new Error('Tempo limite de busca excedido. Tente novamente.'));
    }, timeoutMs);

    script.onerror = () => {
      cleanup();
      reject(new Error('Erro de conexão ao buscar músicas.'));
    };

    const separator = url.includes('?') ? '&' : '?';
    script.src = `${url}${separator}callback=${callbackName}`;
    document.body.appendChild(script);
  });
}

/**
 * Fetch fallback using public CORS proxy if JSONP encounters issues
 * @param {string} term 
 * @returns {Promise<any>}
 */
async function fetchViaProxy(term) {
  const targetUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&entity=song&limit=25`;
  const proxies = [
    `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`
  ];

  for (const proxy of proxies) {
    try {
      const res = await fetch(proxy);
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.warn('Proxy fallback error:', e);
    }
  }
  throw new Error('Não foi possível conectar ao banco de músicas.');
}

/**
 * Search songs on iTunes
 * @param {string} query 
 * @returns {Promise<Array>}
 */
export async function searchTracks(query) {
  if (!query || query.trim().length === 0) return [];

  const cleanQuery = query.trim();
  const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(cleanQuery)}&media=music&entity=song&limit=25`;

  let data = null;

  try {
    data = await fetchJSONP(itunesUrl);
  } catch (err) {
    console.warn('JSONP falhou, tentando proxy fallback:', err.message);
    try {
      data = await fetchViaProxy(cleanQuery);
    } catch (proxyErr) {
      console.error('Falha em todos os métodos de busca:', proxyErr);
      throw new Error('Não foi possível buscar músicas. Verifique sua conexão.');
    }
  }

  if (!data || !Array.isArray(data.results)) {
    return [];
  }

  return data.results.map((item) => {
    const duration = formatDuration(item.trackTimeMillis);
    const artwork = getHighResArtwork(item.artworkUrl100 || item.artworkUrl60, 600);
    const releaseYear = item.releaseDate ? new Date(item.releaseDate).getFullYear() : '';

    return {
      id: item.trackId ? String(item.trackId) : `custom_${Date.now()}_${Math.random()}`,
      title: item.trackName || 'Sem título',
      artist: item.artistName || 'Artista desconhecido',
      album: item.collectionName || '',
      artwork: artwork || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80',
      artworkThumb: item.artworkUrl100 || item.artworkUrl60 || '',
      previewUrl: item.previewUrl || '',
      duration: duration,
      durationMs: item.trackTimeMillis || 0,
      releaseYear: releaseYear,
      genre: item.primaryGenreName || 'Música',
      itunesUrl: item.trackViewUrl || ''
    };
  });
}
