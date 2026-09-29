/**
 * Расходы компании на экране «Аналитика»: сколько из них приходится на период.
 *
 * Расход — либо сумма, либо процент от величины аналитики.
 *
 * - Разовая сумма целиком падает на свой день.
 * - Регулярная сумма раскладывается равномерно (решение владельца, 2026-09-29):
 *   квартальная — по трети в месяц, годовая — по 1/12, а внутри месяца — по дням.
 *   Так месяцы сравниваются честно: годовой платёж не делает провал в месяц оплаты.
 *   Период «Этот месяц» получает месячную долю целиком, хотя месяц ещё идёт.
 * - Процент берётся от величины (выручка, маржа, оплаты) за те дни периода, когда
 *   расход действует. Периодичности у него нет: процент от выручки за месяц и за
 *   три месяца по отдельности — одно и то же. Отрицательная база (убыточная маржа)
 *   даёт 0, а не отрицательный расход.
 *
 * Доля каждого расхода округляется до копейки один раз, в конце.
 */
import { z } from "zod";
import { moscowParts, moscowMidnight, parseDateInput } from "../datetime";
import { formatRub, type Kopecks } from "../money";
import { formatPercent } from "../supplier/price-economics";
import type { Period } from "./period";
import type { ExpenseBase, ExpenseRecurrence } from "@buscom/db/enums";

const DAY_MS = 24 * 60 * 60 * 1000;

export const EXPENSE_RECURRENCES = [
  "ONCE",
  "MONTHLY",
  "QUARTERLY",
  "YEARLY",
] as const satisfies readonly ExpenseRecurrence[];
export const EXPENSE_BASES = ["REVENUE", "MARGIN", "PAYMENTS"] as const satisfies readonly ExpenseBase[];

export const EXPENSE_RECURRENCE_LABELS: Record<ExpenseRecurrence, string> = {
  ONCE: "Разовый",
  MONTHLY: "Раз в месяц",
  QUARTERLY: "Раз в квартал",
  YEARLY: "Раз в год",
};

export const EXPENSE_BASE_LABELS: Record<ExpenseBase, string> = {
  REVENUE: "Выручка",
  MARGIN: "Маржа",
  PAYMENTS: "Поступило оплат",
};

/** «от выручки» — для описания процента */
const BASE_GENITIVE: Record<ExpenseBase, string> = {
  REVENUE: "от выручки",
  MARGIN: "от маржи",
  PAYMENTS: "от поступивших оплат",
};

const MONTHS_IN: Record<Exclude<ExpenseRecurrence, "ONCE">, number> = { MONTHLY: 1, QUARTERLY: 3, YEARLY: 12 };

const PER: Record<ExpenseRecurrence, string> = {
  ONCE: "разово",
  MONTHLY: "в месяц",
  QUARTERLY: "в квартал",
  YEARLY: "в год",
};

/** Расход в том виде, в каком он лежит в базе. */
export type ExpenseRule = {
  /** null — процент */
  recurrence: ExpenseRecurrence | null;
  amountKopecks: Kopecks | null;
  percentHundredths: number | null;
  base: ExpenseBase | null;
  /** Полночь по Москве */
  startsOn: Date;
  /** Последний день включительно, полночь по Москве; null — бессрочно */
  endsOn: Date | null;
};

/** Величина аналитики, привязанная к моменту: выручка заказа, его маржа, платёж. */
export type DatedAmount = { at: Date; kopecks: Kopecks };

export type ExpenseBases = Record<ExpenseBase, DatedAmount[]>;

/** «10 000 ₽ в месяц», «5 000 ₽ разово», «6% от выручки». */
export function describeExpense(rule: ExpenseRule): string {
  if (rule.percentHundredths !== null && rule.base !== null) {
    return `${formatPercent(rule.percentHundredths)} ${BASE_GENITIVE[rule.base]}`;
  }
  return `${formatRub(rule.amountKopecks ?? 0)} ${PER[rule.recurrence ?? "ONCE"]}`;
}

/** Действует с `startsOn` по `endsOn` включительно — полуоткрытый интервал `[from, to)`. */
function activeRange(rule: ExpenseRule): { from: Date; to: Date | null } {
  return { from: rule.startsOn, to: rule.endsOn ? new Date(rule.endsOn.getTime() + DAY_MS) : null };
}

/** Пересечение действия расхода с периодом; null — не пересекаются. */
function overlap(rule: ExpenseRule, period: Period): { from: Date; to: Date } | null {
  const active = activeRange(rule);
  const from = period.from && period.from > active.from ? period.from : active.from;
  const to = active.to && active.to < period.to ? active.to : period.to;
  return from < to ? { from, to } : null;
}

/** Действует ли расход хотя бы день внутри периода (разовый — попадает ли в него). */
export function expenseTouchesPeriod(rule: ExpenseRule, period: Period): boolean {
  if (rule.recurrence === "ONCE") {
    return (period.from === null || rule.startsOn >= period.from) && rule.startsOn < period.to;
  }
  return overlap(rule, period) !== null;
}

