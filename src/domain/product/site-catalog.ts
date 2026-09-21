/**
 * Разбор каталога bus-com.ru (OpenCart) для переноса товаров в ERP.
 *
 * Сеть здесь не трогаем — только строки HTML и XML, чтобы разбор был покрыт
 * тестами. Откуда что берётся (проверено на живом сайте 21.09.2026):
 *
 * - список товаров — `sitemap.xml`: у товаров приоритет 1.0 и картинка, у категорий 0.7;
 *   один товар встречается под несколькими адресами (`/paz/…`, `/russia/…`,
 *   `index.php?…product_id=N`), поэтому уникальность — по `product_id` со страницы;
 * - карточка товара — отладочный `console.log('php_array: {…}')`, который тема
 *   печатает в начало страницы: там `product_id`, название, артикул (`model`),
 *   цена и статус. Если отладку уберут, берём то же из разметки;
 * - категории — меню каталога в шапке (раздел → подкатегории) и ссылки на
 *   товары в листинге каждой категории: номера категории страница не отдаёт.
 */
import { rublesToKopecks, type Kopecks } from "@/domain/money";

/** Товар, как он лежит на сайте. */
export type SiteProduct = {
  /** `product_id` в OpenCart — ключ повторного импорта (`Product.externalId`) */
  externalId: string;
  url: string;
  name: string;
  /** «Код товара» (`model` в OpenCart); бывает пустым */
  sku: string;
  priceKopecks: Kopecks;
  /** Товар включён на сайте */
  isActive: boolean;
  /** «Производитель» на сайте — там страна или марка («Россия», «Webasto») */
  manufacturer: string | null;
  /** Опции с выбором варианта (список, радиокнопки). Текстовые поля не переносим */
  options: SiteOptionGroup[];
};

export type SiteOptionGroup = {
  /** `product_option_id` в OpenCart */
  externalId: string;
  name: string;
  required: boolean;
  values: { externalId: string; name: string; priceDeltaKopecks: Kopecks }[];
};

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", nbsp: " " };

export function decodeEntities(value: string): string {
  return value.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, name: string) => ENTITIES[name]);
}

function clean(value: string): string {
  return decodeEntities(value).replace(/\s+/g, " ").trim();
}

/** Адреса товаров из `sitemap.xml`: записи с приоритетом 1.0. Категории и страницы — 0.7 и 0.5. */
export function parseSitemapProductUrls(xml: string): string[] {
  const urls: string[] = [];
  for (const [entry] of xml.matchAll(/<url>[\s\S]*?<\/url>/g)) {
    const loc = entry.match(/<loc>([^<]+)<\/loc>/)?.[1];
    const priority = entry.match(/<priority>([^<]+)<\/priority>/)?.[1];
    if (loc && priority !== undefined && Number(priority) === 1) urls.push(decodeEntities(loc.trim()));
  }
  return [...new Set(urls)];
}

/**
 * Ключ товара по адресу, чтобы сопоставить ссылку из листинга со страницей товара:
 * `id:470` для `index.php?…product_id=470`, иначе последний сегмент пути —
 * он один и тот же, под каким бы разделом товар ни открыли.
 */
export function productKeyFromUrl(rawUrl: string): string {
  const url = new URL(decodeEntities(rawUrl));
  const id = url.searchParams.get("product_id");
  if (id) return `id:${id}`;
  const segments = url.pathname.split("/").filter(Boolean);
  return segments.at(-1)?.toLowerCase() ?? "";
}

export type SiteCategory = { url: string; name: string; parentUrl: string | null };

/** Дерево каталога из меню в шапке: раздел и его подкатегории. */
export function parseCatalogMenu(html: string): SiteCategory[] {
  const nav = html.match(/<ul class="nav navbar-nav">([\s\S]*?)<\/ul>\s*<\/div>\s*<\/nav>/)?.[1] ?? "";
  const result: SiteCategory[] = [];

  for (const [block] of nav.matchAll(/<li class="dropdown">[\s\S]*?(?=<li class="dropdown">|$)/g)) {
    const links = [...block.matchAll(/<a href="([^"]+)"[^>]*>([^<]+)</g)].map(([, href, text]) => ({
      url: decodeEntities(href).replace(/\/$/, ""),
      name: clean(text),
    }));
    const [root, ...children] = links;
    if (!root) continue;

    result.push({ url: root.url, name: root.name, parentUrl: null });
    for (const child of children) {
      // В выпадающем меню бывает ссылка «Показать все» на сам раздел — её пропускаем.
      if (child.url === root.url || !child.url.startsWith(`${root.url}/`)) continue;
      result.push({ url: child.url, name: child.name, parentUrl: root.url });
    }
  }
  return result;
}

