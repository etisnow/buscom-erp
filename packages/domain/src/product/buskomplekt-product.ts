/**
 * Карточка товара «Нижбаскомплект» (buskomplektnn.ru) для импорта товара в ERP по
 * ссылке: название, описание с характеристиками, снимки, цена и путь раздела из
 * хлебных крошек. Вариантов у товаров нет — цена одна («От N ₽»).
 *
 * Разбор по вёрстке сайта: сменят шаблон — перестанет находить, и это обычный
 * результат `null` / пустой список, а не исключение. Функции чистые: сеть —
 * в `apps/erp/src/server/products/supplier-import.ts`.
 */
import type { Kopecks } from "../money";
import { priceTextToKopecks, urlHasHost } from "./price-page";
import { decodeEntities, htmlToText } from "./site-catalog";
import type { VanprojectProduct } from "./vanproject-product";

export const BUSKOMPLEKT_ORIGIN = "https://buskomplektnn.ru";

export function isBuskomplektUrl(value: string): boolean {
  return urlHasHost(value, "buskomplektnn.ru");
}

/** Тот же вид, что у «Фургон Проекта»: вариантов на сайте нет, поэтому `form` всегда `null`. */
export type BuskomplektProduct = VanprojectProduct;

const stripTags = (html: string) =>
  decodeEntities(html.replace(/<[^>]+>/g, ""))
    .replace(/\s+/g, " ")
    .trim();

const absolute = (path: string) => new URL(path.startsWith("/") ? path : `/${path}`, BUSKOMPLEKT_ORIGIN).toString();

/** Разбор страницы товара. Не страница товара (нет заголовка карточки) — `null`. */
export function parseBuskomplektProduct(html: string): BuskomplektProduct | null {
  const title = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  const name = title ? stripTags(title[1]) : "";
  if (!name || !/id=["']good_card["']/i.test(html)) return null;

  const cart = parseCartButton(html);
  return {
    productId: cart?.productId ?? null,
    name,
    description: parseDescription(html),
    imageUrls: parseGallery(html),
    priceKopecks: cart?.priceKopecks ?? parseBuskomplektPrice(html),
    form: null,
    categoryPath: parseCategoryPath(html),
  };
}

/** Кнопка «Добавить в корзину» несёт id товара и цену: `id="694@55000"`. */
function parseCartButton(html: string): { productId: string; priceKopecks: Kopecks | null } | null {
  const match = /class=["']incart_button["'][^>]*\sid=["'](\d+)@(\d+)["']/i.exec(html);
  return match ? { productId: match[1], priceKopecks: priceTextToKopecks(match[2]) } : null;
}

/** Цена карточки: «От 55 000,- ₽» (то же число — в `id` кнопки корзины). Нет — `null`. */
export function parseBuskomplektPrice(html: string): Kopecks | null {
  const cart = parseCartButton(html);
  if (cart?.priceKopecks) return cart.priceKopecks;
  const text = /<b[^>]*class=["']price["'][^>]*>([\s\S]*?)<\/b>/i.exec(html);
  if (!text) return null;
  // «От 55 000,- ₽»: без слова «от», знака рубля и «,-»
  const number = /\d[\d\s  ]*(?:[.,]\d{1,2})?/.exec(stripTags(text[1]).replace(/,-/g, ""));
  return number ? priceTextToKopecks(number[0]) : null;
}

/**
 * Описание: характеристики (строки «подпись: значение» справа от снимков), затем
 * текст под карточкой — до блока «Посмотрите похожие предложения». Формы заявки
 * и скрипты между ними отбрасываются.
 */
function parseDescription(html: string): string | null {
  const specs = [...html.matchAll(/<p><i>([^<]+?):?<\/i>\s*<b>([^<]*)<\/b><\/p>/gi)]
    .map((match) => [stripTags(match[1]), stripTags(match[2])] as const)
    .filter(([label, value]) => label && value)
    .map(([label, value]) => `${label}: ${value}`);

  const cleared = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<form[\s\S]*?<\/form>/gi, "");
  const tail = /<div style=["']clear:\s*both;?["']><\/div>([\s\S]*?)(?:<h2>Посмотрите похожие|$)/i.exec(cleared);
  const text = tail ? htmlToText(tail[1]) : null;

  const parts = [text, specs.length > 0 ? `Характеристики\n${specs.join("\n")}` : null].filter(Boolean);
  return parts.length > 0 ? parts.join("\n\n") : null;
}

/** Снимки — ссылки `rel="view_bigpic"` на оригиналы (в `background-image` там уменьшенные копии). */
function parseGallery(html: string): string[] {
  const urls = new Set<string>();
  for (const match of html.matchAll(/<a[^>]*href=["']([^"']+)["'][^>]*rel=["']view_bigpic["']/gi)) {
    urls.add(absolute(decodeEntities(match[1])));
  }
  return [...urls];
}

/** Разделы из хлебных крошек (ссылки) без «Главная» и «Каталог товаров»; сам товар — текст без ссылки. */
function parseCategoryPath(html: string): string[] {
  const crumbs = /<div id=["']breadcrumbs["']>([\s\S]*?)<\/div>/i.exec(html);
  if (!crumbs) return [];
  const skip = new Set(["главная", "каталог товаров", "каталог"]);
  return [...crumbs[1].matchAll(/<a[^>]*>([\s\S]*?)<\/a>/gi)]
    .map((match) => stripTags(match[1]))
    .filter((crumb) => crumb && !skip.has(crumb.toLowerCase()));
}

/** Артикул-подсказка для нового товара: по id на сайте поставщика, человек его может сменить. */
export function suggestBuskomplektSku(productId: string | null): string {
  return productId ? `BK-${productId}` : "";
}