/** Регулярная сумма за интервал: месячная доля, внутри месяца — по дням. Без округления. */
function spreadAmount(monthlyKopecks: number, from: Date, to: Date): number {
  let total = 0;
  const first = moscowParts(from);
  for (let i = 0; ; i++) {
    const monthStart = moscowMidnight(first.year, first.month + i);
    if (monthStart >= to) break;
    const monthEnd = moscowMidnight(first.year, first.month + i + 1);
    const start = from > monthStart ? from : monthStart;
    const end = to < monthEnd ? to : monthEnd;
    const days = (end.getTime() - start.getTime()) / DAY_MS;
    const daysInMonth = (monthEnd.getTime() - monthStart.getTime()) / DAY_MS;
    if (days > 0) total += (monthlyKopecks * days) / daysInMonth;
  }
  return total;
}

/** Сколько расхода приходится на период, до копейки. */
export function expenseForPeriod(rule: ExpenseRule, period: Period, bases: ExpenseBases): Kopecks {
  if (rule.percentHundredths !== null && rule.base !== null) {
    const range = overlap(rule, period);
    if (!range) return 0;
    const base = bases[rule.base]
      .filter((row) => row.at >= range.from && row.at < range.to)
      .reduce((sum, row) => sum + row.kopecks, 0);
    return base > 0 ? Math.round((base * rule.percentHundredths) / 10_000) : 0;
  }

  const amount = rule.amountKopecks ?? 0;
  if (rule.recurrence === null || rule.recurrence === "ONCE") {
    return expenseTouchesPeriod(rule, period) ? amount : 0;
  }
  const range = overlap(rule, period);
  if (!range) return 0;
  return Math.round(spreadAmount(amount / MONTHS_IN[rule.recurrence], range.from, range.to));
}

export type ExpenseLine<T> = T & { description: string; periodKopecks: Kopecks };

export type ExpensesSummary<T> = { lines: ExpenseLine<T>[]; totalKopecks: Kopecks };

/**
 * Расходы, действующие в периоде, с долей каждого — по убыванию. Процент от нулевой
 * выручки остаётся в списке с нулём: видно, что расход учтён, просто не с чего.
 */
export function summarizeExpenses<T extends ExpenseRule & { name: string }>(
  expenses: T[],
  period: Period,
  bases: ExpenseBases,
): ExpensesSummary<T> {
  const lines = expenses
    .filter((expense) => expenseTouchesPeriod(expense, period))
    .map((expense) => ({
      ...expense,
      description: describeExpense(expense),
      periodKopecks: expenseForPeriod(expense, period, bases),
    }))
    .sort((a, b) => b.periodKopecks - a.periodKopecks || a.name.localeCompare(b.name, "ru"));
  return { lines, totalKopecks: lines.reduce((sum, line) => sum + line.periodKopecks, 0) };
}

const dateInput = (label: string) =>
  z.string().transform((value, ctx) => {
    const date = parseDateInput(value);
    if (!date) {
      ctx.addIssue({ code: "custom", message: `${label}: укажите дату` });
      return z.NEVER;
    }
    return date;
  });

const common = {
  name: z
    .string()
    .trim()
    .min(1, { error: "Укажите название расхода" })
    .max(200, { error: "Название длиннее 200 символов" }),
  comment: z
    .string()
    .trim()
    .max(2000, { error: "Комментарий длиннее 2000 символов" })
    .transform((value) => value || null),
  startsOn: dateInput("Дата начала"),
};

const optionalEndsOn = z
  .string()
  .optional()
  .transform((value, ctx) => {
    if (!value) return null;
    const date = parseDateInput(value);
    if (!date) {
      ctx.addIssue({ code: "custom", message: "Дата окончания: неверная дата" });
      return z.NEVER;
    }
    return date;
  });

/** Ввод формы расхода. Даты — `YYYY-MM-DD` из `<input type="date">`. */
export const expenseInputSchema = z
  .discriminatedUnion("kind", [
    z.object({
      kind: z.literal("AMOUNT"),
      ...common,
      recurrence: z.enum(EXPENSE_RECURRENCES),
      amountKopecks: z
        .number()
        .int({ error: "Сумма — целые копейки" })
        .positive({ error: "Сумма должна быть больше нуля" })
        .max(100_000_000_000, { error: "Слишком большая сумма" }),
      endsOn: optionalEndsOn,
    }),
    z.object({
      kind: z.literal("PERCENT"),
      ...common,
      base: z.enum(EXPENSE_BASES),
      percentHundredths: z
        .number()
        .int({ error: "Процент — не больше двух знаков после запятой" })
        .positive({ error: "Процент должен быть больше нуля" })
        .max(10_000, { error: "Процент не больше 100" }),
      endsOn: optionalEndsOn,
    }),
  ])
  .transform((input) => ({
    name: input.name,
    comment: input.comment,
    startsOn: input.startsOn,
    ...(input.kind === "AMOUNT"
      ? {
          recurrence: input.recurrence,
          amountKopecks: input.amountKopecks,
          percentHundredths: null,
          base: null,
          // У разового расхода нет срока действия — только его день
          endsOn: input.recurrence === "ONCE" ? null : input.endsOn,
        }
      : {
          recurrence: null,
          amountKopecks: null,
          percentHundredths: input.percentHundredths,
          base: input.base,
          endsOn: input.endsOn,
        }),
  }))
  .refine((expense) => expense.endsOn === null || expense.endsOn >= expense.startsOn, {
    error: "Дата окончания раньше даты начала",
    path: ["endsOn"],
  });

export type ExpenseInput = z.input<typeof expenseInputSchema>;
export type ExpenseData = z.output<typeof expenseInputSchema>;
