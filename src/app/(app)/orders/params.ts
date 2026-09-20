import { z } from "zod";
import { list, pageNumber, single, type RawParams } from "@/app/(app)/search-params";
import type { OrderListFilters, OrderView } from "@/server/orders/list";

/** Значения из URL приходят строками и могут быть чем угодно — разбираем схемой. */
const viewSchema = z.enum(["all", "mine", "unassigned", "to-ship", "overdue"]);
const statusSchema = z.enum([
  "NEW",
  "IN_PROGRESS",
  "AWAITING_PAYMENT",
  "PAID",
  "ASSEMBLY",
  "SHIPPED",
  "COMPLETED",
  "CANCELLED",
]);
const sourceSchema = z.enum(["SITE", "PHONE", "EMAIL", "MESSENGER", "OTHER"]);
const paymentSchema = z.enum(["unpaid", "partial", "paid"]);

/** Дата из `<input type="date">` — начало и конец дня по Москве (UTC+3). */
function dayStart(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00+03:00`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function dayEnd(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T23:59:59.999+03:00`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function parseOrderListParams(params: RawParams, fallbackView: OrderView): OrderListFilters {
  const view = viewSchema.safeParse(single(params.view));
  const payment = paymentSchema.safeParse(single(params.payment));

  return {
    view: view.success ? view.data : fallbackView,
    query: single(params.q),
    statuses: list(params.status).filter(
      (value) => statusSchema.safeParse(value).success,
    ) as OrderListFilters["statuses"],
    managerId: single(params.manager),
    sources: list(params.source).filter(
      (value) => sourceSchema.safeParse(value).success,
    ) as OrderListFilters["sources"],
    createdFrom: dayStart(single(params.from)),
    createdTo: dayEnd(single(params.to)),
    payment: payment.success ? payment.data : undefined,
    page: pageNumber(params.page),
  };
}
