import type { MetadataRoute } from "next";

/**
 * `/robots.txt` — запрет обхода для всех роботов. Индексацию запрещает
 * `X-Robots-Tag` из `next.config.ts` и `metadata.robots` в корневом layout:
 * robots.txt сам по себе не мешает адресу попасть в выдачу.
 *
 * Маршрут открыт без сессии (исключение в `src/proxy.ts`) — иначе робот
 * получал бы на него 307 на страницу входа и запрета не видел.
 */
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", disallow: "/" }] };
}
