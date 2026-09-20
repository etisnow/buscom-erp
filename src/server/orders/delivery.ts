import "server-only";
import type { Kopecks } from "@/domain/money";
import { TERMINAL_STATUSES } from "@/domain/order/status";
import type { DeliveryMethod } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { ForbiddenError } from "@/server/errors";
import {
  loadOrder,
  orderInclude,
  recalculateOrderTotals,
  writeOrderEvent,
  type OrderWithItems,
} from "@/server/orders/internal";
import type { SessionUser } from "@/server/session";

export type UpdateDeliveryInput = {
  orderId: string;
  deliveryMethod?: DeliveryMethod | null;
  carrier?: string | null;
  deliveryAddress?: string | null;
  deliveryPriceKopecks?: Kopecks;
  trackingNumber?: string | null;
  user: SessionUser;
};

/** Доставка: способ, ТК, адрес, стоимость и трек-номер. Всё одной транзакцией с событием заказа. */
export async function updateOrderDelivery(input: UpdateDeliveryInput): Promise<OrderWithItems> {
  return db.$transaction(async (tx) => {
    const order = await loadOrder(tx, input.orderId);

    if (TERMINAL_STATUSES.includes(order.status)) {
      throw new ForbiddenError("Заказ закрыт — доставку изменить нельзя");
    }
    const data = {
      ...(input.deliveryMethod !== undefined ? { deliveryMethod: input.deliveryMethod } : {}),
      ...(input.carrier !== undefined ? { carrier: input.carrier } : {}),
      ...(input.deliveryAddress !== undefined ? { deliveryAddress: input.deliveryAddress } : {}),
      ...(input.trackingNumber !== undefined ? { trackingNumber: input.trackingNumber } : {}),
      ...(input.deliveryPriceKopecks !== undefined ? { deliveryPriceKopecks: input.deliveryPriceKopecks } : {}),
    };

    await tx.order.update({ where: { id: order.id }, data });
    if (input.deliveryPriceKopecks !== undefined) {
      await recalculateOrderTotals(tx, order.id);
    }

    await writeOrderEvent(tx, {
      orderId: order.id,
      user: input.user,
      type: "UPDATED",
      comment: "Изменена доставка",
      payload: {
        before: {
          deliveryMethod: order.deliveryMethod,
          carrier: order.carrier,
          deliveryAddress: order.deliveryAddress,
          deliveryPriceKopecks: order.deliveryPriceKopecks,
          trackingNumber: order.trackingNumber,
        },
        after: data,
      },
    });

    return tx.order.findUniqueOrThrow({ where: { id: order.id }, include: orderInclude });
  });
}
