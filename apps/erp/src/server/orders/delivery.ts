import "server-only";
import type { Kopecks } from "@buscom/domain/money";
import type { Cargo } from "@buscom/domain/order/delivery";
import { TERMINAL_STATUSES } from "@buscom/domain/order/status";
import { Prisma } from "@buscom/db/client";
import type { DeliveryMethod } from "@buscom/db/enums";
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
  /** Полночь по Москве дня отгрузки; null — очистить */
  shippedAt?: Date | null;
  /** Полночь по Москве дня доставки; null — очистить */
  deliveryDate?: Date | null;
  /** Груз целиком: вес в граммах, стороны в сантиметрах; null в поле — не задано */
  cargo?: Cargo;
  user: SessionUser;
};

/** Доставка: способ, ТК, адрес, стоимость, трек, даты отгрузки и доставки, груз. Всё одной транзакцией с событием заказа. */
export async function updateOrderDelivery(input: UpdateDeliveryInput): Promise<OrderWithItems> {
  return db.$transaction(async (tx) => {
    const order = await loadOrder(tx, input.orderId);

    if (TERMINAL_STATUSES.includes(order.status)) {
      throw new ForbiddenError("Заказ закрыт — доставку изменить нельзя");
    }
    // Снимок терминала описывает прежние ТК и адрес — после их правки он бы врал
    const terminalChanged =
      order.deliveryTerminal !== null &&
      ((input.carrier !== undefined && input.carrier !== order.carrier) ||
        (input.deliveryAddress !== undefined && input.deliveryAddress !== order.deliveryAddress) ||
        (input.deliveryMethod !== undefined && input.deliveryMethod !== order.deliveryMethod));
    const data = {
      ...(input.deliveryMethod !== undefined ? { deliveryMethod: input.deliveryMethod } : {}),
      ...(input.carrier !== undefined ? { carrier: input.carrier } : {}),
      ...(input.deliveryAddress !== undefined ? { deliveryAddress: input.deliveryAddress } : {}),
      ...(input.trackingNumber !== undefined ? { trackingNumber: input.trackingNumber } : {}),
      ...(input.deliveryPriceKopecks !== undefined ? { deliveryPriceKopecks: input.deliveryPriceKopecks } : {}),
      ...(input.shippedAt !== undefined ? { shippedAt: input.shippedAt } : {}),
      ...(input.deliveryDate !== undefined ? { deliveryDate: input.deliveryDate } : {}),
      ...(input.cargo !== undefined
        ? {
            cargoWeightGrams: input.cargo.weightGrams,
            cargoLengthCm: input.cargo.lengthCm,
            cargoWidthCm: input.cargo.widthCm,
            cargoHeightCm: input.cargo.heightCm,
            cargoVolumeCm3: input.cargo.volumeCm3,
          }
        : {}),
    };

    await tx.order.update({
      where: { id: order.id },
      data: { ...data, ...(terminalChanged ? { deliveryTerminal: Prisma.DbNull } : {}) },
    });
    if (input.deliveryPriceKopecks !== undefined) {
      await recalculateOrderTotals(tx, order.id, input.user);
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
          deliveryTerminal: order.deliveryTerminal as Prisma.InputJsonValue | null,
          deliveryPriceKopecks: order.deliveryPriceKopecks,
          trackingNumber: order.trackingNumber,
          shippedAt: order.shippedAt,
          deliveryDate: order.deliveryDate,
          cargoWeightGrams: order.cargoWeightGrams,
          cargoLengthCm: order.cargoLengthCm,
          cargoWidthCm: order.cargoWidthCm,
          cargoHeightCm: order.cargoHeightCm,
          cargoVolumeCm3: order.cargoVolumeCm3,
        },
        after: { ...data, ...(terminalChanged ? { deliveryTerminal: null } : {}) },
      },
    });

    return tx.order.findUniqueOrThrow({ where: { id: order.id }, include: orderInclude });
  });
}
