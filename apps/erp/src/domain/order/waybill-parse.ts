/**
 * Разбор транспортной накладной: текст (OCR или текстовый слой PDF) и
 * прочитанные штрихкоды → поля блока «Доставка». Чистая функция без OCR —
 * распознавание в `src/server/orders/waybill-recognition.ts`.
 *
 * Правила сняты с экспедиторской расписки «Деловых Линий» (№26-01211275323).
 * OCR на сканах ошибается в цифрах, поэтому менеджер проверяет подставленное
 * перед сохранением, а номер сверяется со штрихкодом — там он без ошибок.
 */
import { rublesToKopecks, type Kopecks } from "@/domain/money";
import { MAX_CARGO_SIDE_CM, MAX_CARGO_WEIGHT_GRAMS } from "@/domain/order/delivery";

export type WaybillFields = {
  /** Название из справочника ТК — только то, что в нём есть */
  carrier: string | null;
  trackingNumber: string | null;
  /** Дата документа, `2026-09-25` — как у поля даты */
  shippedAt: string | null;
  weightGrams: number | null;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  /** «Итог» к оплате */
  priceKopecks: Kopecks | null;
  /** Город назначения: «…из г. Нижний Новгород в г. Тула» → «Тула» */
  destination: string | null;
};

/** Сравнение без регистра, пробелов и знаков: OCR склеивает «ДЕЛОВЫЕЛИНИИ». */
const squash = (value: string) =>
  value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]/g, "");

/** Как ТК подписывает себя на бланке, если это не совпадает с названием в справочнике. */
const CARRIER_ALIASES: Record<string, string[]> = {
  деловыелинии: ["dellin", "деловыхлиний"],
};

/**
 * ТК из справочника, чьё название есть в тексте. Короткие названия («КИТ», «ПЭК»)
 * ищем только отдельным словом — склеенными они найдутся внутри чего угодно.
 * Из нескольких совпадений — самое длинное название.
 */
export function findCarrier(text: string, carriers: readonly string[]): string | null {
  const squashed = squash(text);
  const words = new Set(
    text
      .toLowerCase()
      .replace(/ё/g, "е")
      .split(/[^a-zа-я0-9]+/),
  );
  let best: string | null = null;
  for (const carrier of carriers) {
    const key = squash(carrier.replace(/\(.*?\)/g, ""));
    if (key.length === 0) continue;
    const variants = [key, ...(CARRIER_ALIASES[key] ?? [])];
    const found = variants.some((variant) => (variant.length < 5 ? words.has(variant) : squashed.includes(variant)));
    if (found && (best === null || carrier.length > best.length)) best = carrier;
  }
  return best;
}

/**
 * Номер вида «26-01211275323». Цифры после дефиса OCR путает, поэтому ищем их
 * в штрихкодах окном той же длины: берём окно, совпадающее с прочитанным хотя
 * бы на 60% позиций, если такое одно. Без штрихкода — только если OCR прочитал
 * одни цифры; иначе номер не угадываем.
 */
export function findTrackingNumber(text: string, barcodes: readonly string[]): string | null {
  const match = /№\s*(\d{2})\s*[-–—]\s*([0-9A-Za-zА-Яа-я$|]{9,13})/.exec(text);
  if (!match) return null;
  const [, prefix, raw] = match;
  const body = raw.replace(/[OОoо]/g, "0").replace(/[lI|]/g, "1");

  let best: { value: string; score: number } | null = null;
  let tie = false;
  for (const code of barcodes) {
    const digits = code.replace(/\D/g, "");
    for (let start = 0; start + body.length <= digits.length; start++) {
      const window = digits.slice(start, start + body.length);
      let score = 0;
      for (let index = 0; index < body.length; index++) if (window[index] === body[index]) score++;
      if (best === null || score > best.score) {
        best = { value: window, score };
        tie = false;
      } else if (score === best.score && window !== best.value) {
        tie = true;
      }
    }
  }
  if (best && !tie && best.score >= Math.ceil(body.length * 0.6)) return `${prefix}-${best.value}`;
  return /^\d+$/.test(body) ? `${prefix}-${body}` : null;
}

/** Первая дата «от 25.09.2026» — дата документа. */
export function findDocumentDate(text: string): string | null {
  const match = /(?:^|[^а-яё])от\s+(\d{2})\.(\d{2})\.(\d{4})/i.exec(text);
  if (!match) return null;
  const [, day, month, year] = match;
  if (Number(month) < 1 || Number(month) > 12 || Number(day) < 1 || Number(day) > 31) return null;
  return `${year}-${month}-${day}`;
}

/** Вес «18 кг» / «18,5 кг» → граммы. Первое упоминание. */
export function findWeightGrams(text: string): number | null {
  const match = /(\d+(?:[.,]\d{1,3})?)\s*кг(?![а-яё])/i.exec(text);
  if (!match) return null;
  const grams = Math.round(Number(match[1].replace(",", ".")) * 1000);
  return grams > 0 && grams <= MAX_CARGO_WEIGHT_GRAMS ? grams : null;
}

/** «1,53 × 0,7 × 0,3 м» → сантиметры. OCR пишет знак умножения как «х», «x» или «*». */
export function findDimensionsCm(text: string): [number, number, number] | null {
  const number = String.raw`(\d+(?:[.,]\d+)?)`;
  const times = String.raw`\s*[хxX×*]\s*`;
  const match = new RegExp(`${number}${times}${number}${times}${number}\\s*м(?![а-яё3])`, "i").exec(text);
  if (!match) return null;
  const sides = match.slice(1, 4).map((side) => Math.round(Number(side.replace(",", ".")) * 100));
  if (sides.some((side) => side <= 0 || side > MAX_CARGO_SIDE_CM)) return null;
  return sides as [number, number, number];
}

/** «Итог 2 973,00» — последнее упоминание, не «Итого»: итого идёт без страховки. */
export function findTotalKopecks(text: string): Kopecks | null {
  const matches = [...text.matchAll(/Итог(?![а-яё])\s*:?\s*(\d{1,3}(?:[  ]?\d{3})*[.,]\d{2})/gi)];
  const last = matches.at(-1);
  if (!last) return null;
  try {
    return rublesToKopecks(last[1]);
  } catch {
    return null;
  }
}

/** «…из г. Нижний Новгород в г. Тула» → «Тула». */
export function findDestination(text: string): string | null {
  const match = /\sв\s+г\.\s*([А-ЯЁ][а-яё-]+(?:[ -][А-ЯЁ][а-яё-]+)*)/.exec(text);
  return match ? match[1] : null;
}

export function parseWaybill(text: string, barcodes: readonly string[], carriers: readonly string[]): WaybillFields {
  const sides = findDimensionsCm(text);
  return {
    carrier: findCarrier(text, carriers),
    trackingNumber: findTrackingNumber(text, barcodes),
    shippedAt: findDocumentDate(text),
    weightGrams: findWeightGrams(text),
    lengthCm: sides?.[0] ?? null,
    widthCm: sides?.[1] ?? null,
    heightCm: sides?.[2] ?? null,
    priceKopecks: findTotalKopecks(text),
    destination: findDestination(text),
  };
}
