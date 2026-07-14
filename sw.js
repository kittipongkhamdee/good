// Service worker ขั้นต่ำ — มีไว้เพื่อให้ Chrome/Android นับหน้านี้เป็น PWA ที่ติดตั้งได้
// (ขึ้นแบนเนอร์ "ติดตั้งแอป" อัตโนมัติ) ไม่ได้ทำ offline caching ใดๆ ปล่อยทุก request ผ่านเครือข่ายตามปกติ
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
