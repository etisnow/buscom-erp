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
