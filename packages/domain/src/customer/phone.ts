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

/** Префикс, с которого начинается поле телефона на сайте */
export const PHONE_INPUT_PREFIX = "+7 ";

/**
 * Поле телефона на сайте: «+7» стоит сразу, цифры раскладываются в «+7 912 345-67-89»
 * по мере набора. Вставка или автозаполнение браузера («89123456789», «+7 (912) 345-67-89»)
 * приводятся к тому же виду. Больше 10 цифр после +7 не принимается.
 */
export function formatPhoneInput(raw: string): string {
  const text = raw.trim();
  let digits: string;
  if (text.startsWith("+7")) {
    digits = text.slice(2).replace(/\D/g, "");
  } else {
    digits = text.replace(/\D/g, "");
    // Номер целиком, с восьмёркой или семёркой впереди — код страны отбрасываем
    if (digits.length === 11 && (digits.startsWith("8") || digits.startsWith("7"))) digits = digits.slice(1);
  }
  digits = digits.slice(0, 10);
  const parts = [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 8), digits.slice(8, 10)];
  let result = PHONE_INPUT_PREFIX + parts[0];
  if (parts[1]) result += ` ${parts[1]}`;
  if (parts[2]) result += `-${parts[2]}`;
  if (parts[3]) result += `-${parts[3]}`;
  return result;
}
