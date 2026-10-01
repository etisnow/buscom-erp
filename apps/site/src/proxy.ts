import { NextResponse, type NextRequest } from "next/server";
import { canonicalOrigin, fallbackLocation, redirectKeys, redirectLocation } from "@buscom/domain/site/redirects";
import { siteEnv } from "@/env";
import { redirectData } from "@/server/redirects";

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

  // http → https и www → без www кодом 301 (canonicalOrigin). Прокси хостинга сообщает
  // исходную схему в X-Forwarded-Proto; переключатель «только HTTPS» в панели Джино отвечает 302
  const origin = canonicalOrigin(
    request.headers.get("x-forwarded-proto"),
    request.headers.get("x-forwarded-host") ?? request.headers.get("host"),
  );
  if (origin) return NextResponse.redirect(`${origin}${pathname}${search}`, 301);

  const keys = redirectKeys(pathname, search);
  if (pathname !== "/") {
    const { table, slugs } = await redirectData();
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
    // Адреса из индекса, которых не было в карте старого сайта: «раздел/товар»,
    // поиск и служебные `index.php` (docs/SEO-SEMANTICS.md, «Что нашёл замер»)
    const fallback = fallbackLocation(
      pathname,
      search,
      (slug) => slugs.has(slug),
      (key) => {
        const found = table.get(key);
        return found && found.statusCode === 301 ? redirectLocation(found) : null;
      },
    );
    if (fallback) return NextResponse.redirect(new URL(fallback, request.nextUrl), 301);
  }

  const response = NextResponse.next();
  if (noindex) response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

export const config = {
  // Статика сборки, картинки товаров и логотип для писем (public/mail) — не старые адреса и не страницы
  matcher: ["/((?!_next/static|_next/image|img/|mail/|favicon.ico|icon.png|apple-icon.png|robots.txt|sitemap.xml).*)"],
};
