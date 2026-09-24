import { beforeEach, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import {
  ingestClientEmail,
  linkEmailToCustomer,
  listCustomerEmails,
  listMailbox,
  mailboxCounts,
  olderCustomerEmails,
  recentCustomerEmails,
  searchCustomersForEmail,
  sendOrderEmail,
  sentTemplates,
  storeMailboxLetter,
  type IncomingEmail,
} from "@/server/emails/service";
import { createOrder } from "@/server/orders/create";
import { describeDb, resetDb } from "@/test/db";
import { makeUser } from "@/test/fixtures";
import type { ClientLetter } from "@/server/mail";
import type { SessionUser } from "@/server/session";

const sent: ClientLetter[] = [];
let smtpFails = false;

vi.mock("@/server/mail", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/mail")>()),
  senderAddress: async () => "BusCom <info@bus-com.ru>",
  sendClientLetter: async (letter: ClientLetter) => {
    if (smtpFails) throw new Error("SMTP недоступен");
    sent.push(letter);
  },
}));

function incoming(overrides: Partial<IncomingEmail> = {}): IncomingEmail {
  return {
    messageId: `in-${Math.random()}@mail.ru`,
    references: [],
    fromEmail: "client@mail.ru",
    fromName: "Клиент",
    toEmails: ["info@bus-com.ru"],
    subject: "Вопрос",
    body: "Здравствуйте",
    date: new Date("2026-09-24T10:00:00Z"),
    attachments: [],
    ...overrides,
  };
}

