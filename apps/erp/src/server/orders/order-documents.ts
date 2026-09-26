import "server-only";
import {
  canManageOrderDocuments,
  ORDER_DOCUMENT_LABELS,
  type OrderDocumentKind,
} from "@buscom/domain/order/order-document";
import { assertSupplierDocument } from "@buscom/domain/order/supplier-document";
import { db } from "@/server/db";
import { ForbiddenError } from "@/server/errors";
import { loadOrder, writeOrderEvent } from "@/server/orders/internal";
import type { SessionUser } from "@/server/session";

/**
 * Файлы самого заказа (`OrderDocument`) — сейчас транспортная накладная.
 * Устроено как счёт поставщика (`src/server/orders/supplier-documents.ts`):
 * проверка файла по сигнатуре, замена — новая запись с новым id, каждое
 * изменение пишет `OrderEvent` в той же транзакции.
 */

/** Запас по времени на файл до 15 МБ — почему, см. `supplier-documents.ts`. */
const UPLOAD_TX = { timeout: 30_000 };

export async function uploadOrderDocument(
  orderId: string,
  kind: OrderDocumentKind,
  fileName: string,
  data: Uint8Array<ArrayBuffer>,
  user: SessionUser,
): Promise<{ id: string }> {
  const contentType = assertSupplierDocument(data);

  return db.$transaction(async (tx) => {
    const order = await loadOrder(tx, orderId);
    if (!canManageOrderDocuments(order.status, user.role)) {
      throw new ForbiddenError("Прикреплять файлы к этому заказу нельзя");
    }

    // Старую запись убираем до вставки новой: уникальность (заказ, вид) не пустит две строки.
    const current = await tx.orderDocument.findUnique({
      where: { orderId_kind: { orderId, kind } },
      select: { id: true },
    });
    if (current) await tx.orderDocument.delete({ where: { id: current.id }, select: { id: true } });

    const created = await tx.orderDocument.create({
      data: { orderId, kind, fileName, contentType, data, byteSize: data.byteLength },
      select: { id: true },
    });

    await writeOrderEvent(tx, {
      orderId,
      user,
      type: "ORDER_DOCUMENT_CHANGED",
      comment: `${ORDER_DOCUMENT_LABELS[kind]}: файл «${fileName}» ${current ? "заменён" : "прикреплён"}`,
    });

    return created;
  }, UPLOAD_TX);
}

/** Убирает файл, если он есть. Отсутствие — не ошибка: убрать уже нечего. */
export async function deleteOrderDocument(orderId: string, kind: OrderDocumentKind, user: SessionUser): Promise<void> {
  await db.$transaction(async (tx) => {
    const order = await loadOrder(tx, orderId);
    if (!canManageOrderDocuments(order.status, user.role)) {
      throw new ForbiddenError("Убирать файлы у этого заказа нельзя");
    }

    const existing = await tx.orderDocument.findUnique({
      where: { orderId_kind: { orderId, kind } },
      select: { id: true, fileName: true },
    });
    if (!existing) return;

    await tx.orderDocument.delete({ where: { id: existing.id }, select: { id: true } });
    await writeOrderEvent(tx, {
      orderId,
      user,
      type: "ORDER_DOCUMENT_CHANGED",
      comment: `${ORDER_DOCUMENT_LABELS[kind]}: файл «${existing.fileName}» удалён`,
    });
  });
}

/** Байты файла для отдачи браузеру — маршрут `/api/order-documents/[id]`. */
export async function readOrderDocument(
  id: string,
): Promise<{ data: Uint8Array; contentType: string; fileName: string } | null> {
  return db.orderDocument.findUnique({
    where: { id },
    select: { data: true, contentType: true, fileName: true },
  });
}
