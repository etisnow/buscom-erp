import { NextResponse } from "next/server";
import { siteEnv } from "@/env";

/**
 * Пока сайт закрыт от поисковиков (`SITE_INDEXING` не `true`), каждый ответ
 * несёт `X-Robots-Tag: noindex`. Заголовок ставится здесь, во время запроса:
 * `headers()` из next.config считается при сборке, а переключают индексацию
 * переменной окружения без пересборки образа.
 */
export function proxy() {
  const response = NextResponse.next();
  if (!siteEnv().SITE_INDEXING) response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

export const config = {
  // Статика сборки заголовок не требует — на неё робот сам по себе не приходит
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
