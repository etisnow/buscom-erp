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
import { normalizePhone } from "@/domain/customer/phone";
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
    select: { id: true, number: true, customerId: true, customer: { select: { email: true } } },
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

  // Ответ продолжает цепочку последнего письма переписки с клиентом: у клиента письма
  // собираются в один разговор, а его ответ мы узнаем по References.
  // Последнее — по времени попадания в ERP, а не по заголовку Date: часы у
  // почтового сервера клиента бывают сбиты.
  const previous = await db.email.findFirst({
    where: {
      AND: [customerEmailsWhere({ id: order.customerId, email: order.customer.email }), { messageId: { not: null } }],
    },
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
  | { status: "stored"; emailId: string; customerLinked: boolean; matchedBy: "thread" | "subject" | "address" | null };

/**
 * С каким клиентом письмо (решение владельца 2026-09-25: письма к заказам не
 * привязываются, переписка — у клиента). Порядок — от надёжного к догадке:
 * ответ на письмо, чей клиент известен; номер заказа в теме — клиент этого
 * заказа; адрес — если он ровно у одного клиента.
 */
type MatchInput = {
  references: string[];
  subject: string;
  date: Date | null;
  /** С кем письмо: отправитель входящего или получатели нашего */
  counterparts: string[];
};

async function matchCustomer(email: MatchInput): Promise<{ customerId: string | null; by: IncomingMatch }> {
  if (email.references.length > 0) {
    const parent = await db.email.findFirst({
      where: { messageId: { in: email.references }, customerId: { not: null } },
      orderBy: { createdAt: "desc" },
      select: { customerId: true },
    });
    if (parent?.customerId) return { customerId: parent.customerId, by: "thread" };
  }

  // Номер в теме — тот, что знает клиент: номер на сайте (`siteNumber` — у заказов
  // с сайта и у архивных; «… - Заказ 2828» в письме OpenCart). Номера в архиве
  // повторяются, поэтому берём самый свежий заказ за год до письма. У заказа,
  // заведённого руками, номера сайта нет — клиенту сообщают номер в ERP.
  const number = orderNumberFromSubject(email.subject);
  if (number !== null) {
    const at = (email.date ?? new Date()).getTime();
    const order =
      (await db.order.findFirst({
        where: {
          siteNumber: String(number),
          deletedAt: null,
          createdAt: { gte: new Date(at - 365 * DAY_MS), lte: new Date(at + DAY_MS) },
        },
        orderBy: { createdAt: "desc" },
        select: { customerId: true },
      })) ??
      (await db.order.findFirst({
        where: { number, source: { notIn: ["SITE", "LEGACY"] }, deletedAt: null },
        select: { customerId: true },
      }));
    if (order) return { customerId: order.customerId, by: "subject" };
  }

  // Адрес у нескольких клиентов — не угадываем, человек выберет в «Почте»
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
  return customers.length === 1 ? { customerId: customers[0].id, by: "address" } : { customerId: null, by: null };
}

type IncomingMatch = "thread" | "subject" | "address" | null;

function attachmentsToStore(files: { fileName: string; contentType: string; content: Buffer }[]) {
  return files.map((file) =>
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
}

export async function ingestClientEmail(email: IncomingEmail): Promise<IncomingResult> {
  const messageId = normalizeMessageId(email.messageId);
  if (messageId && (await db.email.findUnique({ where: { messageId }, select: { id: true } }))) {
    return { status: "duplicate" };
  }

  const match = await matchCustomer({ ...email, counterparts: [email.fromEmail] });
  const stored = await db.email.create({
    data: {
      direction: "INBOUND",
      customerId: match.customerId,
      messageId,
      references: email.references,
      fromEmail: email.fromEmail,
      fromName: email.fromName,
      toEmails: email.toEmails,
      subject: email.subject,
      body: email.body,
      sentAt: email.date ?? new Date(),
      attachments: { create: attachmentsToStore(email.attachments) },
    },
    select: { id: true },
  });
  return { status: "stored", emailId: stored.id, customerLinked: match.customerId !== null, matchedBy: match.by };
}

/**
 * Ручная привязка письма к клиенту из «Почты» — для писем с незнакомого адреса.
 * Можно и перепривязать ошибочно определённого. Это не изменение заказа — журнал
 * заказа не трогается.
 */
export async function linkEmailToCustomer(emailId: string, customerId: string): Promise<void> {
  const [email, customer] = await Promise.all([
    db.email.findUnique({ where: { id: emailId }, select: { id: true } }),
    db.customer.findUnique({ where: { id: customerId }, select: { id: true } }),
  ]);
  if (!email) throw new EmailNotFoundError();
  if (!customer) throw new OrderConflictError("Клиент не найден");
  await db.email.update({ where: { id: email.id }, data: { customerId: customer.id } });
}

/** Клиенты для ручной привязки письма: по имени, телефону, email или ИНН. */
export async function searchCustomersForEmail(query: string) {
  const text = query.trim();
  if (text.length < 2) return [];
  const phone = normalizePhone(text);
  return db.customer.findMany({
    where: {
      OR: [
        { name: { contains: text, mode: "insensitive" } },
        { email: { contains: text, mode: "insensitive" } },
        { inn: { contains: text } },
        ...(phone ? [{ phone }] : []),
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: 8,
    select: { id: true, name: true, email: true, phone: true },
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
  customer: { select: { id: true, name: true } },
  attachments: { select: { id: true, fileName: true, byteSize: true, skippedReason: true } },
} satisfies Prisma.EmailSelect;

export type EmailListItem = Prisma.EmailGetPayload<{ select: typeof listSelect }>;

/**
 * Переписка клиента: письма, где он указан, и письма с его адреса или на его
 * адрес — так подтягиваются и письма, пришедшие до того, как адрес вписали в
 * карточку.
 */
function customerEmailsWhere(customer: { id: string; email: string | null }): Prisma.EmailWhereInput {
  const address = normalizeEmailAddress(customer.email);
  return {
    OR: [{ customerId: customer.id }, ...(address ? [{ fromEmail: address }, { toEmails: { has: address } }] : [])],
  };
}

/** В карточке заказа — столько последних писем переписки с клиентом. */
export const ORDER_EMAILS_LIMIT = 10;

/** Последние письма клиента для карточки заказа — по времени, старые сверху, как читается разговор. */
export async function recentCustomerEmails(customer: {
  id: string;
  email: string | null;
}): Promise<{ items: EmailListItem[]; total: number }> {
  const where = customerEmailsWhere(customer);
  const [items, total] = await Promise.all([
    db.email.findMany({ where, orderBy: { sentAt: "desc" }, take: ORDER_EMAILS_LIMIT, select: listSelect }),
    db.email.count({ where }),
  ]);
  return { items: items.reverse(), total };
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

/** Входящие без клиента, ждущие ручной привязки. История из ящика сюда не попадает. */
const UNLINKED_WHERE: Prisma.EmailWhereInput = { direction: "INBOUND", customerId: null, importedAt: null };

export async function listMailbox(view: MailboxView, page: number) {
  const where: Prisma.EmailWhereInput =
    view === "sent" ? { direction: "OUTBOUND" } : view === "unlinked" ? UNLINKED_WHERE : { direction: "INBOUND" };
  const [items, total] = await Promise.all([
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
  ]);
  return { items, total };
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

export type HistoryStoreResult = { status: "duplicate" } | { status: "stored"; linkedToCustomer: boolean };

/** Письмо из истории ящика: клиент — как у живых писем, письмо сразу прочитано и помечено `importedAt`. */
export async function storeHistoryEmail(letter: HistoryLetter, importedAt: Date): Promise<HistoryStoreResult> {
  const messageId = normalizeMessageId(letter.messageId);
  if (messageId && (await db.email.findUnique({ where: { messageId }, select: { id: true } }))) {
    return { status: "duplicate" };
  }
  const match = await matchCustomer(letter);
  await db.email.create({
    data: {
      direction: letter.direction,
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
  return { status: "stored", linkedToCustomer: match.customerId !== null };
}

/**
 * Достраивает цепочки в перенесённой истории: письмо без клиента получает клиента
 * другого письма той же переписки — и ответ от исходного, и исходное от ответа.
 * Повторяет, пока что-то меняется, но не больше пяти раз.
 */
export async function relinkHistoryThreads(): Promise<number> {
  let total = 0;
  for (let round = 0; round < 5; round++) {
    const linked = await db.email.findMany({
      where: { importedAt: { not: null }, customerId: { not: null } },
      select: { customerId: true, messageId: true, references: true },
    });
    const customerByMessage = new Map<string, string>();
    for (const email of linked) {
      for (const id of [email.messageId, ...email.references])
        if (id) customerByMessage.set(id, email.customerId as string);
    }

    const loose = await db.email.findMany({
      where: { importedAt: { not: null }, customerId: null },
      select: { id: true, messageId: true, references: true },
    });
    let changed = 0;
    for (const email of loose) {
      const customerId = [email.messageId, ...email.references]
        .filter((id): id is string => id !== null)
        .map((id) => customerByMessage.get(id))
        .find((item) => item !== undefined);
      if (!customerId) continue;
      await db.email.update({ where: { id: email.id }, data: { customerId } });
      changed++;
    }
    total += changed;
    if (changed === 0) break;
  }
  return total;
}

/** Переписка клиента — все письма, свежие сверху; у старых клиентов их может быть много. */
export const CUSTOMER_EMAILS_LIMIT = 200;

export async function listCustomerEmails(customer: {
  id: string;
  email: string | null;
}): Promise<{ items: EmailListItem[]; total: number }> {
  const where = customerEmailsWhere(customer);
  const [items, total] = await Promise.all([
    db.email.findMany({ where, orderBy: { sentAt: "desc" }, take: CUSTOMER_EMAILS_LIMIT, select: listSelect }),
    db.email.count({ where }),
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
 * Письмо из живого ящика, которое человек добавил в переписку: целиком, с
 * вложениями до 15 МБ, прочитанное. Клиент — по цепочке, номеру в теме или адресу.
 */
export async function storeMailboxLetter(letter: MailboxLetterInput): Promise<{ customerLinked: boolean }> {
  const counterparts = letter.direction === "INBOUND" ? [letter.fromEmail] : letter.toEmails;
  const match = await matchCustomer({ ...letter, counterparts });
  await db.email.create({
    data: {
      direction: letter.direction,
      customerId: match.customerId,
      messageId: letter.messageId,
      references: letter.references,
      fromEmail: letter.fromEmail,
      fromName: letter.fromName,
      toEmails: letter.toEmails,
      subject: letter.subject,
      body: letter.body,
      readAt: new Date(),
      sentAt: letter.date,
      attachments: { create: attachmentsToStore(letter.attachments) },
    },
  });
  return { customerLinked: match.customerId !== null };
}

/** Счётчики вкладок ERP в «Почте»: непрочитанные входящие и ждущие привязки к клиенту. */
export async function mailboxCounts(): Promise<{ unread: number; unlinked: number }> {
  const [unread, unlinked] = await Promise.all([
    db.email.count({ where: { direction: "INBOUND", readAt: null } }),
    db.email.count({ where: UNLINKED_WHERE }),
  ]);
  return { unread, unlinked };
}
