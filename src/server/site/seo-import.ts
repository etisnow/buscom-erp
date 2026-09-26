import "server-only";
import { z } from "zod";
import { planSiteSeo, type OldSnapshotRow, type SeoPlan } from "@/domain/site/seo-import";
import { db } from "@/server/db";

/**
 * Перенос слугов, метатегов и переадресаций из снимка старого сайта в базу
 * (этап 2, `docs/SITE-PLAN.md`). Что куда — решает `planSiteSeo`; здесь только
 * чтение ERP и запись одной транзакцией.
 *
 * Повторный прогон безопасен: слуг и метатеги, уже заданные в ERP, план не трогает,
 * переадресации узнаются по `fromPath` и обновляются.
 */

const breadcrumbSchema = z.object({ name: z.string(), url: z.string() });

const pageSchema = z.object({
  kind: z.enum(["home", "product", "category", "manufacturer", "information", "other"]),
  opencartId: z.string().nullable(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  keywords: z.string().nullable(),
  canonical: z.string().nullable(),
  robots: z.string().nullable(),
  h1: z.string().nullable(),
  breadcrumbs: z.array(breadcrumbSchema),
  contentHtml: z.string().nullable(),
  contentText: z.string().nullable(),
});

/** Строка `docs/site-snapshot/pages.json`, который пишет `pnpm snapshot:old-site`. */
export const snapshotRowSchema = z.object({
  path: z.string(),
  url: z.string(),
  source: z.enum(["sitemap", "canonical", "extra"]),
  priority: z.string().nullable(),
  status: z.number().int(),
  location: z.string().nullable(),
  page: pageSchema.nullable(),
  error: z.string().optional(),
}) satisfies z.ZodType<OldSnapshotRow>;

export async function importSiteSeo(snapshot: OldSnapshotRow[], options: { dryRun: boolean }): Promise<SeoPlan> {
  const [products, categories] = await Promise.all([
    db.product.findMany({
      select: { id: true, externalId: true, name: true, slug: true, metaTitle: true, metaDescription: true },
    }),
    db.productCategory.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        metaTitle: true,
        metaDescription: true,
        parent: { select: { name: true } },
      },
    }),
  ]);
  const plan = planSiteSeo(snapshot, {
    products,
    categories: categories.map(({ parent, ...category }) => ({ ...category, parentName: parent?.name ?? null })),
  });
  if (options.dryRun) return plan;

  await db.$transaction(
    async (tx) => {
      for (const item of plan.products) {
        await tx.product.update({
          where: { id: item.id },
          data: { slug: item.slug, metaTitle: item.metaTitle, metaDescription: item.metaDescription },
        });
      }
      for (const item of plan.categories) {
        await tx.productCategory.update({
          where: { id: item.id },
          data: { slug: item.slug, metaTitle: item.metaTitle, metaDescription: item.metaDescription },
        });
      }
      for (const { fromPath, ...target } of plan.redirects) {
        await tx.urlRedirect.upsert({ where: { fromPath }, create: { fromPath, ...target }, update: target });
      }
    },
    // Около 700 записей через туннель — дольше стандартных 5 секунд
    { timeout: 120_000 },
  );
  return plan;
}
