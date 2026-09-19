import "server-only";
import { APIError } from "better-auth/api";
import { auth } from "@/server/auth";
import { db } from "@/server/db";

export type SignInResult = { ok: true } | { ok: false; message: string };

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
      // 429 — сработал лимит попыток подбора пароля.
      if (error.status === "TOO_MANY_REQUESTS") {
        return { ok: false, message: "Слишком много попыток входа. Попробуйте через 15 минут." };
      }
      // Существование учётной записи не раскрываем — сообщение одно на все случаи.
      return { ok: false, message: "Неверный email или пароль" };
    }
    throw error;
  }

  return { ok: true };
}

export async function signOutCurrentSession(headers: Headers): Promise<void> {
  await auth.api.signOut({ headers });
}
