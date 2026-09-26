/**
 * Кто и когда может править состав заказа (docs/PRD.md, «Бизнес-правила»).
 * До оплаты состав правит менеджер, после первой оплаты — только руководитель:
 * сумма уже согласована с клиентом. Раньше граница проходила по статусу
 * «Оплачен», после упрощения статусов — по сумме платежей.
 * В выполненном и отменённом заказе состав не меняет никто.
 */
import type { OrderStatus, UserRole } from "@buscom/db/enums";
import { ORDER_STATUS_LABELS, TERMINAL_STATUSES } from "./status";

const MANAGER_ROLES: readonly UserRole[] = ["MANAGER", "HEAD", "ADMIN"];
const HEAD_ROLES: readonly UserRole[] = ["HEAD", "ADMIN"];

export function canEditItems(status: OrderStatus, role: UserRole, paidKopecks = 0): boolean {
  if (TERMINAL_STATUSES.includes(status)) return false;
  return paidKopecks > 0 ? HEAD_ROLES.includes(role) : MANAGER_ROLES.includes(role);
}

export class OrderEditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderEditError";
  }
}

export function assertCanEditItems(status: OrderStatus, role: UserRole, paidKopecks = 0): void {
  if (canEditItems(status, role, paidKopecks)) return;

  if (TERMINAL_STATUSES.includes(status)) {
    throw new OrderEditError(`Заказ в статусе «${ORDER_STATUS_LABELS[status]}» изменить нельзя`);
  }
  throw new OrderEditError("По заказу уже есть оплата — состав меняет только руководитель");
}

/** Переназначить менеджера можно, пока заказ не в финальном статусе, и только руководителю. */
export function canReassignManager(status: OrderStatus, role: UserRole): boolean {
  return !TERMINAL_STATUSES.includes(status) && HEAD_ROLES.includes(role);
}
