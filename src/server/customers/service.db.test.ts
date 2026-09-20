import { beforeEach, expect, it } from "vitest";
import { createCustomer, CustomerExistsError } from "@/server/customers/service";
import { describeDb, resetDb, testDb } from "@/test/db";
import { makeUser } from "@/test/fixtures";
import type { SessionUser } from "@/server/session";

describeDb("заведение клиента из интерфейса (живая БД)", () => {
  let manager: SessionUser;

  beforeEach(async () => {
    await resetDb();
    manager = await makeUser("MANAGER");
  });

  it("заводит клиента и нормализует телефон", async () => {
    const { id } = await createCustomer(
      { type: "PERSON", name: "  Иванов Иван  ", phone: "8 (916) 123-45-67", email: "IVAN@Example.RU" },
      manager,
    );

    const customer = await testDb.customer.findUniqueOrThrow({ where: { id } });
    expect(customer.name).toBe("Иванов Иван");
    expect(customer.phone).toBe("+79161234567");
    expect(customer.email).toBe("ivan@example.ru");
    expect(customer.inn).toBeNull();
  });

  it("не заводит дубль по телефону и отдаёт существующего", async () => {
    const existing = await testDb.customer.create({ data: { name: "Иванов Иван", phone: "+79161234567" } });

    // Тот же номер в другом формате — сопоставление идёт по нормализованному.
    const attempt = createCustomer({ type: "PERSON", name: "Иванов И. И.", phone: "89161234567" }, manager);

    await expect(attempt).rejects.toThrow(CustomerExistsError);
    await expect(attempt).rejects.toMatchObject({ customerId: existing.id, customerName: "Иванов Иван" });
    expect(await testDb.customer.count()).toBe(1);
  });

  it("не заводит дубль по email без учёта регистра", async () => {
    await testDb.customer.create({ data: { name: "ООО «Автолайн»", type: "COMPANY", email: "buh@avtolain.ru" } });

    await expect(
      createCustomer({ type: "COMPANY", name: "Автолайн", email: "BUH@Avtolain.RU" }, manager),
    ).rejects.toThrow(CustomerExistsError);
    expect(await testDb.customer.count()).toBe(1);
  });

  it("однофамильцы без телефона и email заводятся оба: совпадение только по контактам", async () => {
    await createCustomer({ type: "PERSON", name: "Иванов Иван" }, manager);
    await createCustomer({ type: "PERSON", name: "Иванов Иван" }, manager);

    expect(await testDb.customer.count()).toBe(2);
  });

  it("пустое имя не проходит", async () => {
    await expect(createCustomer({ type: "PERSON", name: "   " }, manager)).rejects.toThrow(/Укажите имя/);
    expect(await testDb.customer.count()).toBe(0);
  });
});
