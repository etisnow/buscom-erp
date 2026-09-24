import "server-only";
import {
  orderCreatedTopic,
  orderCreatedLetter,
  paymentStatusTopic,
  paymentStatusLetter,
  supplierStageLetter,
  supplierStageTopic,
  type Letter,
  type OrderBrief,
  type OrderChannel,
} from "@/domain/notification/topics";
import { paymentStatus, type PaymentStatus } from "@/domain/order/payment-status";
import { env } from "@/server/env";
import { scheduleDispatch } from "@/server/notifications/dispatch";
import type { Tx } from "@/server/orders/internal";

/**
 * Хуки уведомлений. Вызываются внутри транзакции изменения — так письмо в
 * очереди появляется ровно тогда, когда изменение сохранилось, и не появляется
 * при откате. Получатели — активные сотрудники, подписанные на тему, кроме
 * автора изменения: о своём действии он и так знает.
 */
async function enqueue(
  tx: Tx,
  input: { topic: string; orderId: string; actorId: string | null; letter: Letter },
): Promise<void> {
  const recipients = await tx.user.findMany({
    where: {
      isActive: true,
      notificationTopics: { has: input.topic },
      ...(input.actorId ? { id: { not: input.actorId } } : {}),
    },
    select: { id: true },
  });
  if (recipients.length === 0) return;

  await tx.notification.createMany({
    data: recipients.map((user) => ({
      userId: user.id,
      topic: input.topic,
      orderId: input.orderId,
      subject: `BusCom ERP: ${input.letter.subject}`,
      text: input.letter.text,
    })),
  });
  scheduleDispatch();
}

async function loadBrief(tx: Tx, orderId: string) {
  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    select: {
      number: true,
      totalKopecks: true,
      paidKopecks: true,
      customer: { select: { name: true } },
      sourceItem: { select: { name: true } },
    },
  });
  const brief: OrderBrief = {
    number: order.number,
    customerName: order.customer.name,
    totalKopecks: order.totalKopecks,
    url: new URL(`/orders/${order.number}`, env.BETTER_AUTH_URL).toString(),
  };
  return { order, brief };
}

/** Новый заказ. Вызывать после того, как позиции и оплата с сайта уже записаны. */
export async function notifyOrderCreated(
  tx: Tx,
  input: { orderId: string; actorId: string | null; channel: OrderChannel; sourceLabel: string },
): Promise<void> {
  const { order, brief } = await loadBrief(tx, input.orderId);
  await enqueue(tx, {
    topic: orderCreatedTopic(input.channel),
    orderId: input.orderId,
    actorId: input.actorId,
    letter: orderCreatedLetter({
      ...brief,
      sourceLabel: order.sourceItem?.name ?? input.sourceLabel,
      paymentStatus: paymentStatus(order.totalKopecks, order.paidKopecks),
    }),
  });
}

/**
 * Статус оплаты считается, а не хранится, поэтому хук сравнивает его до и
 * после изменения сумм. `before` — статус, снятый до изменения в той же транзакции.
 */
export async function notifyPaymentStatusChange(
  tx: Tx,
  input: { orderId: string; actorId: string | null; before: PaymentStatus },
): Promise<void> {
  const { order, brief } = await loadBrief(tx, input.orderId);
  const after = paymentStatus(order.totalKopecks, order.paidKopecks);
  if (after === input.before) return;

  await enqueue(tx, {
    topic: paymentStatusTopic(after),
    orderId: input.orderId,
    actorId: input.actorId,
    letter: paymentStatusLetter({ ...brief, from: input.before, to: after, paidKopecks: order.paidKopecks }),
  });
}

/** Трек поставщика встал на этап. Возврат в «не начат» не уведомляет — подписаться на него нельзя. */
export async function notifySupplierStage(
  tx: Tx,
  input: {
    orderId: string;
    actorId: string | null;
    supplierName: string;
    fromStageName: string | null;
    toStage: { id: string; name: string };
  },
): Promise<void> {
  const { brief } = await loadBrief(tx, input.orderId);
  await enqueue(tx, {
    topic: supplierStageTopic(input.toStage.id),
    orderId: input.orderId,
    actorId: input.actorId,
    letter: supplierStageLetter({
      ...brief,
      supplierName: input.supplierName,
      fromStageName: input.fromStageName,
      toStageName: input.toStage.name,
    }),
  });
}
