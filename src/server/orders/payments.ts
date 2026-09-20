import "server-only";
import { isFullyPaid, paidTotal } from "@/domain/order/payment-status";
import type { Kopecks } from "@/domain/money";
import type { PaymentMethod } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import {
  loadOrder,
  OrderConflictError,
  orderInclude,
  writeOrderEvent,
  type OrderWithItems,
} from "@/server/orders/internal";
import { autoTransitionToPaid } from "@/server/orders/status";
import type { SessionUser } from "@/server/session";

export type AddPaymentInput = {
  orderId: string;
  method: PaymentMethod;
  amountKopecks: Kopecks;
  paidAt: Date;
  /** № платёжного поручения, ID транзакции */
  reference?: string | null;
  user: SessionUser;
};

/**
 * Отметка оплаты. Если после платежа заказ в AWAITING_PAYMENT оплачен полностью,
 * он сам уходит в PAID — автором этого события в журнале значится система (PRD).
 */
export async function addPayment(input: AddPaymentInput): Promise<OrderWithItems> {
  if (!Number.isSafeInteger(input.amountKopecks) || input.amountKopecks <= 0) {
    throw new OrderConflictError("Сумма оплаты должна быть больше нуля");
  }

  return db.$transaction(async (tx) => {
    const order = await loadOrder(tx, input.orderId);

    if (order.status === "CANCELLED") {
      throw new OrderConflictError("Нельзя отметить оплату отменённого заказа");
    }

    await tx.payment.create({
      data: {
        orderId: order.id,
        method: input.method,
        amountKopecks: input.amountKopecks,
        paidAt: input.paidAt,
        reference: input.reference ?? null,
        createdById: input.user.id,
      },
    });

    // Кэш суммы платежей: держим в той же транзакции, иначе фильтр по оплате соврёт.
    await tx.order.update({
      where: { id: order.id },
      data: { paidKopecks: { increment: input.amountKopecks } },
    });

    await writeOrderEvent(tx, {
      orderId: order.id,
      user: input.user,
      type: "PAYMENT_ADDED",
      payload: {
        method: input.method,
        amountKopecks: input.amountKopecks,
        reference: input.reference ?? null,
      },
    });

    const paid = paidTotal([...order.payments, { amountKopecks: input.amountKopecks }]);
    if (order.status === "AWAITING_PAYMENT" && isFullyPaid(order.totalKopecks, paid)) {
      await autoTransitionToPaid(tx, order);
    }

    return tx.order.findUniqueOrThrow({ where: { id: order.id }, include: orderInclude });
  });
}
