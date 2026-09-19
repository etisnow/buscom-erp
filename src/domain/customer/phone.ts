/**
 * Нормализация российских телефонов к виду +7XXXXXXXXXX.
 * По нормализованному телефону сопоставляются клиенты при импорте заказов с сайта.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, "");

  if (digits.length === 11 && (digits.startsWith("8") || digits.startsWith("7"))) {
    digits = digits.slice(1);
  }
  if (digits.length !== 10) return null;

  return `+7${digits}`;
}
