import { beforeEach, expect, it } from "vitest";
import { EMPTY_CUSTOMER_REQUISITES, parseCustomerRequisites } from "@/domain/customer/requisites";
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

  it("одинаковый email у разных клиентов разрешён: одна почта бухгалтерии на несколько юрлиц", async () => {
    await testDb.customer.create({ data: { name: "ООО «Автолайн»", type: "COMPANY", email: "buh@avtolain.ru" } });

    await createCustomer({ type: "COMPANY", name: "ООО «Автолайн-Юг»", email: "BUH@Avtolain.RU" }, manager);

    expect(await testDb.customer.count()).toBe(2);
  });

  it("клиентов без телефона можно завести сколько угодно: уникальность только по непустым", async () => {
    await createCustomer({ type: "PERSON", name: "Без телефона 1" }, manager);
    await createCustomer({ type: "PERSON", name: "Без телефона 2" }, manager);

    expect(await testDb.customer.count()).toBe(2);
  });

  it("однофамильцы без телефона и email заводятся оба: совпадение только по контактам", async () => {
    await createCustomer({ type: "PERSON", name: "Иванов Иван" }, manager);
    await createCustomer({ type: "PERSON", name: "Иванов Иван" }, manager);

    expect(await testDb.customer.count()).toBe(2);
  });

  it("заводит клиента вместе с адресами, помеченный — по умолчанию", async () => {
    const { id } = await createCustomer(
      {
        type: "COMPANY",
        name: "ООО «Автолайн»",
        addresses: [{ address: "Москва, ул. Ленина, 1" }, { address: "Екатеринбург, терминал СДЭК", isDefault: true }],
      },
      manager,
    );

    const addresses = await testDb.customerAddress.findMany({ where: { customerId: id } });
    expect(addresses).toHaveLength(2);
    expect(addresses.filter((item) => item.isDefault).map((item) => item.address)).toEqual([
      "Екатеринбург, терминал СДЭК",
    ]);
  });

  it("без пометки адрес по умолчанию — первый; пустые строки адресов отбрасываются", async () => {
    const { id } = await createCustomer(
      {
        type: "PERSON",
        name: "Иванов Иван",
        addresses: [{ address: "  " }, { address: "Пермь, ул. Мира, 5" }, { address: "" }],
      },
      manager,
    );

    const addresses = await testDb.customerAddress.findMany({ where: { customerId: id } });
    expect(addresses).toHaveLength(1);
    expect(addresses[0]).toMatchObject({ address: "Пермь, ул. Мира, 5", isDefault: true });
  });

  it("реквизиты юрлица ложатся в Json, пустые — не сохраняются", async () => {
    const { id } = await createCustomer(
      {
        type: "COMPANY",
        name: "ООО «Транс»",
        contactPerson: "Пётр Петров",
        requisites: { ...EMPTY_CUSTOMER_REQUISITES, ogrn: "1083917001629", bankName: "Сбербанк" },
      },
      manager,
    );
    const { id: emptyId } = await createCustomer(
      { type: "COMPANY", name: "ООО «Пусто»", requisites: EMPTY_CUSTOMER_REQUISITES },
      manager,
    );

    const filled = await testDb.customer.findUniqueOrThrow({ where: { id } });
    expect(parseCustomerRequisites(filled.requisites).ogrn).toBe("1083917001629");
    expect(filled.contactPerson).toBe("Пётр Петров");
    expect((await testDb.customer.findUniqueOrThrow({ where: { id: emptyId } })).requisites).toBeNull();
  });

  it("пустое имя не проходит", async () => {
    await expect(createCustomer({ type: "PERSON", name: "   " }, manager)).rejects.toThrow(/Укажите имя/);
    expect(await testDb.customer.count()).toBe(0);
  });
});
