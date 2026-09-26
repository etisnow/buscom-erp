import { beforeEach, expect, it } from "vitest";
import { importLegacyOrders } from "@/server/orders/import";
import { createOrder } from "@/server/orders/create";
import { describeDb, resetDb, testDb } from "@/test/db";
import { makeProduct, makeUser } from "@/test/fixtures";

/** Строка выгрузки: колонки те же, что в файле прежней ERP. */
function row(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    ID: "3241",
    Номер: "402",
    Дата: "18.08.2026",
    "На кого": "ООО Норд-авто",
    "E-mail": "nordserv@list.ru",
    Описание: "Сиденье пассажира одноместное Соболь NN",
    "Сумма к оплате": "22785,00",
    Оплачено: "22785,00",
    "Сумма скидок": "0,00",
    "Дата п/п": "10.08.2026",
    "Транспортная компания": "СДЭК",
    "Кто добавил": "Бражник Дмитрий Вячеславович",
    ...overrides,
  };
}

describeDb("импорт заказов из прежней ERP (живая БД)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("создаёт закрытый заказ с одной позицией, платежом и записью в журнале", async () => {
    await testDb.customer.create({ data: { name: "ООО Норд-авто", type: "COMPANY" } });

    const report = await importLegacyOrders([row()]);

    expect(report).toMatchObject({ создано: 1, клиентНайден: 1, клиентЗаведён: 0 });
    const order = await testDb.order.findFirstOrThrow({ include: { items: true, payments: true, events: true } });
    expect(order).toMatchObject({
      number: 1,
      source: "LEGACY",
      externalId: "3241",
      status: "COMPLETED",
      totalKopecks: 2_278_500,
      paidKopecks: 2_278_500,
      deliveryMethod: "CARRIER",
      carrier: "СДЭК",
      slaDueAt: null,
    });
    expect(order.items).toHaveLength(1);
    expect(order.items[0]).toMatchObject({ sku: "ИМПОРТ", quantity: 1, priceKopecks: 2_278_500 });
    expect(order.payments[0]?.amountKopecks).toBe(2_278_500);
    expect(order.events[0]?.comment).toContain("Номер там: 402");
  });

  it("дата заказа становится датой создания, а не днём импорта", async () => {
    await importLegacyOrders([row()]);

    const order = await testDb.order.findFirstOrThrow();
    expect(order.createdAt.toISOString()).toBe("2026-08-17T21:00:00.000Z");
    expect(order.statusChangedAt.toISOString()).toBe("2026-08-17T21:00:00.000Z");
  });

  it("повторный прогон ничего не создаёт", async () => {
    await importLegacyOrders([row()]);
    const report = await importLegacyOrders([row()]);

    expect(report).toMatchObject({ создано: 0, ужеБыло: 1 });
    expect(await testDb.order.count()).toBe(1);
  });

  it("номера раздаются по дате: старший заказ становится первым", async () => {
    await importLegacyOrders([
      row({ ID: "2", Дата: "05.03.2020" }),
      row({ ID: "1", Дата: "01.02.2019" }),
      row({ ID: "3", Дата: "18.08.2026" }),
    ]);

    const orders = await testDb.order.findMany({
      orderBy: { number: "asc" },
      select: { number: true, externalId: true },
    });
    expect(orders).toEqual([
      { number: 1, externalId: "1" },
      { number: 2, externalId: "2" },
      { number: 3, externalId: "3" },
    ]);
  });

  it("неизвестного клиента заводит сам", async () => {
    const report = await importLegacyOrders([row({ "На кого": "ООО Никому Не Известное" })]);

    expect(report).toMatchObject({ клиентЗаведён: 1 });
    const customer = await testDb.customer.findFirstOrThrow();
    expect(customer.name).toBe("ООО Никому Не Известное");
    expect(customer.comment).toContain("Заведён импортом заказов");
  });

  it("без --renumber отказывается занимать номера рабочих заказов", async () => {
    const manager = await makeUser("MANAGER");
    const product = await makeProduct({ priceKopecks: 100_000 });
    await createOrder({
      source: "PHONE",
      customer: { type: "PERSON", name: "Иванов Иван", phone: "89161234567" },
      items: [
        {
          productId: product.id,
          sku: product.sku,
          name: product.name,
          priceKopecks: 100_000,
          quantity: 1,
          discountKopecks: 0,
        },
      ],
      discountKopecks: 0,
      deliveryMethod: null,
      deliveryPriceKopecks: 0,
      user: manager,
    });

    await expect(importLegacyOrders([row()])).rejects.toThrow(/--renumber/);
    expect(await testDb.order.count()).toBe(1);
  });

  it("с --renumber сдвигает рабочие заказы выше архива и двигает последовательность", async () => {
    const manager = await makeUser("MANAGER");
    const product = await makeProduct({ priceKopecks: 100_000 });
    const item = {
      productId: product.id,
      sku: product.sku,
      name: product.name,
      priceKopecks: 100_000,
      quantity: 1,
      discountKopecks: 0,
    };
    const base = {
      source: "PHONE" as const,
      customer: { type: "PERSON" as const, name: "Иванов Иван", phone: "89161234567" },
      items: [item],
      discountKopecks: 0,
      deliveryMethod: null,
      deliveryPriceKopecks: 0,
      user: manager,
    };
    const first = await createOrder(base);
    const second = await createOrder({
      ...base,
      customer: { type: "PERSON", name: "Петров Пётр", phone: "89161112233" },
    });

    const report = await importLegacyOrders([row({ ID: "1" }), row({ ID: "2", Дата: "01.02.2019" })], {
      allowRenumber: true,
    });

    expect(report.перенумерованоРабочих).toBe(2);
    expect((await testDb.order.findUniqueOrThrow({ where: { id: first.id } })).number).toBe(3);
    expect((await testDb.order.findUniqueOrThrow({ where: { id: second.id } })).number).toBe(4);

    // Следующий заказ должен получить номер после всех, а не столкнуться с архивом.
    const next = await createOrder({ ...base, customer: { type: "PERSON", name: "Сидоров", phone: "89160001122" } });
    expect(next.number).toBe(5);
  });

  it("строку без даты и ID пропускает", async () => {
    const report = await importLegacyOrders([row({ ID: "" }), row({ Дата: "" })]);

    expect(report).toMatchObject({ пропущеноБезДаты: 2, создано: 0 });
    expect(await testDb.order.count()).toBe(0);
  });

  it("холостой прогон в базу не пишет", async () => {
    const report = await importLegacyOrders([row()], { dryRun: true });

    expect(report).toMatchObject({ создано: 1 });
    expect(await testDb.order.count()).toBe(0);
  });
});
