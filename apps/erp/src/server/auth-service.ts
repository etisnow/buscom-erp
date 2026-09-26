import "server-only";
import { APIError } from "better-auth/api";
import { loginBlockedMessage } from "@/domain/auth/login-throttle";
import { auth } from "@/server/auth";
import { clearFailedLogins, loginThrottleState, recordFailedLogin } from "@/server/auth/login-attempts";
import { db } from "@/server/db";

export type SignInResult = { ok: true } | { ok: false; message: string };

/** Адрес клиента для журнала неудачных попыток. За прокси хостинга — из X-Forwarded-For. */
function clientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return headers.get("x-real-ip");
}

/**
 * Вход по email и паролю. Cookie сессии ставит плагин `nextCookies`,
 * поэтому вызывать только из Server Action или route handler.
 */
export async function signInWithPassword(input: {
  email: string;
  password: string;
  headers: Headers;
}): Promise<SignInResult> {
  // Better Auth хранит email в нижнем регистре.
  const email = input.email.trim().toLowerCase();

  // PRD, M8: 10 неудачных попыток за 15 минут закрывают вход по этому email на 15 минут.
  const throttle = await loginThrottleState(email);
  if (throttle.blocked) {
    return { ok: false, message: loginBlockedMessage(throttle.minutesLeft) };
  }

  // Деактивированного пользователя не пускаем даже с верным паролем (PRD, M8).
  const existing = await db.user.findUnique({ where: { email }, select: { isActive: true } });
  if (existing && !existing.isActive) {
    return { ok: false, message: "Учётная запись отключена. Обратитесь к администратору." };
  }

  try {
    await auth.api.signInEmail({
      body: { email, password: input.password },
      headers: input.headers,
    });
  } catch (error) {
    if (error instanceof APIError) {
      // 429 — сработала защита от флуда в Better Auth (лимит запросов с адреса).
      if (error.status === "TOO_MANY_REQUESTS") {
        return { ok: false, message: "Слишком много запросов. Попробуйте через 15 минут." };
      }

      // Пароль реально проверялся и не подошёл — это неудачная попытка по смыслу PRD.
      await recordFailedLogin(email, clientIp(input.headers));
      const afterFailure = await loginThrottleState(email);
      if (afterFailure.blocked) {
        return { ok: false, message: loginBlockedMessage(afterFailure.minutesLeft) };
      }

      // Существование учётной записи не раскрываем — сообщение одно на все случаи.
      return { ok: false, message: "Неверный email или пароль" };
    }
    throw error;
  }

  await clearFailedLogins(email);
  return { ok: true };
}

export async function signOutCurrentSession(headers: Headers): Promise<void> {
  await auth.api.signOut({ headers });
}
