import { beforeEach, expect, it } from "vitest";
import { SLA_ENABLED } from "@buscom/domain/sla";
import { createOrder } from "@/server/orders/create";
import { exportOrdersCsv } from "@/server/orders/export";
import { addPayment } from "@/server/orders/payments";
import { describeDb, resetDb } from "@/test/db";
import { makeProduct, makeUser } from "@/test/fixtures";
import type { SessionUser } from "@/server/session";

/** Строки файла без BOM и без завершающего перевода строки. */
function lines(csv: string): string[] {
  return csv.replace(/^﻿/, "").trimEnd().split("\r\n");
}

/** Телефон у каждого клиента свой: по нему заказ сопоставляется с существующим (PRD). */
async function makeOrder(user: SessionUser, customerName: string, priceKopecks: number, phone = "8 916 123-45-67") {
  const product = await makeProduct({ priceKopecks });
  return createOrder({
    source: "PHONE",
    customer: { name: customerName, phone },
    items: [
      {
        productId: product.id,
        sku: product.sku,
        name: product.name,
        priceKopecks: product.priceKopecks,
        quantity: 1,
      },
    ],
    user,
  });
}

describeDb("выгрузка заказов в CSV (живая БД)", () => {
  let manager: SessionUser;

  beforeEach(async () => {
    await resetDb();
    manager = await makeUser("MANAGER");
  });

  it("первая строка — заголовки, дальше по строке на заказ", async () => {
    await makeOrder(manager, "Иванов Иван", 100_000, "8 916 111-11-11");
    await makeOrder(manager, "ООО «Автолайн»", 250_000, "8 916 222-22-22");

    const { csv, truncated } = await exportOrdersCsv({ view: "all" }, manager);
    const rows = lines(csv);

    // Колонка «Просрочен» — только при включённом SLA (packages/domain/src/sla.ts).
    expect(rows[0]).toBe(
      "№;№ на сайте;Создан;Статус;Клиент;Телефон;Сумма, ₽;Оплачено, ₽;Оплата;Менеджер;Источник" +
        (SLA_ENABLED ? ";Просрочен" : ""),
    );
    expect(rows).toHaveLength(3);
    expect(truncated).toBe(false);
  });

  it("суммы — числами без валюты, оплата и статус — словами", async () => {
    const order = await makeOrder(manager, "Иванов Иван", 100_000);
    await addPayment({ orderId: order.id, method: "CASH", amountKopecks: 40_000, paidAt: new Date(), user: manager });

    const { csv } = await exportOrdersCsv({ view: "all" }, manager);
    const [, row] = lines(csv);
    const cells = row!.split(";");

    expect(cells[6]).toBe("1000,00");
    expect(cells[7]).toBe("400,00");
    expect(cells[8]).toBe("Частично");
    expect(cells[3]).toBe("В работе");
    expect(cells[10]).toBe("Телефон");
    // Телефон с восьмёрки: с «+» Excel принял бы ячейку за формулу.
    expect(cells[5]).toBe("8 (916) 123-45-67");
  });

  it("имя с точкой с запятой берётся в кавычки, а не ломает колонки", async () => {
    await makeOrder(manager, "ООО «А; Б»", 100_000);

    const { csv } = await exportOrdersCsv({ view: "all" }, manager);

    expect(csv).toContain('"ООО «А; Б»"');
  });

  it("выгружается тот же список, что на экране: фильтры и вид учитываются", async () => {
    const other = await makeUser("MANAGER", "Другой сотрудник");
    await makeOrder(manager, "Мой клиент", 100_000, "8 916 111-11-11");
    await makeOrder(other, "Чужой клиент", 100_000, "8 916 222-22-22");

    const mine = await exportOrdersCsv({ view: "mine" }, manager);
    expect(lines(mine.csv)).toHaveLength(2);
    expect(mine.csv).toContain("Мой клиент");
    expect(mine.csv).not.toContain("Чужой клиент");

    const search = await exportOrdersCsv({ view: "all", query: "Чужой" }, manager);
    expect(lines(search.csv)).toHaveLength(2);
    expect(search.csv).toContain("Чужой клиент");
  });

  it("имя файла — дата выгрузки", async () => {
    const { fileName } = await exportOrdersCsv({ view: "all" }, manager);

    expect(fileName).toMatch(/^zakazy-\d{4}-\d{2}-\d{2}\.csv$/);
  });
});
