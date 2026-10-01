/**
 * Переадресация старых адресов на новом сайте (`UrlRedirect`, docs/DECISIONS.md
 * от 26.09.2026). Ключ таблицы — путь в виде `oldPath` из снимка: раскодированный,
 * без хвостового слэша, со строкой запроса только у `index.php`.
 */

export type RedirectTarget =
  | { statusCode: 410 }
  | { statusCode: 301; productSlug: string | null; categorySlug: string | null; toPath: string | null };

/**
 * Ключи, по которым искать входящий адрес, от точного к общему. Строка запроса
 * у обычных путей отбрасывается: `/polki?limit=25` — тот же адрес категории.
 * У `index.php` запрос и есть адрес: берём из него `product_id`, порядок и
 * лишние параметры роли не играют.
 */
export function redirectKeys(pathname: string, search: string): string[] {
  let path: string;
  try {
    path = decodeURIComponent(pathname);
  } catch {
    path = pathname;
  }
  if (path.length > 1) path = path.replace(/\/+$/, "");

  if (path.toLowerCase() === "/index.php") {
    const params = new URLSearchParams(search);
    const productId = params.get("product_id");
    if (params.get("route") === "product/product" && productId && /^\d+$/.test(productId)) {
      return [`/index.php?route=product/product&product_id=${productId}`];
    }
    return [];
  }
  const lower = path.toLowerCase();
  return lower === path ? [path] : [path, lower];
}

/**
 * Куда вести: текущий слуг товара или категории, иначе `toPath`. Цель удалили
 * (ссылка обнулилась) — на главную: старый адрес не должен отдавать 404.
 */
export function redirectLocation(target: Exclude<RedirectTarget, { statusCode: 410 }>): string {
  if (target.productSlug) return `/${target.productSlug}`;
  if (target.categorySlug) return `/${target.categorySlug}`;
  return target.toPath ?? "/";
}

/** Первые сегменты собственных вложенных маршрутов нового сайта: их пути — не старые адреса */
const OWN_NESTED_ROOTS = new Set(["modeli", "img", "_next", "api"]);

/**
 * Куда вести старый адрес, которого нет в таблице переадресаций (снимок 01.10.2026:
 * 292 адреса из индекса Яндекса не попали в карту сайта, docs/SEO-SEMANTICS.md).
 * OpenCart открывал товар под любым разделом и отвечал на служебные `index.php`:
 *
 * - `index.php?route=product/search&search=…` — на наш поиск;
 * - старые карты сайта `index.php?route=feed/…` — на `/sitemap.xml`;
 * - прочие `index.php` (корзина, оформление, вход) — на корзину или главную;
 *   `product_id` сюда не доходит: его ключ ищется в таблице (`redirectKeys`);
 * - путь из нескольких сегментов — на самый глубокий сегмент, который сайт знает:
 *   слуг товара или категории (`isSlug`) либо старый адрес из таблицы (`lookup`).
 *   `/komplektuyshie-dlya-sidenij/podlokotnik-reguliruemiy-2` → `/podlokotnik-reguliruemiy-2`,
 *   а товар, которого больше нет, — на его раздел из того же пути.
 *
 * Однокомпонентный неизвестный путь остаётся 404: угадывать не из чего.
 */
export function fallbackLocation(
  pathname: string,
  search: string,
  isSlug: (slug: string) => boolean,
  lookup: (key: string) => string | null,
): string | null {
  let path: string;
  try {
    path = decodeURIComponent(pathname);
  } catch {
    path = pathname;
  }
  const segments = path.toLowerCase().split("/").filter(Boolean);

  if (segments.length === 1 && segments[0] === "index.php") {
    const params = new URLSearchParams(search);
    const route = params.get("route") ?? "";
    if (route === "product/product" && params.has("product_id")) return null;
    if (route === "product/search") {
      const query = params.get("search")?.trim();
      return query ? `/poisk?q=${encodeURIComponent(query)}` : "/poisk";
    }
    if (route === "checkout/cart") return "/korzina";
    // Карты сайта OpenCart (feed/google_sitemap, feed/yandex_sitemap, feed/imagemap) отправлены
    // в Search Console и Вебмастер — после переключения поисковики читают по ним нашу карту
    if (route.startsWith("feed/") && /sitemap|imagemap/.test(route)) return "/sitemap.xml";
    return "/";
  }

  if (segments.length < 2 || OWN_NESTED_ROOTS.has(segments[0])) return null;
  for (const segment of [...segments].reverse()) {
    if (isSlug(segment)) return `/${segment}`;
    const target = lookup(`/${segment}`);
    if (target) return target;
  }
  return null;
}
