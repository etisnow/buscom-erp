import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";

const detailsInclude = {
  customer: true,
  manager: { select: { id: true, name: true } },
  items: { orderBy: { sortOrder: "asc" } },
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
