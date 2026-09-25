/**
 * Service worker для пуш-уведомлений. Отдаётся маршрутом, а не из `public/`:
 * лежать он должен в корне сайта (иначе не получит область `/`), а текст держим рядом
 * с кодом, который шлёт ему уведомления (`src/server/push/service.ts`).
 * Маршрут открыт без входа (src/proxy.ts): браузер обновляет воркер сам, без cookie.
 *
 * Ничего не кеширует и офлайн-режима не даёт — только показывает уведомление
 * и открывает нужную страницу по нажатию.
 */
const SERVICE_WORKER = `
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "BusCom ERP";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      tag: data.tag || undefined,
      // Новое сообщение с тем же тегом снова звенит, а не молча заменяет старое
      renotify: Boolean(data.tag),
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        await client.focus();
        if (client.url !== url && "navigate" in client) await client.navigate(url);
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
`;

export function GET() {
  return new Response(SERVICE_WORKER, {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      // Браузер должен видеть новую версию воркера сразу после выката
      "Cache-Control": "no-cache",
    },
  });
}
