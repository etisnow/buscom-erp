import "server-only";
import { normalizePhone } from "@/domain/customer/phone";
import type { Prisma } from "@/generated/prisma/client";
import type { CustomerType } from "@/generated/prisma/enums";
import { db } from "@/server/db";

export type CustomerFilters = {
  query?: string;
  type?: CustomerType;
  page?: number;
};

export const CUSTOMERS_PAGE_SIZE = 50;

export type CustomerListRow = {
  id: string;
  type: CustomerType;
  name: string;
  phone: string | null;
  email: string | null;
  inn: string | null;
  createdAt: Date;
  ordersCount: number;
  /** Сумма выполненных и отгруженных заказов — «сколько клиент купил» (PRD, M2) */
  purchasedKopecks: number;
};

export type CustomerListResult = {
  rows: CustomerListRow[];
  total: number;
  page: number;
  pageCount: number;
};

function where(filters: CustomerFilters): Prisma.CustomerWhereInput {
  const and: Prisma.CustomerWhereInput[] = [];

  const query = filters.query?.trim();
  if (query) {
    const phone = normalizePhone(query);
    const digits = query.replace(/\D/g, "");

    and.push({
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        ...(phone ? [{ phone }] : []),
        ...(query.includes("@") ? [{ email: { contains: query, mode: "insensitive" as const } }] : []),
        ...(/^\d{10,12}$/.test(digits) ? [{ inn: digits }] : []),
      ],
    });
  }
  if (filters.type) and.push({ type: filters.type });

  return and.length > 0 ? { AND: and } : {};
}

/** Сумма покупок считается только по закрытым сделкам: отгружен и выполнен. */
const PURCHASED_STATUSES = ["SHIPPED", "COMPLETED"] as const;

export async function listCustomers(filters: CustomerFilters): Promise<CustomerListResult> {
  const page = Math.max(1, filters.page ?? 1);
  const customerWhere = where(filters);

  const [customers, total] = await Promise.all([
    db.customer.findMany({
      where: customerWhere,
      select: {
        id: true,
        type: true,
        name: true,
        phone: true,
        email: true,
        inn: true,
        createdAt: true,
        _count: { select: { orders: { where: { deletedAt: null } } } },
      },
      orderBy: { name: "asc" },
      skip: (page - 1) * CUSTOMERS_PAGE_SIZE,
      take: CUSTOMERS_PAGE_SIZE,
    }),
    db.customer.count({ where: customerWhere }),
  ]);

  // Суммы покупок берём одной группировкой по показанным клиентам, а не запросом на строку.
  const sums =
    customers.length > 0
      ? await db.order.groupBy({
          by: ["customerId"],
          where: {
            customerId: { in: customers.map((customer) => customer.id) },
            deletedAt: null,
            status: { in: [...PURCHASED_STATUSES] },
          },
          _sum: { totalKopecks: true },
        })
      : [];
  const purchasedById = new Map(sums.map((row) => [row.customerId, row._sum.totalKopecks ?? 0]));

  return {
    rows: customers.map((customer) => ({
      id: customer.id,
      type: customer.type,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      inn: customer.inn,
      createdAt: customer.createdAt,
      ordersCount: customer._count.orders,
      purchasedKopecks: purchasedById.get(customer.id) ?? 0,
    })),
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / CUSTOMERS_PAGE_SIZE)),
  };
}

const detailsInclude = {
  addresses: { orderBy: { isDefault: "desc" } },
  orders: {
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      number: true,
      status: true,
      source: true,
      createdAt: true,
      totalKopecks: true,
      paidKopecks: true,
    },
  },
} satisfies Prisma.CustomerInclude;

export type CustomerDetails = Prisma.CustomerGetPayload<{ include: typeof detailsInclude }>;

export async function findCustomer(id: string): Promise<CustomerDetails | null> {
  return db.customer.findUnique({ where: { id }, include: detailsInclude });
}
