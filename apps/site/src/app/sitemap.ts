import type { MetadataRoute } from "next";
import { SITE_ORIGIN } from "@/config/company";
import { getSitemapEntries } from "@/server/catalog";

// Из базы на запрос (данные — из кеша каталога): при сборке базы нет
export const dynamic = "force-dynamic";

const STATIC_PAGES = ["/kontakty", "/oplata-dostavka", "/privacy"];

/**
 * `/sitemap.xml` — только канонические адреса (SITE-PRD, «Индексация»): главная,
 * непустые категории, товары в продаже (`lastmod` по `updatedAt`) и статические страницы.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries = await getSitemapEntries();
  return [
    { url: `${SITE_ORIGIN}/`, changeFrequency: "weekly", priority: 1 },
    ...STATIC_PAGES.map((path) => ({ url: `${SITE_ORIGIN}${path}`, changeFrequency: "monthly" as const })),
    ...entries.map((entry) => ({ url: `${SITE_ORIGIN}/${entry.slug}`, lastModified: entry.updatedAt })),
  ];
}
