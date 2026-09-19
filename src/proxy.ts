import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Быстрая проверка «есть ли cookie сессии» до рендера страницы (PRD, M8).
 * Настоящая проверка сессии, роли и `isActive` — на сервере в `requireUser`:
 * proxy работает в отдельной среде и к БД не ходит.
 */
export function proxy(request: NextRequest) {
  if (getSessionCookie(request)) return NextResponse.next();

  const loginUrl = new URL("/login", request.url);
  const { pathname, search } = request.nextUrl;
  // Куда вернуть после входа — всё, кроме самой страницы входа.
  if (pathname !== "/") loginUrl.searchParams.set("next", `${pathname}${search}`);

  return NextResponse.redirect(loginUrl);
}

export const config = {
  /**
   * Под защитой всё, кроме: `/login`, страниц восстановления пароля,
   * `/api/auth/*` (сам вход), `/api/integrations/*` (вебхуки сайта, своя подпись HMAC)
   * и статики Next.
   */
  matcher: [
    "/((?!login|forgot-password|reset-password|api/auth|api/integrations|_next/static|_next/image|favicon.ico).*)",
  ],
};
