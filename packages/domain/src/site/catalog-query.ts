import type { Kopecks } from "../money";

/**
 * Фильтры и сортировка в категории сайта (docs/SITE-PRD.md, «02 · Категория»).
 *
 * Параметры живут в адресе (`/polki?sort=price-asc&model=…`), чтобы фильтр
 * работал без JavaScript и ссылкой делились. Мусор в адресе не ломает страницу:
 * неизвестное значение — как будто параметра нет. Такие адреса не индексируются,
 * canonical ведёт на категорию без параметров (SITE-PLAN, этап 7: «комбинации
 * фильтров — нет»).
 */

export const CATALOG_SORTS = ["price-asc", "price-desc", "name"] as const;
export type CatalogSort = (typeof CATALOG_SORTS)[number];

export const CATALOG_SORT_LABELS: Record<CatalogSort, string> = {
  "price-asc": "Сначала дешевле",
  "price-desc": "Сначала дороже",
  name: "По названию",
};

export type CatalogQuery = {
  sort: CatalogSort;
  /** Цена «от» в рублях, целые; null — без границы */
  minRub: number | null;
  maxRub: number | null;
  /** Модель авто из совместимости товара */
  model: string | null;
};

export const DEFAULT_CATALOG_QUERY: CatalogQuery = { sort: "price-asc", minRub: null, maxRub: null, model: null };

type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)?.trim() || null;

/** Целые рубли: «1 500», «1500,50» → 1500. Отрицательное и нечисловое — без границы. */
function parseRub(value: string | null): number | null {
  if (!value) return null;
  const digits = value.replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(digits)) return null;
  return Math.floor(Number(digits));
}

export function parseCatalogQuery(params: SearchParams): CatalogQuery {
  const sort = first(params.sort);
  let minRub = parseRub(first(params.min));
  let maxRub = parseRub(first(params.max));
  // Перепутанные границы понимаем так, как их явно имели в виду
  if (minRub !== null && maxRub !== null && minRub > maxRub) [minRub, maxRub] = [maxRub, minRub];
  return {
    sort: CATALOG_SORTS.includes(sort as CatalogSort) ? (sort as CatalogSort) : "price-asc",
    minRub: minRub || null,
    maxRub,
    model: first(params.model)?.slice(0, 100) ?? null,
  };
}

/** Есть ли в адресе что-то, кроме самой категории: такую страницу не индексируем. */
export function isCatalogQueryActive(query: CatalogQuery): boolean {
  return (
    query.sort !== DEFAULT_CATALOG_QUERY.sort || query.minRub !== null || query.maxRub !== null || query.model !== null
  );
}

export type FilterableProduct = {
  name: string;
  /** Цена «от»; 0 — «цена по запросу» */
  priceKopecks: Kopecks;
  isHit: boolean;
  compatibility: readonly string[];
};

const byName = (a: FilterableProduct, b: FilterableProduct) => a.name.localeCompare(b.name, "ru");

/**
 * Отбор и порядок товаров категории. Товар «по запросу» (цена 0) в фильтр по цене
 * не попадает — его цена неизвестна, — а при сортировке по цене стоит в конце.
 */
export function applyCatalogQuery<T extends FilterableProduct>(products: readonly T[], query: CatalogQuery): T[] {
  const min = query.minRub !== null ? query.minRub * 100 : null;
  // Верхняя граница включает копейки: «до 1500» пропускает 1 500,50 ₽
  const max = query.maxRub !== null ? (query.maxRub + 1) * 100 : null;
  const priced = min !== null || max !== null;
  const selected = products.filter(
    (product) =>
      (!query.model || product.compatibility.includes(query.model)) &&
      (!priced ||
        (product.priceKopecks > 0 &&
          (min === null || product.priceKopecks >= min) &&
          (max === null || product.priceKopecks < max))),
  );

  const byPrice = (direction: 1 | -1) => (a: T, b: T) => {
    if (a.priceKopecks > 0 !== b.priceKopecks > 0) return a.priceKopecks > 0 ? -1 : 1;
    return (a.priceKopecks - b.priceKopecks) * direction || byName(a, b);
  };
  const compare: Record<CatalogSort, (a: T, b: T) => number> = {
    "price-asc": byPrice(1),
    "price-desc": byPrice(-1),
    name: byName,
  };
  return selected.toSorted(compare[query.sort]);
}

/** Модели для фильтра: те, что есть у товаров категории, чаще встречающиеся — выше. */
export function catalogModels(products: readonly FilterableProduct[]): { model: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const product of products) {
    for (const model of new Set(product.compatibility)) counts.set(model, (counts.get(model) ?? 0) + 1);
  }
  return [...counts]
    .map(([model, count]) => ({ model, count }))
    .sort((a, b) => b.count - a.count || a.model.localeCompare(b.model, "ru"));
}

/**
 * Адрес категории с фильтрами — для вкладок сортировки и выбора модели ссылками.
 * Значения по умолчанию в адрес не попадают: без фильтров это canonical категории.
 */
export function catalogQueryHref(path: string, query: CatalogQuery): string {
  const params = new URLSearchParams();
  if (query.model !== null) params.set("model", query.model);
  if (query.minRub !== null) params.set("min", String(query.minRub));
  if (query.maxRub !== null) params.set("max", String(query.maxRub));
  if (query.sort !== DEFAULT_CATALOG_QUERY.sort) params.set("sort", query.sort);
  const search = params.toString();
  return search ? `${path}?${search}` : path;
}
