import "server-only";
import { randomUUID } from "node:crypto";
import {
  MAX_ATTACHMENT_BYTES,
  normalizeEmailAddress,
  normalizeMessageId,
  orderNumberFromSubject,
} from "@/domain/email/letters";
import { EMAIL_TEMPLATE_KEYS, type EmailTemplateKey } from "@/domain/email/templates";
import { requisitesReady } from "@/domain/settings";
import type { Prisma } from "@/generated/prisma/client";
import { buildInvoice } from "@/server/documents/invoice";
import { renderPdf } from "@/server/documents/pdf";
import { db } from "@/server/db";
import { sendClientLetter, senderAddress } from "@/server/mail";
import { findOrderByNumber } from "@/server/orders/details";
import { OrderConflictError, OrderNotFoundError, writeOrderEvent } from "@/server/orders/internal";
import { readSettings } from "@/server/settings/service";
import type { SessionUser } from "@/server/session";

/**
 * Переписка с клиентом по почте (PRD, M6.2).
 *
 * Исходящее уходит через SMTP и только после успешной отправки ложится в базу
 * вместе с событием заказа — одной транзакцией. Обратный порядок оставлял бы в
 * переписке письма, которые клиент не получил.
 *
 * Входящее приходит из общего ящика (`src/server/integrations/mailbox.ts`) и
 * привязывается к заказу: по цепочке писем (ответ на наше письмо), по номеру
 * заказа в теме, иначе остаётся без заказа — его привязывают руками в «Почте».
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export class EmailNotFoundError extends Error {
  constructor() {
    super("Письмо не найдено");
    this.name = "EmailNotFoundError";
  }
}

/** Домен для наших Message-ID — из адреса отправителя, чтобы письма не выглядели чужими. */
function messageIdDomain(from: string | null): string {
  return normalizeEmailAddress(from)?.split("@")[1] ?? "erp.bus-com.ru";
}

export type SendOrderEmailInput = {
  orderId: string;
  to: string[];
  subject: string;
  body: string;
  template?: EmailTemplateKey | null;
  attachInvoice: boolean;
  user: SessionUser;
};

