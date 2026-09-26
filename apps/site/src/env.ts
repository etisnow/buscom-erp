import { z } from "zod";

/**
 * Переменные окружения сайта. Любая новая переменная — сюда и в .env.example.
 *
 * Читаются при каждом обращении, а не при сборке: образ собирается один, а
 * включать индексацию нужно в день переключения DNS — сменой переменной и
 * перезапуском контейнера, без новой сборки.
 */
const envSchema = z.object({
  /** Общая с ERP база (docs/SITE-PRD.md, «Два приложения, одна база») */
  DATABASE_URL: z.url(),
  /** Адрес сайта без слэша на конце — для canonical, sitemap.xml и robots.txt */
  SITE_URL: z.url().default("https://bus-com.ru"),
  /**
   * Открыт ли сайт поисковикам. До переключения DNS — нет: новый сайт живёт на
   * временном адресе, и копия каталога в выдаче навредила бы старому сайту.
   */
  SITE_INDEXING: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});

export type SiteEnv = z.infer<typeof envSchema>;

export function siteEnv(): SiteEnv {
  return envSchema.parse({
    DATABASE_URL: process.env.DATABASE_URL,
    SITE_URL: process.env.SITE_URL || undefined,
    SITE_INDEXING: process.env.SITE_INDEXING || undefined,
  });
}
