import type { UserRole } from "@/generated/prisma/enums";
import type { SessionUser } from "@/server/session";
import { testDb } from "@/test/db";

/** Пользователь для сервисов. В БД заводится настоящая строка — на неё ссылаются заказы. */
export async function makeUser(role: UserRole = "MANAGER", name = "Тестовый сотрудник"): Promise<SessionUser> {
  const user = await testDb.user.create({
    data: { name, email: `${role.toLowerCase()}-${Date.now()}-${Math.random()}@test.local`, role },
  });
  return { id: user.id, name: user.name, email: user.email, role: user.role, isActive: user.isActive };
}

export async function makeProduct(
  overrides: Partial<{ sku: string; name: string; priceKopecks: number; stock: number; madeToOrder: boolean }> = {},
) {
  return testDb.product.create({
    data: {
      sku: overrides.sku ?? `SKU-${Math.random().toString(36).slice(2, 8)}`,
      name: overrides.name ?? "Тестовый товар",
      priceKopecks: overrides.priceKopecks ?? 100_000,
      stock: overrides.stock ?? 10,
      madeToOrder: overrides.madeToOrder ?? false,
      compatibility: [],
    },
  });
}

export async function makeCustomer(name = "Тестовый клиент", phone = "+79990000000") {
  return testDb.customer.create({ data: { name, phone } });
}

/** Остаток и резерв товара — самая частая проверка в тестах резервирования. */
export async function stockOf(productId: string): Promise<{ stock: number; reserved: number }> {
  const product = await testDb.product.findUniqueOrThrow({
    where: { id: productId },
    select: { stock: true, reserved: true },
  });
  return product;
}
