import "server-only";
import { normalizePhone } from "@/domain/customer/phone";
import { SLA_ENABLED } from "@/domain/sla";
import type { Prisma } from "@buscom/db/client";
import type { OrderStatus } from "@buscom/db/enums";
import { db } from "@/server/db";
import type { SessionUser } from "@/server/session";

/** Сохранённые виды из PRD, «Список заказов». */
export type OrderView = "all" | "mine" | "unassigned" | "overdue";

export const ORDER_VIEW_LABELS: Record<OrderView, string> = {
  all: "Все",
  mine: "Мои",
  unassigned: "Без менеджера",
  overdue: "Просроченные",
};

/**
 * Вид по умолчанию. Раньше зависел от роли: склад открывал «К отгрузке».
 * Склада в проекте нет, вид тоже убран — все открывают «Все».
 */
export function defaultView(): OrderView {
  return "all";
}

export type PaymentFilter = "unpaid" | "partial" | "paid";

export type OrderListFilters = {
  view: OrderView;
  /** Поиск одним полем: №, № на сайте, телефон, email, ИНН, часть имени клиента */
  query?: string;
  statuses?: OrderStatus[];
  managerId?: string;
  /** id пунктов справочника источников */
  sourceItemIds?: string[];
  createdFrom?: Date;
  createdTo?: Date;
  payment?: PaymentFilter;
  page?: number;
};

export const PAGE_SIZE = 50;

const listSelect = {
  id: true,
  number: true,
  siteNumber: true,
  status: true,
  createdAt: true,
  statusChangedAt: true,
  slaDueAt: true,
  totalKopecks: true,
  paidKopecks: true,
  customer: { select: { name: true, phone: true } },
  items: { select: { id: true, name: true, quantity: true }, orderBy: { sortOrder: "asc" } },
  // Цепочка этапов нужна целиком: по ней видно, пройден ли трек (isTrackComplete)
  supplierTracks: {
    select: {
      supplierId: true,
      stageId: true,
      supplier: { select: { name: true, stages: { select: { id: true, name: true }, orderBy: { sortOrder: "asc" } } } },
    },
    orderBy: { supplier: { name: "asc" } },
  },
} satisfies Prisma.OrderSelect;

export type OrderListRow = Prisma.OrderGetPayload<{ select: typeof listSelect }>;

export type OrderListResult = {
  rows: OrderListRow[];
  total: number;
  page: number;
  pageCount: number;
  /** Счётчики на вкладках — считаются с учётом текущих фильтров, но без самого вида */
  counts: Record<OrderView, number>;
};

/** Условие вида. `now` передаётся снаружи, чтобы счётчики и выборка считались на один момент. */
function viewWhere(view: OrderView, user: SessionUser, now: Date): Prisma.OrderWhereInput {
  switch (view) {
    case "mine":
      return { managerId: user.id };
    case "unassigned":
      return { managerId: null };
    case "overdue":
      return { slaDueAt: { lt: now } };
    case "all":
      return {};
  }
}

/**
 * Поиск одним полем. Телефон нормализуется, так что «8 916…» и «+7 916…»
 * находят одного и того же клиента; число ищется и как номер ERP, и как номер на сайте.
 */
function searchWhere(raw: string): Prisma.OrderWhereInput | null {
  const query = raw.trim();
  if (!query) return null;

  const or: Prisma.OrderWhereInput[] = [];

  const digits = query.replace(/\D/g, "");
  if (digits && digits.length <= 9) {
    const number = Number(digits);
    if (Number.isSafeInteger(number)) or.push({ number });
  }
  // Номер на сайте и ID прежней ERP у архивных заказов
  or.push({ siteNumber: { contains: query, mode: "insensitive" } });
  or.push({ externalId: { contains: query, mode: "insensitive" } });

  const phone = normalizePhone(query);
  if (phone) or.push({ customer: { phone } });

  if (query.includes("@")) {
    or.push({ customer: { email: { equals: query, mode: "insensitive" } } });
  }
  if (/^\d{10,12}$/.test(digits)) {
    or.push({ customer: { inn: digits } });
  }
  or.push({ customer: { name: { contains: query, mode: "insensitive" } } });

  return { OR: or };
}

/** Фильтр по статусу оплаты. Статус не хранится — сравниваем сумму платежей с итогом. */
function paymentWhere(payment: PaymentFilter): Prisma.OrderWhereInput {
  switch (payment) {
    case "unpaid":
      return { paidKopecks: 0 };
    case "partial":
      return { AND: [{ paidKopecks: { gt: 0 } }, { paidKopecks: { lt: db.order.fields.totalKopecks } }] };
    case "paid":
      return { paidKopecks: { gte: db.order.fields.totalKopecks } };
  }
}

/** Условия без вида — общие для выборки и для счётчиков вкладок. */
function baseWhere(filters: OrderListFilters): Prisma.OrderWhereInput {
  const and: Prisma.OrderWhereInput[] = [{ deletedAt: null }];

  const search = filters.query ? searchWhere(filters.query) : null;
  if (search) and.push(search);
  if (filters.statuses?.length) and.push({ status: { in: filters.statuses } });
  if (filters.managerId) and.push({ managerId: filters.managerId });
  if (filters.sourceItemIds?.length) and.push({ sourceItemId: { in: filters.sourceItemIds } });
  if (filters.createdFrom) and.push({ createdAt: { gte: filters.createdFrom } });
  if (filters.createdTo) and.push({ createdAt: { lte: filters.createdTo } });
  if (filters.payment) and.push(paymentWhere(filters.payment));

  return { AND: and };
}

/** Виды, которые показываются вкладками: «Просроченные» — только при включённом SLA. */
export const VISIBLE_ORDER_VIEWS: OrderView[] = SLA_ENABLED
  ? ["all", "mine", "unassigned", "overdue"]
  : ["all", "mine", "unassigned"];

/**
 * Условия выборки для текущих фильтров и вида. Общие у списка и у выгрузки в CSV,
 * чтобы файл содержал ровно то, что человек видит на экране.
 */
export function ordersWhere(filters: OrderListFilters, user: SessionUser, now: Date): Prisma.OrderWhereInput {
  return { AND: [baseWhere(filters), viewWhere(filters.view, user, now)] };
}

export async function listOrders(filters: OrderListFilters, user: SessionUser): Promise<OrderListResult> {
  const now = new Date();
  const page = Math.max(1, filters.page ?? 1);
  const base = baseWhere(filters);
  const where: Prisma.OrderWhereInput = { AND: [base, viewWhere(filters.view, user, now)] };

  const [rows, total, ...counts] = await Promise.all([
    db.order.findMany({
      where,
      select: listSelect,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.order.count({ where }),
    ...VISIBLE_ORDER_VIEWS.map((view) => db.order.count({ where: { AND: [base, viewWhere(view, user, now)] } })),
  ]);

  return {
    rows,
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    counts: {
      all: 0,
      mine: 0,
      unassigned: 0,
      overdue: 0,
      ...Object.fromEntries(VISIBLE_ORDER_VIEWS.map((view, index) => [view, counts[index] ?? 0])),
    },
  };
}

/** Менеджеры для выпадающего списка фильтра. */
export async function listManagers(): Promise<{ id: string; name: string }[]> {
  return db.user.findMany({
    where: { isActive: true, role: { in: ["MANAGER", "HEAD", "ADMIN"] } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}
