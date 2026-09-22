import "server-only";
import { db } from "@/server/db";

/**
 * ID клиентов, чьё имя содержит запрос без учёта регистра.
 *
 * Не через Prisma `mode: "insensitive"` (это `ILIKE`): у базы (dev и, судя по
 * всему, боевая — создавались одним скриптом) кодировка `SQL_ASCII` с локалью
 * `C` — Postgres не умеет сворачивать регистр не-ASCII букв, `lower('БАСКОМ')`
 * возвращает «БАСКОМ» как есть, и «баском» не находил «БАСКОМ» (проверено
 * прямым запросом к dev-базе 22.09.2026). У JS с этим проблем нет — сравниваем
 * в приложении. Настоящее решение — пересоздать базу с кодировкой UTF8 и
 * локалью `ru_RU.UTF-8`, это dump/restore с простоем, отдельная задача.
 *
 * Тянет имена всех клиентов на каждый поисковый запрос с буквами — при
 * нескольких тысячах строк это доли секунды. Если клиентов станет на порядок
 * больше и это станет заметно, дешевле завести колонку `nameLower`
 * (поддерживать при create/update) с индексом, чем терпеть полный перебор.
 */
export async function matchNamesCaseInsensitive(query: string): Promise<string[]> {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];

  const rows = await db.customer.findMany({ select: { id: true, name: true } });
  return rows.filter((row) => row.name.toLowerCase().includes(needle)).map((row) => row.id);
}

/** Запрос содержит хоть одну букву — цифрами набранный номер/ИНН искать по имени незачем. */
export function hasLetters(value: string): boolean {
  return /\p{L}/u.test(value);
}
