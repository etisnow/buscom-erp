import "server-only";
import type { RedirectTarget } from "@buscom/domain/site/redirects";
import { db } from "@/server/db";

/**
 * Таблица переадресаций старого сайта в памяти процесса (~500 строк): proxy.ts
 * смотрит в неё на каждый запрос, в базу — раз в TTL. Кеш Next здесь не годится:
 * proxy выполняется до рендера, вне его контекста.
 *
 * `slugs` — слуги товаров и категорий для запасного правила (`fallbackLocation`):
 * старый путь «раздел/товар», которого нет в таблице, ведётся на товар.
 */
const TTL_MS = 5 * 60 * 1000;

export type RedirectData = { table: Map<string, RedirectTarget>; slugs: Set<string> };

let cache: (RedirectData & { loadedAt: number }) | null = null;
let loading: Promise<RedirectData> | null = null;

async function load(): Promise<RedirectData> {
  const [rows, products, categories] = await Promise.all([
    db.urlRedirect.findMany({
      select: {
        fromPath: true,
        statusCode: true,
        toPath: true,
        product: { select: { slug: true } },
        category: { select: { slug: true } },
      },
    }),
    db.product.findMany({ where: { slug: { not: null } }, select: { slug: true, externalId: true } }),
    db.productCategory.findMany({ where: { slug: { not: null } }, select: { slug: true } }),
  ]);
  const table = new Map<string, RedirectTarget>();
  for (const row of rows) {
    table.set(
      row.fromPath,
      row.statusCode === 410
        ? { statusCode: 410 }
        : {
            statusCode: 301,
            productSlug: row.product?.slug ?? null,
            categorySlug: row.category?.slug ?? null,
            toPath: row.toPath,
          },
    );
  }
  // `index.php?…product_id=N` вне таблицы (в карте сайта его не было, а в индексе есть) —
  // на товар с тем же номером OpenCart. Строки таблицы главнее
  for (const { externalId, slug } of products) {
    if (!externalId || !/^\d+$/.test(externalId)) continue;
    const key = `/index.php?route=product/product&product_id=${externalId}`;
    if (!table.has(key)) table.set(key, { statusCode: 301, productSlug: slug, categorySlug: null, toPath: null });
  }
  const slugs = new Set<string>();
  for (const item of [...products, ...categories]) if (item.slug) slugs.add(item.slug.toLowerCase());
  return { table, slugs };
}

export async function redirectData(): Promise<RedirectData> {
  if (cache && Date.now() - cache.loadedAt < TTL_MS) return cache;
  // Параллельные запросы ждут одну загрузку, а не шлют десяток одинаковых
  loading ??= load()
    .then((data) => {
      cache = { ...data, loadedAt: Date.now() };
      return data;
    })
    .finally(() => {
      loading = null;
    });
  try {
    return await loading;
  } catch (error) {
    // База недоступна — работаем со старой таблицей, если она есть: переадресации
    // не должны падать вместе с соединением
    if (cache) return cache;
    throw error;
  }
}
