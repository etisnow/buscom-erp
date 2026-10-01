import type { MetadataRoute } from "next";
import { siteEnv } from "@/env";

// Считается на каждый запрос: индексацию включают переменной без пересборки (src/env.ts)
export const dynamic = "force-dynamic";

/**
 * `/robots.txt` (docs/SITE-PRD.md, «Индексация»). Пока сайт на временном адресе —
 * запрет всего. После переключения каталог открыт, закрыты корзина, оформление,
 * служебные маршруты и параметры сортировки. `Clean-param` — для Яндекса: адреса с метками
 * рекламы и сортировкой он склеивает с основным и не тратит на них обход. `Host` Яндекс
 * больше не читает (главное зеркало — по 301), поэтому его нет.
 */
export default function robots(): MetadataRoute.Robots {
  const { SITE_URL, SITE_INDEXING } = siteEnv();
  if (!SITE_INDEXING) return { rules: [{ userAgent: "*", disallow: "/" }] };
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/korzina", "/oformlenie", "/poisk", "/api/", "/*?*sort="],
        other: {
          "Clean-param": ["utm_source&utm_medium&utm_campaign&utm_content&utm_term", "yclid&ysclid&gclid", "sort"],
        },
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
