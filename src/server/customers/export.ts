import "server-only";
import { csvFileName, EXPORT_LIMIT, toCsv } from "@/domain/csv";
import { CUSTOMER_TYPE_LABELS } from "@/domain/customer/type";
import { formatMoscowDate, formatPhoneLocal } from "@/domain/datetime";
import { formatRubPlain } from "@/domain/money";
import { customersWhere, type CustomerFilters } from "@/server/customers/list";
import { db } from "@/server/db";

/**
 * Выгрузка списка клиентов в CSV (PRD, M7: «выгрузка любого списка»).
 *
 * Схема та же, что у заказов: отдаётся ровно то, что видно на экране — те же
 * фильтры, только без пагинации. Колонки повторяют таблицу списка.
 */

const HEADERS = ["Клиент", "Тип", "Телефон", "Email", "ИНН", "Заказов", "Куплено на, ₽", "Клиент с"];

export type CustomersCsv = {
  csv: string;
  fileName: string;
  /** Выгрузка упёрлась в потолок — в файле не все клиенты фильтра. */
  truncated: boolean;
};

/** Сумма покупок считается по закрытым сделкам — так же, как в списке. */
const PURCHASED_STATUSES = ["SHIPPED", "COMPLETED"] as const;

export async function exportCustomersCsv(filters: CustomerFilters): Promise<CustomersCsv> {
  const now = new Date();

  const customers = await db.customer.findMany({
    where: customersWhere(filters),
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
    take: EXPORT_LIMIT + 1,
  });

  const truncated = customers.length > EXPORT_LIMIT;
  const rows = truncated ? customers.slice(0, EXPORT_LIMIT) : customers;

  // Суммы — одной группировкой по выгружаемым клиентам, а не запросом на строку.
  const sums =
    rows.length > 0
      ? await db.order.groupBy({
          by: ["customerId"],
          where: {
            customerId: { in: rows.map((customer) => customer.id) },
            deletedAt: null,
            status: { in: [...PURCHASED_STATUSES] },
          },
          _sum: { totalKopecks: true },
        })
      : [];
  const purchasedById = new Map(sums.map((row) => [row.customerId, row._sum.totalKopecks ?? 0]));

  const table = [
    HEADERS,
    ...rows.map((customer) => [
      customer.name,
      CUSTOMER_TYPE_LABELS[customer.type],
      formatPhoneLocal(customer.phone),
      customer.email ?? "",
      customer.inn ?? "",
      customer._count.orders,
      formatRubPlain(purchasedById.get(customer.id) ?? 0),
      formatMoscowDate(customer.createdAt),
    ]),
  ];

  return { csv: toCsv(table), fileName: csvFileName("klienty", now, truncated), truncated };
}