/** Ключи товаров из листинга категории: ссылки в заголовках карточек. */
export function parseCategoryProductKeys(html: string): string[] {
  const keys = [...html.matchAll(/<h4><a href="([^"]+)"/g)].map(([, href]) => productKeyFromUrl(href));
  return [...new Set(keys)];
}

type DebugProduct = {
  product_id?: string | number;
  name?: string;
  model?: string;
  price?: string | number;
  status?: string | number;
  manufacturer?: string | null;
};

/** Первый отладочный объект товара (`php_array: {…"product_id"…}`) из начала страницы. */
function parseDebugProduct(html: string): DebugProduct | null {
  const match = html.match(/console\.log\('php_array: (\{"product_id".*?\})'\);<\/script>/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]) as DebugProduct;
  } catch {
    return null;
  }
}

function priceFromMarkup(html: string): Kopecks {
  // «1 790 руб.» / «1 790,50 руб.»: число до слова «руб», пробелы — разделители разрядов.
  const text = html.match(/id="price-now"[^>]*>([^<]*)</)?.[1] ?? "";
  const number = text.match(/(\d[\d\s]*(?:[.,]\d{1,2})?)/)?.[1] ?? "";
  const digits = number.replace(/\s/g, "").replace(",", ".");
  return digits ? rublesToKopecks(digits) : 0;
}

