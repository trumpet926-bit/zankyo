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
  'js/edo-faces.js',
  'js/notice.js',
  'js/sync.js',
  'js/sync-ui.js',
  'js/ensemble.js',
  'js/tap-calib.js',
  'js/zankyo.js',
  'js/share.js',
  'js/xmas.js',
  'js/watch-remote.js',
  'js/hidden-share.js',
  'js/install.js',
  'js/update.js',
  'icons/logo.png',
  'icons/logo-seal.png',
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
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME && k !== 'zankyo-badge').map((k) => caches.delete(k))))
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

// ---------- お知らせの通知（Firebase Cloud Messaging から届く） ----------
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = {};
  }
  const m = payload.data || payload.notification || payload;
  event.waitUntil((async () => {
    await self.registration.showNotification(m.title || '残響 お知らせ', {
      body: m.body || '',
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      tag: 'zankyo-notice',
      renotify: true,
      data: { link: m.link || './?notice=1' },
    });
    // ホーム画面のアイコンの数字を1つ増やす（開いて読むと、アプリが正しい数に直す）
    try {
      if (self.navigator.setAppBadge) {
        const cache = await caches.open('zankyo-badge');
        const saved = await cache.match('count');
        const count = (saved ? Number(await saved.text()) : 0) + 1;
        await cache.put('count', new Response(String(count)));
        await self.navigator.setAppBadge(count);
      }
    } catch (e) {
      // 数字を出せない端末もある
    }
    // アプリを開いている人には、新しいお知らせが来たことを伝える
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    list.forEach((client) => client.postMessage({ type: 'notice-new' }));
  })());
});

// 通知を押したら、アプリを開いてお知らせを出す
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || './?notice=1';
  event.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (list.length) {
      const client = list[0];
      await client.focus();
      client.postMessage({ type: 'notice-open' });
      return;
    }
    await self.clients.openWindow(link);
  })());
});
