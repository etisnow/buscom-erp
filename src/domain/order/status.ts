/**
 * Статусная модель заказа (docs/PRD.md, «Статусная модель заказа»).
 * Единственное место, где описаны допустимые переходы. Сервер обязан проверять
 * каждую смену статуса через assertTransition — UI только прячет недоступные кнопки.
 */
import type { OrderStatus, UserRole } from "@/generated/prisma/enums";

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  NEW: "Новый",
  IN_PROGRESS: "В работе",
  AWAITING_PAYMENT: "Ждёт оплаты",
  PAID: "Оплачен",
  ASSEMBLY: "Сборка",
  SHIPPED: "Отгружен",
  COMPLETED: "Выполнен",
  CANCELLED: "Отменён",
};

type Transition = {
  to: OrderStatus;
  roles: UserRole[];
};

const MANAGERS: UserRole[] = ["MANAGER", "HEAD", "ADMIN"];
const WAREHOUSE: UserRole[] = ["WAREHOUSE", "HEAD", "ADMIN"];
const HEAD_ONLY: UserRole[] = ["HEAD", "ADMIN"];

const TRANSITIONS: Record<OrderStatus, Transition[]> = {
  NEW: [
    { to: "IN_PROGRESS", roles: MANAGERS },
    { to: "CANCELLED", roles: MANAGERS },
  ],
  IN_PROGRESS: [
    { to: "AWAITING_PAYMENT", roles: MANAGERS },
    // постоплата: сборка без предоплаты
    { to: "ASSEMBLY", roles: MANAGERS },
    { to: "CANCELLED", roles: MANAGERS },
  ],
  AWAITING_PAYMENT: [
    { to: "PAID", roles: MANAGERS },
    { to: "IN_PROGRESS", roles: MANAGERS },
    { to: "CANCELLED", roles: MANAGERS },
  ],
  PAID: [
    { to: "ASSEMBLY", roles: WAREHOUSE },
    // отмена после оплаты — только руководитель (нужен возврат денег)
    { to: "CANCELLED", roles: HEAD_ONLY },
  ],
  ASSEMBLY: [
    { to: "SHIPPED", roles: WAREHOUSE },
    { to: "CANCELLED", roles: HEAD_ONLY },
  ],
  SHIPPED: [{ to: "COMPLETED", roles: MANAGERS }],
  COMPLETED: [],
  CANCELLED: [],
};

export const TERMINAL_STATUSES: readonly OrderStatus[] = ["COMPLETED", "CANCELLED"];

/** Статусы, в которые пользователь с ролью role может перевести заказ из from. */
export function availableTransitions(from: OrderStatus, role: UserRole): OrderStatus[] {
  return TRANSITIONS[from].filter((t) => t.roles.includes(role)).map((t) => t.to);
}

export function canTransition(from: OrderStatus, to: OrderStatus, role: UserRole): boolean {
  return availableTransitions(from, role).includes(to);
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
};

export function assertTransition({ from, to, role, cancelReason }: TransitionInput): void {
  if (!TRANSITIONS[from].some((t) => t.to === to)) {
    throw new OrderTransitionError(
      from,
      to,
      `Переход «${ORDER_STATUS_LABELS[from]}» → «${ORDER_STATUS_LABELS[to]}» не предусмотрен`,
    );
  }
  if (!canTransition(from, to, role)) {
    throw new OrderTransitionError(from, to, `Недостаточно прав для перевода заказа в «${ORDER_STATUS_LABELS[to]}»`);
  }
  if (to === "CANCELLED" && !cancelReason?.trim()) {
    throw new OrderTransitionError(from, to, "Для отмены заказа нужно указать причину");
  }
}
