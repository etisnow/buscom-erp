/**
 * Период экрана «Аналитика» (PRD, M7).
 *
 * Границы считаются по Москве: «сентябрь» — это с 1 сентября 00:00 МСК до
 * 1 октября 00:00 МСК, а в базе время в UTC. Интервал полуоткрытый — `[from, to)`,
 * чтобы соседние периоды не делили граничную миллисекунду. В Москве нет перехода
 * на летнее время с 2014 года, поэтому сдвиг постоянный (+3 ч), как и в фильтре
 * дат списка заказов.
 */

const MOSCOW_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export const PERIOD_PRESETS = ["month", "prev-month", "quarter", "year", "prev-year", "all"] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

export const PERIOD_PRESET_LABELS: Record<PeriodPreset, string> = {
  month: "Этот месяц",
  "prev-month": "Прошлый месяц",
  quarter: "Последние 3 месяца",
  year: "Этот год",
  "prev-year": "Прошлый год",
  all: "Всё время",
};

export const DEFAULT_PERIOD_PRESET: PeriodPreset = "month";

/** По дням — короткий период, иначе по месяцам. */
export type Bucket = "day" | "month";

export type Period = {
  /** Выбранный пресет; null — даты заданы руками */
  preset: PeriodPreset | null;
  /** null — «Всё время»: без нижней границы */
  from: Date | null;
  /** Исключительно */
  to: Date;
  bucket: Bucket;
};

/** Полночь по Москве для календарной даты (месяц — с нуля, может выходить за 0–11). */
function moscowMidnight(year: number, month: number, day = 1): Date {
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

/** Последний день периода включительно — для полей «по» и ссылок в список заказов. */
export function lastDayInclusive(to: Date): Date {
  return new Date(to.getTime() - 1);
}

function bucketFor(from: Date | null, to: Date): Bucket {
  return from !== null && to.getTime() - from.getTime() <= 62 * DAY_MS ? "day" : "month";
}

function presetRange(preset: PeriodPreset, now: Date): { from: Date | null; to: Date } {
  const { year, month, day } = moscowParts(now);
  const tomorrow = moscowMidnight(year, month, day + 1);
  switch (preset) {
    case "month":
      return { from: moscowMidnight(year, month), to: moscowMidnight(year, month + 1) };
    case "prev-month":
      return { from: moscowMidnight(year, month - 1), to: moscowMidnight(year, month) };
    case "quarter":
      // Текущий месяц и два предыдущих целиком — чтобы в графике не было обрезанных месяцев
      return { from: moscowMidnight(year, month - 2), to: moscowMidnight(year, month + 1) };
    case "year":
      return { from: moscowMidnight(year, 0), to: moscowMidnight(year + 1, 0) };
    case "prev-year":
      return { from: moscowMidnight(year - 1, 0), to: moscowMidnight(year, 0) };
    case "all":
      return { from: null, to: tomorrow };
  }
}

/**
 * Период из параметров адреса. Даты «с» и «по» (включительно) важнее пресета;
 * одна заданная дата дополняется второй: «с» без «по» — до сегодня, «по» без «с» —
 * с начала того же месяца. Перепутанные местами даты меняются местами.
 */
export function resolvePeriod(params: { preset?: string; from?: string; to?: string }, now: Date = new Date()): Period {
  const fromInput = parseDateInput(params.from);
  const toInput = parseDateInput(params.to);

  if (fromInput || toInput) {
    const today = moscowParts(now);
    let from = fromInput;
    let to = toInput ? new Date(toInput.getTime() + DAY_MS) : moscowMidnight(today.year, today.month, today.day + 1);
    if (!from) {
      const last = moscowParts(lastDayInclusive(to));
      from = moscowMidnight(last.year, last.month);
    }
    if (from.getTime() >= to.getTime()) {
      [from, to] = [new Date(to.getTime() - DAY_MS), new Date(from.getTime() + DAY_MS)];
    }
    return { preset: null, from, to, bucket: bucketFor(from, to) };
  }

  const preset = (PERIOD_PRESETS as readonly string[]).includes(params.preset ?? "")
    ? (params.preset as PeriodPreset)
    : DEFAULT_PERIOD_PRESET;
  const { from, to } = presetRange(preset, now);
  return { preset, from, to, bucket: bucketFor(from, to) };
}

/** Ключ ячейки графика: `2026-09` для месяца, `2026-09-24` для дня. */
export function bucketKey(date: Date, bucket: Bucket): string {
  const input = toDateInput(date);
  return bucket === "month" ? input.slice(0, 7) : input;
}

/**
 * Все ячейки периода по порядку, в том числе пустые — чтобы провал в графике был
 * виден как провал, а не как соседние столбцы. Для «Всё время» нижняя граница —
 * первая дата с данными (`firstDataAt`); данных нет — ячеек нет.
 */
export function bucketStarts(period: Period, firstDataAt: Date | null): Date[] {
  const start = period.from ?? firstDataAt;
  if (!start) return [];
  const result: Date[] = [];
  const first = moscowParts(start);
  for (let i = 0; ; i++) {
    const date =
      period.bucket === "month"
        ? moscowMidnight(first.year, first.month + i)
        : moscowMidnight(first.year, first.month, first.day + i);
    if (date.getTime() >= period.to.getTime()) break;
    result.push(date);
  }
  return result;
}

const MONTHS_SHORT = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

/** Подпись ячейки: «сен 2026» или «24.09». */
export function bucketLabel(date: Date, bucket: Bucket): string {
  const { year, month, day } = moscowParts(date);
  return bucket === "month"
    ? `${MONTHS_SHORT[month]} ${year}`
    : `${String(day).padStart(2, "0")}.${String(month + 1).padStart(2, "0")}`;
}
