import "server-only";
import { assertProductImage, detectImageType } from "@buscom/domain/product/images";
import { db } from "@/server/db";
import { ForbiddenError } from "@/server/errors";
import type { Tx } from "@/server/orders/internal";
import { canEditCatalog } from "@/server/products/service";
import type { SessionUser } from "@/server/session";

export type NewImage = {
  data: Uint8Array<ArrayBuffer>;
  /** Уменьшенная копия; у загруженной руками её нет — в списках покажется полная */
  thumbData?: Uint8Array<ArrayBuffer> | null;
  /** Адрес на сайте — ключ повторного импорта */
  sourceUrl?: string | null;
};

/**
 * Порядок картинок товара: 0, 1, 2 … в переданном порядке. Первая по порядку —
 * аватарка (в списках и в заказах показывается она). Картинки, уже стоящие на
 * своём месте, не трогаем: у товара их бывает под полсотни, а повторный импорт
 * обычно не меняет порядок вовсе.
 */
export async function renumberImages(tx: Tx, ids: string[]): Promise<void> {
  const current = await tx.productImage.findMany({
    where: { id: { in: ids } },
    select: { id: true, sortOrder: true },
  });
  const sortOrderById = new Map(current.map((image) => [image.id, image.sortOrder]));

  for (const [index, id] of ids.entries()) {
    if (sortOrderById.get(id) === index) continue;
    await tx.productImage.update({ where: { id }, data: { sortOrder: index } });
  }
}

/** Новая картинка в конец галереи. Тип определяется по сигнатуре файла. */
export async function createImage(tx: Tx, productId: string, image: NewImage): Promise<{ id: string }> {
  const contentType = assertProductImage(image.data);
  const thumbType = image.thumbData ? detectImageType(image.thumbData) : null;

  const last = await tx.productImage.findFirst({
    where: { productId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  return tx.productImage.create({
    data: {
      productId,
      sortOrder: last ? last.sortOrder + 1 : 0,
      contentType,
      data: image.data,
      byteSize: image.data.byteLength,
      // Превью с неопознанным типом не храним — лучше показать полную картинку.
      thumbData: thumbType ? image.thumbData : null,
      thumbContentType: thumbType,
      sourceUrl: image.sourceUrl ?? null,
    },
    select: { id: true },
  });
}

/**
 * Загрузка картинок в галерею товара — по одной или пачкой. Каждая встаёт в
 * конец; какая аватарка, решает человек кнопкой «Сделать главной».
 *
 * Картинка — новая запись с новым id, а не правка старой: адрес отдачи меняется
 * вместе с файлом, поэтому браузер кеширует его навсегда.
 */
export async function addImages(productId: string, files: Uint8Array<ArrayBuffer>[], user: SessionUser): Promise<void> {
  if (!canEditCatalog(user.role)) throw new ForbiddenError("Недостаточно прав, чтобы менять картинки товара");
  // Проверяем все файлы до записи: пачка сохраняется целиком или никак.
  for (const file of files) assertProductImage(file);

  await db.$transaction(async (tx) => {
    for (const data of files) await createImage(tx, productId, { data });
  });
}

/**
 * Удаление одной картинки. Оставшиеся сдвигаются одним запросом, а не по одной:
 * у сиденья картинок под полсотни, и обновление каждой не укладывалось в
 * пятисекундный срок транзакции по общей базе за туннелем.
 */
export async function deleteImage(imageId: string, user: SessionUser): Promise<void> {
  if (!canEditCatalog(user.role)) throw new ForbiddenError("Недостаточно прав, чтобы менять картинки товара");
  const image = await db.productImage.findUnique({
    where: { id: imageId },
    select: { productId: true, sortOrder: true },
  });
  if (!image) throw new Error("Картинка не найдена — обновите страницу");

  await db.$transaction(async (tx) => {
    // Только id: иначе Prisma вернула бы удалённую строку вместе с байтами картинки.
    await tx.productImage.delete({ where: { id: imageId }, select: { id: true } });
    await tx.productImage.updateMany({
      where: { productId: image.productId, sortOrder: { gt: image.sortOrder } },
      data: { sortOrder: { decrement: 1 } },
    });
  });
}

/** «Сделать главной»: картинка уходит в начало, те, что были перед ней, сдвигаются на шаг. */
export async function makeImageMain(imageId: string, user: SessionUser): Promise<void> {
  if (!canEditCatalog(user.role)) throw new ForbiddenError("Недостаточно прав, чтобы менять картинки товара");
  const image = await db.productImage.findUnique({
    where: { id: imageId },
    select: { productId: true, sortOrder: true },
  });
  if (!image) throw new Error("Картинка не найдена — обновите страницу");

  await db.$transaction(async (tx) => {
    await tx.productImage.updateMany({
      where: { productId: image.productId, sortOrder: { lt: image.sortOrder } },
      data: { sortOrder: { increment: 1 } },
    });
    await tx.productImage.update({ where: { id: imageId }, data: { sortOrder: 0 } });
  });
}

/** Байты картинки для отдачи браузеру. Превью нет — отдаём полную. */
export async function readImage(
  id: string,
  size: "full" | "thumb",
): Promise<{ data: Uint8Array; contentType: string } | null> {
  if (size === "thumb") {
    const thumb = await db.productImage.findUnique({
      where: { id },
      select: { thumbData: true, thumbContentType: true },
    });
    if (!thumb) return null;
    if (thumb.thumbData && thumb.thumbContentType)
      return { data: thumb.thumbData, contentType: thumb.thumbContentType };
  }

  const image = await db.productImage.findUnique({ where: { id }, select: { data: true, contentType: true } });
  return image ? { data: image.data, contentType: image.contentType } : null;
}
