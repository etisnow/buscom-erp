import "server-only";
import { assertTransition } from "@/domain/order/status";
import type { OrderStatus } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import {
  loadOrder,
  OrderConflictError,
  orderInclude,
  writeOrderEvent,
  type OrderWithItems,
  type Tx,
} from "@/server/orders/internal";
import { applyReservation } from "@/server/orders/reservation";
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
 * Смена статуса заказа: проверка перехода, резерв остатка и запись в журнал —
 * всё одной транзакцией. Любой переход мимо `assertTransition` сервер отклоняет,
 * даже если кнопку «подсунули» напрямую.
 */
export async function changeOrderStatus(input: ChangeStatusInput): Promise<OrderWithItems> {
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
    });

    if (input.to === "SHIPPED" && order.deliveryMethod === "CARRIER" && !order.trackingNumber?.trim()) {
      throw new OrderConflictError("Для отгрузки транспортной компанией нужен трек-номер");
    }

    await applyReservation(tx, order, order.status, input.to);

    await tx.order.update({
      where: { id: order.id },
      data: {
        status: input.to,
        statusChangedAt: new Date(),
        ...(input.to === "CANCELLED" ? { cancelReason: input.cancelReason ?? null } : {}),
        ...(input.to === "SHIPPED" ? { shippedAt: new Date() } : {}),
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

/**
 * Автоперевод в PAID при полной оплате (PRD: автор в журнале — система).
 * Вызывается внутри уже открытой транзакции, из сервиса оплат.
 */
export async function autoTransitionToPaid(tx: Tx, order: OrderWithItems): Promise<void> {
  await applyReservation(tx, order, order.status, "PAID");

  await tx.order.update({
    where: { id: order.id },
    data: { status: "PAID", statusChangedAt: new Date() },
  });

  await writeOrderEvent(tx, {
    orderId: order.id,
    user: null,
    type: "STATUS_CHANGED",
    fromStatus: order.status,
    toStatus: "PAID",
    comment: "Оплата получена полностью",
  });
}
