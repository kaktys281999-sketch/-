// Простой service worker: офлайн-доступ к оболочке приложения.
// Данные и так в localStorage, поэтому кешируем только статику.
const CACHE = "finance-shell-v4";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Не трогаем запросы синхронизации (Google Apps Script) и сторонние домены
  if (url.origin !== self.location.origin) return;

  // Network-first: свежее, если есть сеть; из кеша — если офлайн
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match("/")))
  );
});
