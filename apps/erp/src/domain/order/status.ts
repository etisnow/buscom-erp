/**
 * Статусная модель заказа (docs/PRD.md, «Статусная модель заказа»).
 * Единственное место, где описаны допустимые переходы. Сервер обязан проверять
 * каждую смену статуса через assertTransition — UI только прячет недоступные кнопки.
 *
 * Глобальных статусов четыре: «Создан», «В работе», «Выполнен», «Отменён».
 * Промежуточные этапы (счёт, оплата поставщику, отправка) ведутся в цепочках
 * поставщиков — это подстатусы «В работе» (src/domain/supplier/stages.ts).
 */
import type { OrderStatus, UserRole } from "@/generated/prisma/enums";
import { incompleteTracks, type TrackPosition } from "@/domain/supplier/stages";

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  NEW: "Создан",
  IN_PROGRESS: "В работе",
  COMPLETED: "Выполнен",
  CANCELLED: "Отменён",
};

/** Все статусы по порядку жизни заказа — для фильтров, настроек SLA и разбора URL. */
export const ORDER_STATUSES = Object.keys(ORDER_STATUS_LABELS) as OrderStatus[];

type Transition = {
  to: OrderStatus;
  roles: UserRole[];
};

const MANAGERS: UserRole[] = ["MANAGER", "HEAD", "ADMIN"];
const HEAD_ONLY: UserRole[] = ["HEAD", "ADMIN"];

const TRANSITIONS: Record<OrderStatus, Transition[]> = {
  NEW: [
    { to: "IN_PROGRESS", roles: MANAGERS },
    { to: "CANCELLED", roles: MANAGERS },
  ],
  IN_PROGRESS: [
    { to: "COMPLETED", roles: MANAGERS },
    { to: "CANCELLED", roles: MANAGERS },
  ],
  COMPLETED: [],
  CANCELLED: [],
};

export const TERMINAL_STATUSES: readonly OrderStatus[] = ["COMPLETED", "CANCELLED"];

/**
 * Отмена заказа, по которому уже есть оплата, — только руководитель: нужен
 * возврат денег (PRD). Раньше это правило жило на статусе «Оплачен», теперь —
 * на сумме платежей.
 */
function allowed(transition: Transition, role: UserRole, paidKopecks: number): boolean {
  if (transition.to === "CANCELLED" && paidKopecks > 0) return HEAD_ONLY.includes(role);
  return transition.roles.includes(role);
}

/** Статусы, в которые пользователь с ролью role может перевести заказ из from. */
export function availableTransitions(from: OrderStatus, role: UserRole, paidKopecks = 0): OrderStatus[] {
  return TRANSITIONS[from].filter((t) => allowed(t, role, paidKopecks)).map((t) => t.to);
}

export function canTransition(from: OrderStatus, to: OrderStatus, role: UserRole, paidKopecks = 0): boolean {
  return availableTransitions(from, role, paidKopecks).includes(to);
}

export class OrderTransitionError extends Error {
  constructor(
    readonly from: OrderStatus,
    readonly to: OrderStatus,
    message: string,
  ) {
    super(message);
    this.name = "OrderTransitionError";
  }
}

type TransitionInput = {
  from: OrderStatus;
  to: OrderStatus;
  role: UserRole;
  cancelReason?: string | null;
  /** Сумма принятых платежей: отмену оплаченного заказа делает только руководитель */
  paidKopecks?: number;
  /** Треки поставщиков заказа: «Выполнен» — только когда все пройдены */
  supplierTracks?: readonly TrackPosition[];
};

export function assertTransition({
  from,
  to,
  role,
  cancelReason,
  paidKopecks = 0,
  supplierTracks = [],
}: TransitionInput): void {
  if (!TRANSITIONS[from].some((t) => t.to === to)) {
    throw new OrderTransitionError(
      from,
      to,
      `Переход «${ORDER_STATUS_LABELS[from]}» → «${ORDER_STATUS_LABELS[to]}» не предусмотрен`,
    );
  }
  if (!canTransition(from, to, role, paidKopecks)) {
    const reason =
      to === "CANCELLED" && paidKopecks > 0
        ? "По заказу есть оплата — отменить его может только руководитель (нужен возврат денег)"
        : `Недостаточно прав для перевода заказа в «${ORDER_STATUS_LABELS[to]}»`;
    throw new OrderTransitionError(from, to, reason);
  }
  if (to === "CANCELLED" && !cancelReason?.trim()) {
    throw new OrderTransitionError(from, to, "Для отмены заказа нужно указать причину");
  }
  if (to === "COMPLETED") {
    const pending = incompleteTracks(supplierTracks);
    if (pending.length > 0) {
      const names = pending.map((track) => `«${track.supplierName}»`).join(", ");
      throw new OrderTransitionError(from, to, `Не пройдены этапы поставщиков: ${names}`);
    }
  }
}
