import { Readable } from "node:stream";
import { beforeEach, expect, it, vi } from "vitest";
import type { MailFolder } from "@/domain/email/folders";
import { db } from "@/server/db";
import { readHistoryImport, startHistoryImport } from "@/server/emails/history-import";
import { describeDb, resetDb } from "@/test/db";

/**
 * Фальшивый IMAP: папка → письма. Каждое письмо — конверт, структура, заголовки
 * цепочки и текст части «1». Ровно то, что импорт спрашивает у сервера.
 */
type FakeMessage = {
  uid: number;
  from: string;
  to: string;
  subject: string;
  date: string;
  messageId: string;
  references?: string;
  text: string;
  attachment?: string;
};

const mailbox: Record<string, FakeMessage[]> = {};

const FOLDERS: MailFolder[] = [
  { path: "INBOX", name: "INBOX", delimiter: "/", specialUse: "\\Inbox", messages: 3, unseen: 0, selectable: true },
  { path: "Sent", name: "Sent", delimiter: "/", specialUse: "\\Sent", messages: 1, unseen: 0, selectable: true },
  { path: "Spam", name: "Spam", delimiter: "/", specialUse: "\\Junk", messages: 1, unseen: 0, selectable: true },
];

function fakeClient() {
  let opened = "INBOX";
  return {
    connect: async () => {},
    logout: async () => {},
    close: () => {},
    getMailboxLock: async (path: string) => {
      opened = path;
      return { release: () => {} };
    },
    search: async ({ since }: { since: Date }) =>
      (mailbox[opened] ?? []).filter((m) => new Date(m.date) >= since).map((m) => m.uid),
    async *fetch(range: string) {
      const uids = range.split(",").map(Number);
      for (const m of (mailbox[opened] ?? []).filter((item) => uids.includes(item.uid))) {
        yield {
          uid: m.uid,
          envelope: {
            from: [{ name: "Клиент", address: m.from }],
            to: [{ address: m.to }],
            subject: m.subject,
            date: new Date(m.date),
            messageId: `<${m.messageId}>`,
          },
          bodyStructure: m.attachment
            ? {
                type: "multipart/mixed",
                childNodes: [
                  { part: "1", type: "text/plain" },
                  {
                    part: "2",
                    type: "application/pdf",
                    disposition: "attachment",
                    dispositionParameters: { filename: m.attachment },
                    size: 5000,
                  },
                ],
              }
            : { type: "text/plain" },
          headers: Buffer.from(m.references ? `References: ${m.references}\r\n` : ""),
        };
      }
    },
    download: async (uid: string) => {
      const m = (mailbox[opened] ?? []).find((item) => item.uid === Number(uid));
      return { meta: {}, content: Readable.from([Buffer.from(m?.text ?? "")]) };
    },
  };
}

vi.mock("@/server/integrations/mailbox", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/integrations/mailbox")>()),
  resolveMailbox: async () => ({
    host: "imap.test",
    port: 993,
    user: "info@bus-com.ru",
    password: "x",
    source: "settings",
  }),
  listMailboxFolders: async () => FOLDERS,
  createClient: () => fakeClient(),
}));

vi.mock("@/server/mail", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/mail")>()),
  senderAddress: async () => "Баском <info@bus-com.ru>",
}));

