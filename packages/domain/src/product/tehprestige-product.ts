/**
 * Карточка товара «Техпрестиж» (tehprestige.ru) для импорта товара в ERP по ссылке:
 * название, артикул, снимки, цена и путь раздела из хлебных крошек. Описания у
 * карточки нет — на странице только рекламный текст магазина, его не берём.
 * Вариантов нет — цена одна.
 *
 * Разбор по вёрстке сайта: сменят шаблон — перестанет находить, и это обычный
 * результат `null` / пустой список, а не исключение. Функции чистые: сеть —
 * в `apps/erp/src/server/products/supplier-import.ts`.
 */
import type { Kopecks } from "../money";
import { priceTextToKopecks, urlHasHost } from "./price-page";
import { decodeEntities } from "./site-catalog";
import type { VanprojectProduct } from "./vanproject-product";

export const TEHPRESTIGE_ORIGIN = "https://tehprestige.ru";

export function isTehprestigeUrl(value: string): boolean {
  return urlHasHost(value, "tehprestige.ru");
}

/** Тот же вид, что у «Фургон Проекта»: вариантов на сайте нет, поэтому `form` всегда `null`. */
export type TehprestigeProduct = VanprojectProduct;

const stripTags = (html: string) =>
  decodeEntities(html.replace(/<[^>]+>/g, ""))
    .replace(/\s+/g, " ")
    .trim();

const absolute = (path: string) => new URL(path.startsWith("/") ? path : `/${path}`, TEHPRESTIGE_ORIGIN).toString();

/** Значение строки «Артикул: …» / «Код: …» из блока характеристик карточки. */
function characteristic(html: string, label: string): string | null {
  const match = new RegExp(`<span>\\s*${label}:\\s*</span>([^<]*)`, "i").exec(html);
  const value = match ? stripTags(match[1]) : "";
  return value || null;
}

/** Разбор страницы товара. Не страница товара (нет заголовка карточки) — `null`. */
export function parseTehprestigeProduct(html: string): TehprestigeProduct | null {
  const title = /class=["']info__title["'][^>]*>([\s\S]*?)<\/div>/i.exec(html);
  const name = title ? stripTags(title[1]) : "";
  if (!name) return null;

  const article = characteristic(html, "Артикул");
  return {
    // «Код: 6134» — номер товара на сайте; ведущие нули у других кодов ни к чему
    productId: characteristic(html, "Код")?.replace(/\D/g, "").replace(/^0+/, "") || null,
    name,
    description: article ? `Артикул поставщика: ${article}` : null,
    imageUrls: parseGallery(html),
    priceKopecks: parseTehprestigePrice(html),
    form: null,
    categoryPath: parseCategoryPath(html),
  };
}

/** Цена карточки: `data-price="8650"` у блока цены, а если его нет — `itemprop="price"`. Нет — `null`. */
export function parseTehprestigePrice(html: string): Kopecks | null {
  const data = /class=["']value["'][^>]*data-price=["']([\d.,]+)["']/i.exec(html);
  if (data) return priceTextToKopecks(data[1]);
  const meta = /itemprop=["']price["'][^>]*content=["']([^"']+)["']/i.exec(html);
  return meta ? priceTextToKopecks(decodeEntities(meta[1])) : null;
}

/** Снимки — ссылки галереи `for__item fancy` на полноразмерные файлы (в `srcset` там уменьшенные копии). */
function parseGallery(html: string): string[] {
  const urls = new Set<string>();
  for (const match of html.matchAll(/<a[^>]*href=["']([^"']+)["'][^>]*class=["'][^"']*\bfancy\b[^"']*["']/gi)) {
    urls.add(absolute(decodeEntities(match[1])));
  }
  return [...urls];
}

/** Разделы из хлебных крошек (ссылки) без главной страницы; сам товар — крошка без ссылки. */
function parseCategoryPath(html: string): string[] {
  const start = html.search(/class=["']breadcrumbs["']/i);
  if (start < 0) return [];
  const end = html.indexOf("</ul>", start);
  const crumbs = html.slice(start, end > start ? end : undefined);
  return [...crumbs.matchAll(/<a[^>]*>([\s\S]*?)<\/a>/gi)].map((match) => stripTags(match[1])).slice(1);
}

/** Артикул-подсказка для нового товара: по номеру на сайте поставщика, человек его может сменить. */
export function suggestTehprestigeSku(productId: string | null): string {
  return productId ? `TP-${productId}` : "";
}
