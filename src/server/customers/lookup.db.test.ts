import { beforeEach, expect, it } from "vitest";
import { lookupCustomers } from "@/server/customers/lookup";
import { describeDb, resetDb, testDb } from "@/test/db";

describeDb("подбор клиента по частичному телефону и ИНН (живая БД)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("находит по частичному телефону — не весь номер целиком", async () => {
    await testDb.customer.create({ data: { name: "Иванов Иван", phone: "+79161234567" } });
    await testDb.customer.create({ data: { name: "Другой клиент", phone: "+79997654321" } });

    const found = await lookupCustomers("916123");

    expect(found.map((item) => item.name)).toEqual(["Иванов Иван"]);
  });

  it("находит по частичному ИНН — не весь номер целиком", async () => {
    await testDb.customer.create({ data: { name: "ООО Ромашка", type: "COMPANY", inn: "7700000000" } });
    await testDb.customer.create({ data: { name: "ООО Другая", type: "COMPANY", inn: "5000000000" } });

    const found = await lookupCustomers("770000");

    expect(found.map((item) => item.name)).toEqual(["ООО Ромашка"]);
  });

  it("полный телефон по-прежнему находится, в любом формате записи", async () => {
    await testDb.customer.create({ data: { name: "Иванов Иван", phone: "+79161234567" } });

    const found = await lookupCustomers("8 (916) 123-45-67");

    expect(found.map((item) => item.name)).toEqual(["Иванов Иван"]);
  });

  it("совсем короткий ввод (меньше 3 символов) ничего не ищет", async () => {
    await testDb.customer.create({ data: { name: "ООО Ромашка", type: "COMPANY", inn: "7700000000" } });

    expect(await lookupCustomers("77")).toEqual([]);
  });

  it("находит по имени без учёта регистра кириллицы", async () => {
    await testDb.customer.create({ data: { name: 'ООО "БАСКОМ"', type: "COMPANY" } });
    await testDb.customer.create({ data: { name: "Другая компания", type: "COMPANY" } });

    // Обычный Postgres ILIKE это на здешней базе не умеет (docs/DECISIONS.md) —
    // сравниваем в приложении, см. matchNamesCaseInsensitive.
    const found = await lookupCustomers("баском");

    expect(found.map((item) => item.name)).toEqual(['ООО "БАСКОМ"']);
  });
});
