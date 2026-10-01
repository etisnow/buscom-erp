import { COMPANY } from "../company";
import { stripInline } from "./rich-text";

/**
 * Шаблоны метатегов для страниц без своих (docs/SITE-PRD.md, «Метатеги и разметка»).
 * Общие для сайта и подсказок в ERP: там поле Title показывает, что встанет, если
 * его не заполнить.
 */

export function defaultTitle(name: string): string {
  return `${name} — купить | ${COMPANY.brand}`;
}

/** «Диваны для микроавтобусов» уже про микроавтобусы — второй раз не приписываем. */
export function defaultCategoryDescription(name: string): string {
  const subject = /микроавтобус/i.test(name) ? name : `${name} для микроавтобусов`;
  return `${subject} — каталог ${COMPANY.brand}`;
}

/** Маркер блока в начале строки: «## », «### », «> », «• », «1. » — в сниппете поисковика ни к чему. */
const BLOCK_MARKER = /^(?:#{2,3}\s+|>\s+|[•-]\s+|\d+[.)]\s+)/gm;

/** Начало описания товара одной строкой — до 160 знаков, как показывает поисковик. Без разметки. */
export function descriptionSnippet(text: string | null): string | undefined {
  if (!text) return undefined;
  const plain = stripInline(text).replace(BLOCK_MARKER, "").replace(/\s+/g, " ").trim().slice(0, 160);
  return plain || undefined;
}
