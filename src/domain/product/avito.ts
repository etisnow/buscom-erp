/**
 * Цена товара со страницы объявления на avito.ru.
 *
 * Разбор — по разметке страницы, официального API у Авито для этого нет.
 * Отсюда главное свойство: способ хрупкий. Вёрстка меняется без предупреждения,
 * и однажды разбор перестанет находить цену. Поэтому здесь несколько независимых
 * признаков подряд, а неудача — обычный результат, а не исключение: кнопка
 * «Подтянуть цену» должна сказать «не нашёл», а не сломать карточку товара.
 *
 * Функции чистые: сеть — в `src/server/products/avito-price.ts`.
 */
import type { Kopecks } from "@/domain/money";

/** Цена в объявлении — целые рубли; копеек Авито не показывает. */
const MAX_REASONABLE_RUBLES = 100_000_000;

/**
 * Признаки цены, от самого надёжного к запасным:
 * 1. микроразметка `itemprop="price"` — её Авито отдаёт для поисковиков;
 * 2. `data-marker="item-view/item-price"` — служебный атрибут их собственной вёрстки;
 * 3. цена внутри JSON, который страница везёт для гидратации.
 */
const PATTERNS: RegExp[] = [
  /<meta[^>]+itemprop=["']price["'][^>]+content=["']([\d\s.,]+)["']/i,
  /<meta[^>]+content=["']([\d\s.,]+)["'][^>]+itemprop=["']price["']/i,
  /data-marker=["']item-view\/item-price["'][^>]*content=["']([\d\s.,]+)["']/i,
  /content=["']([\d\s.,]+)["'][^>]*data-marker=["']item-view\/item-price["']/i,
  /"priceDetailed"\s*:\s*\{[^}]*?"value"\s*:\s*(\d+)/i,
  /"price"\s*:\s*\{[^}]*?"value"\s*:\s*(\d+)/i,
];

/** «1 234 567», «1234.00», «1 234,00» → 1234567 копеек и т.д. */
function toKopecks(raw: string): Kopecks | null {
  // Пробелы внутри числа — разделители разрядов, в том числе неразрывные
  const cleaned = raw.replace(/[\s  ]/g, "").replace(",", ".");
  const rubles = Number(cleaned);
  if (!Number.isFinite(rubles) || rubles <= 0 || rubles > MAX_REASONABLE_RUBLES) return null;

  return Math.round(rubles * 100);
}

/** Цена со страницы объявления. Не нашли или значение бессмысленное — `null`. */
export function parseAvitoPrice(html: string): Kopecks | null {
  for (const pattern of PATTERNS) {
    const match = pattern.exec(html);
    if (!match) continue;

    const kopecks = toKopecks(match[1]);
    if (kopecks !== null) return kopecks;
  }

  return null;
}

/**
 * Ссылка ведёт на объявление Авито? Проверяется именно хост, а не вхождение
 * строки: `avito.ru.zloy.site` не должен сойти за Авито.
 */
export function isAvitoUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return false;

  const host = url.hostname.toLowerCase();
  return host === "avito.ru" || host.endsWith(".avito.ru");
}
