// 오프라인 지원: 항상 최신 파일을 먼저 받고(네트워크 우선), 연결이 없을 때만 캐시 사용.
const CACHE = 'pigfarm-v3';
const SHELL = ['./', 'index.html', 'app.js', 'calc.js', 'sample.js', 'ci.png', 'ci_white.png', 'icon-192.png', 'manifest.webmanifest',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request)));
});
