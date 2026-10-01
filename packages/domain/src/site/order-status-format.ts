import { moscowParts } from "../datetime";

/**
 * Даты в блоке «Проверить статус заказа» — отдельно от схем `./order-status.ts`, чтобы
 * блок на главной не тянул в браузер zod.
 */

const SHORT_MONTHS = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"] as const;
const GENITIVE_MONTHS = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
] as const;

/** `2026-09-28T…` → «28 сен» — подпись шага под шкалой; день по Москве. */
export function formatStepDate(iso: string): string {
  const { day, month } = moscowParts(new Date(iso));
  return `${day} ${SHORT_MONTHS[month]}`;
}

/** `2026-10-03T…` → «3 октября» — ожидаемая доставка; день по Москве. */
export function formatDeliveryDate(iso: string): string {
  const { day, month } = moscowParts(new Date(iso));
  return `${day} ${GENITIVE_MONTHS[month]}`;
}
