// Service worker — ทำสองอย่าง: (1) ให้ Chrome/Android นับเป็น PWA ที่ติดตั้งได้
// (2) แสดงหน้า offline.html แทนหน้า "ไม่มีอินเทอร์เน็ต" ของเบราว์เซอร์ตอนเปิดแอปโดยไม่มีเน็ต
// ไม่ทำ caching ของไฟล์แอป (index/app.js/style.css) เลย เพื่อไม่ให้ผู้ใช้ติดเวอร์ชันเก่า — โหลดสดจากเครือข่ายเสมอ
const OFFLINE_CACHE = 'good-offline-v1';
const OFFLINE_URL = 'offline.html';

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(OFFLINE_CACHE).then((c) => c.add(OFFLINE_URL)).catch(() => {}).then(() => self.skipWaiting())
  );
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== OFFLINE_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (e) => {
  if (e.request.mode !== 'navigate') return;
  e.respondWith(fetch(e.request).catch(() => caches.match(OFFLINE_URL).then((r) => r || Response.error())));
});

// ── Web Push — เตือนสตรีคใกล้ขาด (ส่งจาก Supabase Edge Function ที่ตั้งเวลาไว้) ──
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) {}
  const title = data.title || 'ระบบสะสมคะแนนความดี';
  const options = {
    body: data.body || '',
    icon: data.icon || 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    data: { url: data.url || './index.html' },
    tag: data.tag || 'streak-reminder',
    renotify: true,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || './index.html';
  const tag = event.notification.tag;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          // แท็บที่เปิดค้างไว้อาจไม่ได้รับ Realtime event สดๆ แล้ว (เบราว์เซอร์พักการเชื่อมต่อตอน
          // อยู่เบื้องหลัง) แค่ focus() เฉยๆ ไม่ทำให้หน้าเช็คงานเรียกใหม่ให้เอง ต้องบอกทางนี้ด้วย
          client.postMessage({ type: 'notification-click', tag });
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
