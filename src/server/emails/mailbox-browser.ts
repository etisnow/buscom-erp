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
import { storeMailboxLetter } from "@/server/emails/service";
import { createClient, readFolders, resolveMailbox } from "@/server/integrations/mailbox";
import { OrderConflictError } from "@/server/orders/internal";

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

/**
 * Одно соединение с ящиком на процесс, а не на каждое открытие: вход в Яндекс —
 * лишние ~0,2 с в бою, и за одно открытие страницы их набиралось два-три.
 * Параллельные запросы imapflow ставит в очередь сам, выбор папки — через
 * `getMailboxLock`. Соединение пересоздаётся, если оборвалось или поменялись
 * настройки ящика; оборвавшееся посреди действия — действие повторяется один раз.
 */
type Shared = { key: string; client: ImapFlow };
const globalForMailbox = globalThis as unknown as { mailboxShared?: Shared; mailboxConnecting?: Promise<Shared> };

async function sharedClient(): Promise<ImapFlow> {
  const connection = await resolveMailbox();
  if (!connection) throw new MailboxUnavailableError();
  const key = `${connection.user}@${connection.host}:${connection.port}:${connection.password.length}:${connection.password}`;

  const current = globalForMailbox.mailboxShared;
  if (current && current.key === key && current.client.usable) return current.client;
  if (current) {
    globalForMailbox.mailboxShared = undefined;
    current.client.close();
  }

  globalForMailbox.mailboxConnecting ??= (async () => {
    const client = createClient(connection);
    // Обрыв соединения — не падение процесса: следующее действие подключится заново
    client.on("error", () => {});
    client.on("close", () => {
      if (globalForMailbox.mailboxShared?.client === client) globalForMailbox.mailboxShared = undefined;
    });
    await client.connect();
    const shared = { key, client };
    globalForMailbox.mailboxShared = shared;
    return shared;
  })().finally(() => {
    globalForMailbox.mailboxConnecting = undefined;
  });
  return (await globalForMailbox.mailboxConnecting).client;
}

/**
 * Предел ожидания одной операции. Соединение может тихо умереть (простой, сеть), и
 * команда на нём ждала бы бесконечно — а за ней в очереди встали бы все следующие
 * открытия «Почты». По истечении соединение закрывается, следующая операция
 * откроет новое.
 */
const OPERATION_TIMEOUT_MS = 20_000;

class MailboxTimeoutError extends MailboxUnavailableError {
  constructor() {
    super("Почтовый сервер не ответил за 20 секунд — попробуйте ещё раз");
  }
}