async function waitForImport() {
  for (let i = 0; i < 100; i++) {
    const state = await readHistoryImport();
    if (state && state.status !== "running") return state;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("импорт не закончился");
}

describeDb("импорт истории переписки (живая БД, IMAP подменён)", () => {
  let customerId: string;
  let siteOrder: { id: string; number: number };

  beforeEach(async () => {
    await resetDb();
    const customer = await db.customer.create({ data: { name: "Клиент", email: "Client@Mail.ru" } });
    customerId = customer.id;
    siteOrder = await db.order.create({
      data: {
        customerId,
        source: "LEGACY",
        externalId: "3239",
        siteNumber: "2780",
        createdAt: new Date("2025-08-09T10:00:00Z"),
      },
      select: { id: true, number: true },
    });
    const recent = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const old = new Date(Date.now() - 4 * 365 * 24 * 3600 * 1000).toISOString();
    mailbox.INBOX = [
      // Вопрос по заказу с номером сайта в теме
      {
        uid: 1,
        from: "client@mail.ru",
        to: "info@bus-com.ru",
        subject: "Заказ 2780",
        date: "2025-08-10T10:00:00Z",
        messageId: "q1@mail.ru",
        text: "Когда?",
        attachment: "платёжка.pdf",
      },
      // Ответ клиента на наше письмо без номера в теме — найдёт заказ по цепочке
      {
        uid: 2,
        from: "client@mail.ru",
        to: "info@bus-com.ru",
        subject: "Re: вопрос",
        date: recent,
        messageId: "q2@mail.ru",
        references: "<s1@bus-com.ru>",
        text: "Спасибо\n\n> старое",
      },
      // Рассылка — не клиент
      {
        uid: 3,
        from: "news@shop.ru",
        to: "info@bus-com.ru",
        subject: "Скидки",
        date: recent,
        messageId: "n1@shop.ru",
        text: "...",
      },
      // Старше трёх лет — вне периода
      {
        uid: 4,
        from: "client@mail.ru",
        to: "info@bus-com.ru",
        subject: "Старое",
        date: old,
        messageId: "old@mail.ru",
        text: "...",
      },
    ];
    mailbox.Sent = [
      {
        uid: 1,
        from: "info@bus-com.ru",
        to: "client@mail.ru",
        subject: "Ответ по заказу 2780",
        date: "2025-08-11T10:00:00Z",
        messageId: "s1@bus-com.ru",
        references: "<q1@mail.ru>",
        text: "Отправили",
      },
    ];
    mailbox.Spam = [
      {
        uid: 1,
        from: "client@mail.ru",
        to: "info@bus-com.ru",
        subject: "спам",
        date: recent,
        messageId: "spam@x",
        text: "...",
      },
    ];
  });

  it("переносит письма с клиентами за 3 года, находит клиента и не дублирует при повторе", async () => {
    await startHistoryImport(null);
    const state = await waitForImport();
    expect(state).toMatchObject({ status: "done", imported: 3, skipped: 1, duplicates: 0 });
    expect(state.folders.map((f) => f.path)).toEqual(["INBOX", "Sent"]);

    const emails = await db.email.findMany({ orderBy: { sentAt: "asc" }, include: { attachments: true } });
    // Письма к заказам не привязываются — только к клиенту
    expect(emails.map((e) => [e.messageId, e.direction, e.orderId, e.customerId === customerId])).toEqual([
      ["q1@mail.ru", "INBOUND", null, true],
      ["s1@bus-com.ru", "OUTBOUND", null, true],
      ["q2@mail.ru", "INBOUND", null, true],
    ]);
    expect(emails.every((e) => e.importedAt !== null && e.readAt !== null)).toBe(true);
    expect(emails[0].attachments.map((a) => [a.fileName, a.data])).toEqual([["платёжка.pdf", null]]);
    expect(emails[2].body).toBe("Спасибо\n\n> старое");
    // История не пишет событий в журнал заказа
    expect(await db.orderEvent.count({ where: { orderId: siteOrder.id } })).toBe(0);

    await startHistoryImport(null);
    const again = await waitForImport();
    expect(again).toMatchObject({ imported: 0, duplicates: 3 });
    expect(await db.email.count()).toBe(3);
  });

  it("можно выбрать только часть папок", async () => {
    await startHistoryImport(["Sent"]);
    const state = await waitForImport();
    expect(state).toMatchObject({ imported: 1 });
    expect(state.folders.map((f) => f.path)).toEqual(["Sent"]);
  });
});
