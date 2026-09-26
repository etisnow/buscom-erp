import "server-only";
import { notificationAddress } from "@buscom/domain/user/settings";
import { db } from "@/server/db";
import { sendLetter } from "@/server/mail";

/** Попыток на письмо: дальше оно остаётся в таблице с последней ошибкой. */
export const MAX_ATTEMPTS = 5;
/** Взятое в работу, но не отправленное за это время письмо считается брошенным. */
const CLAIM_TIMEOUT_MS = 10 * 60_000;
const BATCH = 50;
/** Пауза перед отправкой после хука — чтобы транзакция с письмом успела закоммититься. */
const DISPATCH_DELAY_MS = 1_000;
const RETRY_SECONDS = 60;

export type DispatchSummary = { sent: number; failed: number };

/**
 * Отправляет письма из очереди. Каждое письмо сначала «забирается»
 * условным UPDATE — так его не отправят дважды ни два прохода одного процесса,
 * ни два сервера на одной базе (dev-база общая для двух машин).
 * Ошибка одного письма не мешает остальным: оно получает попытку и ошибку,
 * и следующий проход по таймеру попробует снова.
 */
export async function dispatchNotifications(now: Date = new Date()): Promise<DispatchSummary> {
  const staleClaim = new Date(now.getTime() - CLAIM_TIMEOUT_MS);
  const available = {
    sentAt: null,
    attempts: { lt: MAX_ATTEMPTS },
    OR: [{ claimedAt: null }, { claimedAt: { lt: staleClaim } }],
  };

  const pending = await db.notification.findMany({
    where: available,
    orderBy: { createdAt: "asc" },
    take: BATCH,
    select: { id: true },
  });

  const summary: DispatchSummary = { sent: 0, failed: 0 };
  for (const { id } of pending) {
    const claimed = await db.notification.updateMany({ where: { id, ...available }, data: { claimedAt: new Date() } });
    if (claimed.count === 0) continue;

    const notification = await db.notification.findUniqueOrThrow({
      where: { id },
      select: { subject: true, text: true, user: { select: { email: true, notificationEmail: true } } },
    });

    try {
      await sendLetter({
        to: notificationAddress(notification.user),
        subject: notification.subject,
        text: notification.text,
      });
      await db.notification.update({ where: { id }, data: { sentAt: new Date(), lastError: null } });
      summary.sent++;
    } catch (error) {
      await db.notification.update({
        where: { id },
        data: {
          claimedAt: null,
          attempts: { increment: 1 },
          lastError: error instanceof Error ? error.message : String(error),
        },
      });
      summary.failed++;
    }
  }
  return summary;
}

async function runDispatch(): Promise<void> {
  try {
    const summary = await dispatchNotifications();
    if (summary.failed) console.error(`[notify] Не отправлено писем: ${summary.failed}, повторим позже`);
  } catch (error) {
    console.error(`[notify] Очередь уведомлений недоступна: ${error instanceof Error ? error.message : error}`);
  }
}

const globalForNotify = globalThis as unknown as {
  notifyTimer?: ReturnType<typeof setInterval>;
  notifyScheduled?: ReturnType<typeof setTimeout>;
};

/**
 * Отправить очередь вскоре после хука. Хук работает внутри транзакции и не знает,
 * когда она закоммитится, поэтому отправка — с паузой; не успевшее письмо
 * заберёт проход по таймеру. Несколько хуков подряд дают один проход.
 */
export function scheduleDispatch(): void {
  if (globalForNotify.notifyScheduled) return;
  globalForNotify.notifyScheduled = setTimeout(() => {
    globalForNotify.notifyScheduled = undefined;
    void runDispatch();
  }, DISPATCH_DELAY_MS);
}

/** Повторные попытки и подхват пропущенного — таймер из `src/instrumentation.ts`. */
export function startNotificationDispatch(): void {
  if (globalForNotify.notifyTimer) clearInterval(globalForNotify.notifyTimer);
  globalForNotify.notifyTimer = setInterval(() => void runDispatch(), RETRY_SECONDS * 1000);
  void runDispatch();
}
