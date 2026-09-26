import { pluralize } from "../money-words";

/**
 * Блокировка входа после серии неудачных попыток.
 *
 * PRD, M8: «после 10 неудачных попыток за 15 мин — блокировка входа на 15 мин».
 * Считаются именно неудачные попытки и по конкретному email — встроенный лимитер
 * Better Auth считает все запросы с адреса и остаётся только защитой от флуда.
 *
 * Здесь чистая арифметика по меткам времени; хранение — `src/server/auth/login-attempts.ts`.
 */

/** Сколько неудачных попыток подряд допустимо в окне. */
export const FAILED_LOGIN_LIMIT = 10;

/** Окно подсчёта и оно же длительность блокировки — по PRD совпадают. */
export const FAILED_LOGIN_WINDOW_MINUTES = 15;

const MINUTE_MS = 60_000;

export type LoginThrottleState =
  { blocked: false; attemptsLeft: number } | { blocked: true; until: Date; minutesLeft: number };

/**
 * Состояние по меткам времени неудачных попыток. Порядок меток не важен.
 *
 * Блокировка снимается, когда десятая с конца попытка выходит из окна: пока в
 * последних 15 минутах их 10 и больше, вход закрыт.
 */
export function evaluateFailedLogins(failedAt: Date[], now: Date): LoginThrottleState {
  const windowStart = now.getTime() - FAILED_LOGIN_WINDOW_MINUTES * MINUTE_MS;

  const recent = failedAt
    .map((at) => at.getTime())
    .filter((at) => at > windowStart)
    .sort((a, b) => b - a);

  if (recent.length < FAILED_LOGIN_LIMIT) {
    return { blocked: false, attemptsLeft: FAILED_LOGIN_LIMIT - recent.length };
  }

  const oldestCounted = recent[FAILED_LOGIN_LIMIT - 1];
  const until = new Date(oldestCounted + FAILED_LOGIN_WINDOW_MINUTES * MINUTE_MS);
  const minutesLeft = Math.max(1, Math.ceil((until.getTime() - now.getTime()) / MINUTE_MS));

  return { blocked: true, until, minutesLeft };
}

/** Текст для формы входа. Причину блокировки не раскрываем сверх необходимого. */
export function loginBlockedMessage(minutesLeft: number): string {
  const word = pluralize(minutesLeft, ["минуту", "минуты", "минут"]);
  return `Слишком много неудачных попыток входа. Попробуйте через ${minutesLeft} ${word}.`;
}
