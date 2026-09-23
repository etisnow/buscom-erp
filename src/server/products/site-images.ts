import "server-only";
import { db } from "@/server/db";
import { createImage, renumberImages } from "@/server/products/images";
import type { SiteProductRow } from "@/server/products/site-import";

export type SiteImagesReport = {
  /** Товаров в файле */
  всего: number;
  /** Картинок скачано и сохранено */
  загружено: number;
  /** Картинок уже было — скачивать не пришлось */
  ужеЕсть: number;
  /** Картинок убрано: на сайте их больше нет */
  удалено: number;
  /** Товаров без картинок на сайте */
  безКартинки: number;
  /** Товара с таким product_id в ERP нет — сначала `import:site-products` */
  нетТовара: number;
  ошибки: { externalId: string; name: string; error: string }[];
};

export type Download = (url: string) => Promise<Uint8Array<ArrayBuffer>>;

/**
 * Галерея товара с сайта: главная картинка и все дополнительные, в порядке
 * страницы товара. Первая становится аватаркой.
 *
 * Ключ повторного прогона — адрес картинки (`ProductImage.sourceUrl`): что уже
 * лежит в ERP с тем же адресом, не скачивается заново, только переставляется в
 * порядок сайта. Картинка, которой на сайте больше нет, из ERP убирается — для
 * товаров с сайта источник правды сайт.
 *
 * Загруженные в ERP руками (`sourceUrl` пуст) импорт не трогает: они остаются
 * после картинок сайта. Раньше импорт затирал такую картинку — с галереей в
 * этом нет нужды, и чужую работу лучше сохранить.
 *
 * `download` — параметр, чтобы тесты не ходили в сеть. `pauseMs` — пауза между
 * картинками, чтобы не нагружать магазин.
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
    удалено: 0,
    безКартинки: 0,
    нетТовара: 0,
    ошибки: [],
  };

  const products = await db.product.findMany({
    where: { externalId: { in: rows.map((row) => row.externalId) } },
    select: {
      id: true,
      externalId: true,
      images: { orderBy: { sortOrder: "asc" }, select: { id: true, sourceUrl: true } },
    },
  });
  const byExternalId = new Map(products.map((product) => [product.externalId, product]));

  for (const [index, row] of rows.entries()) {
    options.onProgress?.(index + 1, rows.length);
    const siteImages = row.images ?? [];
    const product = byExternalId.get(row.externalId);

    if (siteImages.length === 0) {
      report.безКартинки += 1;
      continue;
    }
    if (!product) {
      report.нетТовара += 1;
      continue;
    }

    const known = new Map(product.images.filter((image) => image.sourceUrl).map((image) => [image.sourceUrl, image]));
    const siteUrls = new Set(siteImages.map((image) => image.url));
    const stale = product.images.filter((image) => image.sourceUrl && !siteUrls.has(image.sourceUrl));
    const manual = product.images.filter((image) => !image.sourceUrl);
    const missing = siteImages.filter((image) => !known.has(image.url));

    report.ужеЕсть += siteImages.length - missing.length;
    report.загружено += missing.length;
    report.удалено += stale.length;
    if (options.dryRun) continue;

    try {
      // Скачиваем всё до записи: товар не должен остаться с половиной галереи.
      const downloaded = new Map<
        string,
        { data: Uint8Array<ArrayBuffer>; thumbData: Uint8Array<ArrayBuffer> | null }
      >();
      for (const image of missing) {
        const data = await options.download(image.url);
        // Без превью обойдёмся: в списках покажется полная картинка.
        const thumbData = image.thumbUrl ? await options.download(image.thumbUrl).catch(() => null) : null;
        downloaded.set(image.url, { data, thumbData });
        if (options.pauseMs) await new Promise((resolve) => setTimeout(resolve, options.pauseMs));
      }

      // Запись — одной транзакцией, но с запасом по времени: картинки большие,
      // а по SSH-туннелю до общей базы разработки пяти секунд по умолчанию мало.
      await db.$transaction(
        async (tx) => {
          if (stale.length > 0)
            await tx.productImage.deleteMany({ where: { id: { in: stale.map((image) => image.id) } } });

          const ordered: string[] = [];
          for (const image of siteImages) {
            const existing = known.get(image.url);
            if (existing) {
              ordered.push(existing.id);
              continue;
            }
            const file = downloaded.get(image.url);
            if (!file) continue;
            const created = await createImage(tx, product.id, {
              data: file.data,
              thumbData: file.thumbData,
              sourceUrl: image.url,
            });
            ordered.push(created.id);
          }
          // Свои картинки — после картинок сайта, порядок между собой прежний.
          await renumberImages(tx, [...ordered, ...manual.map((image) => image.id)]);
        },
        { timeout: 60_000 },
      );
    } catch (error) {
      report.загружено -= missing.length;
      report.удалено -= stale.length;
      report.ошибки.push({
        externalId: row.externalId,
        name: row.name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return report;
}
