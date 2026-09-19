/**
 * Время в системе хранится в UTC, а показывается в Europe/Moscow.
 * Форматирование — единственное место, где появляется часовой пояс.
 */
const MOSCOW = "Europe/Moscow";

const dateTimeFormatter = new Intl.DateTimeFormat("ru-RU", {
  timeZone: MOSCOW,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  timeZone: MOSCOW,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/** 20.09.2026, 14:35 */
export function formatMoscowDateTime(date: Date): string {
  return dateTimeFormatter.format(date);
}

/** 20.09.2026 */
export function formatMoscowDate(date: Date): string {
  return dateFormatter.format(date);
}

/** Телефон +79161234567 → +7 (916) 123-45-67. Ненормализованный отдаём как есть. */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const match = /^\+7(\d{3})(\d{3})(\d{2})(\d{2})$/.exec(phone);
  if (!match) return phone;
  return `+7 (${match[1]}) ${match[2]}-${match[3]}-${match[4]}`;
}
