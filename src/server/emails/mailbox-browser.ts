import "server-only";
import type { Readable } from "node:stream";
import type { ImapFlow, MessageStructureObject } from "imapflow";
import { simpleParser } from "mailparser";
import type { MailFolder } from "@/domain/email/folders";
import { headerValue, htmlToText, letterParts } from "@/domain/email/history";
import {
  MAX_ATTACHMENT_BYTES,
  normalizeEmailAddress,
  normalizeMessageId,
  referencedMessageIds,
} from "@/domain/email/letters";
import { db } from "@/server/db";
import { linkEmailToOrder, storeMailboxLetter } from "@/server/emails/service";
import { createClient, listMailboxFolders, resolveMailbox } from "@/server/integrations/mailbox";
import { OrderConflictError } from "@/server/orders/internal";
import type { SessionUser } from "@/server/session";

/**
 * Живой просмотр общего ящика в разделе «Почта» (решение владельца 2026-09-25):
 * папки, письма и вложения читаются прямо из IMAP при каждом открытии, в ERP
 * ничего не копируется — ящик всегда совпадает с Яндексом. Из действий —
 * «прочитано», перенос в папку, «удалить» (перенос в «Удалённые», откуда письмо
 * возвращается) и привязка письма к заказу: только тогда оно ложится в ERP.
 * Окончательное удаление — только в самой почте.
 */

export class MailboxUnavailableError extends Error {
  constructor(message = "Ящик не настроен: «Администрирование → Настройки почты → Входящая почта»") {
    super(message);
    this.name = "MailboxUnavailableError";
  }
}

export const MAILBOX_PAGE_SIZE = 50;

/** Одно соединение на действие: подключились, сделали, вышли. */
async function withMailbox<T>(action: (client: ImapFlow) => Promise<T>): Promise<T> {
  const connection = await resolveMailbox();
  if (!connection) throw new MailboxUnavailableError();
  const client = createClient(connection);
  await client.connect();
  try {
    return await action(client);
  } finally {
    await client.logout().catch(() => client.close());
  }
}

/**
 * Дерево папок меняется редко, а спрашивать его на каждом переходе по разделу —
 * секунда ожидания. Держим 30 секунд; действия с письмами кеш сбрасывают.
 */
let foldersCache: { at: number; folders: MailFolder[] } | null = null;
const FOLDERS_TTL_MS = 30_000;

export async function mailboxFolders(): Promise<MailFolder[]> {
  if (foldersCache && Date.now() - foldersCache.at < FOLDERS_TTL_MS) return foldersCache.folders;
  const connection = await resolveMailbox();
  if (!connection) throw new MailboxUnavailableError();
  const folders = await listMailboxFolders(connection);
  foldersCache = { at: Date.now(), folders };
  return folders;
}

function dropFoldersCache() {
  foldersCache = null;
}

type Address = { name?: string; address?: string };

function addressText(list: Address[] | undefined): string {
  return (list ?? [])
    .map((item) => item.name || item.address || "")
    .filter(Boolean)
    .join(", ");
}

function addresses(list: Address[] | undefined): string[] {
  return (list ?? []).map((item) => normalizeEmailAddress(item.address)).filter((a): a is string => a !== null);
}

function hasAttachments(structure: MessageStructureObject | undefined): boolean {
  return structure ? letterParts(structure).attachments.length > 0 : false;
}

export type MailboxListItem = {
  uid: number;
  seen: boolean;
  from: string;
  to: string;
  subject: string;
  date: Date | null;
  hasAttachments: boolean;
  /** Письмо уже лежит в ERP — ссылка на него и номер заказа, если привязано */
  erp: { id: string; orderNumber: number | null } | null;
};

