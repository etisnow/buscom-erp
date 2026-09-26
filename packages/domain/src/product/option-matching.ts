/**
 * Сопоставление вариантов наших опций товара с вариантами на странице
 * поставщика — для кнопки «Подтянуть цены опций».
 *
 * Наш вариант: «5) Боковое заднее левое 1545x667». У поставщика (vanproject.ru)
 * — сочетание списков: «заднее левое» + «1545х667мм темное». Сопоставляем по
 * признакам, которые пишут одинаково по смыслу, но по-разному по буквам:
 *
 * - размер «1545x667» = «1545х667мм» (латинская x, кириллическая х, ×, пробелы);
 * - сторона: если у поставщика в варианте есть «левое»/«правое», она должна
 *   совпасть с нашей (у сдвижной двери стороны нет — тогда не мешает);
 * - форточка: «с форточкой» у нас — только варианты с форточкой, без неё — только без.
 *
 * Однозначное совпадение подставляется само. Несколько подходящих (стекло
 * тёмное и зелёное, петли 180˚ и 270˚) — кандидаты, выбирает человек: угадывать
 * здесь дороже, чем спросить.
 */
import type { Kopecks } from "../money";
import type { VariantOption, VariantSelection } from "./vanproject";

/** Сочетание вариантов у поставщика и его цена; `null` — сайт цену не дал. */
export type SupplierCombo = {
  selection: VariantSelection;
  /** «заднее левое · 1545х667мм темное» */
  label: string;
  priceKopecks: Kopecks | null;
};

export type OptionMatch =
  { kind: "unique"; combo: SupplierCombo } | { kind: "ambiguous"; candidates: SupplierCombo[] } | { kind: "none" };

/**
 * Все допустимые сочетания списков — с учётом зависимостей (`requires`).
 * Списков на странице два-три, значений — десятки: полный перебор дёшев.
 */
export function enumerateCombos(options: VariantOption[]): VariantSelection[] {
  let combos: VariantSelection[] = [{}];
  for (const option of options) {
    const next: VariantSelection[] = [];
    for (const combo of combos) {
      const seen = new Set<string>();
      for (const value of option.values) {
        const fits = Object.entries(value.requires).every(([key, required]) => combo[key] === required);
        if (!fits || seen.has(value.value)) continue;
        seen.add(value.value);
        next.push({ ...combo, [option.key]: value.value });
      }
    }
    combos = next;
  }
  return combos.filter((combo) => Object.keys(combo).length === options.length);
}

export function comboLabel(options: VariantOption[], selection: VariantSelection): string {
  return options
    .map((option) => selection[option.key])
    .filter(Boolean)
    .join(" · ");
}

function normalize(text: string): string {
  return text.toLocaleLowerCase("ru").replace(/ё/g, "е").replace(/[×xх]/g, "х").replace(/\s+/g, " ");
}

/** «1545x667», «1545 х 667 мм» → «1545х667»; без размера — null. */
export function sizeOf(text: string): string | null {
  const match = normalize(text).match(/(\d{2,4})\s*х\s*(\d{2,4})/);
  return match ? `${match[1]}х${match[2]}` : null;
}

function sideOf(text: string): "левое" | "правое" | null {
  const normalized = normalize(text);
  // \b в JS не знает кириллицу — границу слова задаём руками
  if (/(^|[^а-я])лев/.test(normalized)) return "левое";
  if (/(^|[^а-я])прав/.test(normalized)) return "правое";
  return null;
}

const hasVent = (text: string) => /форточк/.test(normalize(text));

/**
 * Подходящие поставщику сочетания для нашего варианта опции. Без размера в
 * названии сопоставлять не беремся: по одним словам «заднее левое» подойдёт
 * слишком многое — пусть человек выберет из всех.
 */
export function matchOptionValue(valueName: string, combos: SupplierCombo[]): OptionMatch {
  const size = sizeOf(valueName);
  if (!size) return combos.length > 0 ? { kind: "ambiguous", candidates: combos } : { kind: "none" };

  const side = sideOf(valueName);
  const vent = hasVent(valueName);

  const candidates = combos.filter((combo) => {
    if (sizeOf(combo.label) !== size) return false;
    const comboSide = sideOf(combo.label);
    if (side && comboSide && comboSide !== side) return false;
    if (hasVent(combo.label) !== vent) return false;
    return true;
  });

  if (candidates.length === 1) return { kind: "unique", combo: candidates[0]! };
  if (candidates.length > 1) return { kind: "ambiguous", candidates };
  return { kind: "none" };
}

/** Закупка варианта опции у поставщика — по id варианта. */
export type OptionPurchase = { optionValueId: string; purchasePriceKopecks: Kopecks };

/**
 * Закупка позиции с опциями: базовая закупка у поставщика плюс закупки
 * выбранных вариантов — по той же схеме, что и цена продажи (цена товара плюс
 * надбавки вариантов). Вариант без своей закупки ничего не добавляет.
 */
export function purchaseWithOptions(
  basePurchaseKopecks: Kopecks,
  optionPrices: readonly OptionPurchase[],
  optionValueIds: readonly string[],
): Kopecks {
  const byValue = new Map(optionPrices.map((row) => [row.optionValueId, row.purchasePriceKopecks]));
  return optionValueIds.reduce((sum, id) => sum + (byValue.get(id) ?? 0), basePurchaseKopecks);
}
