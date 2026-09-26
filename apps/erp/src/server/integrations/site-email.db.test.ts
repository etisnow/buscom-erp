import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, expect, it } from "vitest";
import { retryInboxEntry } from "@/server/integrations/inbox";
import { ingestSiteEmail, SITE_EMAIL_SOURCE, type StoredEmail } from "@/server/integrations/site-email";
import { ingestSiteOrder } from "@/server/integrations/site-orders";
import { describeDb, resetDb, testDb } from "@/test/db";
import { makeCustomer, makeProduct } from "@/test/fixtures";

const fixture = (name: string) =>
  readFileSync(join(__dirname, "../../../../../packages/domain/src/integration/fixtures", name), "utf8");

function companyEmail(overrides: Partial<StoredEmail> = {}): StoredEmail {
  return {
    messageId: "<2820@example.ru>",
    from: "shop@example.ru",
    subject: "Баском. Комплектующие для микроавтобусов - Заказ 2820",
    date: "2026-09-23T12:19:29.000Z",
    html: fixture("opencart-company.html"),
    text: fixture("opencart-company.txt"),
    ...overrides,
  };
}

describeDb("приём заказов из писем сайта (живая БД)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("создаёт заказ с сайта: клиент-юрлицо, позиция связана с каталогом по артикулу, доставка", async () => {
    const product = await makeProduct({ sku: "P06", name: "Полки для микроавтобуса Турист", priceKopecks: 2_700_000 });

    const result = await ingestSiteEmail(companyEmail());
    expect(result).toMatchObject({ status: 201 });

    const order = await testDb.order.findFirstOrThrow({ include: { items: true, customer: true, events: true } });
    expect(order).toMatchObject({
      source: "SITE",
      externalId: "2820",
      status: "NEW",
      totalKopecks: 2_700_000,
      deliveryMethod: "CARRIER",
      carrier: "Деловые линии",
    });
    expect(order.createdAt.toISOString()).toBe("2026-09-23T12:19:29.000Z");
    expect(order.items[0]).toMatchObject({ productId: product.id, sku: "P06", quantity: 1 });
    expect(order.customer).toMatchObject({
      type: "COMPANY",
      name: "ООО «РОМАШКА-АВТО»",
      inn: "7700000009",
      phone: "+79120000001",
      email: "ivan@example.ru",
    });
    expect(order.customerComment).toContain("Реквизиты:");
    expect(order.events[0]?.comment).toBe(
      "Заказ принят из письма сайта, № на сайте 2820; способ оплаты на сайте: Выставить счет",
    );

    const inbox = await testDb.integrationInbox.findFirstOrThrow();
    expect(inbox).toMatchObject({
      source: SITE_EMAIL_SOURCE,
      externalId: "2820",
      status: "PROCESSED",
      orderId: order.id,
    });
    // В журнале — само письмо: по нему можно разобрать заказ заново
    expect(inbox.payload).toMatchObject({ subject: companyEmail().subject });
  });

  it("то же письмо второй раз не создаёт дубль", async () => {
    const first = await ingestSiteEmail(companyEmail());
    const second = await ingestSiteEmail(companyEmail());

    expect(first.status).toBe(201);
    expect(second).toMatchObject({ status: 200, duplicate: true });
    expect(await testDb.order.count()).toBe(1);
    expect(await testDb.integrationInbox.count()).toBe(1);
  });

  it("письмо не о заказе в журнал не попадает", async () => {
    const result = await ingestSiteEmail(
      companyEmail({ subject: "Re: доставка", html: "<p>Когда отправите?</p>", text: "" }),
    );
    expect(result).toEqual({ status: "skipped" });
    expect(await testDb.integrationInbox.count()).toBe(0);
  });

  it("неразборчивое письмо сохраняется с ошибкой, «Повторить» разбирает его заново", async () => {
    const broken = companyEmail({ html: companyEmail().html.replace(/Модель/g, "Артикул") });
    const result = await ingestSiteEmail(broken);
    expect(result).toMatchObject({ status: 202, error: "В письме не найдена таблица товаров" });

    const failed = await testDb.integrationInbox.findFirstOrThrow();
    expect(failed.status).toBe("FAILED");
    expect(await testDb.order.count()).toBe(0);

    // Шаблон починили — в журнале правим письмо и повторяем (как после правки парсера)
    await testDb.integrationInbox.update({ where: { id: failed.id }, data: { payload: companyEmail() } });
    const again = await retryInboxEntry(failed.id);
    expect(again).toMatchObject({ status: 201 });
    expect(await testDb.integrationInbox.findUniqueOrThrow({ where: { id: failed.id } })).toMatchObject({
      status: "PROCESSED",
      attempts: 2,
    });
  });

  it("заказ с ИНН не привязывается к физлицу с тем же телефоном — заводится юрлицо без телефона", async () => {
    const person = await makeCustomer("Иван Иванов", "+79120000001");

    await ingestSiteEmail(companyEmail());

    const order = await testDb.order.findFirstOrThrow({ include: { customer: true } });
    expect(order.customerId).not.toBe(person.id);
    expect(order.customer).toMatchObject({ type: "COMPANY", inn: "7700000009", kpp: "770001001", phone: null });
    // Телефон уникален в базе — у юрлица он только в комментарии, чтобы не потерялся
    expect(order.customer.comment).toBe("Телефон +79120000001 уже записан за другим клиентом");
  });

  it("заказ с ИНН идёт к клиенту с этим ИНН, а среди филиалов — к тому, у кого совпал КПП", async () => {
    await testDb.customer.create({
      data: { type: "COMPANY", name: "Ромашка, головной", inn: "7700000009", kpp: "770101001" },
    });
    const branch = await testDb.customer.create({
      data: { type: "COMPANY", name: "Ромашка, филиал", inn: "7700000009", kpp: "770001001" },
    });

    await ingestSiteEmail(companyEmail());

    const order = await testDb.order.findFirstOrThrow();
    expect(order.customerId).toBe(branch.id);
    expect(await testDb.customer.count()).toBe(2);
  });

  it("заказ, уже пришедший через API, второй раз из письма не заводится", async () => {
    const viaApi = await ingestSiteOrder({
      externalId: "2820",
      customer: { name: "Иван" },
      items: [{ sku: "P06", name: "Полки", priceKopecks: 2_700_000, quantity: 1 }],
    });
    expect(viaApi.status).toBe(201);

    const viaEmail = await ingestSiteEmail(companyEmail());
    expect(viaEmail).toMatchObject({ status: 200, duplicate: true });
    expect(await testDb.order.count()).toBe(1);
  });
});
