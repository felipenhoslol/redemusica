// Registra o service worker (app instalável/offline). No app Android (Capacitor) não precisa.
if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !window.Capacitor?.isNativePlatform?.()) {
  addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('service worker:', err));
  });
}
