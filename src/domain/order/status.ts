/**
 * Статусная модель заказа (docs/PRD.md, «Статусная модель заказа»).
 * Единственное место, где описаны допустимые переходы. Сервер обязан проверять
 * каждую смену статуса через assertTransition — UI только прячет недоступные кнопки.
 */
import type { OrderStatus, UserRole } from "@/generated/prisma/enums";
import { incompleteTracks, type TrackPosition } from "@/domain/supplier/stages";

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  NEW: "Новый",
  IN_PROGRESS: "В работе",
  AWAITING_PAYMENT: "Ждёт оплаты",
  PAID: "Оплачен",
  SHIPPING: "Отправка",
  SHIPPED: "Отгружен",
  COMPLETED: "Выполнен",
  CANCELLED: "Отменён",
};

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
    { to: "AWAITING_PAYMENT", roles: MANAGERS },
    // постоплата: отправляем без предоплаты
    { to: "SHIPPING", roles: MANAGERS },
    { to: "CANCELLED", roles: MANAGERS },
  ],
  AWAITING_PAYMENT: [
    { to: "PAID", roles: MANAGERS },
    { to: "IN_PROGRESS", roles: MANAGERS },
    { to: "CANCELLED", roles: MANAGERS },
  ],
  PAID: [
    { to: "SHIPPING", roles: MANAGERS },
    // отмена после оплаты — только руководитель (нужен возврат денег)
    { to: "CANCELLED", roles: HEAD_ONLY },
  ],
  SHIPPING: [
    { to: "SHIPPED", roles: MANAGERS },
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
  /** Треки поставщиков заказа: в «Отправку» заказ уходит, только когда все пройдены */
  supplierTracks?: readonly TrackPosition[];
};

export function assertTransition({ from, to, role, cancelReason, supplierTracks = [] }: TransitionInput): void {
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
  if (to === "SHIPPING") {
    const pending = incompleteTracks(supplierTracks);
    if (pending.length > 0) {
      const names = pending.map((track) => `«${track.supplierName}»`).join(", ");
      throw new OrderTransitionError(from, to, `Не пройдены этапы поставщиков: ${names}`);
    }
  }
}
