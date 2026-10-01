// Простой service worker: офлайн-доступ к оболочке приложения.
// Данные и так в localStorage, поэтому кешируем только статику.
// v6: новое имя удаляет старый кеш, в который годами копились уникальные
// /version.json?t=… (каждая проверка обновления оседала отдельной записью).
const CACHE = "finance-shell-v6";

// Служебные адреса: проверка версии и страницы PIN-шлюза nginx. Их всегда
// берём из сети и никогда не кешируем.
const BYPASS = new Set(["/version.json", "/lock", "/logout", "/backup"]);

// Сразу кладём в новый кеш оболочку и её статику: activate удаляет прежний
// кеш, и без этого первый запуск без сети после обновления не открылся бы.
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    (async () => {
      try {
        const res = await fetch("/", { cache: "no-store" });
        if (!res.ok || res.redirected) return;
        const html = await res.clone().text();
        const cache = await caches.open(CACHE);
        await cache.put("/", res);
        const assets = [...new Set(html.match(/\/_next\/static\/[^"'\s)]+/g) || [])];
        await Promise.all(
          assets.map((a) =>
            fetch(a)
              .then((r) => (r.ok ? cache.put(a, r) : undefined))
              .catch(() => {})
          )
        );
      } catch (e) {
        // нет сети при установке — кеш наполнится при следующем открытии
      }
    })()
  );
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
  if (BYPASS.has(url.pathname)) return;

  // Network-first: свежее, если есть сеть; из кеша — если офлайн
  event.respondWith(
    fetch(req)
      .then((res) => {
        // Кешируем только обычные успешные ответы без параметров в адресе.
        // Редирект на /lock (истёк PIN) иначе подменил бы собой оболочку.
        if (res.ok && !res.redirected && res.type === "basic" && !url.search) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(async () => {
        const hit = await caches.match(req);
        if (hit) return hit;
        if (req.mode === "navigate") {
          const shell = await caches.match("/");
          if (shell) return shell;
        }
        return Response.error();
      })
  );
});