/** Письма папки, свежие сверху, по 50. Номер страницы вне диапазона — последняя. */
export async function listFolderLetters(path: string, page: number) {
  const result = await withMailbox(async (client) => {
    const lock = await client.getMailboxLock(path, { readOnly: true });
    try {
      const total = client.mailbox ? client.mailbox.exists : 0;
      const pageCount = Math.max(1, Math.ceil(total / MAILBOX_PAGE_SIZE));
      const current = Math.min(Math.max(1, page), pageCount);
      if (total === 0) return { total, page: current, pageCount, raw: [] };
      // Порядковые номера растут к новым письмам: первая страница — хвост ящика
      const last = total - (current - 1) * MAILBOX_PAGE_SIZE;
      const first = Math.max(1, last - MAILBOX_PAGE_SIZE + 1);
      const raw = [];
      for await (const message of client.fetch(`${first}:${last}`, {
        uid: true,
        flags: true,
        envelope: true,
        bodyStructure: true,
      })) {
        raw.push(message);
      }
      raw.sort((a, b) => b.seq - a.seq);
      return { total, page: current, pageCount, raw };
    } finally {
      lock.release();
    }
  });

  const ids = result.raw
    .map((message) => normalizeMessageId(message.envelope?.messageId))
    .filter((id): id is string => id !== null);
  const known = ids.length
    ? await db.email.findMany({
        where: { messageId: { in: ids } },
        select: { id: true, messageId: true, order: { select: { number: true } } },
      })
    : [];
  const byMessageId = new Map(known.map((row) => [row.messageId, row]));

  const items: MailboxListItem[] = result.raw.map((message) => {
    const erp = byMessageId.get(normalizeMessageId(message.envelope?.messageId) ?? "");
    return {
      uid: message.uid,
      seen: message.flags?.has("\\Seen") ?? false,
      from: addressText(message.envelope?.from),
      to: addressText(message.envelope?.to),
      subject: message.envelope?.subject || "(без темы)",
      date: message.envelope?.date ? new Date(message.envelope.date) : null,
      hasAttachments: hasAttachments(message.bodyStructure),
      erp: erp ? { id: erp.id, orderNumber: erp.order?.number ?? null } : null,
    };
  });
  return { total: result.total, page: result.page, pageCount: result.pageCount, items };
}

async function readStream(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks);
}

export type MailboxLetter = {
  uid: number;
  path: string;
  seen: boolean;
  from: string;
  fromEmail: string | null;
  to: string;
  cc: string;
  subject: string;
  date: Date | null;
  body: string;
  attachments: { part: string; fileName: string; contentType: string; size: number }[];
  messageId: string | null;
  erp: { id: string; orderNumber: number | null } | null;
};

/** Одно письмо целиком. Открытие помечает его прочитанным — как в веб-почте. */
export async function readMailboxLetter(path: string, uid: number): Promise<MailboxLetter | null> {
  const letter = await withMailbox(async (client) => {
    const lock = await client.getMailboxLock(path);
    try {
      const message = await client.fetchOne(
        String(uid),
        { uid: true, flags: true, envelope: true, bodyStructure: true },
        { uid: true },
      );
      if (!message || !message.envelope) return null;
      const structure = message.bodyStructure;
      const attachments: MailboxLetter["attachments"] = [];
      let text: { part: string; html: boolean } | null = null;
      if (structure) {
        text = letterParts(structure).text;
        const walk = (node: MessageStructureObject) => {
          if (node.childNodes?.length) return node.childNodes.forEach(walk);
          const fileName = node.dispositionParameters?.filename ?? node.parameters?.name;
          if (node.disposition?.toLowerCase() === "attachment" || (fileName && node.disposition !== "inline")) {
            attachments.push({
              part: node.part ?? "1",
              fileName: fileName ?? "вложение",
              contentType: node.type,
              size: node.size ?? 0,
            });
          }
        };
        walk(structure);
      }
      let body = "";
      if (text) {
        const { content } = await client.download(String(uid), text.part, { uid: true, maxBytes: 1_000_000 });
        body = (await readStream(content)).toString("utf8");
        if (text.html) body = htmlToText(body);
      }
      const seen = message.flags?.has("\\Seen") ?? false;
      if (!seen) await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
      return {
        uid,
        path,
        seen: true,
        from: addressText(message.envelope.from),
        fromEmail: normalizeEmailAddress(message.envelope.from?.[0]?.address),
        to: addressText(message.envelope.to),
        cc: addressText(message.envelope.cc),
        subject: message.envelope.subject || "(без темы)",
        date: message.envelope.date ? new Date(message.envelope.date) : null,
        body: body.trim(),
        attachments,
        messageId: normalizeMessageId(message.envelope.messageId),
      };
    } finally {
      lock.release();
    }
  });
  if (!letter) return null;
  dropFoldersCache();

  const erp = letter.messageId
    ? await db.email.findUnique({
        where: { messageId: letter.messageId },
        select: { id: true, order: { select: { number: true } } },
      })
    : null;
  return { ...letter, erp: erp ? { id: erp.id, orderNumber: erp.order?.number ?? null } : null };
}

