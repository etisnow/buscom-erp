import "server-only";
import { db } from "@/server/db";
import { replaceMainImage } from "@/server/products/images";
import type { SiteProductRow } from "@/server/products/site-import";

export type SiteImagesReport = {
  всего: number;
  загружено: number;
  ужеЕсть: number;
  безКартинки: number;
  /** Товара с таким product_id в ERP нет — сначала `import:site-products` */
  нетТовара: number;
  ошибки: { externalId: string; name: string; error: string }[];
};

export type Download = (url: string) => Promise<Uint8Array<ArrayBuffer>>;

/**
 * Аватарки товаров с сайта. Берём главную картинку и её готовое превью 228×228.
 * Ключ повторного прогона — адрес картинки (`ProductImage.sourceUrl`): если у
 * аватарки товара тот же адрес, ничего не скачиваем. Сменилась картинка на
 * сайте — аватарка заменяется. Картинку, загруженную в ERP руками, импорт тоже
 * заменит: для товаров с сайта источник правды сайт.
 *
 * `download` — параметр, чтобы тесты не ходили в сеть. `pauseMs` — пауза между
 * товарами, чтобы не нагружать магазин.
 */
export async function importSiteImages(
  rows: SiteProductRow[],
  options: {
    download: Download;
    dryRun?: boolean;
    pauseMs?: number;
    onProgress?: (done: number, total: number) => void;
  },
): Promise<SiteImagesReport> {
  const report: SiteImagesReport = {
    всего: rows.length,
    загружено: 0,
    ужеЕсть: 0,
    безКартинки: 0,
    нетТовара: 0,
    ошибки: [],
  };

  const products = await db.product.findMany({
    where: { externalId: { in: rows.map((row) => row.externalId) } },
    select: {
      id: true,
      externalId: true,
      images: { orderBy: { sortOrder: "asc" }, take: 1, select: { sourceUrl: true } },
    },
  });
  const byExternalId = new Map(products.map((product) => [product.externalId, product]));

  for (const [index, row] of rows.entries()) {
    options.onProgress?.(index + 1, rows.length);
    const main = row.images?.[0];
    const product = byExternalId.get(row.externalId);

    if (!main) {
      report.безКартинки += 1;
      continue;
    }
    if (!product) {
      report.нетТовара += 1;
      continue;
    }
    if (product.images[0]?.sourceUrl === main.url) {
      report.ужеЕсть += 1;
      continue;
    }

    report.загружено += 1;
    if (options.dryRun) continue;

    try {
      const data = await options.download(main.url);
      // Без превью обойдёмся: в списках покажется полная картинка.
      const thumbData = main.thumbUrl ? await options.download(main.thumbUrl).catch(() => null) : null;
      await db.$transaction((tx) => replaceMainImage(tx, product.id, { data, thumbData, sourceUrl: main.url }));
    } catch (error) {
      report.загружено -= 1;
      report.ошибки.push({
        externalId: row.externalId,
        name: row.name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    if (options.pauseMs) await new Promise((resolve) => setTimeout(resolve, options.pauseMs));
  }

  return report;
}
