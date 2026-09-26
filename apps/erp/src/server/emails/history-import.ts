import "server-only";
import type { Readable } from "node:stream";
import { z } from "zod";
import {
  counterparts,
  defaultHistoryFolders,
  headerValue,
  historySince,
  htmlToText,
  isClientLetter,
  letterParts,
} from "@buscom/domain/email/history";
import { normalizeEmailAddress, referencedMessageIds } from "@buscom/domain/email/letters";
import { db } from "@/server/db";
import { relinkHistoryThreads, storeHistoryEmail, type HistoryLetter } from "@/server/emails/service";
import { createClient, listMailboxFolders, resolveMailbox } from "@/server/integrations/mailbox";
import { senderAddress } from "@/server/mail";
import { OrderConflictError } from "@/server/orders/internal";

/**
 * Импорт истории переписки из общего ящика (решение владельца 2026-09-25): письма
 * за 3 года, только с клиентами, вложения названиями.
 *
 * Идёт в фоне внутри процесса приложения — доступ к ящику есть только у него.
 * Сначала по каждой пачке писем читаются лишь заголовки и структура; целиком
 * текст скачивается только у писем с клиентами, вложения не скачиваются вовсе.
 * Состояние с прогрессом лежит в `Setting`: его видно в «Настройках почты», и после
 * перезапуска сервера импорт продолжается с последнего разобранного письма папки.
 * Повторный запуск дублей не даёт — письма узнаются по Message-ID.
 */

const STATE_KEY = "mailHistoryImport";
/** Писем в пачке: столько заголовков читается одной командой */
const BATCH = 100;
/** Потолок текста одного письма — у писем-простыней остальное не нужно */
const MAX_TEXT_BYTES = 300_000;

const folderStateSchema = z.object({
  path: z.string(),
  name: z.string(),
  direction: z.enum(["INBOUND", "OUTBOUND"]),
  total: z.number().int(),
  processed: z.number().int(),
  lastUid: z.number().int(),
  done: z.boolean(),
});

const stateSchema = z.object({
  status: z.enum(["running", "done", "failed"]),
  since: z.string(),
  folders: z.array(folderStateSchema),
  imported: z.number().int(),
  /** Письма, у которых нашёлся клиент. У импортов до 25.09 поля нет — там считались заказы */
  linkedToCustomers: z.number().int().default(0),
  duplicates: z.number().int(),
  skipped: z.number().int(),
  relinked: z.number().int(),
  startedAt: z.string(),
  updatedAt: z.string(),
  finishedAt: z.string().nullable(),
  error: z.string().nullable(),
});

export type HistoryImportState = z.infer<typeof stateSchema>;

export async function readHistoryImport(): Promise<HistoryImportState | null> {
  const row = await db.setting.findUnique({ where: { key: STATE_KEY } });
  const parsed = stateSchema.safeParse(row?.value);
  return parsed.success ? parsed.data : null;
}

async function writeState(state: HistoryImportState): Promise<void> {
  state.updatedAt = new Date().toISOString();
  await db.setting.upsert({
    where: { key: STATE_KEY },
    create: { key: STATE_KEY, value: state },
    update: { value: state },
  });
}

/** Один импорт на процесс: второй запуск кнопкой не открывает второе соединение. */
const globalForHistory = globalThis as unknown as { mailHistoryJob?: Promise<void> };

export function historyImportRunning(): boolean {
  return globalForHistory.mailHistoryJob !== undefined;
}

function launch(state: HistoryImportState): void {
  globalForHistory.mailHistoryJob = run(state).finally(() => {
    globalForHistory.mailHistoryJob = undefined;
  });
}

/**
 * Новый импорт по выбранным папкам (null — папки по умолчанию: все, кроме спама,
 * удалённых и черновиков). Период — 3 года до сегодняшнего дня.
 */
export async function startHistoryImport(folderPaths: string[] | null): Promise<HistoryImportState> {
  if (historyImportRunning()) throw new OrderConflictError("Импорт уже идёт — дождитесь окончания");
  const connection = await resolveMailbox();
  if (!connection) throw new OrderConflictError("Ящик не настроен: заполните «Входящую почту»");

  const available = defaultHistoryFolders(await listMailboxFolders(connection));
  const chosen = folderPaths ? available.filter((folder) => folderPaths.includes(folder.path)) : available;
  if (chosen.length === 0) throw new OrderConflictError("Не выбрано ни одной папки");

  const now = new Date().toISOString();
  const state: HistoryImportState = {
    status: "running",
    since: historySince(new Date()).toISOString(),
    folders: chosen.map((folder) => ({
      path: folder.path,
      name: folder.name,
      direction: folder.direction,
      total: 0,
      processed: 0,
      lastUid: 0,
      done: false,
    })),
    imported: 0,
    linkedToCustomers: 0,
    duplicates: 0,
    skipped: 0,
    relinked: 0,
    startedAt: now,
    updatedAt: now,
    finishedAt: null,
    error: null,
  };
  await writeState(state);
  launch(state);
  return state;
}

/**
 * Продолжить прерванный импорт с того же места. Кнопкой — после сбоя (сеть, почтовый
 * сервер); при старте сервера (`onlyInterrupted`) — только оборванный перезапуском,
 * то есть тот, что остался в состоянии «идёт»: выкат посреди импорта его не теряет.
 */
