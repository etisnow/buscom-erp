/**
 * Память фильтров списка заказов.
 *
 * Лежит в cookie, а не в `localStorage`, ради одной вещи: подставить фильтры
 * должен сервер — до того, как страница отрисуется. Клиентское восстановление
 * (эффект + `router.replace`) давало заметное мигание: список успевал показаться
 * без фильтров и только потом перерисовывался с ними.
 *
 * Cookie пишет и чистит браузер (`src/components/orders/order-filters.tsx`),
 * сервер её только читает — поэтому без `httpOnly`.
 */
import { z } from "zod";

export const SAVED_FILTERS_COOKIE = "buscom_orders_filters";

/** Три месяца: набор фильтров — вещь недолговечная, но и не на одну сессию. */
export const SAVED_FILTERS_MAX_AGE = 60 * 60 * 24 * 90;

/**
 * Что разрешено восстанавливать. Cookie приходит от браузера, то есть снаружи:
 * без белого списка в адрес попало бы что угодно, а сама строка идёт в редирект.
 * `page` намеренно не в списке — возвращать нужно к фильтрам, а не к седьмой
 * странице недельной давности.
 */
const ALLOWED_KEYS = ["view", "q", "status", "manager", "source", "from", "to", "payment"] as const;

/** Длина с большим запасом: нормальный набор — десятки символов, не тысячи. */
const MAX_LENGTH = 1024;

const cookieSchema = z.string().max(MAX_LENGTH);

/**
 * Разбирает cookie в безопасную строку запроса: только известные ключи, значения
 * перекодированы через `URLSearchParams`. Нечего восстанавливать — `null`.
 */
export function parseSavedFilters(raw: string | undefined): string | null {
  if (!raw) return null;

  const decoded = decodeURIComponent(raw);
  if (!cookieSchema.safeParse(decoded).success) return null;

  const source = new URLSearchParams(decoded);
  const safe = new URLSearchParams();
  for (const key of ALLOWED_KEYS) {
    for (const value of source.getAll(key)) {
      if (value.length > 0) safe.append(key, value);
    }
  }

  const result = safe.toString();
  return result.length > 0 ? result : null;
}
