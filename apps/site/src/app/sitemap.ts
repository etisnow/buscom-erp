import type { MetadataRoute } from "next";
import { SITE_ORIGIN } from "@/config/company";
import { MODELS_PATH } from "@buscom/domain/site/models";
import { getModels, getSitemapEntries } from "@/server/catalog";

// Из базы на запрос (данные — из кеша каталога): при сборке базы нет
export const dynamic = "force-dynamic";

const STATIC_PAGES = ["/kontakty", "/oplata-dostavka", "/privacy"];

/**
 * `/sitemap.xml` — только канонические адреса (SITE-PRD, «Индексация»): главная,
 * непустые категории, товары в продаже (`lastmod` по `updatedAt`), статические страницы
 * и страницы моделей, у которых есть товары.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [entries, models] = await Promise.all([getSitemapEntries(), getModels()]);
  return [
    { url: `${SITE_ORIGIN}/`, changeFrequency: "weekly", priority: 1 },
    ...STATIC_PAGES.map((path) => ({ url: `${SITE_ORIGIN}${path}`, changeFrequency: "monthly" as const })),
    ...entries.map((entry) => ({ url: `${SITE_ORIGIN}/${entry.slug}`, lastModified: entry.updatedAt })),
    ...(models.length > 0 ? [{ url: `${SITE_ORIGIN}${MODELS_PATH}`, changeFrequency: "weekly" as const }] : []),
    ...models.map((model) => ({
      url: `${SITE_ORIGIN}${MODELS_PATH}/${model.slug}`,
      changeFrequency: "weekly" as const,
    })),
  ];
}
