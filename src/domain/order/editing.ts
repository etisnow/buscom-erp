/**
 * Кто и когда может править состав заказа (docs/PRD.md, «Бизнес-правила»).
 * Склад не меняет ни цены, ни позиции — он только собирает и отгружает.
 */
import type { OrderStatus, UserRole } from "@/generated/prisma/enums";
import { ORDER_STATUS_LABELS, TERMINAL_STATUSES } from "@/domain/order/status";

/** Статусы, в которых состав правит менеджер. Дальше по цепочке — только руководитель. */
const MANAGER_EDITABLE: readonly OrderStatus[] = ["NEW", "IN_PROGRESS", "AWAITING_PAYMENT"];

const MANAGER_ROLES: readonly UserRole[] = ["MANAGER", "HEAD", "ADMIN"];
const HEAD_ROLES: readonly UserRole[] = ["HEAD", "ADMIN"];

export function canEditItems(status: OrderStatus, role: UserRole): boolean {
  // В выполненном и отменённом заказе состав не меняет никто.
  if (TERMINAL_STATUSES.includes(status)) return false;
  if (MANAGER_EDITABLE.includes(status)) return MANAGER_ROLES.includes(role);
  return HEAD_ROLES.includes(role);
}

export class OrderEditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderEditError";
  }
}

export function assertCanEditItems(status: OrderStatus, role: UserRole): void {
  if (canEditItems(status, role)) return;

  if (TERMINAL_STATUSES.includes(status)) {
    throw new OrderEditError(`Заказ в статусе «${ORDER_STATUS_LABELS[status]}» изменить нельзя`);
  }
  throw new OrderEditError(`Недостаточно прав, чтобы менять состав заказа в статусе «${ORDER_STATUS_LABELS[status]}»`);
}

/** Переназначить менеджера можно, пока заказ не в финальном статусе, и только руководителю. */
export function canReassignManager(status: OrderStatus, role: UserRole): boolean {
  return !TERMINAL_STATUSES.includes(status) && HEAD_ROLES.includes(role);
}
