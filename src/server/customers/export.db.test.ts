import { beforeEach, expect, it } from "vitest";
import { exportCustomersCsv } from "@/server/customers/export";
import { createOrder } from "@/server/orders/create";
import { describeDb, resetDb, testDb } from "@/test/db";
import { makeProduct, makeUser } from "@/test/fixtures";
import type { SessionUser } from "@/server/session";

/** Строки файла без BOM и без завершающего перевода строки. */
function lines(csv: string): string[] {
  return csv.replace(/^﻿/, "").trimEnd().split("\r\n");
}

describeDb("выгрузка клиентов в CSV (живая БД)", () => {
  let manager: SessionUser;

  beforeEach(async () => {
    await resetDb();
    manager = await makeUser("MANAGER");
  });

  it("первая строка — заголовки, дальше по строке на клиента", async () => {
    await testDb.customer.create({ data: { name: "Иванов Иван", phone: "+79161111111" } });
    await testDb.customer.create({ data: { name: "ООО «Автолайн»", type: "COMPANY", inn: "7701234567" } });

    const { csv, truncated } = await exportCustomersCsv({});
    const rows = lines(csv);

    expect(rows[0]).toBe("Клиент;Тип;Телефон;Email;ИНН;Заказов;Куплено на, ₽;Клиент с");
    expect(rows).toHaveLength(3);
    expect(truncated).toBe(false);
  });

  it("телефон с восьмёрки, тип словом, пустые поля — пустые ячейки", async () => {
    await testDb.customer.create({ data: { name: "Иванов Иван", phone: "+79161234567" } });

    const { csv } = await exportCustomersCsv({});
    const cells = lines(csv)[1]!.split(";");

    // С «+» Excel принял бы ячейку за формулу.
    expect(cells[2]).toBe("8 (916) 123-45-67");
    expect(cells[1]).toBe("Физлицо");
    expect(cells[3]).toBe("");
    expect(cells[4]).toBe("");
  });

  it("считает заказы и сумму покупок по закрытым сделкам", async () => {
    const product = await makeProduct({ priceKopecks: 100_000 });
    const order = await createOrder({
      source: "PHONE",
      customer: { name: "Иванов Иван", phone: "8 916 123-45-67" },
      items: [
        {
          productId: product.id,
          sku: product.sku,
          name: product.name,
          priceKopecks: product.priceKopecks,
          quantity: 1,
        },
      ],
      user: manager,
    });

    const open = await exportCustomersCsv({});
    const openCells = lines(open.csv)[1]!.split(";");
    expect(openCells[5]).toBe("1");
    // Сделка ещё не закрыта — в «куплено на» она не попадает.
    expect(openCells[6]).toBe("0,00");

    // Статус меняем напрямую: проверяется выгрузка, а не статусная машина —
    // её переходы покрыты своими тестами.
    await testDb.order.update({ where: { id: order.id }, data: { status: "SHIPPED" } });

    const closed = await exportCustomersCsv({});
    expect(lines(closed.csv)[1]!.split(";")[6]).toBe("1000,00");
  });

  it("выгружается тот же список, что на экране: фильтры учитываются", async () => {
    await testDb.customer.create({ data: { name: "Иванов Иван", phone: "+79161111111" } });
    await testDb.customer.create({ data: { name: "ООО «Автолайн»", type: "COMPANY" } });

    const companies = await exportCustomersCsv({ type: "COMPANY" });
    expect(lines(companies.csv)).toHaveLength(2);
    expect(companies.csv).toContain("Автолайн");
    expect(companies.csv).not.toContain("Иванов");

    const search = await exportCustomersCsv({ query: "89161111111" });
    expect(lines(search.csv)).toHaveLength(2);
    expect(search.csv).toContain("Иванов");
  });

  it("имя с точкой с запятой берётся в кавычки, а не ломает колонки", async () => {
    await testDb.customer.create({ data: { name: "ООО «А; Б»", type: "COMPANY" } });

    const { csv } = await exportCustomersCsv({});

    expect(csv).toContain('"ООО «А; Б»"');
  });

  it("имя файла — дата выгрузки", async () => {
    const { fileName } = await exportCustomersCsv({});

    expect(fileName).toMatch(/^klienty-\d{4}-\d{2}-\d{2}\.csv$/);
  });
});