export async function sendOrderEmail(input: SendOrderEmailInput): Promise<{ id: string }> {
  const order = await db.order.findFirst({
    where: { id: input.orderId, deletedAt: null },
    select: { id: true, number: true, customerId: true },
  });
  if (!order) throw new OrderNotFoundError();
  if (input.to.length === 0) throw new OrderConflictError("Укажите адрес клиента");

  const attachments: { fileName: string; contentType: string; content: Buffer }[] = [];
  if (input.attachInvoice) {
    const [details, settings] = await Promise.all([findOrderByNumber(order.number), readSettings()]);
    if (!details) throw new OrderNotFoundError();
    if (!requisitesReady(settings.sellerRequisites)) {
      throw new OrderConflictError("Счёт не приложить: в справочниках не заполнены реквизиты продавца");
    }
    attachments.push({
      fileName: `schet-${order.number}.pdf`,
      contentType: "application/pdf",
      content: await renderPdf(buildInvoice(details, settings.sellerRequisites)),
    });
  }

  // Ответ продолжает цепочку последнего письма по заказу: у клиента письма
  // собираются в один разговор, а его ответ мы узнаем по References.
  // Последнее — по времени попадания в ERP, а не по заголовку Date: часы у
  // почтового сервера клиента бывают сбиты.
  const previous = await db.email.findFirst({
    where: { orderId: order.id, messageId: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { messageId: true, references: true },
  });
  const references = previous?.messageId ? [...previous.references, previous.messageId].slice(-20) : [];

  const from = await senderAddress();
  const messageId = `${randomUUID()}@${messageIdDomain(from)}`;
  await sendClientLetter({
    to: input.to,
    subject: input.subject,
    text: input.body,
    messageId,
    inReplyTo: previous?.messageId ?? null,
    references,
    attachments,
  });

  const sentAt = new Date();
  return db.$transaction(async (tx) => {
    const email = await tx.email.create({
      data: {
        direction: "OUTBOUND",
        orderId: order.id,
        customerId: order.customerId,
        messageId,
        references,
        fromEmail: normalizeEmailAddress(from) ?? "",
        toEmails: input.to,
        subject: input.subject,
        body: input.body,
        template: input.template ?? null,
        userId: input.user.id,
        readAt: sentAt,
        sentAt,
        attachments: {
          create: attachments.map((file) => ({
            fileName: file.fileName,
            contentType: file.contentType,
            byteSize: file.content.length,
            data: new Uint8Array(file.content),
          })),
        },
      },
      select: { id: true },
    });
    await writeOrderEvent(tx, {
      orderId: order.id,
      user: input.user,
      type: "EMAIL_SENT",
      comment: `${input.to.join(", ")}: ${input.subject}`,
      payload: { emailId: email.id, template: input.template ?? null, attachments: attachments.map((f) => f.fileName) },
    });
    return email;
  });
}

export type IncomingEmail = {
  messageId: string | null;
  references: string[];
  fromEmail: string;
  fromName: string | null;
  toEmails: string[];
  subject: string;
  body: string;
  date: Date | null;
  attachments: { fileName: string; contentType: string; content: Buffer }[];
};

export type IncomingResult =
  | { status: "duplicate" }
  | { status: "stored"; emailId: string; orderNumber: number | null; matchedBy: "thread" | "subject" | null };

/** Привязка входящего: заказ и клиент. Порядок — от надёжного к догадке. */
type MatchInput = {
  references: string[];
  subject: string;
  date: Date | null;
  /** С кем письмо: отправитель входящего или получатели нашего */
  counterparts: string[];
};

async function matchIncoming(email: MatchInput) {
  if (email.references.length > 0) {
    const parent = await db.email.findFirst({
      where: { messageId: { in: email.references }, OR: [{ orderId: { not: null } }, { customerId: { not: null } }] },
      orderBy: { sentAt: "desc" },
      select: { orderId: true, customerId: true, order: { select: { number: true, deletedAt: true } } },
    });
    if (parent?.order && !parent.order.deletedAt) {
      return {
        orderId: parent.orderId,
        orderNumber: parent.order.number,
        customerId: parent.customerId,
        by: "thread" as const,
      };
    }
    if (parent?.customerId)
      return { orderId: null, orderNumber: null, customerId: parent.customerId, by: "thread" as const };
  }

  // Номер в теме — тот, что знает клиент: номер на сайте (`siteNumber` — у заказов
  // с сайта и у архивных). Клиент отвечает на письмо OpenCart «… - Заказ 2828».
  // Номера в архиве повторяются («10» — у девяти заказов разных лет), поэтому
  // берём самый свежий заказ, созданный за год до письма и не позже дня после.
  // У заказа, заведённого руками, номера сайта нет — клиенту сообщают номер в ERP.
  const number = orderNumberFromSubject(email.subject);
  if (number !== null) {
    const select = { id: true, number: true, customerId: true } as const;
    const at = (email.date ?? new Date()).getTime();
    const order =
      (await db.order.findFirst({
        where: {
          siteNumber: String(number),
          deletedAt: null,
          createdAt: { gte: new Date(at - 365 * DAY_MS), lte: new Date(at + DAY_MS) },
        },
        orderBy: { createdAt: "desc" },
        select,
      })) ??
      (await db.order.findFirst({
        where: { number, source: { notIn: ["SITE", "LEGACY"] }, deletedAt: null },
        select,
      }));
    if (order)
      return { orderId: order.id, orderNumber: order.number, customerId: order.customerId, by: "subject" as const };
  }

  // Заказа не нашли — хотя бы клиент по адресу. Если адрес у нескольких клиентов,
  // не угадываем: пусть человек выберет заказ сам.
  const customers =
    email.counterparts.length === 0
      ? []
      : await db.customer.findMany({
          where: {
            OR: email.counterparts.map((address) => ({ email: { equals: address, mode: "insensitive" as const } })),
          },
          select: { id: true },
          take: 2,
        });
  return { orderId: null, orderNumber: null, customerId: customers.length === 1 ? customers[0].id : null, by: null };
}

export async function ingestClientEmail(email: IncomingEmail): Promise<IncomingResult> {
  const messageId = normalizeMessageId(email.messageId);
  if (messageId && (await db.email.findUnique({ where: { messageId }, select: { id: true } }))) {
    return { status: "duplicate" };
  }

  const match = await matchIncoming({ ...email, counterparts: [email.fromEmail] });
  const attachments: Prisma.EmailAttachmentCreateWithoutEmailInput[] = email.attachments.map((file) =>
    file.content.length > MAX_ATTACHMENT_BYTES
      ? {
          fileName: file.fileName,
          contentType: file.contentType,
          byteSize: file.content.length,
          skippedReason: "Файл больше 15 МБ — не сохранён, он есть в ящике",
        }
      : {
          fileName: file.fileName,
          contentType: file.contentType,
          byteSize: file.content.length,
          data: new Uint8Array(file.content),
        },
  );

  return db.$transaction(async (tx) => {
    const stored = await tx.email.create({
      data: {
        direction: "INBOUND",
        orderId: match.orderId,
        customerId: match.customerId,
        messageId,
        references: email.references,
        fromEmail: email.fromEmail,
        fromName: email.fromName,
        toEmails: email.toEmails,
        subject: email.subject,
        body: email.body,
        sentAt: email.date ?? new Date(),
        attachments: { create: attachments },
      },
      select: { id: true },
    });
    if (match.orderId) {
      await writeOrderEvent(tx, {
        orderId: match.orderId,
        user: null,
        type: "EMAIL_RECEIVED",
        comment: `${email.fromEmail}: ${email.subject}`,
        payload: { emailId: stored.id, matchedBy: match.by },
      });
    }
    return { status: "stored" as const, emailId: stored.id, orderNumber: match.orderNumber, matchedBy: match.by };
  });
}

/** Ручная привязка входящего к заказу из «Почты». Можно и перепривязать ошибочно привязанное. */
/**
 * `allowOutbound` — для писем из «Отправленных» ящика: они наши, но пришли не из
 * ERP (история или привязка из живого ящика) и заказа могут не иметь. Письма,
 * отправленные из карточки заказа, так не перепривязываются.
 */
export async function linkEmailToOrder(
  emailId: string,
  orderNumber: number,
  user: SessionUser,
  options: { allowOutbound?: boolean } = {},
): Promise<void> {
  await db.$transaction(async (tx) => {
    const email = await tx.email.findUnique({
      where: { id: emailId },
      select: { id: true, direction: true, orderId: true, fromEmail: true, subject: true },
    });
    if (!email) throw new EmailNotFoundError();
    if (email.direction !== "INBOUND" && !options.allowOutbound)
      throw new OrderConflictError("Отправленное письмо уже привязано к своему заказу");
    const order = await tx.order.findFirst({
      where: { number: orderNumber, deletedAt: null },
      select: { id: true, customerId: true },
    });
    if (!order) throw new OrderNotFoundError();
    if (order.id === email.orderId) return;

    await tx.email.update({ where: { id: email.id }, data: { orderId: order.id, customerId: order.customerId } });
    await writeOrderEvent(tx, {
      orderId: order.id,
      user,
      type: email.direction === "OUTBOUND" ? "EMAIL_SENT" : "EMAIL_RECEIVED",
      comment: `Привязано вручную — ${email.fromEmail}: ${email.subject}`,
      payload: { emailId: email.id, matchedBy: "manual" },
    });
  });
}

export async function markEmailsRead(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.email.updateMany({ where: { id: { in: ids }, readAt: null }, data: { readAt: new Date() } });
}

export async function unreadEmailCount(): Promise<number> {
  return db.email.count({ where: { direction: "INBOUND", readAt: null } });
}

const listSelect = {
  id: true,
  direction: true,
  fromEmail: true,
  fromName: true,
  toEmails: true,
  subject: true,
  body: true,
  template: true,
  readAt: true,
  sentAt: true,
  user: { select: { name: true } },
  order: { select: { number: true } },
  customer: { select: { id: true, name: true } },
  attachments: { select: { id: true, fileName: true, byteSize: true, skippedReason: true } },
} satisfies Prisma.EmailSelect;

export type EmailListItem = Prisma.EmailGetPayload<{ select: typeof listSelect }>;

/** Переписка по заказу — по времени, старые сверху, как читается разговор. */
export async function listOrderEmails(orderId: string): Promise<EmailListItem[]> {
  return db.email.findMany({ where: { orderId }, orderBy: { sentAt: "asc" }, select: listSelect });
}

/** Какими шаблонами по заказу уже писали — для подсказок «Сообщить клиенту?». */
export async function sentTemplates(orderId: string): Promise<EmailTemplateKey[]> {
  const rows = await db.email.findMany({
    where: { orderId, direction: "OUTBOUND", template: { not: null } },
    select: { template: true },
    distinct: ["template"],
  });
  return rows
    .map((row) => row.template)
    .filter((key): key is EmailTemplateKey => EMAIL_TEMPLATE_KEYS.includes(key as EmailTemplateKey));
}

export const MAILBOX_VIEWS = ["inbox", "unlinked", "sent"] as const;
export type MailboxView = (typeof MAILBOX_VIEWS)[number];

export const MAILBOX_PAGE_SIZE = 50;

export async function listMailbox(view: MailboxView, page: number) {
  const where: Prisma.EmailWhereInput =
    view === "sent"
      ? { direction: "OUTBOUND" }
      : view === "unlinked"
        ? { direction: "INBOUND", orderId: null, importedAt: null }
        : { direction: "INBOUND" };
  const [items, total, counts] = await Promise.all([
    db.email.findMany({
      where,
      // Непрочитанные — сверху: раздел нужен, чтобы ни один ответ не потерялся
      orderBy:
        view === "sent" ? [{ sentAt: "desc" }] : [{ readAt: { sort: "desc", nulls: "first" } }, { sentAt: "desc" }],
      skip: (page - 1) * MAILBOX_PAGE_SIZE,
      take: MAILBOX_PAGE_SIZE,
      select: listSelect,
    }),
    db.email.count({ where }),
    Promise.all([
      db.email.count({ where: { direction: "INBOUND", readAt: null } }),
      db.email.count({ where: { direction: "INBOUND", orderId: null, importedAt: null } }),
    ]),
  ]);
  return { items, total, unread: counts[0], unlinked: counts[1] };
}

export async function getEmail(id: string) {
  return db.email.findUnique({ where: { id }, select: { ...listSelect, references: true, messageId: true } });
}

export async function readEmailAttachment(id: string) {
  return db.emailAttachment.findUnique({
    where: { id },
    select: { fileName: true, contentType: true, data: true },
  });
}

/** Последние заказы клиента — быстрый выбор при ручной привязке письма. */
export async function recentCustomerOrders(customerId: string) {
  return db.order.findMany({
    where: { customerId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: 6,
    select: { number: true, status: true, totalKopecks: true, createdAt: true },
  });
}

export type HistoryLetter = {
  direction: "INBOUND" | "OUTBOUND";
  messageId: string | null;
  references: string[];
  fromEmail: string;
  fromName: string | null;
  toEmails: string[];
  subject: string;
  body: string;
  date: Date;
  /** С кем письмо — по ним ищется клиент */
  counterparts: string[];
  /** Вложения только названиями: сами файлы остаются в ящике */
  attachments: { fileName: string; contentType: string; size: number }[];
};

export type HistoryStoreResult = { status: "duplicate" } | { status: "stored"; linkedToOrder: boolean };

/**
 * Письмо из истории ящика. Привязка — та же, что у живых писем, но письмо сразу
 * прочитано, помечено `importedAt` и события в истории заказа не пишет: это не
 * изменение заказа, а перенос архива, и тысяча строк «Письмо от клиента» за три
 * года завалила бы журнал.
 */
export async function storeHistoryEmail(letter: HistoryLetter, importedAt: Date): Promise<HistoryStoreResult> {
  const messageId = normalizeMessageId(letter.messageId);
  if (messageId && (await db.email.findUnique({ where: { messageId }, select: { id: true } }))) {
    return { status: "duplicate" };
  }
  const match = await matchIncoming(letter);
  await db.email.create({
    data: {
      direction: letter.direction,
      orderId: match.orderId,
      customerId: match.customerId,
      messageId,
      references: letter.references,
      fromEmail: letter.fromEmail,
      fromName: letter.fromName,
      toEmails: letter.toEmails,
      subject: letter.subject,
      body: letter.body,
      readAt: importedAt,
      importedAt,
      sentAt: letter.date,
      attachments: {
        create: letter.attachments.map((file) => ({
          fileName: file.fileName,
          contentType: file.contentType,
          byteSize: file.size,
          skippedReason: "Перенесено из истории ящика без файла — он есть в почте",
        })),
      },
    },
  });
  return { status: "stored", linkedToOrder: match.orderId !== null };
}

/**
 * Достраивает цепочки в перенесённой истории: письмо без заказа получает заказ
 * другого письма той же переписки — и ответ от исходного, и исходное от ответа
 * (номер заказа часто есть только в теме одного из них). Повторяет, пока что-то
 * меняется, но не больше пяти раз: цепочки длиннее встречаются редко.
 */
export async function relinkHistoryThreads(): Promise<number> {
  let total = 0;
  for (let round = 0; round < 5; round++) {
    const linked = await db.email.findMany({
      where: { importedAt: { not: null }, orderId: { not: null } },
      select: { orderId: true, customerId: true, messageId: true, references: true },
    });
    const orderByMessage = new Map<string, { orderId: string; customerId: string | null }>();
    for (const email of linked) {
      const target = { orderId: email.orderId as string, customerId: email.customerId };
      for (const id of [email.messageId, ...email.references]) if (id) orderByMessage.set(id, target);
    }

    const loose = await db.email.findMany({
      where: { importedAt: { not: null }, orderId: null },
      select: { id: true, customerId: true, messageId: true, references: true },
    });
    let changed = 0;
    for (const email of loose) {
      const target = [email.messageId, ...email.references]
        .filter((id): id is string => id !== null)
        .map((id) => orderByMessage.get(id))
        .find((item) => item !== undefined);
      if (!target) continue;
      await db.email.update({
        where: { id: email.id },
        data: { orderId: target.orderId, customerId: email.customerId ?? target.customerId },
      });
      changed++;
    }
    total += changed;
    if (changed === 0) break;
  }
  return total;
}

/** Переписка клиента — все письма, свежие сверху; у старых клиентов их может быть много. */
export const CUSTOMER_EMAILS_LIMIT = 200;

export async function listCustomerEmails(customerId: string): Promise<{ items: EmailListItem[]; total: number }> {
  const [items, total] = await Promise.all([
    db.email.findMany({
      where: { customerId },
      orderBy: { sentAt: "desc" },
      take: CUSTOMER_EMAILS_LIMIT,
      select: listSelect,
    }),
    db.email.count({ where: { customerId } }),
  ]);
  return { items, total };
}

export type MailboxLetterInput = {
  direction: "INBOUND" | "OUTBOUND";
  messageId: string | null;
  references: string[];
  fromEmail: string;
  fromName: string | null;
  toEmails: string[];
  subject: string;
  body: string;
  date: Date;
  attachments: { fileName: string; contentType: string; content: Buffer }[];
};

/**
 * Письмо из живого ящика, которое человек сам привязал к заказу: целиком, с
 * вложениями до 15 МБ, прочитанное, с записью в журнал заказа.
 */
export async function storeMailboxLetter(
  letter: MailboxLetterInput,
  orderNumber: number,
  user: SessionUser,
): Promise<void> {
  await db.$transaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: { number: orderNumber, deletedAt: null },
      select: { id: true, customerId: true },
    });
    if (!order) throw new OrderNotFoundError();
    const email = await tx.email.create({
      data: {
        direction: letter.direction,
        orderId: order.id,
        customerId: order.customerId,
        messageId: letter.messageId,
        references: letter.references,
        fromEmail: letter.fromEmail,
        fromName: letter.fromName,
        toEmails: letter.toEmails,
        subject: letter.subject,
        body: letter.body,
        readAt: new Date(),
        sentAt: letter.date,
        attachments: {
          create: letter.attachments.map((file) =>
            file.content.length > MAX_ATTACHMENT_BYTES
              ? {
                  fileName: file.fileName,
                  contentType: file.contentType,
                  byteSize: file.content.length,
                  skippedReason: "Файл больше 15 МБ — не сохранён, он есть в ящике",
                }
              : {
                  fileName: file.fileName,
                  contentType: file.contentType,
                  byteSize: file.content.length,
                  data: new Uint8Array(file.content),
                },
          ),
        },
      },
      select: { id: true },
    });
    await writeOrderEvent(tx, {
      orderId: order.id,
      user,
      type: letter.direction === "OUTBOUND" ? "EMAIL_SENT" : "EMAIL_RECEIVED",
      comment: `Добавлено из ящика вручную — ${letter.fromEmail}: ${letter.subject}`,
      payload: { emailId: email.id, matchedBy: "manual" },
    });
  });
}

/** Счётчики вкладок ERP в «Почте»: непрочитанные входящие и ждущие привязки. */
export async function mailboxCounts(): Promise<{ unread: number; unlinked: number }> {
  const [unread, unlinked] = await Promise.all([
    db.email.count({ where: { direction: "INBOUND", readAt: null } }),
    db.email.count({ where: { direction: "INBOUND", orderId: null, importedAt: null } }),
  ]);
  return { unread, unlinked };
}