describeDb("переписка с клиентом (живая БД)", () => {
  let manager: SessionUser;
  let order: { id: string; number: number; customerId: string };

  beforeEach(async () => {
    await resetDb();
    sent.length = 0;
    smtpFails = false;
    manager = await makeUser("MANAGER");
    order = await createOrder({
      source: "PHONE",
      customer: { name: "Клиент", phone: "8 916 123-45-67", email: "client@mail.ru" },
      items: [{ sku: "A-1", name: "Сиденье", priceKopecks: 100_000, quantity: 1 }],
      user: manager,
    });
  });

  it("отправленное письмо ложится в переписку с событием заказа и шаблоном", async () => {
    await sendOrderEmail({
      orderId: order.id,
      to: ["client@mail.ru"],
      subject: "Ваш заказ оплачен",
      body: "Спасибо",
      template: "paid",
      attachInvoice: false,
      user: manager,
    });

    expect(sent).toHaveLength(1);
    expect(sent[0].messageId).toMatch(/@bus-com\.ru$/);
    const email = await db.email.findFirstOrThrow({ where: { orderId: order.id } });
    expect(email).toMatchObject({
      direction: "OUTBOUND",
      fromEmail: "info@bus-com.ru",
      template: "paid",
      userId: manager.id,
    });
    expect(email.readAt).not.toBeNull();
    expect(await db.orderEvent.count({ where: { orderId: order.id, type: "EMAIL_SENT" } })).toBe(1);
    expect(await sentTemplates(order.id)).toEqual(["paid"]);
  });

  it("не ушло по SMTP — в переписке письма нет", async () => {
    smtpFails = true;
    await expect(
      sendOrderEmail({
        orderId: order.id,
        to: ["client@mail.ru"],
        subject: "Т",
        body: "Т",
        attachInvoice: false,
        user: manager,
      }),
    ).rejects.toThrow("SMTP недоступен");
    expect(await db.email.count()).toBe(0);
  });

  it("счёт без реквизитов продавца не прикладывается — понятная ошибка", async () => {
    await expect(
      sendOrderEmail({
        orderId: order.id,
        to: ["client@mail.ru"],
        subject: "Счёт",
        body: "Т",
        attachInvoice: true,
        user: manager,
      }),
    ).rejects.toThrow("реквизиты продавца");
    expect(sent).toHaveLength(0);
  });

  it("ответ клиента находит клиента по цепочке, наше следующее письмо продолжает её; журнал заказа не трогается", async () => {
    await sendOrderEmail({
      orderId: order.id,
      to: ["client@mail.ru"],
      subject: "Т",
      body: "Т",
      attachInvoice: false,
      user: manager,
    });
    const ours = sent[0].messageId;

    // Ответ с другого адреса — клиента находит только цепочка
    const reply = await ingestClientEmail(
      incoming({ fromEmail: "boss@other.ru", references: [ours], subject: "Re: Т" }),
    );
    expect(reply).toMatchObject({ status: "stored", customerLinked: true, matchedBy: "thread" });
    expect(await db.orderEvent.count({ where: { orderId: order.id, type: "EMAIL_RECEIVED" } })).toBe(0);
    const replyRow = await db.email.findFirstOrThrow({ where: { direction: "INBOUND" } });
    expect(replyRow).toMatchObject({ customerId: order.customerId, orderId: null });

    await sendOrderEmail({
      orderId: order.id,
      to: ["client@mail.ru"],
      subject: "Re: Т",
      body: "Ответ",
      attachInvoice: false,
      user: manager,
    });
    expect(sent[1].inReplyTo).toBe(replyRow.messageId);
    expect(sent[1].references).toContain(ours);
  });

  it("клиент по номеру заказа в теме или по адресу; незнакомый адрес — во «Без клиента»; повтор не дублируется", async () => {
    const other = await db.customer.create({ data: { name: "Другой" } });
    const otherOrder = await db.order.create({
      data: { customerId: other.id, source: "PHONE" },
      select: { number: true },
    });
    const bySubject = await ingestClientEmail(
      incoming({ fromEmail: "unknown@x.ru", subject: `Вопрос по заказу №${otherOrder.number}` }),
    );
    expect(bySubject).toMatchObject({ customerLinked: true, matchedBy: "subject" });
    expect((await db.email.findFirstOrThrow({ where: { fromEmail: "unknown@x.ru" } })).customerId).toBe(other.id);

    const byAddress = await ingestClientEmail(incoming({ messageId: "same@mail.ru" }));
    expect(byAddress).toMatchObject({ customerLinked: true, matchedBy: "address" });
    expect(await ingestClientEmail(incoming({ messageId: "same@mail.ru" }))).toEqual({ status: "duplicate" });

    const stranger = await ingestClientEmail(incoming({ fromEmail: "stranger@x.ru", subject: "Вопрос" }));
    expect(stranger).toMatchObject({ customerLinked: false, matchedBy: null });
    const unlinked = await listMailbox("unlinked", 1);
    expect(unlinked.items.map((item) => item.fromEmail)).toEqual(["stranger@x.ru"]);
    expect(await mailboxCounts()).toEqual({ unread: 3, unlinked: 1 });
  });

  it("номер в теме — номер на сайте, самый свежий заказ в пределах года до письма", async () => {
    const siteCustomer = await db.customer.create({ data: { name: "С сайта" } });
    const oldCustomer = await db.customer.create({ data: { name: "Старый" } });
    const make = (customerId: string, source: "SITE" | "LEGACY", externalId: string, siteNumber: string, at: string) =>
      db.order.create({ data: { customerId, source, externalId, siteNumber, createdAt: new Date(at) } });
    await make(siteCustomer.id, "SITE", "2828", "2828", "2026-09-20T10:00:00Z");
    // Тот же номер у архивного заказа трёхлетней давности — не он
    await make(oldCustomer.id, "LEGACY", "1001", "2828", "2023-05-01T10:00:00Z");

    await ingestClientEmail(
      incoming({ fromEmail: "a@x.ru", subject: "Re: Басском - Заказ 2828", date: new Date("2026-09-24T10:00:00Z") }),
    );
    expect((await db.email.findFirstOrThrow({ where: { fromEmail: "a@x.ru" } })).customerId).toBe(siteCustomer.id);
  });

  it("в заказе — последние 10 писем клиента, в том числе по его адресу без привязки", async () => {
    // Письмо с адреса клиента, пришедшее, когда клиента ещё не знали
    await db.email.create({
      data: {
        direction: "INBOUND",
        fromEmail: "client@mail.ru",
        toEmails: ["info@bus-com.ru"],
        subject: "Давнее",
        body: "…",
        sentAt: new Date("2026-01-01T10:00:00Z"),
      },
    });
    for (let i = 0; i < 11; i++) {
      await ingestClientEmail(incoming({ subject: `Письмо ${i}`, date: new Date(Date.UTC(2026, 8, 1 + i)) }));
    }
    const customer = { id: order.customerId, email: "Client@Mail.ru" };
    const recent = await recentCustomerEmails(customer);
    expect(recent.total).toBe(12);
    expect(recent.items.map((item) => item.subject)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => `Письмо ${i}`));
    expect((await listCustomerEmails(customer)).items.at(-1)?.subject).toBe("Давнее");

    // Подгрузка старых при прокрутке: остальные два письма, без повторов, больше нет
    const first = recent.items[0];
    const older = await olderCustomerEmails(order.customerId, { sentAt: first.sentAt, id: first.id });
    expect(older.items.map((item) => item.subject)).toEqual(["Давнее", "Письмо 0"]);
    expect(older.hasMore).toBe(false);
  });

  it("письмо из ящика добавляется в переписку клиента с вложениями, без события заказа", async () => {
    const result = await storeMailboxLetter({
      direction: "OUTBOUND",
      messageId: "sent-from-yandex@bus-com.ru",
      references: [],
      fromEmail: "info@bus-com.ru",
      fromName: null,
      toEmails: ["client@mail.ru"],
      subject: "Счёт",
      body: "Во вложении",
      date: new Date("2026-09-01T10:00:00Z"),
      attachments: [{ fileName: "счёт.pdf", contentType: "application/pdf", content: Buffer.from("pdf") }],
    });
    expect(result).toEqual({ customerLinked: true });
    const email = await db.email.findUniqueOrThrow({
      where: { messageId: "sent-from-yandex@bus-com.ru" },
      include: { attachments: true },
    });
    expect(email).toMatchObject({ direction: "OUTBOUND", orderId: null, customerId: order.customerId });
    expect(email.attachments.map((a) => [a.fileName, a.data !== null])).toEqual([["счёт.pdf", true]]);
    expect(await db.orderEvent.count({ where: { type: { in: ["EMAIL_SENT", "EMAIL_RECEIVED"] } } })).toBe(0);
  });

  it("большое вложение не хранится, но отмечается", async () => {
    await ingestClientEmail(
      incoming({
        attachments: [
          { fileName: "платёжка.pdf", contentType: "application/pdf", content: Buffer.from("pdf") },
          { fileName: "видео.mp4", contentType: "video/mp4", content: Buffer.alloc(15 * 1024 * 1024 + 1) },
        ],
      }),
    );
    const files = await db.emailAttachment.findMany({ orderBy: { fileName: "asc" } });
    expect(files.map((file) => [file.fileName, file.data === null, file.skippedReason !== null])).toEqual([
      ["видео.mp4", true, true],
      ["платёжка.pdf", false, false],
    ]);
  });

  it("ручная привязка к клиенту и поиск клиента", async () => {
    const result = await ingestClientEmail(incoming({ fromEmail: "stranger@mail.ru" }));
    if (result.status !== "stored") throw new Error("письмо не сохранилось");
    const found = await searchCustomersForEmail("Клиент");
    expect(found.map((row) => row.id)).toContain(order.customerId);
    await linkEmailToCustomer(result.emailId, order.customerId);
    expect((await db.email.findUniqueOrThrow({ where: { id: result.emailId } })).customerId).toBe(order.customerId);
    expect(await db.orderEvent.count({ where: { type: "EMAIL_RECEIVED" } })).toBe(0);
  });
});
