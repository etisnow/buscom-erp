import { beforeEach, expect, it } from "vitest";
import { OrderEditError } from "@/domain/order/editing";
import { createOrder } from "@/server/orders/create";
import { changeOrderSource, resolveSystemSource } from "@/server/orders/source";
import type { SessionUser } from "@/server/session";
import { getOrderSources, setDictionaryItemActive } from "@/server/settings/service";
import { describeDb, resetDb, testDb } from "@/test/db";
import { makeProduct, makeUser } from "@/test/fixtures";

describeDb("источники заказов из справочника (живая БД)", () => {
  let manager: SessionUser;

  beforeEach(async () => {
    await resetDb();
    manager = await makeUser("MANAGER");
  });

  async function source(name: string) {
    return testDb.dictionaryItem.create({ data: { type: "ORDER_SOURCE", name } });
  }

  async function newOrder(sourceItemId: string | null) {
    const product = await makeProduct();
    return createOrder({
      sourceItemId,
      customer: { name: "Клиент" },
      items: [{ productId: product.id, sku: product.sku, name: product.name, priceKopecks: 100_000, quantity: 1 }],
      user: manager,
    });
  }

  it("заказ заводится с источником из справочника, в журнале — его название", async () => {
    const avito = await source("Авито");

    const order = await newOrder(avito.id);

    expect(order.sourceItemId).toBe(avito.id);
    const event = await testDb.orderEvent.findFirstOrThrow({ where: { orderId: order.id, type: "CREATED" } });
    expect(event.comment).toBe("Заказ создан вручную (Авито)");
  });

  it("выключенный и системный источник руками не выбрать", async () => {
    const off = await source("Выставка");
    await setDictionaryItemActive(off.id, false);
    const site = await resolveSystemSource(testDb, "SITE");

    await expect(newOrder(off.id)).rejects.toThrow(OrderEditError);
    await expect(newOrder(site)).rejects.toThrow(OrderEditError);
    expect((await getOrderSources()).map((item) => item.name)).toEqual([]);
  });

  it("смена источника в карточке пишет журнал", async () => {
    const phone = await source("Телефон");
    const avito = await source("Авито");
    const order = await newOrder(phone.id);

    await changeOrderSource(order.id, avito.id, manager);

    const fresh = await testDb.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(fresh.sourceItemId).toBe(avito.id);
    const event = await testDb.orderEvent.findFirstOrThrow({ where: { orderId: order.id, type: "UPDATED" } });
    expect(event.comment).toBe("Источник: Телефон → Авито");
  });

  it("у заказа с сайта источник не меняется", async () => {
    const avito = await source("Авито");
    const order = await newOrder(null);
    await testDb.order.update({ where: { id: order.id }, data: { source: "SITE", externalId: "S-1" } });

    await expect(changeOrderSource(order.id, avito.id, manager)).rejects.toThrow(/не меняется/);
  });

  it("системный источник не выключить, а при пустом справочнике он заводится сам", async () => {
    const legacy = await resolveSystemSource(testDb, "LEGACY");
    expect(await resolveSystemSource(testDb, "LEGACY")).toBe(legacy);

    await expect(setDictionaryItemActive(legacy, false)).rejects.toThrow(/Системный/);
    const item = await testDb.dictionaryItem.findUniqueOrThrow({ where: { id: legacy } });
    expect(item).toMatchObject({ name: "Прежняя ERP", systemCode: "LEGACY", isActive: true });
  });
});
