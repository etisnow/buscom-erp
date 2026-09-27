/**
 * Карточка товара «Фургон Проекта» (vanproject.ru) целиком — для импорта товара в
 * ERP по ссылке: название, описание, полноразмерные снимки, цена, варианты и путь
 * раздела из хлебных крошек. Цену и варианты разбирает `vanproject.ts` (ими же
 * пользуется «Подтянуть цену»), здесь — остальное.
 *
 * Разбор по вёрстке MODX/miniShop2: сменят шаблон — перестанет находить, и это
 * обычный результат `null` / пустой список, а не исключение. Функции чистые: сеть —
 * в `apps/erp/src/server/products/supplier-import.ts`.
 */
import type { Kopecks } from "../money";
import type { CategoryNode } from "./categories";
import { decodeEntities, htmlToText } from "./site-catalog";
import type { SupplierCombo } from "./option-matching";
import {
  parseVanprojectForm,
  parseVanprojectPrice,
  type VanprojectForm,
  type VariantOption,
  type VariantSelection,
} from "./vanproject";

export const VANPROJECT_ORIGIN = "https://vanproject.ru";

export type VanprojectProduct = {
  /** id товара на сайте — из формы заказа */
  productId: string | null;
  name: string;
  description: string | null;
  /** Полноразмерные снимки галереи, абсолютные адреса, в порядке на странице */
  imageUrls: string[];
  /** Цена на странице; при вариантах — цена первого варианта */
  priceKopecks: Kopecks | null;
  form: VanprojectForm | null;
  /** Разделы из хлебных крошек без «Главная», «Каталог» и самого товара, повторы подряд схлопнуты */
  categoryPath: string[];
};

const stripTags = (html: string) =>
  decodeEntities(html.replace(/<[^>]+>/g, ""))
    .replace(/\s+/g, " ")
    .trim();

/** Разбор страницы товара. Не страница товара (нет заголовка карточки) — `null`. */
export function parseVanprojectProduct(html: string): VanprojectProduct | null {
  const title = /<h1[^>]*class=["'][^"']*product__title[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  if (!title) return null;
  const name = stripTags(title[1]);
  if (!name) return null;

  const form = parseVanprojectForm(html);
  return {
    productId: form?.productId ?? null,
    name,
    description: parseDescription(html),
    imageUrls: parseGallery(html),
    priceKopecks: parseVanprojectPrice(html),
    form,
    categoryPath: parseCategoryPath(html, name),
  };
}

/**
 * Описание — последний `<div class="text">` в `product__description` перед формой
 * заказа: предыдущие `div.text` на странице — подписи бокового меню.
 */
function parseDescription(html: string): string | null {
  const start = html.search(/class=["']product__description["']/i);
  const end = html.search(/<form[^>]*class=["'][^"']*product__settings/i);
  if (start < 0 || end < start) return null;
  const block = html.slice(start, end);
  const open = block.lastIndexOf('<div class="text">');
  if (open < 0) return null;
  const inner = block.slice(open + '<div class="text">'.length);
  const close = inner.lastIndexOf("</div>");
  return htmlToText(close >= 0 ? inner.slice(0, close) : inner);
}

/**
 * Снимки — ссылки главного слайдера на оригиналы `/assets/images/products/…`
 * (в `<img>` там уменьшенные копии 500×385 из кеша). Повторы убираем.
 */
function parseGallery(html: string): string[] {
  const urls = new Set<string>();
  for (const match of html.matchAll(/href=["'](\/?assets\/images\/products\/[^"']+\.(?:jpe?g|png|webp))["']/gi)) {
    urls.add(new URL(match[1].startsWith("/") ? match[1] : `/${match[1]}`, VANPROJECT_ORIGIN).toString());
  }
  return [...urls];
}

function parseCategoryPath(html: string, productName: string): string[] {
  const crumbs = /<ul class=["']breadscrumbs["']>([\s\S]*?)<\/ul>/i.exec(html);
  if (!crumbs) return [];
  const names = [...crumbs[1].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map((match) => stripTags(match[1]));
  const skip = new Set(["главная", "каталог", productName.toLowerCase()]);
  return names
    .filter((crumb) => crumb && !skip.has(crumb.toLowerCase()))
    .filter((crumb, index, list) => index === 0 || crumb.toLowerCase() !== list[index - 1].toLowerCase());
}

/** Артикул-подсказка для нового товара: по id на сайте поставщика, человек его может сменить. */
export function suggestVanprojectSku(productId: string | null): string {
  return productId ? `VP-${productId}` : "";
}

/**
 * Наша категория по пути раздела поставщика: ищем с конца пути (самый узкий
 * раздел) категорию с тем же названием, без учёта регистра, «ё» и пробелов.
 * Названия у нас и у поставщика не совпадают по устройству — не нашли, значит
 * `null`, категорию выберет человек.
 */
export function matchCategory(path: readonly string[], categories: readonly CategoryNode[]): string | null {
  const key = (name: string) => name.replace(/\s+/g, " ").trim().toLocaleLowerCase("ru").replace(/ё/g, "е");
  const byName = new Map<string, string>();
  for (const category of categories) byName.set(key(category.name), category.id);
  for (const crumb of [...path].reverse()) {
    const id = byName.get(key(crumb));
    if (id) return id;
  }
  return null;
}

export type ImportedOptionGroup = {
  name: string;
  required: true;
  values: { name: string; priceDeltaKopecks: Kopecks }[];
};

export type ImportedPricing = {
  /** Закупка самого дешёвого сочетания вариантов — базовая закупка товара */
  basePurchaseKopecks: Kopecks | null;
  /** Это сочетание — выбор вариантов у ссылки на поставщика */
  baseSelection: VariantSelection;
  /** Списки поставщика как наши обязательные группы опций */
  groups: ImportedOptionGroup[];
};

/**
 * Варианты поставщика → наши группы опций. Каждый список — обязательная группа;
 * доплата варианта — разница между самой дешёвой закупкой с этим вариантом и
 * самой дешёвой закупкой вообще. Это закупочные разницы: человек в форме решает,
 * брать их как есть или со своей наценкой. Сочетания без цены не учитываются;
 * у варианта без единой цены доплата 0.
 */
export function pricingFromCombos(
  options: readonly VariantOption[],
  combos: readonly SupplierCombo[],
): ImportedPricing {
  const priced = combos.filter(
    (combo): combo is SupplierCombo & { priceKopecks: Kopecks } => combo.priceKopecks !== null,
  );
  const cheapest = priced.reduce<(typeof priced)[number] | null>(
    (best, combo) => (best === null || combo.priceKopecks < best.priceKopecks ? combo : best),
    null,
  );
  const base = cheapest?.priceKopecks ?? null;
  return {
    basePurchaseKopecks: base,
    baseSelection: cheapest?.selection ?? {},
    groups: options.map((option) => ({
      name: option.label.replace(/:\s*$/, ""),
      required: true,
      values: [...new Set(option.values.map((value) => value.value))].map((name) => {
        const prices = priced
          .filter((combo) => combo.selection[option.key] === name)
          .map((combo) => combo.priceKopecks);
        return { name, priceDeltaKopecks: base === null || prices.length === 0 ? 0 : Math.min(...prices) - base };
      }),
    })),
  };
}
