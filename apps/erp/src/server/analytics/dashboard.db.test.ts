import { beforeEach, expect, it } from "vitest";
import { resolvePeriod } from "@/domain/analytics/period";
import type { OrderStatus } from "@buscom/db/enums";
import { getDashboard } from "@/server/analytics/dashboard";
import { db } from "@/server/db";
import { ForbiddenError } from "@/server/errors";
import { describeDb, resetDb } from "@/test/db";
import { makeCustomer, makeUser } from "@/test/fixtures";
import type { SessionUser } from "@/server/session";

const NOW = new Date("2026-09-24T12:00:00Z");
const SEPTEMBER = resolvePeriod({ preset: "month" }, NOW);

/**
 * Заказ прямо в базу: сервисы ставят даты «сейчас», а тесту нужны даты в
 * периоде и вне его. Итог — как посчитал бы сервер: сумма позиций.
 */
async function makeOrder(
  customerId: string,
  data: {
    status: OrderStatus;
    createdAt: string;
    statusChangedAt?: string;
    priceKopecks: number;
    costKopecks?: number;
    deletedAt?: Date;
  },
) {
  const supplier =
    data.costKopecks === undefined ? null : await db.supplier.create({ data: { name: `Поставщик ${Math.random()}` } });
  return db.order.create({
    data: {
      customerId,
      source: "PHONE",
      status: data.status,
      createdAt: new Date(data.createdAt),
      statusChangedAt: new Date(data.statusChangedAt ?? data.createdAt),
      itemsTotalKopecks: data.priceKopecks,
      totalKopecks: data.priceKopecks,
      deletedAt: data.deletedAt,
      items: {
        create: {
          sku: "A-1",
          name: "Сиденье",
          priceKopecks: data.priceKopecks,
          quantity: 1,
          supplierId: supplier?.id,
          purchaseCostKopecks: data.costKopecks,
        },
      },
      supplierTracks: supplier ? { create: { supplierId: supplier.id } } : undefined,
    },
  });
}

describeDb("аналитика (живая БД)", () => {
  let head: SessionUser;
  let customerId: string;

  beforeEach(async () => {
    await resetDb();
    head = await makeUser("HEAD");
    customerId = (await makeCustomer()).id;
  });

  it("выручка — выполненные по дате выполнения, маржа — где известна", async () => {
    // Создан в августе, выполнен в сентябре — в сентябрьскую выручку
    await makeOrder(customerId, {
      status: "COMPLETED",
      createdAt: "2026-08-20T10:00:00Z",
      statusChangedAt: "2026-09-02T10:00:00Z",
      priceKopecks: 100_000,
      costKopecks: 70_000,
    });
    // Без поставщика: в выручку да, в маржу нет
    await makeOrder(customerId, { status: "COMPLETED", createdAt: "2026-09-05T10:00:00Z", priceKopecks: 50_000 });
    // Выполнен в августе, отменён, в работе, удалён — в выручку не идут
    await makeOrder(customerId, { status: "COMPLETED", createdAt: "2026-08-05T10:00:00Z", priceKopecks: 1 });
    await makeOrder(customerId, { status: "CANCELLED", createdAt: "2026-09-06T10:00:00Z", priceKopecks: 2 });
    await makeOrder(customerId, { status: "IN_PROGRESS", createdAt: "2026-09-07T10:00:00Z", priceKopecks: 3 });
    await makeOrder(customerId, {
      status: "COMPLETED",
      createdAt: "2026-09-08T10:00:00Z",
      priceKopecks: 4,
      deletedAt: new Date(),
    });

    const dashboard = await getDashboard(SEPTEMBER, head);

    expect(dashboard.completed.orders).toBe(2);
    expect(dashboard.completed.revenueKopecks).toBe(150_000);
    expect(dashboard.completed.averageKopecks).toBe(75_000);
    expect(dashboard.completed.margin).toMatchObject({ knownOrders: 1, marginKopecks: 30_000 });
    expect(dashboard.series.find((point) => point.key === "2026-09-02")?.revenueKopecks).toBe(100_000);
    expect(dashboard.topProducts).toMatchObject([{ name: "Сиденье", quantity: 2, orders: 2 }]);
  });

  it("заказы по статусам — созданные в периоде, без удалённых", async () => {
    await makeOrder(customerId, {
      status: "COMPLETED",
      createdAt: "2026-08-20T10:00:00Z",
      statusChangedAt: "2026-09-02T10:00:00Z",
      priceKopecks: 1,
    });
    await makeOrder(customerId, { status: "NEW", createdAt: "2026-09-01T10:00:00Z", priceKopecks: 1 });
    await makeOrder(customerId, { status: "CANCELLED", createdAt: "2026-09-02T10:00:00Z", priceKopecks: 1 });
    await makeOrder(customerId, {
      status: "NEW",
      createdAt: "2026-09-03T10:00:00Z",
      priceKopecks: 1,
      deletedAt: new Date(),
    });

    const dashboard = await getDashboard(SEPTEMBER, head);

    expect(dashboard.createdOrders).toBe(2);
    expect(dashboard.byStatus.map((row) => [row.status, row.orders])).toEqual([
      ["NEW", 1],
      ["IN_PROGRESS", 0],
      ["COMPLETED", 0],
      ["CANCELLED", 1],
    ]);
  });

  it("оплаты — по дате платежа", async () => {
    const order = await makeOrder(customerId, {
      status: "IN_PROGRESS",
      createdAt: "2026-08-01T10:00:00Z",
      priceKopecks: 10,
    });
    await db.payment.createMany({
      data: [
        { orderId: order.id, method: "CASH", amountKopecks: 7, paidAt: new Date("2026-09-10T10:00:00Z") },
        { orderId: order.id, method: "CASH", amountKopecks: 3, paidAt: new Date("2026-08-10T10:00:00Z") },
      ],
    });

    const dashboard = await getDashboard(SEPTEMBER, head);

    expect(dashboard.payments).toEqual({ count: 1, amountKopecks: 7 });
  });

  it("менеджеру аналитика закрыта", async () => {
    const manager = await makeUser("MANAGER");
    await expect(getDashboard(SEPTEMBER, manager)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
