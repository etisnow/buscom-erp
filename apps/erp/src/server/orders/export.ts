import "server-only";
import { csvDateTime, csvFileName, EXPORT_LIMIT, toCsv } from "@buscom/domain/csv";
import { formatPhoneLocal } from "@buscom/domain/datetime";
import { formatRubPlain } from "@buscom/domain/money";
import { PAYMENT_STATUS_LABELS, paymentStatus } from "@buscom/domain/order/payment-status";
import { orderSourceLabel } from "@buscom/domain/order/source";
import { ORDER_STATUS_LABELS } from "@buscom/domain/order/status";
import { SLA_ENABLED } from "@buscom/domain/sla";
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
  ...(SLA_ENABLED ? ["Просрочен"] : []),
];

export type OrdersCsv = {
  csv: string;
  fileName: string;
  /** Выгрузка упёрлась в потолок — в файле не все заказы фильтра. */
  truncated: boolean;
};

export async function exportOrdersCsv(filters: OrderListFilters, user: SessionUser): Promise<OrdersCsv> {
  const now = new Date();
  const where = ordersWhere(filters, user, now);

  const orders = await db.order.findMany({
    where,
    select: {
      number: true,
      siteNumber: true,
      createdAt: true,
      status: true,
      source: true,
      sourceItem: { select: { name: true } },
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
      order.siteNumber ?? "",
      csvDateTime(order.createdAt),
      ORDER_STATUS_LABELS[order.status],
      order.customer.name,
      formatPhoneLocal(order.customer.phone),
      formatRubPlain(order.totalKopecks),
      formatRubPlain(order.paidKopecks),
      PAYMENT_STATUS_LABELS[paymentStatus(order.totalKopecks, order.paidKopecks)],
      order.manager?.name ?? "не назначен",
      orderSourceLabel(order.source, order.sourceItem?.name),
      ...(SLA_ENABLED ? [order.slaDueAt !== null && order.slaDueAt < now ? "да" : ""] : []),
    ]),
  ];

  return { csv: toCsv(table), fileName: csvFileName("zakazy", now, truncated), truncated };
}