export async function setLetterSeen(path: string, uid: number, seen: boolean): Promise<void> {
  await withMailbox(async (client) => {
    const lock = await client.getMailboxLock(path);
    try {
      if (seen) await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
      else await client.messageFlagsRemove(String(uid), ["\\Seen"], { uid: true });
    } finally {
      lock.release();
    }
  });
  dropFoldersCache();
}

export async function moveLetter(path: string, uid: number, destination: string): Promise<void> {
  if (path === destination) return;
  await withMailbox(async (client) => {
    const lock = await client.getMailboxLock(path);
    try {
      const moved = await client.messageMove(String(uid), destination, { uid: true });
      if (!moved) throw new OrderConflictError("Письмо не перемещено — возможно, его уже нет в папке");
    } finally {
      lock.release();
    }
  });
  dropFoldersCache();
}

/** «Удалить» — перенос в «Удалённые»: оттуда письмо возвращается, как в Яндексе. */
export async function trashLetter(path: string, uid: number): Promise<string> {
  const trash = (await mailboxFolders()).find((folder) => folder.specialUse === "\\Trash");
  if (!trash) throw new OrderConflictError("В ящике нет папки «Удалённые» — удалите письмо в самой почте");
  if (trash.path === path)
    throw new OrderConflictError("Письмо уже в «Удалённых» — окончательно удаляется в самой почте");
  await moveLetter(path, uid, trash.path);
  return trash.path;
}

/** Вложение письма из ящика — для скачивания. Крупнее лимита не отдаём. */
export async function downloadLetterPart(path: string, uid: number, part: string) {
  return withMailbox(async (client) => {
    const lock = await client.getMailboxLock(path, { readOnly: true });
    try {
      const { meta, content } = await client.download(String(uid), part, { uid: true, maxBytes: MAX_ATTACHMENT_BYTES });
      return {
        fileName: meta.filename ?? "вложение",
        contentType: meta.contentType ?? "application/octet-stream",
        data: await readStream(content),
      };
    } finally {
      lock.release();
    }
  });
}

/**
 * Привязать письмо ящика к заказу: письмо целиком (с вложениями до 15 МБ) ложится
 * в переписку заказа с записью в его журнал. Если оно уже в ERP (пришло опросом
 * или из истории) — только перепривязывается. Письмо из «Отправленных» — наше.
 */
export async function attachLetterToOrder(
  path: string,
  uid: number,
  orderNumber: number,
  user: SessionUser,
): Promise<void> {
  const folders = await mailboxFolders();
  const direction = folders.find((folder) => folder.path === path)?.specialUse === "\\Sent" ? "OUTBOUND" : "INBOUND";

  const source = await withMailbox(async (client) => {
    const lock = await client.getMailboxLock(path, { readOnly: true });
    try {
      const message = await client.fetchOne(String(uid), { uid: true, source: true }, { uid: true });
      return message && message.source ? message.source : null;
    } finally {
      lock.release();
    }
  });
  if (!source) throw new OrderConflictError("Письмо не найдено в ящике — возможно, его переместили");

  const mail = await simpleParser(source);
  const messageId = normalizeMessageId(mail.messageId);
  const existing = messageId
    ? await db.email.findUnique({ where: { messageId }, select: { id: true, direction: true } })
    : null;
  if (existing) {
    await linkEmailToOrder(existing.id, orderNumber, user, { allowOutbound: true });
    return;
  }

  const to = Array.isArray(mail.to) ? mail.to : mail.to ? [mail.to] : [];
  const rawHeaders = [...mail.headerLines].map((line) => line.line).join("\r\n");
  await storeMailboxLetter(
    {
      direction,
      messageId,
      references: referencedMessageIds(headerValue(rawHeaders, "In-Reply-To"), headerValue(rawHeaders, "References")),
      fromEmail: normalizeEmailAddress(mail.from?.value[0]?.address) ?? "",
      fromName: mail.from?.value[0]?.name || null,
      toEmails: to.flatMap((item) => addresses(item.value)),
      subject: mail.subject ?? "(без темы)",
      body: (mail.text ?? (typeof mail.html === "string" ? htmlToText(mail.html) : "")).trim(),
      date: mail.date ?? new Date(),
      attachments: mail.attachments
        .filter((file) => !file.related)
        .map((file) => ({
          fileName: file.filename ?? "вложение",
          contentType: file.contentType,
          content: file.content,
        })),
    },
    orderNumber,
    user,
  );
}