export async function resumeHistoryImport(onlyInterrupted = false): Promise<HistoryImportState | null> {
  if (historyImportRunning()) return readHistoryImport();
  const state = await readHistoryImport();
  if (!state || state.status === "done") return state;
  if (onlyInterrupted && state.status !== "running") return state;
  state.status = "running";
  state.error = null;
  await writeState(state);
  launch(state);
  return state;
}

/** Дата письма: из конверта, иначе когда оно легло в ящик; негодная — null. */
function letterDate(...values: (Date | string | undefined)[]): Date | null {
  for (const value of values) {
    if (!value) continue;
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return null;
}

async function readStream(stream: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function run(state: HistoryImportState): Promise<void> {
  const connection = await resolveMailbox();
  if (!connection) {
    state.status = "failed";
    state.error = "Ящик не настроен";
    await writeState(state);
    return;
  }

  const customerEmails = new Set(
    (await db.customer.findMany({ where: { email: { not: null } }, select: { email: true } }))
      .map((row) => normalizeEmailAddress(row.email))
      .filter((address): address is string => address !== null),
  );
  const own = new Set(
    [normalizeEmailAddress(connection.user), normalizeEmailAddress(await senderAddress())].filter(
      (address): address is string => address !== null,
    ),
  );
  const importedAt = new Date();
  const since = new Date(state.since);

  const client = createClient(connection);
  try {
    await client.connect();
    for (const folder of state.folders.filter((item) => !item.done)) {
      const lock = await client.getMailboxLock(folder.path, { readOnly: true });
      try {
        const found = await client.search({ since }, { uid: true });
        const uids = (found || []).filter((uid) => uid > folder.lastUid).sort((a, b) => a - b);
        if (folder.processed === 0) folder.total = uids.length;

        for (let i = 0; i < uids.length; i += BATCH) {
          // Сначала все заголовки пачки, потом скачивание текстов: внутри fetch
          // imapflow не даёт отправлять другие команды
          const batch = uids.slice(i, i + BATCH);
          const messages = [];
          for await (const message of client.fetch(
            batch.join(","),
            {
              uid: true,
              envelope: true,
              bodyStructure: true,
              internalDate: true,
              headers: ["references", "in-reply-to"],
            },
            { uid: true },
          )) {
            messages.push(message);
          }
          messages.sort((a, b) => a.uid - b.uid);

          for (const message of messages) {
            const envelope = message.envelope;
            const addresses = envelope ? counterparts(folder.direction, envelope) : [];
            const sender = envelope?.from?.[0];
            const fromEmail = normalizeEmailAddress(sender?.address);

            // Входящее от самих себя — копии и уведомления сайта, не переписка
            const fromOurselves = folder.direction === "INBOUND" && fromEmail !== null && own.has(fromEmail);
            if (!envelope || !fromEmail || fromOurselves || !isClientLetter(addresses, customerEmails, own)) {
              state.skipped++;
            } else {
              const parts = message.bodyStructure
                ? letterParts(message.bodyStructure)
                : { text: null, attachments: [] };
              let body = "";
              if (parts.text) {
                const { content } = await client.download(String(message.uid), parts.text.part, {
                  uid: true,
                  maxBytes: MAX_TEXT_BYTES,
                });
                body = await readStream(content);
                if (parts.text.html) body = htmlToText(body);
              }
              const rawHeaders = message.headers?.toString("utf8") ?? "";
              const letter: HistoryLetter = {
                direction: folder.direction,
                messageId: envelope.messageId ?? null,
                references: referencedMessageIds(
                  headerValue(rawHeaders, "In-Reply-To"),
                  headerValue(rawHeaders, "References"),
                ),
                fromEmail,
                fromName: sender?.name || null,
                toEmails: (envelope.to ?? [])
                  .map((item) => normalizeEmailAddress(item.address))
                  .filter((address): address is string => address !== null),
                subject: envelope.subject || "(без темы)",
                body: body.trim(),
                date: letterDate(envelope.date, message.internalDate) ?? importedAt,
                counterparts: addresses,
                attachments: parts.attachments,
              };
              const result = await storeHistoryEmail(letter, importedAt);
              if (result.status === "duplicate") state.duplicates++;
              else {
                state.imported++;
                if (result.linkedToCustomer) state.linkedToCustomers++;
              }
            }
            folder.processed++;
            folder.lastUid = message.uid;
          }
          await writeState(state);
        }
        folder.done = true;
        await writeState(state);
      } finally {
        lock.release();
      }
    }
    await client.logout().catch(() => client.close());

    state.relinked = await relinkHistoryThreads();
    state.status = "done";
    state.finishedAt = new Date().toISOString();
    await writeState(state);
    console.log(
      `[mail] Импорт истории закончен: писем ${state.imported}, с клиентом ${state.linkedToCustomers + state.relinked}`,
    );
  } catch (error) {
    client.close();
    state.status = "failed";
    state.error = error instanceof Error ? error.message : String(error);
    await writeState(state);
    console.error(`[mail] Импорт истории прерван: ${state.error}`);
  }
}
