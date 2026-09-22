import { beforeEach, expect, it } from "vitest";
import { listCustomers } from "@/server/customers/list";
import { describeDb, resetDb, testDb } from "@/test/db";

describeDb("список клиентов: поиск (живая БД)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("находит по имени без учёта регистра кириллицы", async () => {
    await testDb.customer.create({ data: { name: 'ООО "БАСКОМ"', type: "COMPANY" } });
    await testDb.customer.create({ data: { name: "Другая компания", type: "COMPANY" } });

    const result = await listCustomers({ query: "баском" });

    expect(result.rows.map((row) => row.name)).toEqual(['ООО "БАСКОМ"']);
  });

  it("находит по частичному телефону и ИНН", async () => {
    await testDb.customer.create({ data: { name: "Иванов Иван", phone: "+79161234567", inn: "7700000000" } });
    await testDb.customer.create({ data: { name: "Другой клиент", phone: "+79997654321", inn: "5000000000" } });

    expect((await listCustomers({ query: "916123" })).rows.map((r) => r.name)).toEqual(["Иванов Иван"]);
    expect((await listCustomers({ query: "770000" })).rows.map((r) => r.name)).toEqual(["Иванов Иван"]);
  });
});
