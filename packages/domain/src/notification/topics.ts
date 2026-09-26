/**
 * Уведомления сотрудникам о событиях заказов: темы, на которые подписываются
 * в личных настройках, и тексты писем.
 *
 * Тема — строка-ключ, подписки лежат в `User.notificationTopics`:
 * - `ORDER_CREATED:MANUAL` / `ORDER_CREATED:SITE` — новый заказ, заведённый
 *   вручную или пришедший с сайта (эндпоинт или письмо). Перенос из прежней ERP
 *   не уведомляет;
 * - `PAYMENT_STATUS:<статус>` — заказ перешёл в этот статус оплаты
 *   (`paymentStatus`): после платежа или правки состава, скидки, доставки.
 *   «Не оплачен» среди тем нет: платежи не удаляются, вернуться в него заказ не может;
 * - `SUPPLIER_STAGE:<id этапа>` — трек поставщика встал на этот этап. Этап
 *   у каждого поставщика свой, поэтому и подписка — на этап конкретного поставщика.
 *
 * Функции чистые: ни БД, ни Next.
 */
import { z } from "zod";
import { formatRub, type Kopecks } from "../money";
import { PAYMENT_STATUS_LABELS, type PaymentStatus } from "../order/payment-status";

export type OrderChannel = "MANUAL" | "SITE";

export function orderCreatedTopic(channel: OrderChannel): string {
  return `ORDER_CREATED:${channel}`;
}

export function paymentStatusTopic(status: PaymentStatus): string {
  return `PAYMENT_STATUS:${status}`;
}

const SUPPLIER_STAGE_PREFIX = "SUPPLIER_STAGE:";

export function supplierStageTopic(stageId: string): string {
  return `${SUPPLIER_STAGE_PREFIX}${stageId}`;
}

/** id этапа из ключа темы или null, если тема не про этап поставщика. */
export function stageIdFromTopic(topic: string): string | null {
  return topic.startsWith(SUPPLIER_STAGE_PREFIX) ? topic.slice(SUPPLIER_STAGE_PREFIX.length) || null : null;
}

export type TopicGroup = {
  title: string;
  description: string;
  topics: { key: string; label: string }[];
};

/** Общие темы — те, что не зависят от справочника поставщиков. Группы — как на форме. */
export const GENERAL_TOPIC_GROUPS: TopicGroup[] = [
  {
    title: "Новый заказ",
    description: "Письмо о каждом новом заказе из отмеченного источника.",
    topics: [
      { key: orderCreatedTopic("MANUAL"), label: "Заведён вручную" },
      { key: orderCreatedTopic("SITE"), label: "Пришёл с сайта" },
    ],
  },
  {
    title: "Статус оплаты",
    description: "Письмо, когда заказ переходит в отмеченный статус — после платежа или правки состава заказа.",
    topics: (["PARTIAL", "PAID", "OVERPAID"] as const).map((status) => ({
      key: paymentStatusTopic(status),
      label: PAYMENT_STATUS_LABELS[status],
    })),
  },
];

export const NOTIFICATION_TOPICS_MAX = 500;

/** Подписки с формы. Какие этапы существуют, проверяет сервер — здесь только форма ключей. */
export const notificationTopicsSchema = z
  .array(z.string().max(200))
  .max(NOTIFICATION_TOPICS_MAX, { error: "Слишком много подписок" })
  .transform((topics) => [...new Set(topics)]);

/**
 * Оставляет только известные темы: общие и этапы из `existingStageIds`.
 * Удалённый этап или подделанный ключ молча выпадает.
 */
export function filterKnownTopics(topics: string[], existingStageIds: ReadonlySet<string>): string[] {
  const general = new Set(GENERAL_TOPIC_GROUPS.flatMap((group) => group.topics.map((topic) => topic.key)));
  return topics.filter((topic) => {
    if (general.has(topic)) return true;
    const stageId = stageIdFromTopic(topic);
    return stageId !== null && existingStageIds.has(stageId);
  });
}

export type Letter = { subject: string; text: string };

/** Что о заказе нужно любому письму. */
export type OrderBrief = {
  number: number;
  customerName: string;
  totalKopecks: Kopecks;
  /** Ссылка на карточку заказа в ERP */
  url: string;
};

function orderLines(order: OrderBrief): string[] {
  return [`Клиент: ${order.customerName}`, `Сумма заказа: ${formatRub(order.totalKopecks)}`];
}

export function orderCreatedLetter(order: OrderBrief & { sourceLabel: string; paymentStatus: PaymentStatus }): Letter {
  return {
    subject: `Новый заказ №${order.number}`,
    text: [
      `Новый заказ №${order.number} — ${order.sourceLabel}.`,
      "",
      ...orderLines(order),
      `Оплата: ${PAYMENT_STATUS_LABELS[order.paymentStatus]}`,
      "",
      order.url,
    ].join("\n"),
  };
}

export function paymentStatusLetter(
  order: OrderBrief & { from: PaymentStatus; to: PaymentStatus; paidKopecks: Kopecks },
): Letter {
  const from = PAYMENT_STATUS_LABELS[order.from];
  const to = PAYMENT_STATUS_LABELS[order.to];
  return {
    subject: `Заказ №${order.number}: оплата — ${to}`,
    text: [
      `Статус оплаты заказа №${order.number}: ${from} → ${to}.`,
      `Оплачено: ${formatRub(order.paidKopecks)} из ${formatRub(order.totalKopecks)}`,
      "",
      ...orderLines(order),
      "",
      order.url,
    ].join("\n"),
  };
}

export function supplierStageLetter(
  order: OrderBrief & { supplierName: string; fromStageName: string | null; toStageName: string },
): Letter {
  const from = order.fromStageName ?? "не начат";
  return {
    subject: `Заказ №${order.number}: ${order.supplierName} — ${order.toStageName}`,
    text: [
      `Заказ №${order.number}, поставщик ${order.supplierName}: ${from} → ${order.toStageName}.`,
      "",
      ...orderLines(order),
      "",
      order.url,
    ].join("\n"),
  };
}
