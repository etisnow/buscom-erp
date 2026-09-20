/**
 * Когда заказ держит резерв остатка (docs/PRD.md, «Бизнес-правила»).
 * Само изменение остатков — на сервере; здесь только правило, что делать при смене статуса.
 */
import type { OrderStatus } from "@/generated/prisma/enums";

export type ReservationAction =
  /** Поставить резерв: reserved += количество */
  | "RESERVE"
  /** Снять резерв: reserved -= количество */
  | "RELEASE"
  /** Отгрузка: списать и из stock, и из reserved */
  | "SHIP"
  | "NONE";

/**
 * Статусы, в которых товар отложен под заказ: резерв ставится при выходе
 * из IN_PROGRESS вперёд и держится до отгрузки, возврата в работу или отмены.
 */
const RESERVING_STATUSES: readonly OrderStatus[] = ["AWAITING_PAYMENT", "PAID", "ASSEMBLY"];

export function holdsReservation(status: OrderStatus): boolean {
  return RESERVING_STATUSES.includes(status);
}

export function reservationAction(from: OrderStatus, to: OrderStatus): ReservationAction {
  const was = holdsReservation(from);
  const becomes = holdsReservation(to);

  if (was && to === "SHIPPED") return "SHIP";
  if (!was && becomes) return "RESERVE";
  if (was && !becomes) return "RELEASE";
  return "NONE";
}
