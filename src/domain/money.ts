/**
 * Деньги в системе — целые копейки (number, integer). Никаких float-рублей в расчётах.
 * Рубли появляются только на границе: ввод в форме и отображение.
 */
export type Kopecks = number;

export function assertKopecks(value: number): asserts value is Kopecks {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`Сумма должна быть целым числом копеек, получено: ${value}`);
  }
}

/** "1 234,50" | "1234.5" | 1234.5 → 123450 */
export function rublesToKopecks(rubles: string | number): Kopecks {
  const normalized = typeof rubles === "number" ? String(rubles) : rubles.replace(/\s/g, "").replace(",", ".");
  if (!/^-?\d+(\.\d{1,2})?$/.test(normalized)) {
    throw new Error(`Некорректная сумма: ${rubles}`);
  }
  const [whole, fraction = ""] = normalized.split(".");
  const sign = whole.startsWith("-") ? -1 : 1;
  const kopecks = Math.abs(Number(whole)) * 100 + Number(fraction.padEnd(2, "0"));
  return sign * kopecks;
}

const rubFormatter = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** 123450 → "1 234,5 ₽" */
export function formatRub(kopecks: Kopecks): string {
  return rubFormatter.format(kopecks / 100);
}

/**
 * 123450 → "1234,50". Без разделителя тысяч и знака валюты: в таком виде Excel
 * с русской локалью видит в ячейке выгрузки число и умеет его складывать.
 */
export function formatRubPlain(kopecks: Kopecks): string {
  const sign = kopecks < 0 ? "-" : "";
  const absolute = Math.abs(kopecks);
  return `${sign}${Math.trunc(absolute / 100)},${String(absolute % 100).padStart(2, "0")}`;
}
