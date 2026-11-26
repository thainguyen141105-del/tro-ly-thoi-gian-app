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
// Hộp thư thông báo đẩy của máy này (IndexedDB "tro-ly-thong-bao" / "inbox", khoá = id thông báo): ghi lại mỗi thông báo đẩy
// nhận được, kể cả khi app đã tắt; lần sau mở app, chuông có đủ (src/lib/inbox.ts đọc, mergeInbox gộp và chống trùng theo id).
// Lỗi ghi không bao giờ chặn việc hiện thông báo.
function inbox(fn) {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('tro-ly-thong-bao');
    r.onupgradeneeded = () => r.result.createObjectStore('inbox');
    r.onerror = () => reject(r.error);
    r.onsuccess = () => {
      const db = r.result;
      try {
        const tx = db.transaction('inbox', 'readwrite');
        fn(tx.objectStore('inbox'));
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); };
      } catch (err) { db.close(); reject(err); }
    };
  });
}
const remember = (d) => (d && d.tag && d.tag !== 'test'
  ? inbox((s) => s.put({ id: d.tag, title: String(d.title || ''), body: String(d.body || ''), href: d.href, at: new Date().toISOString(), read: false }, d.tag))
  : Promise.resolve());
const markRead = (id) => (id && id !== 'test'
  ? inbox((s) => { const g = s.get(id); g.onsuccess = () => { if (g.result) s.put(Object.assign({}, g.result, { read: true }), id); }; })
  : Promise.resolve());
const quietly = (fn) => Promise.resolve().then(fn).catch(() => {});

self.addEventListener('push', (e) => {
  const d = e.data ? e.data.json() : { title: 'Trợ lý thời gian', body: '' };
  e.waitUntil(Promise.all([
    self.registration.showNotification(d.title, { body: d.body, tag: d.tag, data: { href: d.href } }),
    quietly(() => remember(d)),
  ]));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const href = (e.notification.data && e.notification.data.href) || '#hom-nay';
  const id = e.notification.tag;
  // Đường dẫn sâu "#thong-bao/<id>": app tự tìm đúng thẻ của thông báo (notificationTarget trong src/lib/notify.ts),
  // kể cả thông báo cũ chỉ có href "#hom-nay"; app đánh dấu thông báo đó đã đọc.
  const link = id && id !== 'test' ? '#thong-bao/' + encodeURIComponent(id) : href;
  e.waitUntil(Promise.all([
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
      if (cs.length) { cs[0].postMessage({ href: link }); return cs[0].focus(); }
      return self.clients.openWindow('./' + link);
    }),
    quietly(() => markRead(id)), // đã bấm trên máy → khi gộp vào chuông là "đã đọc"
  ]));
});
