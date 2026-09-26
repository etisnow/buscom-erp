import "server-only";
import { assertTransition } from "@buscom/domain/order/status";
import { canReassignManager } from "@buscom/domain/order/editing";
import { db } from "@/server/db";
import {
  loadOrder,
  OrderConflictError,
  orderInclude,
  slaDueAtFor,
  writeOrderEvent,
  type OrderWithItems,
} from "@/server/orders/internal";
import { ForbiddenError } from "@/server/errors";
import { getSettings } from "@/server/settings/service";
import type { SessionUser } from "@/server/session";

/**
 * «Взять себе»: назначает автора менеджером и переводит заказ в работу одним действием
 * (PRD, карточка заказа). Если заказ уже взял другой — понятная ошибка, а не перезапись.
 */
export async function takeOrder(orderId: string, user: SessionUser): Promise<OrderWithItems> {
  const { slaMinutes } = await getSettings();

  return db.$transaction(async (tx) => {
    const order = await loadOrder(tx, orderId);

    if (order.managerId && order.managerId !== user.id) {
      const manager = await tx.user.findUnique({ where: { id: order.managerId }, select: { name: true } });
      throw new OrderConflictError(`Заказ уже в работе у ${manager?.name ?? "другого менеджера"}`);
    }

    assertTransition({ from: order.status, to: "IN_PROGRESS", role: user.role });

    const changedAt = new Date();
    await tx.order.update({
      where: { id: order.id },
      data: {
        managerId: user.id,
        status: "IN_PROGRESS",
        statusChangedAt: changedAt,
        slaDueAt: slaDueAtFor("IN_PROGRESS", changedAt, slaMinutes),
      },
    });

    await writeOrderEvent(tx, {
      orderId: order.id,
      user,
      type: "ASSIGNED",
      comment: `Взял заказ в работу: ${user.name}`,
    });
    await writeOrderEvent(tx, {
      orderId: order.id,
      user,
      type: "STATUS_CHANGED",
      fromStatus: order.status,
      toStatus: "IN_PROGRESS",
    });

    return tx.order.findUniqueOrThrow({ where: { id: order.id }, include: orderInclude });
  });
}

/** Переназначение менеджера руководителем в любом нефинальном статусе. */
export async function assignManager(orderId: string, managerId: string, user: SessionUser): Promise<OrderWithItems> {
  return db.$transaction(async (tx) => {
    const order = await loadOrder(tx, orderId);

    if (!canReassignManager(order.status, user.role)) {
      throw new ForbiddenError("Переназначить менеджера может только руководитель, и только в незакрытом заказе");
    }

    const manager = await tx.user.findFirst({
      where: { id: managerId, isActive: true },
      select: { id: true, name: true, role: true },
    });
    if (!manager) {
      throw new OrderConflictError("Такого сотрудника нет или он отключён");
    }
    await tx.order.update({ where: { id: order.id }, data: { managerId: manager.id } });

    await writeOrderEvent(tx, {
      orderId: order.id,
      user,
      type: "ASSIGNED",
      comment: `Ответственный: ${manager.name}`,
      payload: { fromManagerId: order.managerId, toManagerId: manager.id },
    });

    return tx.order.findUniqueOrThrow({ where: { id: order.id }, include: orderInclude });
  });
}
