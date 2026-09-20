import "server-only";
import { normalizePhone } from "@/domain/customer/phone";
import { db } from "@/server/db";

export type CustomerMatch = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  inn: string | null;
  ordersCount: number;
};

/**
 * Подбор клиента при создании заказа: по телефону, имени или ИНН.
 * Телефон нормализуется, поэтому «8 916…» находит клиента, записанного как «+7 916…».
 */
export async function lookupCustomers(query: string): Promise<CustomerMatch[]> {
  const search = query.trim();
  if (search.length < 3) return [];

  const phone = normalizePhone(search);
  const digits = search.replace(/\D/g, "");

  const customers = await db.customer.findMany({
    where: {
      OR: [
        ...(phone ? [{ phone }] : []),
        ...(/^\d{10,12}$/.test(digits) ? [{ inn: digits }] : []),
        { name: { contains: search, mode: "insensitive" as const } },
        ...(search.includes("@") ? [{ email: { equals: search, mode: "insensitive" as const } }] : []),
      ],
    },
    select: { id: true, name: true, phone: true, email: true, inn: true, _count: { select: { orders: true } } },
    orderBy: { name: "asc" },
    take: 8,
  });

  return customers.map((customer) => ({
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    email: customer.email,
    inn: customer.inn,
    ordersCount: customer._count.orders,
  }));
}
