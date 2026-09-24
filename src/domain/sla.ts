/**
 * SLA по статусам заказа (docs/PRD.md, «Бизнес-правила» и «Статусная модель»).
 * Время в статусе считается только по рабочим минутам: пн–пт 09:00–18:00 по Москве.
 *
 * Москва с 2014 года — фиксированный UTC+3 без перехода на летнее время,
 * поэтому смещение здесь константой, без библиотеки часовых поясов.
 * Производственный календарь (праздники РФ) — после MVP, сейчас праздники считаются рабочими.
 */
import type { OrderStatus } from "@/generated/prisma/enums";

const MSK_OFFSET_MINUTES = 3 * 60;
const MINUTES_PER_DAY = 24 * 60;
const WORK_START_MINUTE = 9 * 60;
const WORK_END_MINUTE = 18 * 60;

/**
 * Контроль SLA в интерфейсе: подсветка просрочки в списке, вид «Просроченные»,
 * колонка «Просрочен» в выгрузке, нормативы в справочниках. Выключен 2026-09-24 —
 * владельцу SLA не нужен (docs/DECISIONS.md). Дедлайн `slaDueAt` в заказе продолжает
 * считаться, так что включение — только смена этого флага.
 */
export const SLA_ENABLED = false;

/** Рабочих минут в одном рабочем дне — 9 часов. */
export const WORKING_MINUTES_PER_DAY = WORK_END_MINUTE - WORK_START_MINUTE;

/**
 * SLA на статус в рабочих минутах. `null` — контроль не ведётся
 * (заказ выполнен или отменён).
 */
export const DEFAULT_SLA_MINUTES: Record<OrderStatus, number | null> = {
  NEW: 30,
  IN_PROGRESS: WORKING_MINUTES_PER_DAY,
  COMPLETED: null,
  CANCELLED: null,
};

/** Минуты от эпохи в московском времени — в них удобно считать дни и время суток. */
function toMskMinutes(date: Date): number {
  const time = date.getTime();
  if (!Number.isFinite(time)) {
    throw new Error("Некорректная дата");
  }
  return Math.floor(time / 60_000) + MSK_OFFSET_MINUTES;
}

function fromMskMinutes(mskMinutes: number): Date {
  return new Date((mskMinutes - MSK_OFFSET_MINUTES) * 60_000);
}

/** 1 января 1970 — четверг, отсюда сдвиг на 4 при переводе в «0 — воскресенье». */
function isWorkingDay(dayIndex: number): boolean {
  const weekday = (((dayIndex + 4) % 7) + 7) % 7;
  return weekday >= 1 && weekday <= 5;
}

function workingMinutesInDay(dayIndex: number, fromMinute: number, toMinute: number): number {
  if (!isWorkingDay(dayIndex)) return 0;
  const start = Math.max(fromMinute, WORK_START_MINUTE);
  const end = Math.min(toMinute, WORK_END_MINUTE);
  return Math.max(0, end - start);
}

/**
 * Сколько рабочих минут прошло между двумя моментами.
 * Обратный порядок дат даёт 0 — «отрицательного времени в статусе» не бывает.
 */
export function workingMinutesBetween(from: Date, to: Date): number {
  const start = toMskMinutes(from);
  const end = toMskMinutes(to);
  if (end <= start) return 0;

  const firstDay = Math.floor(start / MINUTES_PER_DAY);
  const lastDay = Math.floor(end / MINUTES_PER_DAY);

  let total = 0;
  for (let day = firstDay; day <= lastDay; day++) {
    const dayStart = day * MINUTES_PER_DAY;
    const fromMinute = day === firstDay ? start - dayStart : 0;
    const toMinute = day === lastDay ? end - dayStart : MINUTES_PER_DAY;
    total += workingMinutesInDay(day, fromMinute, toMinute);
  }
  return total;
}

/**
 * Момент, когда истекает срок: к `from` прибавляется `minutes` рабочих минут.
 * Начало вне рабочего времени сдвигается к ближайшему рабочему началу.
 * Возвращается самый ранний подходящий момент: рабочий день от 09:00 пятницы
 * истекает в 18:00 той же пятницы, а не в 09:00 понедельника.
 */
export function addWorkingMinutes(from: Date, minutes: number): Date {
  if (!Number.isInteger(minutes) || minutes < 0) {
    throw new Error(`Рабочие минуты должны быть целым неотрицательным числом, получено: ${minutes}`);
  }

  let cursor = toMskMinutes(from);
  let left = minutes;

  // Шагаем по дням: в каждом берём сколько сможем из его рабочего окна.
  for (let guard = 0; guard < 4_000; guard++) {
    const day = Math.floor(cursor / MINUTES_PER_DAY);
    const dayStart = day * MINUTES_PER_DAY;
    const minuteOfDay = cursor - dayStart;

    if (!isWorkingDay(day) || minuteOfDay >= WORK_END_MINUTE) {
      cursor = dayStart + MINUTES_PER_DAY + WORK_START_MINUTE;
      continue;
    }

    const windowStart = Math.max(minuteOfDay, WORK_START_MINUTE);
    const available = WORK_END_MINUTE - windowStart;

    if (left <= available) {
      return fromMskMinutes(dayStart + windowStart + left);
    }
    left -= available;
    cursor = dayStart + MINUTES_PER_DAY + WORK_START_MINUTE;
  }

  throw new Error("Слишком большой срок SLA");
}

export type SlaState = {
  /** Рабочих минут прошло с последней смены статуса */
  elapsedMinutes: number;
  /** Норматив на статус; null — не контролируется */
  slaMinutes: number | null;
  isOverdue: boolean;
  /** Сколько рабочих минут просрочено (0, если в срок) */
  overdueMinutes: number;
};

/** Состояние SLA заказа: сколько провисел в статусе и просрочен ли. */
export function slaState(status: OrderStatus, statusChangedAt: Date, now: Date = new Date()): SlaState {
  const slaMinutes = DEFAULT_SLA_MINUTES[status];
  const elapsedMinutes = workingMinutesBetween(statusChangedAt, now);

  if (slaMinutes === null) {
    return { elapsedMinutes, slaMinutes, isOverdue: false, overdueMinutes: 0 };
  }

  const overdueMinutes = Math.max(0, elapsedMinutes - slaMinutes);
  return { elapsedMinutes, slaMinutes, isOverdue: overdueMinutes > 0, overdueMinutes };
}

/** «2 раб. дн. 3 ч» — для колонки «время в статусе». */
export function formatWorkingMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} мин`;

  const days = Math.floor(minutes / WORKING_MINUTES_PER_DAY);
  const hours = Math.floor((minutes % WORKING_MINUTES_PER_DAY) / 60);

  if (days === 0) return `${hours} ч`;
  return hours === 0 ? `${days} раб. дн.` : `${days} раб. дн. ${hours} ч`;
}
