// Service worker: deixa o app instalável e abrir sem rede.
// - Navegação e CSS/JS: rede primeiro, cache só quando está offline. Assim um deploy novo
//   nunca mistura módulos velhos com novos (no Vercel os módulos não têm ?v=).
// - Imagens/ícones do próprio site: cache primeiro, atualizando por trás.
// - Outros domínios (Supabase, iTunes, Last.fm, Giphy, prévias de áudio) e não-GET: não passam por aqui.
// VERSION é trocado pelo commit no tools/stamp-version.mjs; ao mudar, os caches antigos são apagados.
const VERSION = 'dev';
const CACHE = `rmsn-${VERSION}`;
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'assets/favicon.svg',
  'assets/icon-192.png', 'assets/icon-512.png', 'assets/icon-512-maskable.png'];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL);
    // CSS/JS citados no index.html (com ?v= no build do Pages), para abrir offline já na 2ª visita
    const html = await (await cache.match('index.html')).text();
    const urls = [...html.matchAll(/(?:href|src)="((?:css|js)\/[^"]+)"/g)].map(m => m[1]);
    await Promise.all(urls.map(u => cache.add(u).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('rmsn-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

const save = (req, res) => {
  if (res.status === 200 && res.type === 'basic') {
    const copy = res.clone();
    caches.open(CACHE).then(c => c.put(req, copy));
  }
  return res;
};

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || req.headers.has('range')) return;

  if (req.mode === 'navigate') {
    // /@handle e links com #token caem no index.html em cache quando offline
    e.respondWith(fetch(req).catch(async () =>
      (await caches.match('index.html')) || Response.error()));
    return;
  }

  if (url.pathname.includes('/assets/')) {
    e.respondWith(caches.match(req).then(hit => {
      const net = fetch(req).then(res => save(req, res));
      if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
      return net;
    }));
    return;
  }

  e.respondWith(fetch(req).then(res => save(req, res)).catch(async () =>
    (await caches.match(req)) || Response.error()));
});
