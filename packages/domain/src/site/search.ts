/**
 * Поиск по каталогу сайта (docs/SITE-PRD.md, «01 · Главная», поиск в шапке).
 *
 * Каталог маленький (сотни товаров), поэтому ищем в памяти по закешированному
 * списку, без полнотекстового индекса в базе. Каждое слово запроса должно найтись
 * в названии или коде товара. Окончания русских слов отрезаются грубо — чтобы
 * «сиденья» находили «сиденье», а «шторки» — «шторка»; морфологии тут нет.
 */

export const MAX_SEARCH_QUERY = 100;

/** Нижний регистр, «ё» как «е», знаки препинания — пробелы. */
export function normalizeSearchText(text: string): string {
  return text
    .toLowerCase()
    .replaceAll("ё", "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const ENDING = /[аеиоуыэюяйь]+$/u;

/** Беглая гласная перед последней согласной: «поручен(ь)» и «поручн(и)», «замок» и «замк(и)» */
const FLEETING = /(?<=..[а-я])[ео](?=[кнлц]$)/u;

/**
 * Основа слова: без гласных на конце, если остаётся хотя бы три буквы, и без беглой
 * гласной. Грубо, но одинаково для запроса и названия — только это и нужно. Цифры и
 * латиницу не трогаем.
 */
function stem(word: string): string {
  if (!/^[а-я]+$/u.test(word)) return word;
  const base = word.replace(ENDING, "");
  if (base.length < 3) return word;
  return base.replace(FLEETING, "");
}

/** Текст, в котором ищут: как есть и основами слов — «поручни» найдёт «Поручень». */
function searchable(text: string): string {
  const normalized = normalizeSearchText(text);
  return `${normalized} ${normalized.split(" ").map(stem).join(" ")}`;
}

/** Нашлись ли все слова запроса в тексте — для товаров и названий разделов. */
export function matchesTerms(text: string, terms: readonly string[]): boolean {
  const haystack = searchable(text);
  return terms.every((term) => haystack.includes(term));
}

/** Слова запроса для поиска; пустой список — искать нечего. */
export function searchTerms(query: string): string[] {
  const words = normalizeSearchText(query.slice(0, MAX_SEARCH_QUERY)).split(" ").filter(Boolean);
  return [...new Set(words.map(stem))];
}

export type Searchable = { name: string; sku: string };

/** Код без пробелов и дефисов: «SEAT-1» находится и по «seat1». */
const compact = (text: string) => normalizeSearchText(text).replaceAll(" ", "");

/**
 * Товары, где нашлись все слова запроса. Порядок: код совпал целиком, название
 * начинается с первого слова, остальные — по алфавиту.
 */
export function searchProducts<T extends Searchable>(products: readonly T[], query: string): T[] {
  const terms = searchTerms(query);
  if (terms.length === 0) return [];
  const exactSku = compact(query);
  const scored = products.flatMap((product) => {
    if (!matchesTerms(`${product.name} ${product.sku} ${compact(product.sku)}`, terms)) return [];
    const firstWord = normalizeSearchText(product.name).split(" ")[0] ?? "";
    const startsWith = firstWord.startsWith(terms[0]) || stem(firstWord).startsWith(terms[0]);
    const rank = compact(product.sku) === exactSku ? 0 : startsWith ? 1 : 2;
    return [{ product, rank }];
  });
  return scored
    .sort((a, b) => a.rank - b.rank || a.product.name.localeCompare(b.product.name, "ru"))
    .map((item) => item.product);
}
