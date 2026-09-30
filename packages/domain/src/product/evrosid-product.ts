/**
 * Карточка товара «ЕвроСид» (evrosid.ru, 1С-Битрикс) для импорта товара в ERP по
 * ссылке: название, описание, полноразмерные снимки, цена и путь раздела из
 * хлебных крошек. Вариантов у товаров нет — цена одна («от N руб.»).
 *
 * Разбор по вёрстке сайта: сменят шаблон — перестанет находить, и это обычный
 * результат `null` / пустой список, а не исключение. Функции чистые: сеть —
 * в `apps/erp/src/server/products/supplier-import.ts`.
 */
import type { Kopecks } from "../money";
import { priceTextToKopecks, urlHasHost } from "./price-page";
import { decodeEntities, htmlToText } from "./site-catalog";
import type { VanprojectProduct } from "./vanproject-product";

export const EVROSID_ORIGIN = "https://evrosid.ru";

export function isEvrosidUrl(value: string): boolean {
  return urlHasHost(value, "evrosid.ru");
}

/** Тот же вид, что у «Фургон Проекта»: у ЕвроСид нет вариантов, поэтому `form` всегда `null`. */
export type EvrosidProduct = VanprojectProduct;

const stripTags = (html: string) =>
  decodeEntities(html.replace(/<[^>]+>/g, ""))
    .replace(/\s+/g, " ")
    .trim();

const absolute = (path: string) => new URL(path.startsWith("/") ? path : `/${path}`, EVROSID_ORIGIN).toString();

/** Разбор страницы товара. Не страница товара (нет названия в карточке) — `null`. */
export function parseEvrosidProduct(html: string): EvrosidProduct | null {
  const name = parseName(html);
  if (!name) return null;
  return {
    productId: /class=["']item-id["'][^>]*value=["'](\d+)["']/i.exec(html)?.[1] ?? null,
    name,
    description: parseDescription(html),
    imageUrls: parseGallery(html),
    priceKopecks: parseEvrosidPrice(html),
    form: null,
    categoryPath: parseCategoryPath(html, name),
  };
}

/**
 * Название — заголовок `page-h2`, а если его нет — скрытый `itemprop="name"` внутри
 * карточки (раньше по странице идут хлебные крошки с таким же `itemprop`).
 */
function parseName(html: string): string | null {
  const heading = /<h2[^>]*page-h2[^>]*>([\s\S]*?)<\/h2>/i.exec(html);
  const article = html.search(/<article/i);
  const card = article >= 0 ? /itemprop=["']name["'][^>]*>([\s\S]*?)<\/div>/i.exec(html.slice(article)) : null;
  const found = heading ?? card;
  return found ? stripTags(found[1]) || null : null;
}

/** Цена карточки: `itemprop="price" content="36000"`; у товаров «от N руб.» это цена от. */
export function parseEvrosidPrice(html: string): Kopecks | null {
  const content = /itemprop=["']price["'][^>]*content=["']([^"']+)["']/i.exec(html);
  return content ? priceTextToKopecks(content[1]) : null;
}

/** Вкладка карточки по id панели: до следующей панели или конца списка вкладок. */
function tabText(html: string, id: string): string | null {
  const pane = new RegExp(
    `id=["']${id}["'][^>]*>([\\s\\S]*?)</div>\\s*(?=<div class=["']tab-pane|</div>\\s*</article>)`,
    "i",
  ).exec(html);
  if (!pane) return null;
  const text = htmlToText(pane[1]);
  // Сайт пишет «Не указано.» там, где описания нет
  return text && !/^не указано\.?$/i.test(text) ? text : null;
}

/** Описание, а если на сайте есть вкладка «Преимущества» — она идёт следом отдельным абзацем. */
function parseDescription(html: string): string | null {
  const description = tabText(html, "product-description-target");
  const advantages = tabText(html, "product-advantages-target");
  const parts = [description, advantages ? `Преимущества\n${advantages}` : null].filter(Boolean);
  return parts.length > 0 ? parts.join("\n\n") : null;
}

/**
 * Снимки — ссылки слайдера `data-fslightbox="productgallery"` на оригиналы или
 * увеличенные копии 1200×1200 (в `<img>` там уменьшенные). Повторы убираем; нет
 * галереи — берём `image` из разметки schema.org.
 */
function parseGallery(html: string): string[] {
  const urls = new Set<string>();
  for (const match of html.matchAll(/<a[^>]*data-fslightbox=["']productgallery["'][^>]*href=["']([^"']+)["']/gi)) {
    urls.add(absolute(decodeEntities(match[1])));
  }
  if (urls.size === 0) {
    const main = /itemprop=["']image["'][^>]*src=["']([^"']+)["']/i.exec(html);
    if (main) urls.add(absolute(decodeEntities(main[1])));
  }
  return [...urls];
}

/** Разделы из хлебных крошек без «Главная», «Каталог продукции» и самого товара. */
function parseCategoryPath(html: string, productName: string): string[] {
  const start = html.search(/class=["']bx-breadcrumb["']/i);
  const end = html.search(/<article/i);
  const crumbs = start >= 0 ? html.slice(start, end > start ? end : undefined) : "";
  const names = [...crumbs.matchAll(/itemprop=["']name["'][^>]*>([^<]*)</gi)].map((match) => stripTags(match[1]));
  const skip = new Set(["главная", "каталог", "каталог продукции", productName.toLowerCase()]);
  return names
    .filter((crumb) => crumb && !skip.has(crumb.toLowerCase()))
    .filter((crumb, index, list) => index === 0 || crumb.toLowerCase() !== list[index - 1].toLowerCase());
}

/** Артикул-подсказка для нового товара: по id на сайте поставщика, человек его может сменить. */
export function suggestEvrosidSku(productId: string | null): string {
  return productId ? `ES-${productId}` : "";
}
