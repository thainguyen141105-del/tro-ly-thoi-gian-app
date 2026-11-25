// Service worker: chạy offline (lưu vỏ app) + hiện thông báo + mở đúng màn khi bấm thông báo.
const CACHE = 'tro-ly-v2';
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './index.html', './manifest.webmanifest'])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.endsWith('/version.json')) return; // luôn lấy thẳng từ mạng để biết có bản mới
  // Mạng trước, lỗi mạng thì lấy bản đã lưu → dùng được khi offline.
  e.respondWith(
    fetch(req).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res; })
      .catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
  );
});
self.addEventListener('push', (e) => {
  const d = e.data ? e.data.json() : { title: 'Trợ lý thời gian', body: '' };
  e.waitUntil(self.registration.showNotification(d.title, { body: d.body, tag: d.tag, data: { href: d.href } }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const href = (e.notification.data && e.notification.data.href) || '#hom-nay';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
    if (cs.length) { cs[0].postMessage({ href }); return cs[0].focus(); }
    return self.clients.openWindow('./' + href);
  }));
});
