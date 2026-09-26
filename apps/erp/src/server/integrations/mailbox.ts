import "server-only";
import { ImapFlow } from "imapflow";
import { simpleParser, type AddressObject, type ParsedMail } from "mailparser";
import { z } from "zod";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { imapConfigured, type ImapSettings } from "@buscom/domain/settings";
import { readSettings } from "@/server/settings/service";
import type { MailFolder } from "@buscom/domain/email/folders";
import { normalizeEmailAddress, referencedMessageIds } from "@buscom/domain/email/letters";
import { ingestClientEmail, ingestSentEmail, type IncomingEmail } from "@/server/emails/service";
import { ingestSiteEmail, type StoredEmail } from "@/server/integrations/site-email";

/**
 * Опрос общего ящика: заказы с сайта и письма клиентов. Какое письмо разобрано
 * последним, помним по UID, а не по отметке «прочитано»: ящик читают и люди, и
 * письмо, открытое в веб-почте раньше ERP, иначе потерялось бы. Письма о заказах
 * после приёма помечаем прочитанными — подсказка людям, что система их забрала.
 *
 * При первом запуске, при смене ящика и если сервер сменил UIDVALIDITY (нумерация
 * писем сброшена) запоминаем текущий конец ящика и берём только новые письма:
 * старые заказы уже заведены руками или перенесены из прежней ERP.
 *
 * Вторым проходом читаются «Отправленные» — со своим курсором: письма клиентам,
 * написанные в веб-почте мимо ERP, тоже ложатся в переписку. Туда же ERP кладёт
 * копии своих писем (`appendToSent`) — их опрос узнаёт по Message-ID.
 *
 * Куда подключаться — из «Справочники → Почта входящая», иначе из `IMAP_*`
 * окружения. Настройки читаются на каждом проходе: правка в интерфейсе действует
 * без перезапуска сервера.
 */

const CURSOR_KEY = "siteEmailCursor";
const SENT_CURSOR_KEY = "sentEmailCursor";
/** Писем за один проход — чтобы ящик с завалом не держал соединение минутами */
const BATCH = 50;

const cursorSchema = z.object({
  uidValidity: z.string(),
  lastUid: z.number().int().min(0),
  /** `логин@сервер` — чей это курсор. У курсоров до смены ящика поля нет */
  account: z.string().optional(),
});
type Cursor = z.infer<typeof cursorSchema>;

export type PollSummary = {
  /** Первый запуск: запомнили конец ящика, писем не разбирали */
  baseline: boolean;
  created: number[];
  duplicates: number;
  failed: number;
  skipped: number;
  /** Письма клиентов, легшие в переписку; из них привязаны к заказу */
  letters: number;
  lettersLinked: number;
  /** Наши письма клиентам из «Отправленных», написанные мимо ERP */
  sentLetters: number;
  /** Остались письма сверх BATCH — заберём следующим проходом */
  more: boolean;
};

export type MailboxConnection = ImapSettings & { source: "settings" | "env" };

/** Подключение к ящику: настройки из интерфейса главнее окружения. Не задано — null. */
export async function resolveMailbox(): Promise<MailboxConnection | null> {
  const { imap } = await readSettings();
  if (imapConfigured(imap)) return { ...imap, source: "settings" };
  if (env.IMAP_HOST && env.IMAP_USER && env.IMAP_PASSWORD) {
    return {
      host: env.IMAP_HOST,
      port: env.IMAP_PORT,
      user: env.IMAP_USER,
      password: env.IMAP_PASSWORD,
      source: "env",
    };
  }
  return null;
}

export async function isMailboxConfigured(): Promise<boolean> {
  return (await resolveMailbox()) !== null;
}

function accountOf(connection: ImapSettings): string {
  return `${connection.user.toLowerCase()}@${connection.host.toLowerCase()}`;
}

async function readCursor(key = CURSOR_KEY): Promise<Cursor | null> {
  const row = await db.setting.findUnique({ where: { key } });
  const parsed = cursorSchema.safeParse(row?.value);
  return parsed.success ? parsed.data : null;
}

