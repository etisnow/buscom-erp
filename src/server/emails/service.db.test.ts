import { beforeEach, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import {
  ingestClientEmail,
  linkEmailToOrder,
  listMailbox,
  sendOrderEmail,
  sentTemplates,
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

  it("ответ клиента находит заказ по цепочке, наше следующее письмо продолжает её", async () => {
    await sendOrderEmail({
      orderId: order.id,
      to: ["client@mail.ru"],
      subject: "Т",
      body: "Т",
      attachInvoice: false,
      user: manager,
    });
    const ours = sent[0].messageId;

    const reply = await ingestClientEmail(incoming({ references: [ours], subject: "Re: Т" }));
    expect(reply).toMatchObject({ status: "stored", orderNumber: order.number, matchedBy: "thread" });
    expect(await db.orderEvent.count({ where: { orderId: order.id, type: "EMAIL_RECEIVED" } })).toBe(1);

    await sendOrderEmail({
      orderId: order.id,
      to: ["client@mail.ru"],
      subject: "Re: Т",
      body: "Ответ",
      attachInvoice: false,
      user: manager,
    });
    const replyRow = await db.email.findFirstOrThrow({ where: { direction: "INBOUND" } });
    expect(sent[1].inReplyTo).toBe(replyRow.messageId);
    expect(sent[1].references).toContain(ours);
  });

  it("по номеру в теме — к заказу; без номера — только клиент по адресу; повтор не дублируется", async () => {
    const bySubject = await ingestClientEmail(incoming({ subject: `Вопрос по заказу №${order.number}` }));
    expect(bySubject).toMatchObject({ orderNumber: order.number, matchedBy: "subject" });

    const message = incoming({ messageId: "same@mail.ru" });
    const loose = await ingestClientEmail(message);
    expect(loose).toMatchObject({ status: "stored", orderNumber: null });
    const looseRow = await db.email.findUniqueOrThrow({ where: { messageId: "same@mail.ru" } });
    expect(looseRow.customerId).toBe(order.customerId);
    expect(await ingestClientEmail(message)).toEqual({ status: "duplicate" });

    const mailbox = await listMailbox("unlinked", 1);
    expect(mailbox.items.map((item) => item.id)).toEqual([looseRow.id]);
    expect(mailbox.unread).toBe(2);
  });

  it("номер в теме — номер на сайте, самый свежий заказ в пределах года до письма", async () => {
    const make = (source: "SITE" | "LEGACY", externalId: string, siteNumber: string, createdAt: string) =>
      db.order.create({
        data: { customerId: order.customerId, source, externalId, siteNumber, createdAt: new Date(createdAt) },
        select: { id: true, number: true },
      });
    const site = await make("SITE", "2828", "2828", "2026-09-20T10:00:00Z");
    // Тот же номер у архивного заказа трёхлетней давности — не он
    await make("LEGACY", "1001", "2828", "2023-05-01T10:00:00Z");
    const legacy = await make("LEGACY", "3239", "2780", "2026-08-09T10:00:00Z");

    const bySite = await ingestClientEmail(
      incoming({ subject: "Re: Басском - Заказ 2828", date: new Date("2026-09-24T10:00:00Z") }),
    );
    expect(bySite).toMatchObject({ orderNumber: site.number, matchedBy: "subject" });

    // Архивный заказ находится по номеру сайта из «Номер там»
    const byLegacySite = await ingestClientEmail(
      incoming({ subject: "Заказ 2780", date: new Date("2026-08-12T10:00:00Z") }),
    );
    expect(byLegacySite).toMatchObject({ orderNumber: legacy.number });

    // Номер архивного заказа в ERP — не номер для клиента
    const byErpNumber = await ingestClientEmail(incoming({ subject: `Заказ №${legacy.number}` }));
    expect(byErpNumber).toMatchObject({ orderNumber: null });
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

  it("ручная привязка к заказу пишет событие", async () => {
    const result = await ingestClientEmail(incoming({ fromEmail: "stranger@mail.ru" }));
    if (result.status !== "stored") throw new Error("письмо не сохранилось");
    await linkEmailToOrder(result.emailId, order.number, manager);

    const email = await db.email.findUniqueOrThrow({ where: { id: result.emailId } });
    expect(email).toMatchObject({ orderId: order.id, customerId: order.customerId });
    const event = await db.orderEvent.findFirstOrThrow({ where: { orderId: order.id, type: "EMAIL_RECEIVED" } });
    expect(event.comment).toContain("Привязано вручную");
  });
});
