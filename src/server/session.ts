import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { UserRole } from "@/generated/prisma/enums";
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
 * Пользователь для защищённого экрана или действия.
 * Без сессии — редирект на `/login`; с недостаточной ролью — `ForbiddenError` (403).
 */
export async function requireUser(roles?: UserRole[]): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (roles && !roles.includes(user.role)) throw new ForbiddenError();
  return user;
}
