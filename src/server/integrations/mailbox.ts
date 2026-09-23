import "server-only";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { z } from "zod";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { ingestSiteEmail, type StoredEmail } from "@/server/integrations/site-email";

/**
 * Опрос ящика заказов. Какое письмо разобрано последним, помним по UID, а не по
 * отметке «прочитано»: ящик читают и люди, и письмо, открытое в веб-почте раньше
 * ERP, иначе потерялось бы. Отметку «прочитано» ставим после приёма — это
 * подсказка людям, что система письмо забрала.
 *
 * При первом запуске (и если сервер сменил UIDVALIDITY — нумерация писем
 * сброшена) запоминаем текущий конец ящика и берём только новые письма: старые
 * заказы уже заведены руками или перенесены из прежней ERP.
 */

const CURSOR_KEY = "siteEmailCursor";
/** Писем за один проход — чтобы ящик с завалом не держал соединение минутами */
const BATCH = 50;

const cursorSchema = z.object({ uidValidity: z.string(), lastUid: z.number().int().min(0) });
type Cursor = z.infer<typeof cursorSchema>;

export type PollSummary = {
  /** Первый запуск: запомнили конец ящика, писем не разбирали */
  baseline: boolean;
  created: number[];
  duplicates: number;
  failed: number;
  skipped: number;
  /** Остались письма сверх BATCH — заберём следующим проходом */
  more: boolean;
};

export function isMailboxConfigured(): boolean {
  return Boolean(env.IMAP_HOST && env.IMAP_USER && env.IMAP_PASSWORD);
}

async function readCursor(): Promise<Cursor | null> {
  const row = await db.setting.findUnique({ where: { key: CURSOR_KEY } });
  const parsed = cursorSchema.safeParse(row?.value);
  return parsed.success ? parsed.data : null;
}

async function writeCursor(cursor: Cursor): Promise<void> {
  await db.setting.upsert({
    where: { key: CURSOR_KEY },
    create: { key: CURSOR_KEY, value: cursor },
    update: { value: cursor },
  });
}

function createClient(): ImapFlow {
  const host = env.IMAP_HOST as string;
  const [viaHost, viaPort] = env.IMAP_VIA?.split(":") ?? [];
  return new ImapFlow({
    host: viaHost || host,
    port: viaPort ? Number(viaPort) : env.IMAP_PORT,
    secure: true,
    tls: { servername: host },
    auth: { user: env.IMAP_USER as string, pass: env.IMAP_PASSWORD as string },
    connectionTimeout: 15_000,
    logger: false,
  });
}

async function toStoredEmail(source: Buffer): Promise<StoredEmail> {
  const mail = await simpleParser(source);
  return {
    messageId: mail.messageId ?? null,
    from: mail.from?.text ?? null,
    subject: mail.subject ?? "",
    date: mail.date ? mail.date.toISOString() : null,
    html: typeof mail.html === "string" ? mail.html : "",
    text: mail.text ?? "",
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
  if (!isMailboxConfigured()) throw new Error("Ящик заказов не настроен: нужны IMAP_HOST, IMAP_USER и IMAP_PASSWORD");

  const summary: PollSummary = { baseline: false, created: [], duplicates: 0, failed: 0, skipped: 0, more: false };
  const client = createClient();
  await client.connect();

  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const mailbox = client.mailbox;
      if (!mailbox) throw new Error("Не удалось открыть INBOX");
      const uidValidity = String(mailbox.uidValidity);

      if (options.fromUid !== undefined) {
        await writeCursor({ uidValidity, lastUid: Math.max(0, options.fromUid - 1) });
      }
      const cursor = await readCursor();
      if (!cursor || cursor.uidValidity !== uidValidity) {
        await writeCursor({ uidValidity, lastUid: Math.max(0, mailbox.uidNext - 1) });
        return { ...summary, baseline: true };
      }
      if (mailbox.uidNext - 1 <= cursor.lastUid) return summary;

      // Сначала собираем письма, потом разбираем: внутри fetch imapflow не даёт
      // отправлять другие команды (отметку «прочитано»). Диапазон «N:*» вернёт
      // последнее письмо, даже если оно старше N, — поэтому фильтр по UID.
      const messages: { uid: number; source: Buffer }[] = [];
      for await (const message of client.fetch(`${cursor.lastUid + 1}:*`, { uid: true, source: true }, { uid: true })) {
        if (message.uid > cursor.lastUid && message.source) messages.push({ uid: message.uid, source: message.source });
      }
      messages.sort((a, b) => a.uid - b.uid);
      summary.more = messages.length > BATCH;

      for (const message of messages.slice(0, BATCH)) {
        // Ошибка здесь — не про письмо (его разбор ошибок не бросает), а про базу
        // или сеть: курсор не двигаем, письмо заберём следующим проходом.
        const result = await ingestSiteEmail(await toStoredEmail(message.source));

        if (result.status === "skipped") summary.skipped++;
        else {
          if (result.status === 201) summary.created.push(result.orderNumber);
          else if (result.status === 200) summary.duplicates++;
          else summary.failed++;
          await client.messageFlagsAdd(String(message.uid), ["\\Seen"], { uid: true });
        }
        await writeCursor({ uidValidity, lastUid: message.uid });
      }

      return summary;
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => client.close());
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
  if (summary.skipped) parts.push(`не о заказах: ${summary.skipped}`);
  if (summary.more) parts.push("остальные письма — следующим проходом");
  return parts.length ? parts.join("; ") : "Новых писем нет";
}
