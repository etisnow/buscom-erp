import { beforeEach, expect, it } from "vitest";
import { retryInboxEntry } from "@/server/integrations/inbox";
import { ingestSiteOrder } from "@/server/integrations/site-orders";
import { describeDb, resetDb, testDb } from "@/test/db";
import { makeProduct } from "@/test/fixtures";

function payload(overrides: Record<string, unknown> = {}) {
  return {
    externalId: "WEB-1",
    customer: { type: "PERSON", name: "Иван Петров", phone: "+7 912 345-67-89" },
    items: [{ sku: "TEST-1", name: "Люк вентиляционный", priceKopecks: 100_000, quantity: 2 }],
    totalKopecks: 200_000,
    ...overrides,
  };
}

describeDb("приём заказов с сайта (живая БД)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("создаёт заказ в статусе NEW и помечает запись журнала обработанной", async () => {
    const result = await ingestSiteOrder(payload());
    expect(result.status).toBe(201);

    const order = await testDb.order.findFirstOrThrow({ include: { items: true, events: true } });
    expect(order.status).toBe("NEW");
    expect(order.source).toBe("SITE");
    expect(order.externalId).toBe("WEB-1");
    expect(order.totalKopecks).toBe(200_000);
    expect(order.managerId).toBeNull();
    // Заказ с сайта создаёт система, а не сотрудник.
    expect(order.events[0]?.userId).toBeNull();

    const inbox = await testDb.integrationInbox.findFirstOrThrow();
    expect(inbox.status).toBe("PROCESSED");
    expect(inbox.orderId).toBe(order.id);
  });

  it("повторная доставка того же заказа не создаёт дубль", async () => {
    const first = await ingestSiteOrder(payload());
    const second = await ingestSiteOrder(payload());

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    if (first.status === 201 && second.status === 200) {
      expect(second.orderNumber).toBe(first.orderNumber);
      expect(second.duplicate).toBe(true);
    }
    expect(await testDb.order.count()).toBe(1);
  });

  it("негодный payload сохраняется сырым и помечается ошибкой", async () => {
    const result = await ingestSiteOrder(payload({ items: [] }));
    expect(result.status).toBe(202);

    const inbox = await testDb.integrationInbox.findFirstOrThrow();
    expect(inbox.status).toBe("FAILED");
    expect(inbox.error).toContain("позиция");
    // Главное свойство журнала: сырой JSON на месте, заказ не потерян.
    expect(inbox.payload).toMatchObject({ externalId: "WEB-1" });
    expect(await testDb.order.count()).toBe(0);
  });

  it("без externalId запись сохранить нельзя", async () => {
    const result = await ingestSiteOrder({ customer: { name: "Без номера" } });
    expect(result.status).toBe(400);
    expect(await testDb.integrationInbox.count()).toBe(0);
  });

  it("«Повторить» разбирает ту же запись заново", async () => {
    await ingestSiteOrder(payload({ items: [] }));
    const failed = await testDb.integrationInbox.findFirstOrThrow();

    // Чинить сам payload незачем — проверяем, что повтор доходит до разбора и снова падает.
    const again = await retryInboxEntry(failed.id);
    expect(again.status).toBe(202);

    const after = await testDb.integrationInbox.findUniqueOrThrow({ where: { id: failed.id } });
    expect(after.attempts).toBe(2);
  });

  it("товар связывается по артикулу, неизвестный остаётся без связи", async () => {
    const product = await makeProduct({ sku: "TEST-1" });

    await ingestSiteOrder(
      payload({
        items: [
          { sku: "TEST-1", name: "Известный", priceKopecks: 100_000, quantity: 1 },
          { sku: "НЕТ-ТАКОГО", name: "Неизвестный", priceKopecks: 50_000, quantity: 1 },
        ],
        totalKopecks: 150_000,
      }),
    );

    const items = await testDb.orderItem.findMany({ orderBy: { sortOrder: "asc" } });
    expect(items[0]?.productId).toBe(product.id);
    expect(items[1]?.productId).toBeNull();
  });

  it("клиент сопоставляется по нормализованному телефону, а не заводится заново", async () => {
    await ingestSiteOrder(payload({ externalId: "WEB-1" }));
    await ingestSiteOrder(
      payload({ externalId: "WEB-2", customer: { type: "PERSON", name: "Иван П.", phone: "89123456789" } }),
    );

    expect(await testDb.customer.count()).toBe(1);
    expect(await testDb.order.count()).toBe(2);
  });

  it("предоплата с сайта заводится платежом", async () => {
    await ingestSiteOrder(payload({ payment: { method: "ONLINE", paidKopecks: 200_000 } }));

    const order = await testDb.order.findFirstOrThrow({ include: { payments: true } });
    expect(order.paidKopecks).toBe(200_000);
    expect(order.payments).toHaveLength(1);
    expect(order.payments[0]?.method).toBe("ONLINE");
    // Автоперехода в PAID здесь нет: заказ ещё в NEW, его должен взять менеджер.
    expect(order.status).toBe("NEW");
  });

  it("расхождение суммы не блокирует приём, но попадает в журнал заказа", async () => {
    await ingestSiteOrder(payload({ totalKopecks: 999_999 }));

    const order = await testDb.order.findFirstOrThrow({ include: { events: true } });
    expect(order.totalKopecks).toBe(200_000);

    const warning = order.events.find((event) => event.comment?.includes("не совпала"));
    expect(warning).toBeDefined();
    expect(JSON.stringify(warning?.payload)).toContain("999999");
  });

  it("дата создания берётся из payload", async () => {
    await ingestSiteOrder(payload({ createdAt: "2026-09-19T10:15:00+03:00" }));

    const order = await testDb.order.findFirstOrThrow();
    expect(order.createdAt.toISOString()).toBe("2026-09-19T07:15:00.000Z");
  });
});
