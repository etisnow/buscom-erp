import "server-only";
import { OrderEditError } from "@/domain/order/editing";
import { canChangeOrderSource, ORDER_SOURCE_LABELS, type SystemOrderSource } from "@/domain/order/source";
import { db } from "@/server/db";
import { ForbiddenError } from "@/server/errors";
import { loadOrder, writeOrderEvent, type Tx } from "@/server/orders/internal";
import type { SessionUser } from "@/server/session";

/**
 * Пункт справочника для системного источника: его ставят интеграция (SITE) и
 * импорт (LEGACY). Миграция заводит оба; если справочник всё же пуст (чистая
 * тестовая база), пункт заводится здесь с названием по умолчанию.
 */
export async function resolveSystemSource(tx: Tx, code: SystemOrderSource): Promise<string> {
  const existing = await tx.dictionaryItem.findFirst({
    where: { type: "ORDER_SOURCE", systemCode: code },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await tx.dictionaryItem.create({
    data: { type: "ORDER_SOURCE", name: ORDER_SOURCE_LABELS[code], systemCode: code, sortOrder: 0 },
    select: { id: true },
  });
  return created.id;
}

/**
 * Источник, выбранный человеком: включённый пункт справочника и не системный —
 * «Сайт» и «Прежнюю ERP» руками не ставят, иначе заказ выдавал бы себя за пришедший извне.
 */
export async function assertManualSource(tx: Tx, sourceItemId: string): Promise<{ id: string; name: string }> {
  const item = await tx.dictionaryItem.findFirst({
    where: { id: sourceItemId, type: "ORDER_SOURCE", isActive: true, systemCode: null },
    select: { id: true, name: true },
  });
  if (!item) throw new OrderEditError("Такого источника нет или он выключен — выберите другой");
  return item;
}

const SOURCE_ROLES = ["MANAGER", "HEAD", "ADMIN"] as const;

/** Смена источника в карточке заказа. Пишет в журнал, как и любое изменение заказа. */
export async function changeOrderSource(orderId: string, sourceItemId: string, user: SessionUser): Promise<void> {
  if (!SOURCE_ROLES.includes(user.role as (typeof SOURCE_ROLES)[number])) {
    throw new ForbiddenError("Недостаточно прав, чтобы менять источник заказа");
  }

  await db.$transaction(async (tx) => {
    const order = await loadOrder(tx, orderId);
    if (!canChangeOrderSource(order.source)) {
      throw new OrderEditError("Источник заказа с сайта и из прежней ERP не меняется: он привязан к внешнему номеру");
    }
    if (order.sourceItemId === sourceItemId) return;

    const item = await assertManualSource(tx, sourceItemId);
    const before = order.sourceItemId
      ? await tx.dictionaryItem.findUnique({ where: { id: order.sourceItemId }, select: { name: true } })
      : null;

    await tx.order.update({ where: { id: order.id }, data: { sourceItemId: item.id } });
    await writeOrderEvent(tx, {
      orderId: order.id,
      user,
      type: "UPDATED",
      comment: `Источник: ${before?.name ?? ORDER_SOURCE_LABELS[order.source]} → ${item.name}`,
      payload: { field: "source", from: order.sourceItemId, to: item.id },
    });
  });
}
