/**
 * Карточка товара «Группа деталей» (gruppa-detaley.ru) для импорта товара в ERP по
 * ссылке: название, артикул, снимки, цена и путь раздела из хлебных крошек.
 * Описания у карточки нет — на странице только рекламный текст магазина, его не
 * берём. Вариантов нет — цена одна. Тот же движок, что у «Техпрестижа», но другой
 * шаблон карточки.
 *
 * Разбор по вёрстке сайта: сменят шаблон — перестанет находить, и это обычный
 * результат `null` / пустой список, а не исключение. Функции чистые: сеть —
 * в `apps/erp/src/server/products/supplier-import.ts`.
 */
import type { Kopecks } from "../money";
import { priceTextToKopecks, urlHasHost } from "./price-page";
import { decodeEntities } from "./site-catalog";
import type { VanprojectProduct } from "./vanproject-product";

export const GRUPPA_DETALEY_ORIGIN = "https://gruppa-detaley.ru";

export function isGruppaDetaleyUrl(value: string): boolean {
  return urlHasHost(value, "gruppa-detaley.ru");
}

/** Тот же вид, что у «Фургон Проекта»: вариантов на сайте нет, поэтому `form` всегда `null`. */
export type GruppaDetaleyProduct = VanprojectProduct;

const stripTags = (html: string) =>
  decodeEntities(html.replace(/<[^>]+>/g, ""))
    .replace(/\s+/g, " ")
    .trim();

const absolute = (path: string) => new URL(path.startsWith("/") ? path : `/${path}`, GRUPPA_DETALEY_ORIGIN).toString();

/** Значение строки «Артикул: …» / «Код товара: …» блока `info__content`. */
function characteristic(html: string, label: string): string | null {
  const match = new RegExp(`<b>\\s*${label}:\\s*</b>([^<]*)`, "i").exec(html);
  const value = match ? stripTags(match[1]) : "";
  return value || null;
}

/** Разбор страницы товара. Не страница товара (нет заголовка) — `null`. */
export function parseGruppaDetaleyProduct(html: string): GruppaDetaleyProduct | null {
  const title = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  const name = title ? stripTags(title[1]) : "";
  if (!name || !/itemtype=["']http:\/\/schema\.org\/Product["']/i.test(html)) return null;

  const article = characteristic(html, "Артикул");
  return {
    // «Код товара: 00-00000709» — номер товара на сайте (он же в адресе: …_709.html)
    productId: characteristic(html, "Код товара")?.replace(/\D/g, "").replace(/^0+/, "") || null,
    name,
    description: article ? `Артикул поставщика: ${article}` : null,
    imageUrls: parseGallery(html),
    priceKopecks: parseGruppaDetaleyPrice(html),
    form: null,
    categoryPath: parseCategoryPath(html),
  };
}

/** Цена карточки: `<span itemprop="price"> 72935</span>`. Нет — `null`. */
export function parseGruppaDetaleyPrice(html: string): Kopecks | null {
  const price = /itemprop=["']price["'][^>]*>\s*([^<]+?)\s*</i.exec(html);
  return price ? priceTextToKopecks(decodeEntities(price[1])) : null;
}

/**
 * Снимки — ссылка слайдера `class="fancy"` и полноразмерные `src` внутри него
 * (один снимок на странице встречается дважды). Уменьшенные копии (`thumb.`) и
 * заглушку не берём.
 */
function parseGallery(html: string): string[] {
  const urls = new Set<string>();
  const add = (path: string) => {
    const decoded = decodeEntities(path);
    if (!/\.(?:jpe?g|png|webp)$/i.test(decoded) || /\/thumb\.|noimage/i.test(decoded)) return;
    urls.add(absolute(decoded));
  };
  for (const match of html.matchAll(/<a[^>]*href=["']([^"']+)["'][^>]*class=["'][^"']*\bfancy\b[^"']*["']/gi)) {
    add(match[1]);
  }
  for (const match of html.matchAll(/<img[^>]*\ssrc=["'](\/file\/[^"']+)["']/gi)) add(match[1]);
  return [...urls];
}

/** Разделы из хлебных крошек (ссылки) без главной и «Каталог запчастей»; сам товар — крошка без ссылки. */
function parseCategoryPath(html: string): string[] {
  const start = html.search(/class=["']breadcrumbs["']/i);
  if (start < 0) return [];
  const end = html.indexOf("</ul>", start);
  const crumbs = html.slice(start, end > start ? end : undefined);
  const skip = new Set(["каталог запчастей", "каталог"]);
  return [...crumbs.matchAll(/<a[^>]*>([\s\S]*?)<\/a>/gi)]
    .map((match) => stripTags(match[1]))
    .slice(1)
    .filter((crumb) => crumb && !skip.has(crumb.toLowerCase()));
}

/** Артикул-подсказка для нового товара: по номеру на сайте поставщика, человек его может сменить. */
export function suggestGruppaDetaleySku(productId: string | null): string {
  return productId ? `GD-${productId}` : "";
}
