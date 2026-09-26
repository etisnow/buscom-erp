import { beforeEach, expect, it } from "vitest";
import { importLegacyCustomers } from "@/server/customers/import";
import { describeDb, resetDb, testDb } from "@/test/db";

/** Строка выгрузки: колонки те же, что в файле прежней ERP. */
function row(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    Вид: "Физ.лицо",
    ФИО: "Иванов Иван",
    Название: "Иванов Иван",
    Телефон: "89161234567",
    "E-mail": "ivan@example.ru",
    Адрес: "Москва, ул. Ленина, 1",
    ...overrides,
  };
}

describeDb("импорт клиентов из прежней ERP (живая БД)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("заводит клиента с адресом по умолчанию", async () => {
    const report = await importLegacyCustomers([row()]);

    expect(report).toMatchObject({ всего: 1, создано: 1, дополнено: 0 });
    const customer = await testDb.customer.findFirstOrThrow({ include: { addresses: true } });
    expect(customer).toMatchObject({ name: "Иванов Иван", phone: "+79161234567", email: "ivan@example.ru" });
    expect(customer.addresses).toMatchObject([{ address: "Москва, ул. Ленина, 1", isDefault: true }]);
  });

  it("повторный прогон ничего не создаёт и не меняет", async () => {
    await importLegacyCustomers([row()]);
    const report = await importLegacyCustomers([row()]);

    expect(report).toMatchObject({ создано: 0, дополнено: 0, безИзменений: 1 });
    expect(await testDb.customer.count()).toBe(1);
    expect(await testDb.customerAddress.count()).toBe(1);
  });

  it("две строки с одним телефоном дают одного клиента", async () => {
    const report = await importLegacyCustomers([
      row(),
      row({ "E-mail": "", Примечание: "Второй заход", Адрес: "Тверь, ул. Мира, 2" }),
    ]);

    expect(report).toMatchObject({ создано: 1, слитоВнутриФайла: 1 });
    const customer = await testDb.customer.findFirstOrThrow({ include: { addresses: true } });
    expect(customer.comment).toContain("Второй заход");
    // Второй адрес добавляется, но по умолчанию остаётся первый.
    expect(customer.addresses).toHaveLength(2);
    expect(customer.addresses.filter((item) => item.isDefault)).toHaveLength(1);
  });

  it("уже заведённого клиента не перетирает, а дозаполняет пустое", async () => {
    await testDb.customer.create({
      data: { name: "Иванов И. И.", phone: "+79161234567", email: "personal@example.ru", comment: "Заметка менеджера" },
    });

    const report = await importLegacyCustomers([row({ ИНН: "771234567890" })]);

    expect(report).toMatchObject({ создано: 0, дополнено: 1 });
    const customer = await testDb.customer.findFirstOrThrow();
    // Имя и почту, введённые руками, выгрузка не трогает.
    expect(customer.name).toBe("Иванов И. И.");
    expect(customer.email).toBe("personal@example.ru");
    expect(customer.inn).toBe("771234567890");
    expect(customer.comment).toContain("Заметка менеджера");
  });

  it("без телефона ключом становится ИНН", async () => {
    const company = row({ Вид: "Юр.лицо", Название: "ООО «Транс»", Телефон: "", ИНН: "7701234567" });

    await importLegacyCustomers([company]);
    const report = await importLegacyCustomers([company]);

    expect(report).toMatchObject({ создано: 0, безКлюча: 0 });
    expect(await testDb.customer.count()).toBe(1);
  });

  it("строки без телефона и ИНН считаются отдельно, а с --only-keyed пропускаются", async () => {
    const keyless = row({ Телефон: "", "E-mail": "" });

    expect(await importLegacyCustomers([keyless], { onlyKeyed: true })).toMatchObject({ безКлюча: 1, создано: 0 });
    expect(await testDb.customer.count()).toBe(0);

    expect(await importLegacyCustomers([keyless])).toMatchObject({ безКлюча: 1, создано: 1 });
    expect(await testDb.customer.count()).toBe(1);
  });

  it("строку без имени пропускает", async () => {
    const report = await importLegacyCustomers([row({ ФИО: "  ", Название: "  " })]);

    expect(report).toMatchObject({ безИмени: 1, создано: 0 });
    expect(await testDb.customer.count()).toBe(0);
  });

  it("холостой прогон в базу не пишет", async () => {
    const report = await importLegacyCustomers([row()], { dryRun: true });

    expect(report).toMatchObject({ создано: 1 });
    expect(await testDb.customer.count()).toBe(0);
  });
});
