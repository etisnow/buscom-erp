import "server-only";
import { resolveSitePage, SITE_PAGE_SLUGS, type SitePageContent, type SitePageSlug } from "@buscom/domain/site/pages";
import { db } from "@/server/db";
import { ForbiddenError } from "@/server/errors";
import { canEditCatalog } from "@/server/products/service";
import type { SessionUser } from "@/server/session";

/**
 * Тексты статических страниц сайта (docs/SITE-PLAN.md, этап 6). Набор страниц —
 * в packages/domain/src/site/pages.ts; здесь только чтение и запись `SitePage`.
 * Права — как у каталога: менеджер, руководитель, администратор.
 */

export type SitePageRow = SitePageContent & {
  /** Правили в ERP; нет — на сайте исходный текст */
  edited: boolean;
  updatedAt: Date | null;
  updatedByName: string | null;
};

export async function listSitePages(): Promise<SitePageRow[]> {
  const saved = await db.sitePage.findMany({
    select: {
      slug: true,
      title: true,
      metaTitle: true,
      metaDescription: true,
      body: true,
      updatedAt: true,
      updatedBy: { select: { name: true } },
    },
  });
  const bySlug = new Map(saved.map((row) => [row.slug, row]));
  return SITE_PAGE_SLUGS.map((slug) => {
    const row = bySlug.get(slug) ?? null;
    return {
      ...resolveSitePage(slug, row),
      edited: row !== null,
      updatedAt: row?.updatedAt ?? null,
      updatedByName: row?.updatedBy?.name ?? null,
    };
  });
}

export type SitePageDraft = { title: string; metaTitle: string; metaDescription: string; body: string };

export async function saveSitePage(slug: SitePageSlug, draft: SitePageDraft, user: SessionUser): Promise<void> {
  if (!canEditCatalog(user.role)) throw new ForbiddenError("Править страницы сайта может менеджер или руководитель");
  const data = {
    title: draft.title.trim(),
    metaTitle: draft.metaTitle.trim(),
    metaDescription: draft.metaDescription.trim() || null,
    // Хвостовые пробелы строк и лишние пустые строки на вид не влияют — не храним
    body: draft.body
      .replace(/[ \t]+$/gm, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
    updatedById: user.id,
  };
  await db.sitePage.upsert({ where: { slug }, create: { slug, ...data }, update: data });
}

/** Вернуть исходный текст: строка удаляется, сайт показывает текст из кода. */
export async function resetSitePage(slug: SitePageSlug, user: SessionUser): Promise<void> {
  if (!canEditCatalog(user.role)) throw new ForbiddenError("Править страницы сайта может менеджер или руководитель");
  await db.sitePage.deleteMany({ where: { slug } });
}
