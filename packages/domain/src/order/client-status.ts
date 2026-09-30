import { z } from "zod";
import type { OrderStatus } from "@buscom/db/enums";
import { formatRub } from "../money";
import { paymentStatus } from "./payment-status";

/**
 * Клиентские статусы заказа — то, что покупатель видит в блоке «Проверить статус
 * заказа» на сайте. Свои статусы ERP для него слишком внутренние, поэтому в
 * «Администрирование → Статусы для клиента» их сопоставляют клиентским двумя
 * таблицами: статус заказа ERP → клиентский и этап поставщика → клиентский.
 *
 * Шаги на шкале: «Принят» → «Подтверждён» → «Оплачен» → «Передан в ТК» → «Получен».
 * «Оплачен» — особый: он не зависит от таблиц и хода заказа, а показывает правду об
 * оплате по платежам заказа («Оплачен» / «Оплачен частично» / ещё нет), даже если
 * заказ ещё не подтверждён. Остальные четыре — ход заказа (`PROGRESS_STEPS`).
 * Чистая логика без базы и сети: данные приходят от ERP-сервиса.
 */

/** Шаги на шкале по порядку слева направо. */
export const CLIENT_STEPS = ["RECEIVED", "CONFIRMED", "PAID", "HANDED_TO_CARRIER", "DELIVERED"] as const;
export type ClientStep = (typeof CLIENT_STEPS)[number];
export type ClientStatusKey = ClientStep | "CANCELLED";

/** Ход заказа — шаги, которые задают таблицы соответствия; «Оплачен» среди них нет. */
export const PROGRESS_STEPS = ["RECEIVED", "CONFIRMED", "HANDED_TO_CARRIER", "DELIVERED"] as const;
export type ProgressStep = (typeof PROGRESS_STEPS)[number];
/** Значение клиентского статуса в таблицах: шаг хода заказа или «Отменён» */
export type MappedStatus = ProgressStep | "CANCELLED";

const LABELS: Record<ClientStatusKey, string> = {
  RECEIVED: "Принят",
  CONFIRMED: "Подтверждён",
  PAID: "Оплачен",
  HANDED_TO_CARRIER: "Передан в ТК",
  DELIVERED: "Получен",
  CANCELLED: "Отменён",
};

/** Название статуса для клиента; «Передан в ТК» называет перевозчика заказа («Передан в СДЭК»). */
export function clientStatusLabel(key: ClientStatusKey, carrier?: string | null): string {
  if (key === "HANDED_TO_CARRIER" && carrier?.trim()) return `Передан в ${shortCarrierName(carrier)}`;
  return LABELS[key];
}

/** В справочнике ТК пишут «КИТ (GTD)»; клиенту скобки ни к чему. */
function shortCarrierName(carrier: string): string {
  return carrier.replace(/\s*\([^)]*\)\s*$/, "").trim() || carrier.trim();
}

/** Порядковый номер шага хода заказа; у «Отменён» — `null`. */
export function progressRank(key: MappedStatus): number | null {
  return key === "CANCELLED" ? null : PROGRESS_STEPS.indexOf(key);
}