async function withTimeout<T>(client: ImapFlow, action: (client: ImapFlow) => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      client.close();
      reject(new MailboxTimeoutError());
    }, OPERATION_TIMEOUT_MS);
  });
  try {
    return await Promise.race([action(client), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function withMailbox<T>(action: (client: ImapFlow) => Promise<T>): Promise<T> {
  const client = await sharedClient();
  try {
    return await withTimeout(client, action);
  } catch (error) {
    // Соединение умерло (Яндекс закрывает простаивающие) — один повтор на свежем.
    // После истечения предела не повторяем: человек и так ждал 20 секунд
    if (client.usable || error instanceof MailboxTimeoutError) throw error;
    return withTimeout(await sharedClient(), action);
  }
}

/**
 * Два кеша папок. Список без счётчиков меняется редко и приходит быстро — им
 * пользуются страницы (заголовок папки, «Переместить в…»). Счётчики нужны только
 * левой колонке и стоят ~1 с: отдаём последние известные сразу, а свежие
 * запрашиваем в фоне не чаще раза в 30 секунд, одним запросом на всех.
 */
const STRUCTURE_TTL_MS = 5 * 60_000;
const COUNTS_TTL_MS = 30_000;
const globalForFolders = globalThis as unknown as {
  mailboxStructure?: { at: number; folders: MailFolder[] };
  mailboxCounts?: { at: number; folders: MailFolder[] };
  mailboxCountsLoading?: Promise<MailFolder[]>;
  /** Когда счётчики последний раз правились действием — пересчёт, начатый раньше, их не перетирает */
  mailboxCountsChangedAt?: number;
};

/** Папки без счётчиков — для страниц. */
export async function mailboxFolderList(): Promise<MailFolder[]> {
  const cached = globalForFolders.mailboxStructure;
  if (cached && Date.now() - cached.at < STRUCTURE_TTL_MS) return cached.folders;
  const folders = await withMailbox((client) => readFolders(client, false));
  globalForFolders.mailboxStructure = { at: Date.now(), folders };
  return folders;
}

function refreshCounts(): Promise<MailFolder[]> {
  if (globalForFolders.mailboxCountsLoading) return globalForFolders.mailboxCountsLoading;
  const startedAt = Date.now();
  globalForFolders.mailboxCountsLoading = withMailbox((client) => readFolders(client, true))
    .then((folders) => {
      globalForFolders.mailboxStructure = { at: Date.now(), folders };
      const changedAt = globalForFolders.mailboxCountsChangedAt ?? 0;
      if (changedAt >= startedAt && globalForFolders.mailboxCounts) {
        // Пока шёл пересчёт, действие поправило счётчики — эти цифры уже старые.
        // Оставляем поправленные и пересчитываем ещё раз после этого
        setTimeout(() => void refreshCounts().catch(() => {}), 0);
        return globalForFolders.mailboxCounts.folders;
      }
      globalForFolders.mailboxCounts = { at: Date.now(), folders };
      return folders;
    })
    .finally(() => {
      globalForFolders.mailboxCountsLoading = undefined;
    });
  return globalForFolders.mailboxCountsLoading;
}

/** Папки со счётчиками — для левой колонки. Устаревшие отдаются сразу, свежие — в фоне. */
export async function mailboxFolders(): Promise<MailFolder[]> {
  const cached = globalForFolders.mailboxCounts;
  if (!cached) return refreshCounts();
  if (Date.now() - cached.at >= COUNTS_TTL_MS) void refreshCounts().catch(() => {});
  return cached.folders;
}

/** После действия с письмом счётчики изменились — пересчитать в фоне. */
function dropFoldersCache() {
  void refreshCounts().catch(() => {});
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
  erp: { id: string; customer: { id: string; name: string } | null } | null;
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
        select: { id: true, messageId: true, customer: { select: { id: true, name: true } } },
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
      erp: erp ? { id: erp.id, customer: erp.customer } : null,
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
  erp: { id: string; customer: { id: string; name: string } | null } | null;
};

/** Одно письмо целиком. Открытие помечает его прочитанным — как в веб-почте. */
export async function readMailboxLetter(path: string, uid: number): Promise<MailboxLetter | null> {
  const letter = await withMailbox(async (client) => {
    // Только на чтение (EXAMINE): скачивание текста письма (BODY[…]) в папке,
    // открытой на запись, сервер сам помечает прочитанным — и отметку ставила бы
    // отрисовка страницы, а не человек.
    const lock = await client.getMailboxLock(path, { readOnly: true });
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
      // Отметку «прочитано» здесь не ставим: страницу письма сервер перерисовывает и
      // после действий — «Пометить непрочитанным» тут же снова делало бы письмо
      // прочитанным. Её ставит `markLetterOpened`, один раз при открытии в браузере.
      return {
        uid,
        path,
        seen: message.flags?.has("\\Seen") ?? false,
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

  const erp = letter.messageId
    ? await db.email.findUnique({
        where: { messageId: letter.messageId },
        select: { id: true, customer: { select: { id: true, name: true } } },
      })
    : null;
  return { ...letter, erp: erp ? { id: erp.id, customer: erp.customer } : null };
}

/**
 * Сдвиг счётчиков папки в кеше сразу после действия — чтобы левая колонка,
 * которую сервер перерисует в ответе на действие, уже была верной, не дожидаясь
 * фонового пересчёта из ящика (он всё равно запускается и всё выверит).
 */
function adjustCounts(path: string, delta: { messages?: number; unseen?: number }) {
  const cached = globalForFolders.mailboxCounts;
  if (!cached) return;
  globalForFolders.mailboxCountsChangedAt = Date.now();
  cached.folders = cached.folders.map((folder) =>
    folder.path === path
      ? {
          ...folder,
          messages: folder.messages === null ? null : Math.max(0, folder.messages + (delta.messages ?? 0)),
          unseen: folder.unseen === null ? null : Math.max(0, folder.unseen + (delta.unseen ?? 0)),
        }
      : folder,
  );
}

/** Прочитано ли письмо сейчас — перед действием, чтобы сдвинуть счётчики точно. */
async function isSeen(client: ImapFlow, uid: number): Promise<boolean> {
  const message = await client.fetchOne(String(uid), { uid: true, flags: true }, { uid: true });
  return message ? (message.flags?.has("\\Seen") ?? false) : true;
}

export async function setLetterSeen(path: string, uid: number, seen: boolean): Promise<void> {
  const changed = await withMailbox(async (client) => {
    const lock = await client.getMailboxLock(path);
    try {
      if ((await isSeen(client, uid)) === seen) return false;
      if (seen) await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
      else await client.messageFlagsRemove(String(uid), ["\\Seen"], { uid: true });
      return true;
    } finally {
      lock.release();
    }
  });
  if (changed) adjustCounts(path, { unseen: seen ? -1 : 1 });
  dropFoldersCache();
}

/** Письмо открыли в браузере — прочитано, как в веб-почте. */
export async function markLetterOpened(path: string, uid: number): Promise<void> {
  await setLetterSeen(path, uid, true);
}

export async function moveLetter(path: string, uid: number, destination: string): Promise<void> {
  if (path === destination) return;
  const wasSeen = await withMailbox(async (client) => {
    const lock = await client.getMailboxLock(path);
    try {
      const seen = await isSeen(client, uid);
      const moved = await client.messageMove(String(uid), destination, { uid: true });
      if (!moved) throw new OrderConflictError("Письмо не перемещено — возможно, его уже нет в папке");
      return seen;
    } finally {
      lock.release();
    }
  });
  adjustCounts(path, { messages: -1, unseen: wasSeen ? 0 : -1 });
  adjustCounts(destination, { messages: 1, unseen: wasSeen ? 0 : 1 });
  dropFoldersCache();
}

/** «Удалить» — перенос в «Удалённые»: оттуда письмо возвращается, как в Яндексе. */
export async function trashLetter(path: string, uid: number): Promise<string> {
  const trash = (await mailboxFolderList()).find((folder) => folder.specialUse === "\\Trash");
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
 * Добавить письмо ящика в переписку ERP: целиком, с вложениями до 15 МБ. Клиент —
 * по цепочке, номеру заказа в теме или адресу; не нашёлся — письмо ждёт в «Почте →
 * Без клиента». Уже лежащее в ERP (опрос, история) второй раз не добавляется.
 * Письмо из «Отправленных» — наше.
 */
export async function addLetterToCorrespondence(
  path: string,
  uid: number,
): Promise<{ status: "exists" } | { status: "added"; customerLinked: boolean }> {
  const folders = await mailboxFolderList();
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
  if (existing) return { status: "exists" };

  const to = Array.isArray(mail.to) ? mail.to : mail.to ? [mail.to] : [];
  const rawHeaders = [...mail.headerLines].map((line) => line.line).join("\r\n");
  const stored = await storeMailboxLetter({
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
  });
  return { status: "added", customerLinked: stored.customerLinked };
}
