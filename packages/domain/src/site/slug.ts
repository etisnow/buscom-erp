/**
 * Слуг — адрес страницы сайта: bus-com.ru/{slug}. У товаров и категорий адреса
 * одного уровня, поэтому слуг уникален на весь сайт, а не только в своей таблице.
 */

const MAP: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "j",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "c",
  ч: "ch",
  ш: "sh",
  щ: "shch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};

/** Адреса, которые заняты страницами сайта и служебными маршрутами — слугом им не быть. */
export const RESERVED_SLUGS = new Set([
  "kontakty",
  "oplata-dostavka",
  "privacy",
  "korzina",
  "oformlenie",
  "poisk",
  "modeli",
  "api",
  "sitemap.xml",
  "robots.txt",
  "index.php",
]);

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Длиннее не бывает и на старом сайте (самый длинный — 158 знаков, его сохраняем как есть). */
const MAX_LENGTH = 200;
/** Новый слуг короче: обрезается по границе слова */
const NEW_SLUG_LENGTH = 80;

export function isValidSlug(value: string): boolean {
  return SLUG_RE.test(value) && value.length <= MAX_LENGTH && !RESERVED_SLUGS.has(value);
}

/** «Багажник на задние двери (рюкзак) на Ford Transit» → `bagazhnik-na-zadnie-dveri-ryukzak-na-ford-transit`. */
export function slugify(text: string): string {
  const latin = [...text.toLowerCase()].map((char) => MAP[char] ?? char).join("");
  let slug = latin.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (slug.length > NEW_SLUG_LENGTH) {
    const cut = slug.slice(0, NEW_SLUG_LENGTH + 1);
    slug = cut.includes("-") ? cut.slice(0, cut.lastIndexOf("-")) : cut.slice(0, NEW_SLUG_LENGTH);
  }
  return slug || "tovar";
}

/** Свободный слуг: к занятому дописывается `-2`, `-3`… */
export function uniqueSlug(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base) && !RESERVED_SLUGS.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}
