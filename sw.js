// Service worker ขั้นต่ำ — มีไว้เพื่อให้ Chrome/Android นับหน้านี้เป็น PWA ที่ติดตั้งได้
// (ขึ้นแบนเนอร์ "ติดตั้งแอป" อัตโนมัติ) ไม่ได้ทำ offline caching ใดๆ ปล่อยทุก request ผ่านเครือข่ายตามปกติ
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});

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
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
