import "server-only";
import { db } from "@/server/db";

/**
 * ID товаров, у которых артикул, название или одна из совместимых моделей
 * содержит запрос без учёта регистра.
 *
 * Не через Prisma `mode: "insensitive"` (это `ILIKE`): база в кодировке
 * `SQL_ASCII` с локалью `C`, и Postgres не сворачивает регистр кириллицы —
 * «сиденье» не находило «Сиденье». Та же причина и тот же обход, что у клиентов
 * (`src/server/customers/name-match.ts`, docs/DECISIONS.md). Товаров сотни —
 * перебор в приложении на каждый запрос занимает миллисекунды.
 */
export async function matchProductsCaseInsensitive(query: string, onlyActive = false): Promise<string[]> {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];

  const rows = await db.product.findMany({
    where: onlyActive ? { isActive: true } : undefined,
    select: { id: true, sku: true, name: true, compatibility: true },
  });
  return rows
    .filter(
      (row) =>
        row.sku.toLowerCase().includes(needle) ||
        row.name.toLowerCase().includes(needle) ||
        row.compatibility.some((model) => model.toLowerCase().includes(needle)),
    )
    .map((row) => row.id);
}
