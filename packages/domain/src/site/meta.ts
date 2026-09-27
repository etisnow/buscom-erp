import { COMPANY } from "../company";

/**
 * Шаблоны метатегов для страниц без своих (docs/SITE-PRD.md, «Метатеги и разметка»).
 * Общие для сайта и подсказок в ERP: там поле Title показывает, что встанет, если
 * его не заполнить.
 */

export function defaultTitle(name: string): string {
  return `${name} — купить в Нижнем Новгороде | ${COMPANY.brand}`;
}

/** «Диваны для микроавтобусов» уже про микроавтобусы — второй раз не приписываем. */
export function defaultCategoryDescription(name: string): string {
  const subject = /микроавтобус/i.test(name) ? name : `${name} для микроавтобусов`;
  return `${subject} — каталог ${COMPANY.brand}`;
}

/** Начало описания товара одной строкой — до 160 знаков, как показывает поисковик. */
export function descriptionSnippet(text: string | null): string | undefined {
  return text ? text.replace(/\s+/g, " ").trim().slice(0, 160) : undefined;
}
