/**
 * Цена товара со страницы объявления на avito.ru.
 *
 * Разбор — по разметке страницы, официального API у Авито для этого нет.
 * Отсюда главное свойство: способ хрупкий. Вёрстка меняется без предупреждения,
 * и однажды разбор перестанет находить цену. Поэтому здесь несколько независимых
 * признаков подряд, а неудача — обычный результат, а не исключение: кнопка
 * «Подтянуть цену» должна сказать «не нашёл», а не сломать карточку товара.
 *
 * Функции чистые: сеть — в `src/server/products/supplier-price.ts`.
 */
import type { Kopecks } from "../money";
import { priceTextToKopecks, urlHasHost } from "./price-page";

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

/** Цена со страницы объявления. Не нашли или значение бессмысленное — `null`. */
export function parseAvitoPrice(html: string): Kopecks | null {
  for (const pattern of PATTERNS) {
    const match = pattern.exec(html);
    if (!match) continue;

    const kopecks = priceTextToKopecks(match[1]);
    if (kopecks !== null) return kopecks;
  }

  return null;
}

export function isAvitoUrl(value: string): boolean {
  return urlHasHost(value, "avito.ru");
}
