import "server-only";
import { holdsReservation, reservationAction, type ReservationAction } from "@/domain/order/reservation";
import type { OrderStatus } from "@/generated/prisma/enums";
import type { OrderWithItems, Tx } from "@/server/orders/internal";

/**
 * Применяет правило резерва к остаткам товаров при смене статуса заказа.
 * Товары «под заказ» (`madeToOrder`) и произвольные позиции без `productId` не резервируются.
 * Нехватка остатка не блокирует (PRD) — в карточке показывается предупреждение.
 */
export async function applyReservation(
  tx: Tx,
  order: OrderWithItems,
  from: OrderStatus,
  to: OrderStatus,
): Promise<ReservationAction> {
  const action = reservationAction(from, to);
  if (action === "NONE") return action;

  const reservable = order.items.filter((item) => item.productId !== null);
  if (reservable.length === 0) return action;

  const products = await tx.product.findMany({
    where: { id: { in: reservable.map((item) => item.productId as string) }, madeToOrder: false },
    select: { id: true },
  });
  const trackedIds = new Set(products.map((product) => product.id));

  // Одна позиция товара может встретиться в заказе несколько раз — суммируем.
  const quantityByProduct = new Map<string, number>();
  for (const item of reservable) {
    const productId = item.productId as string;
    if (!trackedIds.has(productId)) continue;
    quantityByProduct.set(productId, (quantityByProduct.get(productId) ?? 0) + item.quantity);
  }

  for (const [productId, quantity] of quantityByProduct) {
    const data =
      action === "RESERVE"
        ? { reserved: { increment: quantity } }
        : action === "RELEASE"
          ? { reserved: { decrement: quantity } }
          : { reserved: { decrement: quantity }, stock: { decrement: quantity } };

    await tx.product.update({ where: { id: productId }, data });
  }

  return action;
}

/** Позиции, которых не хватает на складе, — для предупреждения в карточке заказа. */
export type StockShortage = {
  productId: string;
  sku: string;
  name: string;
  required: number;
  available: number;
};

/**
 * Если заказ уже держит резерв, его собственное количество сидит в `reserved`
 * и вычитать его второй раз нельзя — иначе заказ «не хватает сам себе».
 */
export async function findStockShortages(tx: Tx, order: OrderWithItems): Promise<StockShortage[]> {
  const ownReservationCounted = holdsReservation(order.status);
  const withProduct = order.items.filter((item) => item.productId !== null);
  if (withProduct.length === 0) return [];

  const products = await tx.product.findMany({
    where: { id: { in: withProduct.map((item) => item.productId as string) }, madeToOrder: false },
    select: { id: true, sku: true, name: true, stock: true, reserved: true },
  });

  const required = new Map<string, number>();
  for (const item of withProduct) {
    const productId = item.productId as string;
    required.set(productId, (required.get(productId) ?? 0) + item.quantity);
  }

  const shortages: StockShortage[] = [];
  for (const product of products) {
    const need = required.get(product.id) ?? 0;
    const reservedByOthers = ownReservationCounted ? product.reserved - need : product.reserved;
    const available = product.stock - Math.max(0, reservedByOthers);
    if (need > available) {
      shortages.push({
        productId: product.id,
        sku: product.sku,
        name: product.name,
        required: need,
        available,
      });
    }
  }
  return shortages;
}

/** Позиция в том виде, в каком её знает правка состава: связь с каталогом и количество. */
export type ReservableItem = { productId?: string | null; quantity: number };

function quantitiesByProduct(items: ReservableItem[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const item of items) {
    if (!item.productId) continue;
    result.set(item.productId, (result.get(item.productId) ?? 0) + item.quantity);
  }
  return result;
}

/**
 * Пересчёт резерва при правке состава заказа, который резерв уже держит
 * (PAID, ASSEMBLY — правит руководитель). Без этого `reserved` у товаров остаётся
 * от прежнего состава и расходится с заказами.
 */
export async function adjustReservation(tx: Tx, order: OrderWithItems, nextItems: ReservableItem[]): Promise<void> {
  if (!holdsReservation(order.status)) return;

  const before = quantitiesByProduct(order.items);
  const after = quantitiesByProduct(nextItems);

  const productIds = [...new Set([...before.keys(), ...after.keys()])];
  if (productIds.length === 0) return;

  // Товары «под заказ» не резервируются — их из расчёта исключаем.
  const tracked = await tx.product.findMany({
    where: { id: { in: productIds }, madeToOrder: false },
    select: { id: true },
  });

  for (const product of tracked) {
    const delta = (after.get(product.id) ?? 0) - (before.get(product.id) ?? 0);
    if (delta === 0) continue;
    await tx.product.update({
      where: { id: product.id },
      data: { reserved: delta > 0 ? { increment: delta } : { decrement: -delta } },
    });
  }
}
