import "server-only";
import { headers } from "next/headers";
import { forbidden, redirect } from "next/navigation";
import { cache } from "react";
import type { UserRole } from "@buscom/db/enums";
import { auth } from "@/server/auth";
import { ForbiddenError } from "@/server/errors";

export { ForbiddenError };

/** Пользователь текущей сессии в том виде, в каком его используют экраны и сервисы. */
export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
};

/**
 * Текущий пользователь или null. `cache` — один запрос к БД на HTTP-запрос,
 * сколько бы компонентов ни спросило сессию.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const { id, name, email, role, isActive } = session.user;
  // Деактивированный пользователь не работает в системе даже с живой сессией (PRD, M8).
  if (!isActive) return null;

  return { id, name, email, role: role as UserRole, isActive };
});

/**
 * Пользователь для Server Action, route handler или сервиса.
 * Без сессии — редирект на `/login`; с недостаточной ролью — `ForbiddenError`,
 * который вызывающий превращает в 403 или в сообщение об ошибке.
 */
export async function requireUser(roles?: UserRole[]): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (roles && !roles.includes(user.role)) throw new ForbiddenError();
  return user;
}

/**
 * Пользователь для страницы (`page.tsx`).
 * Без сессии — редирект на `/login`; с недостаточной ролью — `forbidden()`,
 * то есть экран 403 из `src/app/(app)/forbidden.tsx` и статус 403.
 *
 * В Server Action `forbidden()` не годится: там ошибку ловят и показывают тостом,
 * а `try/catch` глушит этот интеррапт — для действий остаётся `requireUser`.
 */
export async function requirePageUser(roles?: UserRole[]): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (roles && !roles.includes(user.role)) forbidden();
  return user;
}
