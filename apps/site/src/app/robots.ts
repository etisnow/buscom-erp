import type { MetadataRoute } from "next";
import { siteEnv } from "@/env";

// Считается на каждый запрос: индексацию включают переменной без пересборки (src/env.ts)
export const dynamic = "force-dynamic";

/**
 * `/robots.txt` (docs/SITE-PRD.md, «Индексация»). Пока сайт на временном адресе —
 * запрет всего. После переключения каталог открыт, закрыты корзина, оформление,
 * служебные маршруты и параметры сортировки.
 */
export default function robots(): MetadataRoute.Robots {
  const { SITE_URL, SITE_INDEXING } = siteEnv();
  if (!SITE_INDEXING) return { rules: [{ userAgent: "*", disallow: "/" }] };
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/korzina", "/oformlenie", "/api/", "/*?*sort="] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
