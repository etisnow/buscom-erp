import type { MetadataRoute } from "next";
import { SITE_ORIGIN } from "@/config/company";
import { getSitemapEntries } from "@/server/catalog";

// Из базы на запрос (данные — из кеша каталога): при сборке базы нет
export const dynamic = "force-dynamic";

/**
 * `/sitemap.xml` — только канонические адреса (SITE-PRD, «Индексация»): главная,
 * непустые категории и товары в продаже, `lastmod` по `updatedAt`. Статические
 * страницы добавятся вместе с ними (этап 6).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries = await getSitemapEntries();
  return [
    { url: `${SITE_ORIGIN}/`, changeFrequency: "weekly", priority: 1 },
    ...entries.map((entry) => ({ url: `${SITE_ORIGIN}/${entry.slug}`, lastModified: entry.updatedAt })),
  ];
}