export const ORDER_STATUS_KEYS = ["NEW", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const satisfies OrderStatus[];

/** Умолчания — как было бы без настройки: заказ принят, в работе — подтверждён, выполнен — получен. */
export const DEFAULT_ORDER_STATUS_MAP: Record<OrderStatus, MappedStatus> = {
  NEW: "RECEIVED",
  IN_PROGRESS: "CONFIRMED",
  COMPLETED: "DELIVERED",
  CANCELLED: "CANCELLED",
};

const mappedSchema = z.enum([...PROGRESS_STEPS, "CANCELLED"]);
const progressSchema = z.enum(PROGRESS_STEPS);

/**
 * Таблицы соответствия из «Администрирование → Статусы для клиента».
 * `orderStatuses` — как ERP-статус выглядит для клиента (неуказанные — умолчание);
 * `supplierStages` — id этапа поставщика → шаг, до которого этот этап «продвигает» заказ
 * (этап не в таблице заказ не двигает).
 */
export const clientStatusMappingSchema = z.object({
  orderStatuses: z.partialRecord(z.enum(ORDER_STATUS_KEYS), mappedSchema).default({}),
  supplierStages: z.record(z.string(), progressSchema).default({}),
});

export type ClientStatusMapping = z.infer<typeof clientStatusMappingSchema>;

export const DEFAULT_CLIENT_STATUS_MAPPING: ClientStatusMapping = { orderStatuses: {}, supplierStages: {} };

function baseStatus(orderStatus: OrderStatus, mapping: ClientStatusMapping): MappedStatus {
  return mapping.orderStatuses[orderStatus] ?? DEFAULT_ORDER_STATUS_MAP[orderStatus];
}

/**
 * Ход заказа для клиента сейчас. Основа — статус заказа по таблице; «Получен» и
 * «Отменён» от этапов поставщиков не зависят. Иначе заказ «продвигают» этапы: берём
 * самого отстающего поставщика — пока хоть один не дошёл, клиенту рано говорить
 * «передан», а поставщик без этапа в таблице или не начатый остаётся на основе.
 * Ниже основы статус не опускается. Оплата сюда не входит — её показывает свой шаг.
 */
export function clientStatusOf(
  orderStatus: OrderStatus,
  /** Этап каждого поставщика заказа: id или `null`, если работа не начата */
  stageIds: readonly (string | null)[],
  mapping: ClientStatusMapping,
): MappedStatus {
  const base = baseStatus(orderStatus, mapping);
  const baseRank = progressRank(base);
  if (baseRank === null || base === "DELIVERED" || stageIds.length === 0) return base;

  const ranks = stageIds.map((id) => {
    const mapped = id ? mapping.supplierStages[id] : undefined;
    return mapped ? PROGRESS_STEPS.indexOf(mapped) : baseRank;
  });
  return PROGRESS_STEPS[Math.max(baseRank, Math.min(...ranks))];
}

/** Что произошло с заказом — из журнала `OrderEvent`, по возрастанию времени. */
export type ClientTimelineEvent =
  | { kind: "STATUS"; at: Date; toStatus: OrderStatus }
  | { kind: "STAGE"; at: Date; supplierId: string; toStageId: string | null };

export type ClientTimelineStep = {
  key: ClientStatusKey;
  label: string;
  /** Когда шаг наступил; `null` — ещё нет (или заказ пришёл без журнала) */
  at: Date | null;
  /** `partial` — только у «Оплачен»: оплачена часть суммы */
  state: "done" | "current" | "pending" | "partial";
  /** Пояснение под названием: у частичной оплаты — «5 000 ₽ из 14 900 ₽» */
  note?: string | null;
};

export type ClientTimeline = {
  /** Текущий шаг хода заказа (заголовок блока); «Оплачен» текущим не бывает */
  current: MappedStatus;
  label: string;
  steps: ClientTimelineStep[];
};

export type PaymentRecord = { paidAt: Date; amountKopecks: number };

/**
 * Состояние оплаты по платежам: сумма против итога заказа (как `paymentStatus`).
 * `at` — когда оплата полная (платёж, закрывший сумму) или когда пришла первая часть.
 */
export function paymentProgress(
  totalKopecks: number,
  payments: readonly PaymentRecord[],
): { state: "none" | "partial" | "paid"; at: Date | null; paidKopecks: number } {
  const sorted = [...payments].sort((a, b) => a.paidAt.getTime() - b.paidAt.getTime());
  const paidKopecks = sorted.reduce((sum, payment) => sum + payment.amountKopecks, 0);
  const status = paymentStatus(totalKopecks, Math.max(0, paidKopecks));
  if (status === "UNPAID") return { state: "none", at: null, paidKopecks: 0 };
  if (status === "PARTIAL") return { state: "partial", at: sorted[0]?.paidAt ?? null, paidKopecks };

  let running = 0;
  for (const payment of sorted) {
    running += payment.amountKopecks;
    if (running >= totalKopecks) return { state: "paid", at: payment.paidAt, paidKopecks };
  }
  return { state: "paid", at: null, paidKopecks };
}

/**
 * Шкала для клиента. Журнал проигрывается с начала: после каждого события считаем ход
 * заказа и запоминаем, когда каждый шаг был достигнут впервые. Пропущенный шаг считается
 * пройденным в момент перехода. Шаги дальше текущего — «ожидается». «Оплачен» живёт
 * отдельно — по платежам. У отменённого заказа шкала заканчивается «Отменён».
 */
export function buildClientTimeline(input: {
  createdAt: Date;
  /** Статус заказа и этап каждого поставщика *сейчас* — итог, которому шкала должна соответствовать */
  orderStatus: OrderStatus;
  suppliers: readonly { supplierId: string; stageId: string | null }[];
  events: readonly ClientTimelineEvent[];
  mapping: ClientStatusMapping;
  totalKopecks: number;
  payments: readonly PaymentRecord[];
  carrier?: string | null;
  /** Перевозчик подтвердил выдачу груза: заказ «Получен», если ещё нет */
  delivered?: { at: Date | null } | null;
}): ClientTimeline {
  const { mapping } = input;
  const stages = new Map<string, string | null>(input.suppliers.map((supplier) => [supplier.supplierId, null]));
  let status: OrderStatus = "NEW";
  const reachedAt: (Date | null)[] = PROGRESS_STEPS.map(() => null);
  let cancelledAt: Date | null = null;

  const note = (at: Date) => {
    const key = clientStatusOf(status, [...stages.values()], mapping);
    const rank = progressRank(key);
    if (rank === null) {
      cancelledAt ??= at;
      return;
    }
    for (let index = 0; index <= rank; index++) reachedAt[index] ??= at;
  };

  note(input.createdAt);
  for (const event of input.events) {
    if (event.kind === "STATUS") status = event.toStatus;
    else if (stages.has(event.supplierId)) stages.set(event.supplierId, event.toStageId);
    note(event.at);
  }

  let current = clientStatusOf(
    input.orderStatus,
    input.suppliers.map((supplier) => supplier.stageId),
    mapping,
  );
  let deliveredAt = reachedAt[PROGRESS_STEPS.indexOf("DELIVERED")];
  if (input.delivered && current !== "CANCELLED" && current !== "DELIVERED") {
    current = "DELIVERED";
    deliveredAt = input.delivered.at;
  }

  const label = (key: ClientStatusKey) => clientStatusLabel(key, input.carrier);
  const currentRank = progressRank(current);

  const payment = paymentProgress(input.totalKopecks, input.payments);
  const paidStep: ClientTimelineStep =
    payment.state === "paid"
      ? { key: "PAID", label: "Оплачен", at: payment.at, state: "done" }
      : payment.state === "partial"
        ? {
            key: "PAID",
            label: "Оплачен частично",
            at: payment.at,
            state: "partial",
            note: `${formatRub(payment.paidKopecks)} из ${formatRub(input.totalKopecks)}`,
          }
        : { key: "PAID", label: "Оплачен", at: null, state: "pending" };

  if (currentRank === null) {
    // Отменён: показываем пройденное до отмены, оплату, если она была, и саму отмену
    const steps: ClientTimelineStep[] = [];
    for (const key of PROGRESS_STEPS) {
      const index = PROGRESS_STEPS.indexOf(key);
      if (reachedAt[index] !== null) steps.push({ key, label: label(key), at: reachedAt[index], state: "done" });
    }
    if (payment.state !== "none") steps.push(paidStep);
    steps.push({ key: "CANCELLED", label: label("CANCELLED"), at: cancelledAt, state: "current" });
    return { current, label: label(current), steps };
  }

  const progress = (key: ProgressStep): ClientTimelineStep => {
    const index = PROGRESS_STEPS.indexOf(key);
    const at = key === "DELIVERED" ? deliveredAt : reachedAt[index];
    return {
      key,
      label: label(key),
      // Дату показываем только у пройденного шага: шаг «впереди» мог быть достигнут раньше и откатиться
      at: index <= currentRank ? at : null,
      state: index < currentRank ? "done" : index === currentRank ? "current" : "pending",
    };
  };

  // Порядок на шкале — как в CLIENT_STEPS: «Оплачен» стоит между «Подтверждён» и «Передан в ТК»
  const steps = CLIENT_STEPS.map((key) => (key === "PAID" ? paidStep : progress(key)));
  return { current, label: label(current), steps };
}
