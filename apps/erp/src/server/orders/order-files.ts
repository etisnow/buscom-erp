import "server-only";
import { assertOrderFile, canDeleteOrderFile, isGalleryImage, OrderFileError } from "@buscom/domain/order/order-files";
import { db } from "@/server/db";
import { ForbiddenError } from "@/server/errors";
import { makeThumbnail } from "@/server/files/thumbnail";
import { loadOrder, writeOrderEvent } from "@/server/orders/internal";
import type { SessionUser } from "@/server/session";

/**
 * Галерея файлов заказа (`OrderFile`). В отличие от накладной и счёта поставщика файлов
 * сколько угодно, вида нет, замены нет — только добавить и удалить. Добавлять можно
 * и в закрытый заказ: фото отгрузки или подписанные документы приходят после «Выполнен».
 * Каждое изменение пишет `OrderEvent` в той же транзакции.
 */

/** Запас по времени на файл до 15 МБ — почему, см. `supplier-documents.ts`. */
const UPLOAD_TX = { timeout: 30_000 };

export type OrderFileView = {
  id: string;
  fileName: string;
  contentType: string;
  byteSize: number;
  uploadedAt: Date;
  uploadedById: string | null;
  uploadedByName: string | null;
};

export async function listOrderFiles(orderId: string): Promise<OrderFileView[]> {
  const rows = await db.orderFile.findMany({
    where: { orderId },
    orderBy: [{ uploadedAt: "asc" }, { id: "asc" }],
    // Байты сюда не тянем — их отдаёт маршрут /api/order-files/[id]
    select: {
      id: true,
      fileName: true,
      contentType: true,
      byteSize: true,
      uploadedAt: true,
      uploadedById: true,
      uploadedBy: { select: { name: true } },
    },
  });
  return rows.map(({ uploadedBy, ...row }) => ({
    ...row,
    uploadedByName: uploadedBy?.name ?? null,
  }));
}

export async function uploadOrderFile(
  orderId: string,
  fileName: string,
  data: Uint8Array<ArrayBuffer>,
  user: SessionUser,
): Promise<{ id: string }> {
  const contentType = assertOrderFile(data);
  // Уменьшаем до транзакции: декодирование большой фотографии — заметные доли секунды
  const thumbData = isGalleryImage(contentType) ? await makeThumbnail(data) : null;

  return db.$transaction(async (tx) => {
    await loadOrder(tx, orderId);
    const created = await tx.orderFile.create({
      data: {
        orderId,
        fileName,
        contentType,
        byteSize: data.byteLength,
        data,
        thumbData,
        uploadedById: user.id,
      },
      select: { id: true },
    });
    await writeOrderEvent(tx, {
      orderId,
      user,
      type: "ORDER_DOCUMENT_CHANGED",
      comment: `Файлы заказа: добавлен «${fileName}»`,
    });
    return created;
  }, UPLOAD_TX);
}

export async function deleteOrderFile(orderId: string, fileId: string, user: SessionUser): Promise<void> {
  await db.$transaction(async (tx) => {
    await loadOrder(tx, orderId);
    const file = await tx.orderFile.findFirst({
      where: { id: fileId, orderId },
      select: { id: true, fileName: true, uploadedById: true },
    });
    if (!file) throw new OrderFileError("Файл не найден — обновите страницу");
    if (!canDeleteOrderFile(file, user)) {
      throw new ForbiddenError("Удалить файл может тот, кто его загрузил, руководитель или администратор");
    }

    await tx.orderFile.delete({ where: { id: file.id }, select: { id: true } });
    await writeOrderEvent(tx, {
      orderId,
      user,
      type: "ORDER_DOCUMENT_CHANGED",
      comment: `Файлы заказа: удалён «${file.fileName}»`,
    });
  });
}

/** Байты для маршрута `/api/order-files/[id]`: миниатюра, если просили и она есть, иначе оригинал. */
export async function readOrderFile(
  id: string,
  size: "full" | "thumb",
): Promise<{ data: Uint8Array; contentType: string; fileName: string } | null> {
  if (size === "thumb") {
    const thumb = await db.orderFile.findUnique({ where: { id }, select: { thumbData: true, fileName: true } });
    if (!thumb) return null;
    if (thumb.thumbData) return { data: thumb.thumbData, contentType: "image/jpeg", fileName: thumb.fileName };
  }
  return db.orderFile.findUnique({ where: { id }, select: { data: true, contentType: true, fileName: true } });
}
