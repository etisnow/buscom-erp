/**
 * Время в системе хранится в UTC, а показывается в Europe/Moscow.
 * Форматирование — единственное место, где появляется часовой пояс.
 */
const MOSCOW = "Europe/Moscow";
/** В Москве нет перехода на летнее время с 2014 года — сдвиг постоянный. */
const MOSCOW_OFFSET_MS = 3 * 60 * 60 * 1000;

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

/**
 * +79161234567 → «8 (916) 123-45-67». Для выгрузок: ячейка, начинающаяся с «+»,
 * для Excel выглядит формулой, и её приходится обезвреживать апострофом — а он
 * потом виден в таблице. Восьмёрка — привычная запись того же номера.
 * Не распознанный номер отдаём как есть.
 */
export function formatPhoneLocal(phone: string | null | undefined): string {
  if (!phone) return "";
  const formatted = formatPhone(phone);
  return formatted.startsWith("+7 ") ? `8 ${formatted.slice(3)}` : formatted;
}

/** Полночь по Москве для календарной даты (месяц — с нуля, может выходить за 0–11). */
export function moscowMidnight(year: number, month: number, day = 1): Date {
  return new Date(Date.UTC(year, month, day) - MOSCOW_OFFSET_MS);
}

/** Календарные поля даты по Москве. */
export function moscowParts(date: Date): { year: number; month: number; day: number } {
  const shifted = new Date(date.getTime() + MOSCOW_OFFSET_MS);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth(), day: shifted.getUTCDate() };
}

/** `2026-09-01` из `<input type="date">` — полночь по Москве; мусор — null. */
export function parseDateInput(value: string | undefined): Date | null {
  const match = value ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]) - 1, Number(match[3])];
  const date = moscowMidnight(year, month, day);
  // 2026-02-31 Date.UTC молча превратит в 3 марта — такую дату не принимаем
  const parts = moscowParts(date);
  return parts.year === year && parts.month === month && parts.day === day ? date : null;
}

/** Дата по Москве в формате `<input type="date">`. */
export function toDateInput(date: Date): string {
  const { year, month, day } = moscowParts(date);
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
