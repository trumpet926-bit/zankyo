// 電波がなくても動くようにする仕組み（サービスワーカー）
// ネットにつながるときは常に最新のファイルを使い、つながらないときは保存しておいたファイルを使う

importScripts('js/version.js'); // 版の番号（変わると、このサービスワーカーも新しくなる）

const CACHE_NAME = `zankyo-${APP_VERSION}`;
const FILES = [
  './',
  'index.html',
  'style.css',
  'manifest.webmanifest',
  'js/version.js',
  'js/music.js',
  'js/scale-guide.js',
  'js/storage.js',
  'js/usage.js',
  'js/audio.js',
  'js/metronome.js',
  'js/notation.js',
  'js/staff.js',
  'js/scale-player.js',
  'js/pitch.js',
  'js/tuner.js',
  'js/drone.js',
  'js/recordings-db.js',
  'js/recorder.js',
  'js/player.js',
  'js/waveform.js',
  'js/app.js',
  'js/calib.js',
  'js/sync.js',
  'js/sync-ui.js',
  'js/ensemble.js',
  'js/zankyo.js',
  'js/share.js',
  'js/install.js',
  'js/update.js',
  'icons/logo.png',
  'icons/app-qr.svg',
  'icons/icon-32.png',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/watermark-light.png',
  'icons/watermark-dark.png',
];

self.addEventListener('install', (event) => {
  // ブラウザの一時保存ではなく、必ずサーバーから取り直して保存する
  event.waitUntil(caches.open(CACHE_NAME).then((cache) =>
    cache.addAll(FILES.map((file) => new Request(file, { cache: 'reload' })))));
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
  // 毎回サーバーに「新しくなっていないか」を確かめる（GitHub の一時保存で古いファイルを使わないように）
  const fresh = request.mode === 'navigate'
    ? fetch(request.url, { cache: 'no-cache', credentials: 'same-origin' })
    : fetch(request, { cache: 'no-cache' });
  event.respondWith(
    fresh
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(() => caches.match(request, { ignoreSearch: true }))
  );
});
