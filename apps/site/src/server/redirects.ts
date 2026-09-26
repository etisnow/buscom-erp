import "server-only";
import type { RedirectTarget } from "@buscom/domain/site/redirects";
import { db } from "@/server/db";

/**
 * Таблица переадресаций старого сайта в памяти процесса (~500 строк): proxy.ts
 * смотрит в неё на каждый запрос, в базу — раз в TTL. Кеш Next здесь не годится:
 * proxy выполняется до рендера, вне его контекста.
 */
const TTL_MS = 5 * 60 * 1000;

let cache: { table: Map<string, RedirectTarget>; loadedAt: number } | null = null;
let loading: Promise<Map<string, RedirectTarget>> | null = null;

async function load(): Promise<Map<string, RedirectTarget>> {
  const rows = await db.urlRedirect.findMany({
    select: {
      fromPath: true,
      statusCode: true,
      toPath: true,
      product: { select: { slug: true } },
      category: { select: { slug: true } },
    },
  });
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
  return table;
}

export async function redirectTable(): Promise<Map<string, RedirectTarget>> {
  if (cache && Date.now() - cache.loadedAt < TTL_MS) return cache.table;
  // Параллельные запросы ждут одну загрузку, а не шлют десяток одинаковых
  loading ??= load()
    .then((table) => {
      cache = { table, loadedAt: Date.now() };
      return table;
    })
    .finally(() => {
      loading = null;
    });
  try {
    return await loading;
  } catch (error) {
    // База недоступна — работаем со старой таблицей, если она есть: переадресации
    // не должны падать вместе с соединением
    if (cache) return cache.table;
    throw error;
  }
}
