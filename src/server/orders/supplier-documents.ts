import "server-only";
import { assertSupplierDocument, canManageSupplierDocuments } from "@/domain/order/supplier-document";
import type { SupplierActionKey } from "@/domain/supplier/actions";
import { db } from "@/server/db";
import { ForbiddenError } from "@/server/errors";
import { loadOrder, writeOrderEvent } from "@/server/orders/internal";
import type { SessionUser } from "@/server/session";

/**
 * Артефакты по поставщику в заказе (`OrderSupplierDocument`) — сейчас только
 * счёт от поставщика клиенту, ключ `"SUPPLIER_INVOICE"`. Права и типы файлов —
 * `src/domain/order/supplier-document.ts`. Каждое изменение пишет `OrderEvent`
 * в той же транзакции — это и история в карточке, и аудит.
 */

export class SupplierNotFoundError extends Error {
  constructor() {
    super("Поставщик не найден");
    this.name = "SupplierNotFoundError";
  }
}

/**
 * Прикрепление файла. Замена — новая запись с новым id вместо старой (как
 * аватарка товара): адрес файла меняется вместе с содержимым, поэтому его
 * можно кешировать в браузере навсегда. Старую запись убираем до вставки
 * новой — иначе в паре (заказ, поставщик, вид) на миг оказались бы две строки,
 * а уникальность этой тройки в базе как раз это и не пускает.
 */
export async function uploadSupplierDocument(
  orderId: string,
  supplierId: string,
  kind: SupplierActionKey,
  fileName: string,
  data: Uint8Array<ArrayBuffer>,
  user: SessionUser,
): Promise<{ id: string }> {
  const contentType = assertSupplierDocument(data);

  return db.$transaction(async (tx) => {
    const order = await loadOrder(tx, orderId);
    if (!canManageSupplierDocuments(order.status, user.role)) {
      throw new ForbiddenError("Прикреплять файлы к этому заказу нельзя");
    }

    const supplier = await tx.supplier.findUnique({ where: { id: supplierId }, select: { name: true } });
    if (!supplier) throw new SupplierNotFoundError();

    const current = await tx.orderSupplierDocument.findUnique({
      where: { orderId_supplierId_kind: { orderId, supplierId, kind } },
      select: { id: true },
    });
    if (current) await tx.orderSupplierDocument.delete({ where: { id: current.id } });

    const created = await tx.orderSupplierDocument.create({
      data: { orderId, supplierId, kind, fileName, contentType, data, byteSize: data.byteLength },
      select: { id: true },
    });

    await writeOrderEvent(tx, {
      orderId,
      user,
      type: "SUPPLIER_DOCUMENT_CHANGED",
      comment: `${supplier.name}: файл «${fileName}» ${current ? "заменён" : "прикреплён"}`,
    });

    return created;
  });
}

/** Убирает файл, если он есть. Отсутствие — не ошибка: убрать уже нечего. */
export async function deleteSupplierDocument(
  orderId: string,
  supplierId: string,
  kind: SupplierActionKey,
  user: SessionUser,
): Promise<void> {
  await db.$transaction(async (tx) => {
    const order = await loadOrder(tx, orderId);
    if (!canManageSupplierDocuments(order.status, user.role)) {
      throw new ForbiddenError("Убирать файлы у этого заказа нельзя");
    }

    const existing = await tx.orderSupplierDocument.findUnique({
      where: { orderId_supplierId_kind: { orderId, supplierId, kind } },
      select: { id: true, fileName: true, supplier: { select: { name: true } } },
    });
    if (!existing) return;

    await tx.orderSupplierDocument.delete({ where: { id: existing.id } });
    await writeOrderEvent(tx, {
      orderId,
      user,
      type: "SUPPLIER_DOCUMENT_CHANGED",
      comment: `${existing.supplier.name}: файл «${existing.fileName}» удалён`,
    });
  });
}

/** Байты файла для отдачи браузеру — маршрут `/api/order-supplier-documents/[id]`. */
export async function readSupplierDocument(
  id: string,
): Promise<{ data: Uint8Array; contentType: string; fileName: string } | null> {
  return db.orderSupplierDocument.findUnique({
    where: { id },
    select: { data: true, contentType: true, fileName: true },
  });
}
