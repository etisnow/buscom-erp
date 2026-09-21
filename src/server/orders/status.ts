import "server-only";
import { assertTransition } from "@/domain/order/status";
import { getSettings } from "@/server/settings/service";
import type { OrderStatus } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import {
  loadOrder,
  OrderConflictError,
  orderInclude,
  slaDueAtFor,
  writeOrderEvent,
  type OrderWithItems,
  type Tx,
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
      supplierTracks: await loadTrackPositions(tx, order.id),
    });

    if (input.to === "SHIPPED" && order.deliveryMethod === "CARRIER" && !order.trackingNumber?.trim()) {
      throw new OrderConflictError("Для отгрузки транспортной компанией нужен трек-номер");
    }

    const changedAt = new Date();
    await tx.order.update({
      where: { id: order.id },
      data: {
        status: input.to,
        statusChangedAt: changedAt,
        slaDueAt: slaDueAtFor(input.to, changedAt, slaMinutes),
        ...(input.to === "CANCELLED" ? { cancelReason: input.cancelReason ?? null } : {}),
        ...(input.to === "SHIPPED" ? { shippedAt: changedAt } : {}),
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
  const { slaMinutes } = await getSettings();

  const changedAt = new Date();
  await tx.order.update({
    where: { id: order.id },
    data: { status: "PAID", statusChangedAt: changedAt, slaDueAt: slaDueAtFor("PAID", changedAt, slaMinutes) },
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
