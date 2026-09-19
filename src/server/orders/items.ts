import "server-only";
import { assertDiscountWithinLimit } from "@/domain/order/discount";
import { assertCanEditItems } from "@/domain/order/editing";
import type { Kopecks } from "@/domain/money";
import { db } from "@/server/db";
import {
  loadOrder,
  orderInclude,
  recalculateOrderTotals,
  writeOrderEvent,
  type OrderWithItems,
} from "@/server/orders/internal";
import type { SessionUser } from "@/server/session";

export type OrderItemDraft = {
  /** Ссылка на каталог; null — произвольная позиция, введённая руками */
  productId?: string | null;
  sku: string;
  name: string;
  priceKopecks: Kopecks;
  quantity: number;
  discountKopecks?: Kopecks;
};

export type UpdateItemsInput = {
  orderId: string;
  items: OrderItemDraft[];
  discountKopecks?: Kopecks;
  deliveryPriceKopecks?: Kopecks;
  user: SessionUser;
};

/**
 * Полная замена состава заказа: позиции, скидка на заказ, стоимость доставки.
 * Итоги считает сервер, лимит скидки проверяется до записи.
 * Резерв здесь не трогается: состав правят в статусах, где резерва ещё нет,
 * а правку руководителем после оплаты разбираем вручную (см. STATUS, долги).
 */
export async function updateOrderItems(input: UpdateItemsInput): Promise<OrderWithItems> {
  return db.$transaction(async (tx) => {
    const order = await loadOrder(tx, input.orderId);
    assertCanEditItems(order.status, input.user.role);

    const discountKopecks = input.discountKopecks ?? order.discountKopecks;
    const deliveryPriceKopecks = input.deliveryPriceKopecks ?? order.deliveryPriceKopecks;

    assertDiscountWithinLimit({
      items: input.items.map((item) => ({
        priceKopecks: item.priceKopecks,
        quantity: item.quantity,
        discountKopecks: item.discountKopecks ?? 0,
      })),
      orderDiscountKopecks: discountKopecks,
      role: input.user.role,
    });

    const before = order.items.map((item) => ({
      sku: item.sku,
      name: item.name,
      priceKopecks: item.priceKopecks,
      quantity: item.quantity,
      discountKopecks: item.discountKopecks,
    }));

    await tx.orderItem.deleteMany({ where: { orderId: order.id } });
    await tx.orderItem.createMany({
      data: input.items.map((item, index) => ({
        orderId: order.id,
        productId: item.productId ?? null,
        sku: item.sku,
        name: item.name,
        priceKopecks: item.priceKopecks,
        quantity: item.quantity,
        discountKopecks: item.discountKopecks ?? 0,
        sortOrder: index,
      })),
    });

    await tx.order.update({
      where: { id: order.id },
      data: { discountKopecks, deliveryPriceKopecks },
    });
    await recalculateOrderTotals(tx, order.id);

    const updated = await tx.order.findUniqueOrThrow({ where: { id: order.id }, include: orderInclude });

    await writeOrderEvent(tx, {
      orderId: order.id,
      user: input.user,
      type: "ITEMS_CHANGED",
      payload: {
        before,
        after: input.items.map((item) => ({
          sku: item.sku,
          name: item.name,
          priceKopecks: item.priceKopecks,
          quantity: item.quantity,
          discountKopecks: item.discountKopecks ?? 0,
        })),
        totalBefore: order.totalKopecks,
        totalAfter: updated.totalKopecks,
      },
    });

    return updated;
  });
}
