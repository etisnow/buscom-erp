import { COMPANY } from "../company";
import { pluralize } from "../money-words";
import { slugify } from "./slug";

/**
 * Страницы моделей авто на сайте (docs/SITE-PLAN.md, этап 7): `/modeli/{slug}` —
 * формат утверждён владельцем 27.09.2026 (SITE-PRD, «Адреса»).
 *
 * Модели берутся из совместимости товаров в продаже, а не из справочника: у сайта
 * права только на таблицы каталога (scripts/site-db-role.sql), а страница модели
 * без товаров не нужна. Слуг — транслитерация названия; переименование модели в
 * ERP оставляет 301 со старого адреса (`modelPath`).
 */

export const MODELS_PATH = "/modeli";

export function modelSlug(name: string): string {
  return slugify(name);
}

export function modelPath(name: string): string {
  return `${MODELS_PATH}/${modelSlug(name)}`;
}

export type SiteModel = { name: string; slug: string; productCount: number };

/**
 * Модели из совместимости товаров: сколько товаров подходит, по убыванию, при
 * равенстве — по алфавиту. Разные названия с одним слугом («Iveco Daily 2015+» и
 * «Iveco Daily 2015») делят страницу: побеждает то, у кого товаров больше.
 */
export function siteModels(products: readonly { compatibility: readonly string[] }[]): SiteModel[] {
  const counts = new Map<string, number>();
  for (const product of products) {
    for (const name of new Set(product.compatibility.map((model) => model.trim()).filter(Boolean))) {
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  const sorted = [...counts]
    .map(([name, productCount]) => ({ name, slug: modelSlug(name), productCount }))
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
