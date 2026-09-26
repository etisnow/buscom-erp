import "server-only";
import { assertTransition } from "@/domain/order/status";
import { getSettings } from "@/server/settings/service";
import type { OrderStatus } from "@buscom/db/enums";
import { db } from "@/server/db";
import {
  loadOrder,
  OrderConflictError,
  orderInclude,
  slaDueAtFor,
  writeOrderEvent,
  type OrderWithItems,
} from "@/server/orders/internal";
import { loadTrackPositions } from "@/server/orders/suppliers";
import type { SessionUser } from "@/server/session";

export type ChangeStatusInput = {
  orderId: string;
  to: OrderStatus;
  user: SessionUser;
  comment?: string | null;
  cancelReason?: string | null;
  /** Статус, который видел пользователь: защита от гонки двух менеджеров. */
  expectedStatus?: OrderStatus;
};

/**
 * Смена статуса заказа: проверка перехода и запись в журнал — всё одной
 * транзакцией. Любой переход мимо `assertTransition` сервер отклоняет,
 * даже если кнопку «подсунули» напрямую.
 */
export async function changeOrderStatus(input: ChangeStatusInput): Promise<OrderWithItems> {
  const { slaMinutes } = await getSettings();

  return db.$transaction(async (tx) => {
    const order = await loadOrder(tx, input.orderId);

    if (input.expectedStatus && order.status !== input.expectedStatus) {
      throw new OrderConflictError("Статус заказа успели изменить — обновите страницу");
    }

    assertTransition({
      from: order.status,
      to: input.to,
      role: input.user.role,
      cancelReason: input.cancelReason,
      paidKopecks: order.paidKopecks,
      supplierTracks: await loadTrackPositions(tx, order.id),
    });

    // Отгрузки как статуса больше нет: трек-номер для доставки ТК требуем при закрытии заказа.
    if (input.to === "COMPLETED" && order.deliveryMethod === "CARRIER" && !order.trackingNumber?.trim()) {
      throw new OrderConflictError("Для доставки транспортной компанией нужен трек-номер — без него заказ не закрыть");
    }

    const changedAt = new Date();
    await tx.order.update({
      where: { id: order.id },
      data: {
        status: input.to,
        statusChangedAt: changedAt,
        slaDueAt: slaDueAtFor(input.to, changedAt, slaMinutes),
        ...(input.to === "CANCELLED" ? { cancelReason: input.cancelReason ?? null } : {}),
        ...(input.to === "COMPLETED" && !order.shippedAt ? { shippedAt: changedAt } : {}),
      },
    });

    await writeOrderEvent(tx, {
      orderId: order.id,
      user: input.user,
      type: "STATUS_CHANGED",
      fromStatus: order.status,
      toStatus: input.to,
      comment: input.to === "CANCELLED" ? (input.cancelReason ?? null) : (input.comment ?? null),
    });

    return tx.order.findUniqueOrThrow({ where: { id: order.id }, include: orderInclude });
  });
}
