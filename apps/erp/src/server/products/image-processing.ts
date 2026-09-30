import "server-only";
import { assertProductImage } from "@buscom/domain/product/images";
import { db } from "@/server/db";
import { ForbiddenError } from "@/server/errors";
import { getCarveKey, removeBackground } from "@/server/products/carve";
import { getDewatermarkKey, removeWatermark } from "@/server/products/dewatermark";
import { canEditCatalog } from "@/server/products/service";
import type { SessionUser } from "@/server/session";

export type StoredImageOperation = "watermark" | "background";

const NO_ACCESS = "Недостаточно прав, чтобы менять картинки товара";
const GONE = "Картинка не найдена — обновите страницу";

const IMAGE_SELECT = {
  productId: true,
  sortOrder: true,
  sourceUrl: true,
  data: true,
  contentType: true,
  originalData: true,
  originalContentType: true,
} as const;

/**
 * Обработка картинки, уже сохранённой у товара: снять водяной знак (dewatermark.ai) или удалить фон
 * (carve.photos) — то же, что при импорте с сайта поставщика. Результат встаёт на то же место в
 * галерее, а первоначальный снимок остаётся в `originalData` — его можно вернуть.
 *
 * Картинка — новая запись с новым id, старая удаляется: адрес отдачи меняется вместе с файлом,
 * поэтому браузер, кеширующий его навсегда, не покажет старую. Внешний сервис вызывается до
 * транзакции: минута ожидания ответа не должна держать соединение с базой.
 */
export async function processStoredImage(
  imageId: string,
  operation: StoredImageOperation,
  user: SessionUser,
): Promise<void> {
  if (!canEditCatalog(user.role)) throw new ForbiddenError(NO_ACCESS);
  const image = await db.productImage.findUnique({ where: { id: imageId }, select: IMAGE_SELECT });
  if (!image) throw new Error(GONE);

  const key = operation === "watermark" ? await getDewatermarkKey() : await getCarveKey();
  if (!key) {
    const service = operation === "watermark" ? "dewatermark.ai" : "Carve";
    throw new Error(`Ключ ${service} не задан в «Администрирование → Внешние сервисы»`);
  }
  const source = new Uint8Array(image.data);
  const result =
    operation === "watermark"
      ? await removeWatermark(source, "image", key)
      : await removeBackground(source, "image", key);
  if (!result.ok) throw new Error(result.error);
  const processed = new Uint8Array(result.data);
  const contentType = assertProductImage(processed);

  await db.$transaction(async (tx) => {
    // Только id: иначе Prisma вернула бы удалённую строку вместе с байтами картинки.
    await tx.productImage.delete({ where: { id: imageId }, select: { id: true } });
    await tx.productImage.create({
      data: {
        productId: image.productId,
        sortOrder: image.sortOrder,
        contentType,
        data: processed,
        byteSize: processed.byteLength,
        // Превью старой картинки не подходит к новой; в списках покажется полная
        thumbData: null,
        thumbContentType: null,
        sourceUrl: image.sourceUrl,
        // Оригинал — самый первый: повторная обработка его не затирает
        originalData: image.originalData ?? image.data,
        originalContentType: image.originalContentType ?? image.contentType,
      },
      select: { id: true },
    });
  });
}

/** «Вернуть оригинал»: на место обработанной картинки встаёт первоначальная, отметка об обработке снимается. */
export async function restoreOriginalImage(imageId: string, user: SessionUser): Promise<void> {
  if (!canEditCatalog(user.role)) throw new ForbiddenError(NO_ACCESS);
  const image = await db.productImage.findUnique({ where: { id: imageId }, select: IMAGE_SELECT });
  if (!image) throw new Error(GONE);
  if (!image.originalData || !image.originalContentType)
    throw new Error("Эту картинку не обрабатывали — возвращать нечего");
  const original = image.originalData;
  const originalType = image.originalContentType;

  await db.$transaction(async (tx) => {
    await tx.productImage.delete({ where: { id: imageId }, select: { id: true } });
    await tx.productImage.create({
      data: {
        productId: image.productId,
        sortOrder: image.sortOrder,
        contentType: originalType,
        data: original,
        byteSize: original.byteLength,
        sourceUrl: image.sourceUrl,
      },
      select: { id: true },
    });
  });
}
