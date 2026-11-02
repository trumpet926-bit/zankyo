// 電波がなくても動くようにする仕組み（サービスワーカー）
// ネットにつながるときは常に最新のファイルを使い、つながらないときは保存しておいたファイルを使う

const CACHE_NAME = 'zankyo-v4';
const FILES = [
  './',
  'index.html',
  'style.css',
  'manifest.webmanifest',
  'js/music.js',
  'js/storage.js',
  'js/audio.js',
  'js/metronome.js',
  'js/notation.js',
  'js/scale-player.js',
  'js/pitch.js',
  'js/tuner.js',
  'js/recordings-db.js',
  'js/recorder.js',
  'js/player.js',
  'js/app.js',
  'js/sync.js',
  'js/sync-ui.js',
  'js/install.js',
  'icons/logo.png',
  'icons/icon-32.png',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/watermark-light.png',
  'icons/watermark-dark.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return;
  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(() => caches.match(request, { ignoreSearch: true }))
  );
});
