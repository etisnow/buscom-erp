import "server-only";
import type { Prisma } from "@buscom/db/client";
import type { OrderEventType, OrderStatus } from "@buscom/db/enums";
import { paymentStatus } from "@buscom/domain/order/payment-status";
import { calculateOrderTotals } from "@buscom/domain/order/totals";
import { addWorkingMinutes, DEFAULT_SLA_MINUTES } from "@buscom/domain/sla";
import { notifyPaymentStatusChange } from "@/server/notifications/queue";
import type { SessionUser } from "@/server/session";

/** Клиент внутри транзакции: все действия сервиса пишут заказ и событие одним куском. */
export type Tx = Prisma.TransactionClient;

/** Заказ не найден или удалён (deletedAt). */
export class OrderNotFoundError extends Error {
  constructor(message = "Заказ не найден") {
    super(message);
    this.name = "OrderNotFoundError";
  }
}

/** Конфликт одновременной работы: заказ уже кто-то взял, статус уже сменили. */
export class OrderConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderConflictError";
  }
}

const ORDER_WITH_ITEMS = {
  items: { orderBy: { sortOrder: "asc" } },
  payments: true,
} satisfies Prisma.OrderInclude;

export type OrderWithItems = Prisma.OrderGetPayload<{ include: typeof ORDER_WITH_ITEMS }>;

export const orderInclude = ORDER_WITH_ITEMS;

/** Заказ для изменения. Удалённые заказы не отдаём — их для системы не существует. */
export async function loadOrder(tx: Tx, orderId: string): Promise<OrderWithItems> {
  const order = await tx.order.findFirst({
    where: { id: orderId, deletedAt: null },
    include: ORDER_WITH_ITEMS,
  });
  if (!order) throw new OrderNotFoundError();
  return order;
}

type EventInput = {
  orderId: string;
  /** null — действие системы: интеграция, автопереход по оплате */
  user: SessionUser | null;
  type: OrderEventType;
  fromStatus?: OrderStatus | null;
  toStatus?: OrderStatus | null;
  comment?: string | null;
  payload?: Prisma.InputJsonValue;
};

/**
 * Запись в журнал заказа. Вызывается в той же транзакции, что и само изменение, —
 * без события изменение считается незавершённым (PRD, аудит).
 */
export async function writeOrderEvent(tx: Tx, input: EventInput): Promise<void> {
  await tx.orderEvent.create({
    data: {
      orderId: input.orderId,
      userId: input.user?.id ?? null,
      type: input.type,
      fromStatus: input.fromStatus ?? null,
      toStatus: input.toStatus ?? null,
      comment: input.comment ?? null,
      ...(input.payload === undefined ? {} : { payload: input.payload }),
    },
  });
}

/**
 * Пересчитывает итоги из позиций заказа и сохраняет их. Суммы с клиента не принимаются.
 * Новый итог может сдвинуть статус оплаты (добавили позицию к оплаченному заказу) —
 * об этом уведомляются подписанные, кроме `actor`.
 */
export async function recalculateOrderTotals(tx: Tx, orderId: string, actor: SessionUser | null = null): Promise<void> {
  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { items: true },
  });

  const totals = calculateOrderTotals({
    items: order.items.map((item) => ({
      priceKopecks: item.priceKopecks,
      quantity: item.quantity,
      discountKopecks: item.discountKopecks,
    })),
    discountKopecks: order.discountKopecks,
    deliveryPriceKopecks: order.deliveryPriceKopecks,
  });

  await tx.order.update({
    where: { id: orderId },
    data: {
      itemsTotalKopecks: totals.itemsTotalKopecks,
      totalKopecks: totals.totalKopecks,
    },
  });

  await notifyPaymentStatusChange(tx, {
    orderId,
    actorId: actor?.id ?? null,
    before: paymentStatus(order.totalKopecks, order.paidKopecks),
  });
}

/**
 * Дедлайн SLA для статуса. Считается один раз при смене статуса и кладётся в заказ,
 * чтобы фильтр «просроченные» в списке был условием `slaDueAt < now()`, а не перебором.
 * Нормативы приходят из настроек; без них берутся умолчания из домена.
 */
export function slaDueAtFor(
  status: OrderStatus,
  statusChangedAt: Date,
  slaMinutes: Record<OrderStatus, number | null> = DEFAULT_SLA_MINUTES,
): Date | null {
  const minutes = slaMinutes[status];
  return minutes === null || minutes === undefined ? null : addWorkingMinutes(statusChangedAt, minutes);
}
