import type { Metadata } from "next";
import { COMPANY } from "@/config/company";

/**
 * Метатеги индексируемой страницы: title, description, canonical, `og:` и `twitter:`
 * (docs/SITE-PRD.md, «Метатеги и разметка»).
 *
 * Next сливает метаданные сегментов поверхностно: `openGraph` страницы целиком
 * заменяет `openGraph` layout-а (node_modules/next/dist/docs/…/generate-metadata.md,
 * «Merging»). Поэтому `siteName` и `locale` собираются здесь каждый раз.
 */
export function pageMetadata({
  title,
  description,
  path,
  image,
  type = "website",
}: {
  /** Полный title — шаблон layout-а «%s | Баском» к нему не добавляется */
  title: string;
  description?: string;
  /** Канонический путь от корня: `/polki` */
  path: string;
  /** Путь картинки от корня: `/img/{id}` */
  image?: string;
  type?: "website" | "article";
}): Metadata {
  const images = image ? [image] : undefined;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: path },
    openGraph: { siteName: COMPANY.brand, locale: "ru_RU", type, title, description, url: path, images },
    twitter: { card: image ? "summary_large_image" : "summary", title, description, images },
  };
}