async function writeCursor(cursor: Cursor, key = CURSOR_KEY): Promise<void> {
  await db.setting.upsert({
    where: { key },
    create: { key, value: cursor },
    update: { value: cursor },
  });
}

export function createClient(connection: ImapSettings): ImapFlow {
  const [viaHost, viaPort] = env.IMAP_VIA?.split(":") ?? [];
  return new ImapFlow({
    host: viaHost || connection.host,
    port: viaPort ? Number(viaPort) : connection.port,
    secure: true,
    tls: { servername: connection.host },
    auth: { user: connection.user, pass: connection.password },
    connectionTimeout: 15_000,
    logger: false,
  });
}

/**
 * Проверка подключения заданными настройками — в том числе ещё не сохранёнными.
 * Только открывает INBOX и считает письма: курсор не трогает, писем не разбирает.
 * Ошибку не глушит — её показывают администратору.
 */
export async function testMailboxConnection(connection: ImapSettings): Promise<{ messages: number }> {
  const client = createClient(connection);
  await client.connect();
  try {
    const status = await client.status("INBOX", { messages: true });
    return { messages: status.messages ?? 0 };
  } finally {
    await client.logout().catch(() => client.close());
  }
}

/**
 * Папки ящика с числом писем — посмотреть, как почта разложена в клиенте.
 * Подключение из формы (в том числе несохранённое); ящик не меняет.
 */
/**
 * Папки уже подключённого клиента. `withCounts` — с числом писем и непрочитанных:
 * Яндекс отдаёт их отдельным запросом на каждую папку, это секунда на ~20 папок;
 * без счётчиков список приходит за десятки миллисекунд.
 */
export async function readFolders(client: ImapFlow, withCounts: boolean): Promise<MailFolder[]> {
  const list = await client.list(withCounts ? { statusQuery: { messages: true, unseen: true } } : { listOnly: true });
  return list.map((item) => ({
    path: item.path,
    name: item.name,
    delimiter: item.delimiter,
    // Яндекс не помечает INBOX флагом — узнаём по имени, оно в IMAP зарезервировано
    specialUse: item.specialUse ?? (item.path.toUpperCase() === "INBOX" ? "\\Inbox" : null),
    messages: item.status?.messages ?? null,
    unseen: item.status?.unseen ?? null,
    selectable: !item.flags.has("\\Noselect"),
  }));
}

export async function listMailboxFolders(connection: ImapSettings): Promise<MailFolder[]> {
  const client = createClient(connection);
  await client.connect();
  try {
    return await readFolders(client, true);
  } finally {
    await client.logout().catch(() => client.close());
  }
}

/** Папка «Отправленные»: по флагу сервера Sent, иначе по привычному названию. */
async function findSentFolder(client: ImapFlow): Promise<string | null> {
  const folders = await readFolders(client, false);
  const flagged = folders.find((folder) => folder.specialUse === "\Sent" && folder.selectable);
  if (flagged) return flagged.path;
  const named = folders.find((folder) => /^(sent|отправленные)$/i.test(folder.name) && folder.selectable);
  return named?.path ?? null;
}

/**
 * Копия письма, ушедшего из ERP, — в «Отправленные» ящика, прочитанной: чтобы её
 * видели и в веб-почте. SMTP сам копий не кладёт. Ящик не настроен — ничего.
 */
export async function appendToSent(source: Buffer): Promise<void> {
  const connection = await resolveMailbox();
  if (!connection) return;
  const client = createClient(connection);
  await client.connect();
  try {
    const path = await findSentFolder(client);
    if (!path) throw new Error("В ящике нет папки «Отправленные»");
    await client.append(path, source, ["\Seen"]);
  } finally {
    await client.logout().catch(() => client.close());
  }
}

function toStoredEmail(mail: ParsedMail): StoredEmail {
  return {
    messageId: mail.messageId ?? null,
    from: mail.from?.text ?? null,
    subject: mail.subject ?? "",
    date: mail.date ? mail.date.toISOString() : null,
    html: typeof mail.html === "string" ? mail.html : "",
    text: mail.text ?? "",
  };
}

