import "server-only";
import { toCsv } from "@/domain/csv";
import { formatMoscowDateTime, formatPhoneLocal } from "@/domain/datetime";
import { formatRubPlain } from "@/domain/money";
import { PAYMENT_STATUS_LABELS, paymentStatus } from "@/domain/order/payment-status";
import { ORDER_SOURCE_LABELS } from "@/domain/order/source";
import { ORDER_STATUS_LABELS } from "@/domain/order/status";
import { db } from "@/server/db";
import { ordersWhere, type OrderListFilters } from "@/server/orders/list";
import type { SessionUser } from "@/server/session";

/**
 * Выгрузка списка заказов в CSV (PRD, M7: «выгрузка любого списка»).
 *
 * Отдаётся ровно то, что человек видит на экране: те же фильтры и тот же вид,
 * только без пагинации. Сумма и оплата — числами без знака валюты, чтобы Excel
 * мог их сложить; остальное словами, как в списке.
 */

/**
 * Потолок выгрузки. На замере 100 000 заказов список держится в пределах требований
 * PRD, но CSV собирается в памяти одной строкой — при таком объёме это десятки
 * мегабайт. Если упрёмся, следующий шаг — отдавать файл потоком по курсору.
 */
export const EXPORT_LIMIT = 10_000;

const HEADERS = [
  "№",
  "№ на сайте",
  "Создан",
  "Статус",
  "Клиент",
  "Телефон",
  "Сумма, ₽",
  "Оплачено, ₽",
  "Оплата",
  "Менеджер",
  "Источник",
  "Просрочен",
];

export type OrdersCsv = {
  csv: string;
  fileName: string;
  /** Выгрузка упёрлась в потолок — в файле не все заказы фильтра. */
  truncated: boolean;
};

/** «20.09.2026 14:35»: без запятой, иначе Excel видит в ячейке не дату, а текст. */
function exportDateTime(date: Date): string {
  return formatMoscowDateTime(date).replace(",", "");
}

/**
 * Имя файла с датой выгрузки по Москве: `zakazy-2026-09-20.csv`.
 * Упёрлись в потолок — это видно в самом имени, до открытия файла.
 */
function fileName(now: Date, truncated: boolean): string {
  const [day, month, year] = formatMoscowDateTime(now).slice(0, 10).split(".");
  const suffix = truncated ? `-pervye-${EXPORT_LIMIT}` : "";
  return `zakazy-${year}-${month}-${day}${suffix}.csv`;
}

export async function exportOrdersCsv(filters: OrderListFilters, user: SessionUser): Promise<OrdersCsv> {
  const now = new Date();
  const where = ordersWhere(filters, user, now);

  const orders = await db.order.findMany({
    where,
    select: {
      number: true,
      externalId: true,
      createdAt: true,
      status: true,
      source: true,
      slaDueAt: true,
      totalKopecks: true,
      paidKopecks: true,
      customer: { select: { name: true, phone: true } },
      manager: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: EXPORT_LIMIT + 1,
  });

  const truncated = orders.length > EXPORT_LIMIT;
  const rows = truncated ? orders.slice(0, EXPORT_LIMIT) : orders;

  const table = [
    HEADERS,
    ...rows.map((order) => [
      order.number,
      order.externalId ?? "",
      exportDateTime(order.createdAt),
      ORDER_STATUS_LABELS[order.status],
      order.customer.name,
      formatPhoneLocal(order.customer.phone),
      formatRubPlain(order.totalKopecks),
      formatRubPlain(order.paidKopecks),
      PAYMENT_STATUS_LABELS[paymentStatus(order.totalKopecks, order.paidKopecks)],
      order.manager?.name ?? "не назначен",
      ORDER_SOURCE_LABELS[order.source],
      order.slaDueAt !== null && order.slaDueAt < now ? "да" : "",
    ]),
  ];

  return { csv: toCsv(table), fileName: fileName(now, truncated), truncated };
}
