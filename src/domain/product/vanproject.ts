/**
 * Цена товара со страницы каталога vanproject.ru (поставщик «Фургон Проект»).
 *
 * Сайт на MODX с miniShop2 и плагином msOptionsPrice: цена карточки лежит в
 * `<span class="msoptionsprice-cost msoptionsprice-<id>">330</span>`. Разбор по
 * вёрстке, как и у Авито: сменят шаблон — перестанет находить, и это обычный
 * результат `null`, а не исключение.
 *
 * Функции чистые: сеть — в `src/server/products/supplier-price.ts`.
 */
import type { Kopecks } from "@/domain/money";
import { priceTextToKopecks, urlHasHost } from "@/domain/product/price-page";

/**
 * Класс `msoptionsprice-cost` целиком: старая цена при скидке идёт в
 * `msoptionsprice-old_cost`, и её брать нельзя.
 */
const COST_PATTERN = /class=["'](?:[^"']*\s)?msoptionsprice-cost(?:\s[^"']*)?["'][^>]*>\s*([^<]+?)\s*</i;

/** Цена со страницы товара. Не нашли или значение бессмысленное — `null`. */
export function parseVanprojectPrice(html: string): Kopecks | null {
  const match = COST_PATTERN.exec(html);
  return match ? priceTextToKopecks(match[1]) : null;
}

export function isVanprojectUrl(value: string): boolean {
  return urlHasHost(value, "vanproject.ru");
}
