import { COMPANY } from "../company";
import { pluralize } from "../money-words";
import { slugify } from "./slug";

/**
 * Страницы моделей авто на сайте (docs/SITE-PLAN.md, этап 7): `/modeli/{slug}` —
 * формат утверждён владельцем 27.09.2026 (SITE-PRD, «Адреса»).
 *
 * Модели берутся из совместимости товаров в продаже, а не из справочника: у сайта
 * права только на таблицы каталога (scripts/site-db-role.sql), а страница модели
 * без товаров не нужна. Страница — на семейство (`modelFamily`): «Ford Transit 2000–2014»
 * и «Ford Transit 2015+» живут на одной. Слуг — транслитерация названия семейства;
 * переименование модели в ERP оставляет 301 со старого адреса (`modelPath`).
 */

export const MODELS_PATH = "/modeli";

export function modelSlug(name: string): string {
  return slugify(name);
}

/**
 * Окончания названия, которые отличают поколение или исполнение от самой машины:
 * «2000–2014», «2015+», «2017», «W906», «Classic», «T5», «244», «X250 / X290», «III».
 */
const GENERATION_SUFFIXES = [
  /\s+\d{4}\s*[–-]\s*\d{4}$/,
  /\s+\d{4}\+?$/,
  /\s+\d{3}$/,
  /\s+W\d{3}$/i,
  /\s+Classic$/i,
  /\s+T\d$/i,
  /\s+X\d{3}(?:\s*\/\s*X\d{3})*$/i,
  /\s+(?:II|III|IV|V)$/,
];

/** Названия, которые после отбрасывания поколения всё равно остаются разными страницами одной машины */
const FAMILY_ALIASES: Record<string, string> = {
  "Fiat Ducato": "Fiat Ducato / Peugeot Boxer / Citroen Jumper",
};

/**
 * Семейство модели — то, на что люди ищут: «Ford Transit», «Mercedes Sprinter», а не
 * «Ford Transit 2015+» и «Mercedes Sprinter W907». Страница сайта — на семейство, поколения
 * и исполнения собираются на ней (SITE-PRD, «Адреса»; решение владельца 01.10.2026).
 */
export function modelFamily(name: string): string {
  let family = name.trim().replace(/\s+/g, " ");
  for (let changed = true; changed;) {
    changed = false;
    for (const suffix of GENERATION_SUFFIXES) {
      const next = family.replace(suffix, "");
      if (next !== family && next.includes(" ")) {
        family = next;
        changed = true;
      }
    }
  }
  return FAMILY_ALIASES[family] ?? family;
}

/** Адрес страницы семейства, к которому относится модель (поколение — на страницу семейства). */
export function modelPath(name: string): string {
  return `${MODELS_PATH}/${modelSlug(modelFamily(name))}`;
}

/** `members` — названия из совместимости товаров, собранные на странице семейства */
export type SiteModel = { name: string; slug: string; productCount: number; members: string[] };

/**
 * Семейства из совместимости товаров: сколько товаров подходит хотя бы к одному поколению,
 * по убыванию, при равенстве — по алфавиту. Разные семейства с одним слугом делят страницу:
 * побеждает то, у кого товаров больше.
 */
export function siteModels(products: readonly { compatibility: readonly string[] }[]): SiteModel[] {
  const families = new Map<string, { count: number; members: Set<string> }>();
  for (const product of products) {
    const names = new Set(product.compatibility.map((model) => model.trim()).filter(Boolean));
    const byFamily = new Map<string, string[]>();
    for (const name of names) {
      const family = modelFamily(name);
      byFamily.set(family, [...(byFamily.get(family) ?? []), name]);
    }
    for (const [family, members] of byFamily) {
      const entry = families.get(family) ?? { count: 0, members: new Set<string>() };
      entry.count += 1;
      for (const member of members) entry.members.add(member);
      families.set(family, entry);
    }
  }
  const sorted = [...families]
    .map(([name, { count, members }]) => ({
      name,
      slug: modelSlug(name),
      productCount: count,
      members: [...members].sort((a, b) => a.localeCompare(b, "ru")),
    }))
    .sort((a, b) => b.productCount - a.productCount || a.name.localeCompare(b.name, "ru"));
  const seen = new Set<string>();
  return sorted.filter((model) => !seen.has(model.slug) && seen.add(model.slug));
}

export function modelTitle(name: string): string {
  return `Комплектующие для ${name} — купить | ${COMPANY.brand}`;
}

export function modelDescription(name: string, productCount: number): string {
  return `${productCount} ${pluralize(productCount, ["товар", "товара", "товаров"])} для ${name}: сиденья, детали салона и кузова. Доставка по России, Беларуси, Казахстану и Киргизии — ${COMPANY.brand}.`;
}