/** «+12 250 руб.» → 1 225 000 копеек; «-500 руб.» → −50 000. Нет суммы — надбавки нет. */
function deltaFromText(text: string): Kopecks {
  const match = text.match(/\(([+-])\s*(\d[\d\s]*(?:[.,]\d{1,2})?)\s*руб/);
  if (!match) return 0;
  const kopecks = rublesToKopecks(match[2].replace(/\s/g, "").replace(",", "."));
  return match[1] === "-" ? -kopecks : kopecks;
}

/** Название варианта без хвоста с надбавкой: «Трехточечный (+1 750 руб.)» → «Трехточечный». */
function valueName(text: string): string {
  return clean(text.replace(/\([+-]\s*[\d\s.,]*руб\.?\)/, ""));
}

/**
 * Опции со страницы товара. Разметка OpenCart: блок `div.options.form-group`
 * (класс `required` — обязательная), внутри либо `<select name="option[ID]">`,
 * либо радиокнопки `name="option[ID]"`. Текстовые поля («Номер цвета») — не выбор
 * варианта, их пропускаем; флажков (выбор нескольких) на сайте нет.
 */
export function parseProductOptions(html: string): SiteOptionGroup[] {
  const area = html.match(/Доступные опции<\/h3>([\s\S]*?)id="button-cart"/)?.[1];
  if (!area) return [];

  const groups: SiteOptionGroup[] = [];
  for (const block of area.split(/<div class="options form-group/).slice(1)) {
    const externalId = block.match(/name="option\[(\d+)\]"/)?.[1];
    if (!externalId) continue;

    const name = clean(
      block.match(/option_name="([^"]*)"/)?.[1] ?? block.match(/<label class="control-label"[^>]*>([^<]*)</)?.[1] ?? "",
    );
    const required = /^[^>]*required/.test(block);
    let values: SiteOptionGroup["values"] = [];

    if (/<select name="option\[/.test(block)) {
      values = [...block.matchAll(/<option value="(\d+)\s*"[^>]*>([\s\S]*?)<\/option>/g)].map(([, id, text]) => ({
        externalId: id,
        name: valueName(text),
        priceDeltaKopecks: deltaFromText(text),
      }));
    } else if (/type="radio" [^>]*name="option\[/.test(block)) {
      values = [...block.matchAll(/<input type="radio"[^>]*value="(\d+)"[^>]*\/>([\s\S]*?)<\/label>/g)].map(
        ([, id, text]) => ({ externalId: id, name: valueName(text), priceDeltaKopecks: deltaFromText(text) }),
      );
    }

    if (name && values.length > 0) groups.push({ externalId, name, required, values });
  }
  return groups;
}

/**
 * Карточка товара со страницы. null — это не страница товара (снят с продажи,
 * отдаёт заглушку «Товар не найден»).
 */
export function parseProductPage(html: string, url: string): SiteProduct | null {
  const debug = parseDebugProduct(html);

  const externalId = String(
    debug?.product_id ?? html.match(/<input type="hidden" name="product_id" value="(\d+)"/)?.[1] ?? "",
  );
  const name = clean(debug?.name ?? html.match(/<h1>([^<]+)<\/h1>/)?.[1] ?? "");
  if (!externalId || !name) return null;

  const sku = clean(debug?.model ?? html.match(/<li>Код товара:\s*([^<]*)<\/li>/)?.[1] ?? "");
  const priceKopecks =
    debug?.price !== undefined && debug.price !== null && debug.price !== ""
      ? rublesToKopecks(String(debug.price))
      : priceFromMarkup(html);
  const manufacturer =
    clean(debug?.manufacturer ?? html.match(/<li>Производитель:(?:\s*<!--.*?-->)?\s*([^<]*)/)?.[1] ?? "") || null;

  return {
    externalId,
    url,
    name,
    sku,
    priceKopecks,
    isActive: debug?.status === undefined ? true : String(debug.status) === "1",
    manufacturer,
    options: parseProductOptions(html),
  };
}

/**
 * Артикулы для ERP, где артикул уникален. На сайте он повторяется: так заведены
 * варианты одного товара (двенадцать шторок под `SHT02`). Первый по `product_id`
 * оставляет артикул как есть, остальные получают суффикс с номером на сайте —
 * `SHT02-441`: однозначно, воспроизводимо и видно, откуда взялось.
 * `taken` — артикулы в ERP, занятые не этими товарами (демо-каталог, ручные).
 */
export function assignSkus(
  products: readonly Pick<SiteProduct, "externalId" | "sku">[],
  taken: ReadonlySet<string> = new Set(),
): Map<string, string> {
  const sorted = [...products].sort((a, b) => Number(a.externalId) - Number(b.externalId));
  const used = new Set(taken);
  const result = new Map<string, string>();

  for (const product of sorted) {
    const base = product.sku.trim() || `BC-${product.externalId}`;
    const sku = used.has(base) ? `${base}-${product.externalId}` : base;
    used.add(sku);
    result.set(product.externalId, sku);
  }
  return result;
}

/**
 * Категория товара для ERP: одна строка. Берём подкатегорию — «Люки» понятнее,
 * чем «Климат»; товар без подкатегории получает раздел. Если товар в нескольких,
 * побеждает первая по порядку меню — так же его видит покупатель.
 */
export function pickCategory(
  productKey: string,
  listings: { category: SiteCategory; keys: string[] }[],
): string | null {
  const found = listings.filter((listing) => listing.keys.includes(productKey)).map((listing) => listing.category);
  return (found.find((category) => category.parentUrl !== null) ?? found[0])?.name ?? null;
}

/**
 * Названия для ERP, где в товаре не бывает двух одинаковых групп, а в группе —
 * двух одинаковых вариантов. На сайте повторы возможны; второму и следующим
 * дописываем номер — «Серый (2)», иначе сохранение отклонило бы весь товар.
 */
export function uniqueOptionNames(groups: readonly SiteOptionGroup[]): SiteOptionGroup[] {
  const dedupe = <T extends { name: string }>(items: readonly T[]): T[] => {
    const counts = new Map<string, number>();
    return items.map((item) => {
      const key = item.name.toLocaleLowerCase("ru");
      const count = (counts.get(key) ?? 0) + 1;
      counts.set(key, count);
      return count === 1 ? item : { ...item, name: `${item.name} (${count})` };
    });
  };
  return dedupe(groups).map((group) => ({ ...group, values: dedupe(group.values) }));
}
