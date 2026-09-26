import type { Kopecks } from "../money";

type OptionGroupPrice = { required: boolean; values: { priceDeltaKopecks: Kopecks }[] };

/**
 * Цена «от» для карточки в списке и заголовка товара: базовая цена плюс самые
 * дешёвые варианты обязательных групп. Необязательные группы цену не поднимают —
 * без них товар купить можно. `hasChoice` — есть ли выбор, меняющий цену: тогда
 * перед ценой пишется «от».
 */
export function startingPrice(
  basePriceKopecks: Kopecks,
  groups: readonly OptionGroupPrice[],
): { priceKopecks: Kopecks; hasChoice: boolean } {
  let price = basePriceKopecks;
  let hasChoice = false;
  for (const group of groups) {
    if (group.values.length === 0) continue;
    const deltas = group.values.map((value) => value.priceDeltaKopecks);
    const min = Math.min(...deltas);
    if (group.required) price += min;
    if (Math.max(...deltas) !== min || (!group.required && Math.max(...deltas) > 0)) hasChoice = true;
  }
  return { priceKopecks: Math.max(0, price), hasChoice };
}
