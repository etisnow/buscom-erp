import type { MetadataRoute } from "next";
import { SITE_ORIGIN } from "@/config/company";

/**
 * `/sitemap.xml` — пока только главная. Каталог (слуги товаров и категорий из
 * базы, `lastmod` по `updatedAt`) и страницы добавляются на этапе 4.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: `${SITE_ORIGIN}/`, changeFrequency: "weekly", priority: 1 }];
}
