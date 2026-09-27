import "server-only";
import { unstable_cache } from "next/cache";
import { resolveSitePage, type SitePageContent, type SitePageSlug } from "@buscom/domain/site/pages";
import { db } from "@/server/db";

/**
 * Статическая страница: текст из ERP (`SitePage`) поверх исходного из кода.
 * Кеш — как у каталога (src/server/catalog.ts): правка в ERP видна через несколько минут.
 */
export const getSitePage = unstable_cache(
  async (slug: SitePageSlug): Promise<SitePageContent> => {
    const saved = await db.sitePage.findUnique({
      where: { slug },
      select: { title: true, metaTitle: true, metaDescription: true, body: true },
    });
    return resolveSitePage(slug, saved);
  },
  ["site-page"],
  { revalidate: 300, tags: ["site-pages"] },
);
