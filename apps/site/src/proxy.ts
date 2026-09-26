import { NextResponse, type NextRequest } from "next/server";
import { redirectKeys, redirectLocation } from "@buscom/domain/site/redirects";
import { siteEnv } from "@/env";
import { redirectTable } from "@/server/redirects";

/**
 * Каждый запрос сначала сверяется с таблицей старых адресов (`UrlRedirect`):
 * 301 на товар, категорию или главную, 410 — на убранный насовсем. Код 301
 * ставим сами — `permanentRedirect` в страницах отдал бы 308, а в PRD обещан 301.
 *
 * Пока сайт закрыт от поисковиков (`SITE_INDEXING` не `true`), ответы несут
 * `X-Robots-Tag: noindex`. Заголовок ставится во время запроса: `headers()` из
 * next.config считается при сборке, а индексацию переключают без пересборки.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const noindex = !siteEnv().SITE_INDEXING;

  // http → https кодом 301: перенаправление в панели Джино отвечает 302, а поиску
  // нужен постоянный переезд. Прокси хостинга сообщает исходную схему в X-Forwarded-Proto
  if (request.headers.get("x-forwarded-proto") === "http") {
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    if (host && !/^(localhost|127\.0\.0\.1)(:|$)/.test(host)) {
      return NextResponse.redirect(`https://${host}${pathname}${search}`, 301);
    }
  }

  const keys = redirectKeys(pathname, search);
  if (keys.length > 0 && pathname !== "/") {
    const table = await redirectTable();
    const target = keys.map((key) => table.get(key)).find(Boolean);
    if (target?.statusCode === 410) {
      return new NextResponse("Страница удалена", {
        status: 410,
        headers: { "Content-Type": "text/plain; charset=utf-8", ...(noindex ? { "X-Robots-Tag": "noindex" } : {}) },
      });
    }
    if (target) {
      const url = request.nextUrl.clone();
      url.pathname = redirectLocation(target);
      url.search = "";
      return NextResponse.redirect(url, 301);
    }
  }

  const response = NextResponse.next();
  if (noindex) response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

export const config = {
  // Статика сборки и картинки товаров — не старые адреса и не страницы
  matcher: ["/((?!_next/static|_next/image|img/|favicon.ico|robots.txt|sitemap.xml).*)"],
};