function addresses(value: AddressObject | AddressObject[] | undefined): string[] {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  return list.flatMap((item) =>
    item.value.map((entry) => normalizeEmailAddress(entry.address)).filter((a): a is string => a !== null),
  );
}

/** Письмо для переписки. Встроенные в HTML картинки (подписи, логотипы) вложениями не считаем. */
function toIncomingEmail(mail: ParsedMail): IncomingEmail | null {
  const sender = mail.from?.value[0];
  const fromEmail = normalizeEmailAddress(sender?.address);
  if (!fromEmail) return null;
  return {
    messageId: mail.messageId ?? null,
    references: referencedMessageIds(mail.inReplyTo, mail.references),
    fromEmail,
    fromName: sender?.name || null,
    toEmails: [...addresses(mail.to), ...addresses(mail.cc)],
    subject: mail.subject ?? "(без темы)",
    body: (mail.text ?? "").trim(),
    date: mail.date ?? null,
    attachments: mail.attachments
      .filter((file) => !file.related)
      .map((file) => ({
        fileName: file.filename ?? "вложение",
        contentType: file.contentType || "application/octet-stream",
        content: file.content,
      })),
  };
}

export type PollOptions = {
  /**
   * Перечитать ящик начиная с письма с этим UID — восстановление после сбоя
   * или проверка на уже лежащих письмах. Дублей не будет: принятые письма
   * узнаются по номеру заказа.
   */
  fromUid?: number;
};

async function pollOnce(options: PollOptions): Promise<PollSummary> {
  const connection = await resolveMailbox();
  if (!connection) throw new Error("Ящик не настроен: заполните «Почта входящая» в справочниках");
  const account = accountOf(connection);

  const summary: PollSummary = {
    baseline: false,
    created: [],
    duplicates: 0,
    failed: 0,
    skipped: 0,
    letters: 0,
    lettersLinked: 0,
    sentLetters: 0,
    more: false,
  };
  const client = createClient(connection);
  await client.connect();

  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const mailbox = client.mailbox;
      if (!mailbox) throw new Error("Не удалось открыть INBOX");
      const uidValidity = String(mailbox.uidValidity);

      if (options.fromUid !== undefined) {
        await writeCursor({ uidValidity, lastUid: Math.max(0, options.fromUid - 1), account });
      }
      const cursor = await readCursor();
      // Курсор без account — от прежней версии, он про этот же ящик: принимаем и дописываем
      const otherAccount = cursor?.account !== undefined && cursor.account !== account;
      if (!cursor || cursor.uidValidity !== uidValidity || otherAccount) {
        await writeCursor({ uidValidity, lastUid: Math.max(0, mailbox.uidNext - 1), account });
        return { ...summary, baseline: true };
      }
      if (mailbox.uidNext - 1 > cursor.lastUid) await pollInbox(client, cursor.lastUid, uidValidity, account, summary);
    } finally {
      lock.release();
    }
    if (!summary.baseline) await pollSent(client, account, summary);
    return summary;
  } finally {
    await client.logout().catch(() => client.close());
  }
}

/** Новые письма INBOX: заказы с сайта и письма клиентов. Папка уже открыта. */
async function pollInbox(
  client: ImapFlow,
  lastUid: number,
  uidValidity: string,
  account: string,
  summary: PollSummary,
): Promise<void> {
  const messages = await fetchAfter(client, lastUid);
  summary.more = messages.length > BATCH;

  for (const message of messages.slice(0, BATCH)) {
    // Ошибка здесь — не про письмо (его разбор ошибок не бросает), а про базу
    // или сеть: курсор не двигаем, письмо заберём следующим проходом.
    const mail = await simpleParser(message.source);
    const result = await ingestSiteEmail(toStoredEmail(mail));

    if (result.status === "skipped") {
      // Не заказ с сайта — значит, письмо клиента. Отметку «прочитано» не ставим:
      // ящик читают и люди, а в ERP у письма своя отметка.
      const incoming = toIncomingEmail(mail);
      const letter = incoming ? await ingestClientEmail(incoming) : null;
      if (letter?.status === "stored") {
        summary.letters++;
        if (letter.customerLinked) summary.lettersLinked++;
      } else summary.skipped++;
    } else {
      if (result.status === 201) summary.created.push(result.orderNumber);
      else if (result.status === 200) summary.duplicates++;
      else summary.failed++;
      await client.messageFlagsAdd(String(message.uid), ["\\Seen"], { uid: true });
    }
    await writeCursor({ uidValidity, lastUid: message.uid, account });
  }
}

