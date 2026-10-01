import { COMPANY } from "../company";
import { pluralize } from "../money-words";
import { MODELS_PATH, modelFamily, modelSlug } from "./models";

/**
 * Посадочные «категория + семейство модели» (docs/SITE-PLAN.md, этап 7; формат адреса утверждён
 * владельцем 27.09.2026): `/modeli/gazel-next/sidenja-dlya-microavtobusov`. Страница собирает
 * товары категории (вместе с подкатегориями), подходящие семейству, и закрывает запросы вида
 * «сиденья для газель некст» (docs/SEO-SEMANTICS.md).
 */

/** Меньше товаров — страница тонкая и в поиске не нужна: её нет ни в карте сайта, ни ссылкой */
export const MIN_LANDING_PRODUCTS = 3;

export function landingPath(familySlug: string, categorySlug: string): string {
  return `${MODELS_PATH}/${familySlug}/${categorySlug}`;
}

/**
 * Название страницы: «Сиденья для Ford Transit», «Комплектующие для сидений Ford Transit».
 * Если в названии категории уже есть «для», семейство дописывается без второго «для».
 */
export function landingPhrase(categoryName: string, family: string): string {
  const name = categoryName.trim();
  return / для /i.test(name) ? `${name} ${family}` : `${name} для ${family}`;
}

export function landingTitle(phrase: string): string {
  return `${phrase} — купить | ${COMPANY.brand}`;
}

export function landingDescription(phrase: string, productCount: number): string {
  return `${phrase}: ${productCount} ${pluralize(productCount, ["товар", "товара", "товаров"])}. Доставка по России, Беларуси, Казахстану и Киргизии — ${COMPANY.brand}.`;
}

export type LandingCombo = { family: string; familySlug: string; categoryId: string; productCount: number };

/**
 * Какие страницы есть: пары «семейство × категория», где подходящих товаров не меньше порога.
 * `categoryPath` у товара — его категория и все её предки: страница раздела включает подкатегории.
 * Товар, подходящий нескольким поколениям одного семейства, считается один раз.
 */
export function landingCombos(
  products: readonly { categoryPath: readonly string[]; compatibility: readonly string[] }[],
  min = MIN_LANDING_PRODUCTS,
): LandingCombo[] {
  const counts = new Map<string, LandingCombo>();
  for (const product of products) {
    const families = new Set(product.compatibility.map((name) => modelFamily(name)).filter(Boolean));
    for (const family of families) {
      for (const categoryId of new Set(product.categoryPath)) {
        const key = `${family}\u0000${categoryId}`;
        const entry = counts.get(key) ?? { family, familySlug: modelSlug(family), categoryId, productCount: 0 };
        entry.productCount += 1;
        counts.set(key, entry);
      }
    }
  }
  const seen = new Set<string>();
  return [...counts.values()]
    .filter((combo) => combo.productCount >= min)
    .sort((a, b) => b.productCount - a.productCount || a.family.localeCompare(b.family, "ru"))
    .filter((combo) => {
      // Разные семейства с одним слугом делят страницу — как и на странице модели
      const key = `${combo.familySlug}\u0000${combo.categoryId}`;
      return !seen.has(key) && seen.add(key);
    });
}
