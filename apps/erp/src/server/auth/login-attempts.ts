import "server-only";
import {
  evaluateFailedLogins,
  FAILED_LOGIN_WINDOW_MINUTES,
  type LoginThrottleState,
} from "@buscom/domain/auth/login-throttle";
import { db } from "@/server/db";

/**
 * Счётчик неудачных попыток входа (PRD, M8).
 *
 * Правило считает домен (`packages/domain/src/auth/login-throttle.ts`), здесь только хранение:
 * строка на каждую неудачу, успешный вход их стирает. Ключ — email, потому что PRD
 * ограничивает подбор пароля к учётной записи; лимитер Better Auth по адресу
 * остаётся защитой от флуда.
 */

const MINUTE_MS = 60_000;

function windowStart(now: Date): Date {
  return new Date(now.getTime() - FAILED_LOGIN_WINDOW_MINUTES * MINUTE_MS);
}

/** Закрыт ли вход для этого email прямо сейчас. */
export async function loginThrottleState(email: string, now = new Date()): Promise<LoginThrottleState> {
  const rows = await db.failedLogin.findMany({
    where: { email, createdAt: { gt: windowStart(now) } },
    select: { createdAt: true },
  });

  return evaluateFailedLogins(
    rows.map((row) => row.createdAt),
    now,
  );
}

/**
 * Записать неудачу. Зовётся только после реальной проверки пароля: пока вход
 * заблокирован, попытки не пишутся, иначе перебор продлевал бы блокировку сам себе.
 *
 * Заодно чистит устаревшие строки по всем адресам — отдельный крон ради одной
 * маленькой таблицы не нужен, а перебор по разным email иначе копил бы мусор.
 */
export async function recordFailedLogin(email: string, ipAddress: string | null, now = new Date()): Promise<void> {
  await db.$transaction([
    db.failedLogin.create({ data: { email, ipAddress, createdAt: now } }),
    db.failedLogin.deleteMany({ where: { createdAt: { lte: windowStart(now) } } }),
  ]);
}

/** Успешный вход обнуляет счётчик. */
export async function clearFailedLogins(email: string): Promise<void> {
  await db.failedLogin.deleteMany({ where: { email } });
}