/**
 * Письма открытой папки с UID больше данного, по возрастанию. Сначала собираем,
 * потом разбираем: внутри fetch imapflow не даёт отправлять другие команды
 * (отметку «прочитано»). Диапазон «N:*» вернёт последнее письмо, даже если оно
 * старше N, — поэтому фильтр по UID.
 */
async function fetchAfter(client: ImapFlow, lastUid: number): Promise<{ uid: number; source: Buffer }[]> {
  const messages: { uid: number; source: Buffer }[] = [];
  for await (const message of client.fetch(`${lastUid + 1}:*`, { uid: true, source: true }, { uid: true })) {
    if (message.uid > lastUid && message.source) messages.push({ uid: message.uid, source: message.source });
  }
  return messages.sort((a, b) => a.uid - b.uid);
}

/**
 * «Отправленные»: наши письма клиентам, написанные мимо ERP. Курсор свой, первый
 * проход запоминает конец папки — прежние письма переносит импорт истории.
 */
async function pollSent(client: ImapFlow, account: string, summary: PollSummary): Promise<void> {
  const path = await findSentFolder(client);
  if (!path) return;
  const lock = await client.getMailboxLock(path, { readOnly: true });
  try {
    const mailbox = client.mailbox;
    if (!mailbox) return;
    const uidValidity = String(mailbox.uidValidity);
    const cursor = await readCursor(SENT_CURSOR_KEY);
    if (!cursor || cursor.uidValidity !== uidValidity || cursor.account !== account) {
      await writeCursor({ uidValidity, lastUid: Math.max(0, mailbox.uidNext - 1), account }, SENT_CURSOR_KEY);
      return;
    }
    if (mailbox.uidNext - 1 <= cursor.lastUid) return;

    const messages = await fetchAfter(client, cursor.lastUid);
    if (messages.length > BATCH) summary.more = true;

    for (const message of messages.slice(0, BATCH)) {
      const letter = toIncomingEmail(await simpleParser(message.source));
      const result = letter ? await ingestSentEmail(letter) : null;
      if (result?.status === "stored") summary.sentLetters++;
      await writeCursor({ uidValidity, lastUid: message.uid, account }, SENT_CURSOR_KEY);
    }
  } finally {
    lock.release();
  }
}

let running: Promise<PollSummary> | null = null;

/**
 * Один проход по ящику. Параллельные вызовы (таймер и кнопка в журнале) ждут
 * один и тот же проход, а не открывают второе соединение.
 */
export function pollMailbox(options: PollOptions = {}): Promise<PollSummary> {
  running ??= pollOnce(options).finally(() => {
    running = null;
  });
  return running;
}

/** Итог прохода по-человечески — для кнопки в журнале и лога сервера. */
export function describePoll(summary: PollSummary): string {
  if (summary.baseline) return "Ящик подключён: принимаются письма, пришедшие с этого момента";
  const parts: string[] = [];
  if (summary.created.length) parts.push(`новых заказов: ${summary.created.length} (№${summary.created.join(", №")})`);
  if (summary.duplicates) parts.push(`уже принятых: ${summary.duplicates}`);
  if (summary.failed) parts.push(`с ошибкой разбора: ${summary.failed} — см. журнал`);
  if (summary.letters)
    parts.push(`писем в переписку: ${summary.letters}, из них с известным клиентом: ${summary.lettersLinked}`);
  if (summary.sentLetters) parts.push(`наших писем клиентам из «Отправленных»: ${summary.sentLetters}`);
  if (summary.skipped) parts.push(`пропущено: ${summary.skipped}`);
  if (summary.more) parts.push("остальные письма — следующим проходом");
  return parts.length ? parts.join("; ") : "Новых писем нет";
}
