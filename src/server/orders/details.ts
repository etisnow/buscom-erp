import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";

const detailsInclude = {
  customer: {
    include: {
      // Адрес по умолчанию — первым: карточка показывает его как основной.
      addresses: { orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] },
      _count: { select: { orders: { where: { deletedAt: null } } } },
    },
  },
  manager: { select: { id: true, name: true } },
  sourceItem: { select: { id: true, name: true } },
  items: {
    orderBy: { sortOrder: "asc" },
    include: {
      supplier: { select: { id: true, name: true } },
      // Варианты поставщика для правки позиции — из привязок товара, дешёвый первым.
      product: {
        select: {
          suppliers: {
            orderBy: { purchasePriceKopecks: "asc" },
            select: { purchasePriceKopecks: true, supplier: { select: { id: true, name: true } } },
          },
        },
      },
    },
  },
  supplierTracks: {
    orderBy: { supplier: { name: "asc" } },
    select: {
      stageId: true,
      supplier: {
        select: { id: true, name: true, stages: { orderBy: { sortOrder: "asc" }, select: { id: true, name: true } } },
      },
    },
  },
  payments: { orderBy: { paidAt: "asc" }, include: { createdBy: { select: { name: true } } } },
  events: {
    orderBy: { createdAt: "desc" },
    include: { user: { select: { name: true } } },
  },
} satisfies Prisma.OrderInclude;

export type OrderDetails = Prisma.OrderGetPayload<{ include: typeof detailsInclude }>;

/** Карточка заказа по человекочитаемому номеру. Удалённые заказы не показываются. */
export async function findOrderByNumber(number: number): Promise<OrderDetails | null> {
  return db.order.findFirst({
    where: { number, deletedAt: null },
    include: detailsInclude,
  });
}
