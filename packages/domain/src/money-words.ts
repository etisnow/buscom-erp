/**
 * Сумма прописью для счёта на оплату: «Двадцать четыре тысячи пятьсот рублей 00 копеек».
 * Без неё счёт не принимают в бухгалтерии, поэтому правила склонения — отдельным модулем с тестами.
 */
import { assertKopecks, type Kopecks } from "./money";

const ONES_MALE = ["", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"];

const ONES_FEMALE = ["", "одна", "две", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"];

const TEENS = [
  "десять",
  "одиннадцать",
  "двенадцать",
  "тринадцать",
  "четырнадцать",
  "пятнадцать",
  "шестнадцать",
  "семнадцать",
  "восемнадцать",
  "девятнадцать",
];

const TENS = [
  "",
  "",
  "двадцать",
  "тридцать",
  "сорок",
  "пятьдесят",
  "шестьдесят",
  "семьдесят",
  "восемьдесят",
  "девяносто",
];

const HUNDREDS = [
  "",
  "сто",
  "двести",
  "триста",
  "четыреста",
  "пятьсот",
  "шестьсот",
  "семьсот",
  "восемьсот",
  "девятьсот",
];

/** Формы слова для 1, 2–4 и 5–20: «рубль, рубля, рублей». */
export type WordForms = [one: string, few: string, many: string];

/** Выбор формы слова по числу с учётом русских правил (11–14 — особый случай). */
export function pluralize(count: number, forms: WordForms): string {
  const abs = Math.abs(count);
  const lastTwo = abs % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return forms[2];

  const last = abs % 10;
  if (last === 1) return forms[0];
  if (last >= 2 && last <= 4) return forms[1];
  return forms[2];
}

/** Трёхзначная группа прописью. `female` — для тысяч («одна тысяча», «две тысячи»). */
function groupToWords(group: number, female: boolean): string[] {
  const words: string[] = [];
  const hundreds = Math.floor(group / 100);
  const remainder = group % 100;

  if (hundreds > 0) words.push(HUNDREDS[hundreds] as string);

  if (remainder >= 10 && remainder <= 19) {
    words.push(TEENS[remainder - 10] as string);
  } else {
    const tens = Math.floor(remainder / 10);
    const ones = remainder % 10;
    if (tens > 0) words.push(TENS[tens] as string);
    if (ones > 0) words.push((female ? ONES_FEMALE[ones] : ONES_MALE[ones]) as string);
  }

  return words;
}

const GROUP_FORMS: { forms: WordForms; female: boolean }[] = [
  { forms: ["", "", ""], female: false }, // единицы — само существительное подставляется снаружи
  { forms: ["тысяча", "тысячи", "тысяч"], female: true },
  { forms: ["миллион", "миллиона", "миллионов"], female: false },
  { forms: ["миллиард", "миллиарда", "миллиардов"], female: false },
];

/** Целое число прописью. Ноль отдаётся как «ноль». */
export function numberToWords(value: number, female = false): string {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Прописью выводится только целое неотрицательное число, получено: ${value}`);
  }
  if (value === 0) return "ноль";

  const groups: number[] = [];
  let rest = value;
  while (rest > 0) {
    groups.push(rest % 1000);
    rest = Math.floor(rest / 1000);
  }
  if (groups.length > GROUP_FORMS.length) {
    throw new Error("Слишком большое число для вывода прописью");
  }

  const words: string[] = [];
  for (let index = groups.length - 1; index >= 0; index--) {
    const group = groups[index] as number;
    if (group === 0) continue;

    const config = GROUP_FORMS[index] as { forms: WordForms; female: boolean };
    const isUnits = index === 0;
    words.push(...groupToWords(group, isUnits ? female : config.female));
    if (!isUnits) words.push(pluralize(group, config.forms));
  }

  return words.join(" ");
}

const RUBLE_FORMS: WordForms = ["рубль", "рубля", "рублей"];
const KOPECK_FORMS: WordForms = ["копейка", "копейки", "копеек"];

/**
 * «123450 → Одна тысяча двести тридцать четыре рубля 50 копеек».
 * Копейки цифрами — так принято в счетах.
 */
export function kopecksToWords(kopecks: Kopecks): string {
  assertKopecks(kopecks);
  if (kopecks < 0) {
    throw new Error("Сумма прописью не выводится для отрицательных значений");
  }

  const rubles = Math.floor(kopecks / 100);
  const remainder = kopecks % 100;

  const rublesWords = numberToWords(rubles);
  const capitalized = rublesWords.charAt(0).toUpperCase() + rublesWords.slice(1);

  return `${capitalized} ${pluralize(rubles, RUBLE_FORMS)} ${String(remainder).padStart(2, "0")} ${pluralize(
    remainder,
    KOPECK_FORMS,
  )}`;
}
