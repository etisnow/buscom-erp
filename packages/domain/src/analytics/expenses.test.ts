import { describe, expect, it } from "vitest";
import { parseDateInput } from "../datetime";
import { formatRub } from "../money";
import {
  describeExpense,
  expenseForPeriod,
  expenseInputSchema,
  summarizeExpenses,
  type ExpenseBases,
  type ExpenseRule,
} from "./expenses";
import { resolvePeriod } from "./period";

const NOW = new Date("2026-09-15T12:00:00Z");

function day(value: string): Date {
  const date = parseDateInput(value);
  if (!date) throw new Error(value);
  return date;
}

function period(from: string, to: string) {
  return resolvePeriod({ from, to }, NOW);
}

function amount(
  recurrence: ExpenseRule["recurrence"],
  amountKopecks: number,
  startsOn: string,
  endsOn?: string,
): ExpenseRule {
  return {
    recurrence,
    amountKopecks,
    percentHundredths: null,
    base: null,
    startsOn: day(startsOn),
    endsOn: endsOn ? day(endsOn) : null,
  };
}

function percent(
  base: NonNullable<ExpenseRule["base"]>,
  percentHundredths: number,
  startsOn: string,
  endsOn?: string,
): ExpenseRule {
  return {
    recurrence: null,
    amountKopecks: null,
    percentHundredths,
    base,
    startsOn: day(startsOn),
    endsOn: endsOn ? day(endsOn) : null,
  };
}

const NO_BASES: ExpenseBases = { REVENUE: [], MARGIN: [], PAYMENTS: [] };

describe("expenseForPeriod: разовый", () => {
  it("целиком в периоде своего дня, вне его — 0", () => {
    const rule = amount("ONCE", 500_000, "2026-09-10");
    expect(expenseForPeriod(rule, period("2026-09-01", "2026-09-30"), NO_BASES)).toBe(500_000);
    expect(expenseForPeriod(rule, period("2026-08-01", "2026-08-31"), NO_BASES)).toBe(0);
    expect(expenseForPeriod(rule, period("2026-09-10", "2026-09-10"), NO_BASES)).toBe(500_000);
    expect(expenseForPeriod(rule, period("2026-09-11", "2026-09-20"), NO_BASES)).toBe(0);
  });

  it("«Всё время» его включает", () => {
    const all = resolvePeriod({ preset: "all" }, NOW);
    expect(expenseForPeriod(amount("ONCE", 100, "2020-01-01"), all, NO_BASES)).toBe(100);
  });
});

describe("expenseForPeriod: регулярная сумма раскладывается равномерно", () => {
  it("ежемесячный — полная сумма за месяц, половина за полмесяца", () => {
    const rule = amount("MONTHLY", 3_000_000, "2026-01-01");
    expect(expenseForPeriod(rule, period("2026-09-01", "2026-09-30"), NO_BASES)).toBe(3_000_000);
    // 15 дней из 30
    expect(expenseForPeriod(rule, period("2026-09-01", "2026-09-15"), NO_BASES)).toBe(1_500_000);
  });

  it("квартальный — треть в месяц, годовой — 1/12", () => {
    const month = period("2026-09-01", "2026-09-30");
    expect(expenseForPeriod(amount("QUARTERLY", 90_000, "2026-01-01"), month, NO_BASES)).toBe(30_000);
    expect(expenseForPeriod(amount("YEARLY", 12_000_000, "2026-01-01"), month, NO_BASES)).toBe(1_000_000);
    // Год целиком — вся годовая сумма
    const year = period("2026-01-01", "2026-12-31");
    expect(expenseForPeriod(amount("YEARLY", 12_000_000, "2026-01-01"), year, NO_BASES)).toBe(12_000_000);
  });

  it("действует только между датой начала и окончания включительно", () => {
    // С 16 по 25 сентября — 10 дней из 30
    const rule = amount("MONTHLY", 3_000_000, "2026-09-16", "2026-09-25");
    expect(expenseForPeriod(rule, period("2026-09-01", "2026-09-30"), NO_BASES)).toBe(1_000_000);
    expect(expenseForPeriod(rule, period("2026-10-01", "2026-10-31"), NO_BASES)).toBe(0);
    expect(expenseForPeriod(rule, period("2026-08-01", "2026-08-31"), NO_BASES)).toBe(0);
  });

  it("период через несколько месяцев разной длины считается по месяцам", () => {
    // Февраль 2026 — 28 дней: половина февраля + весь март
    const rule = amount("MONTHLY", 2_800_000, "2026-01-01");
    expect(expenseForPeriod(rule, period("2026-02-15", "2026-03-31"), NO_BASES)).toBe(1_400_000 + 2_800_000);
  });

  it("«Всё время» — с даты начала до сегодня включительно", () => {
    const all = resolvePeriod({ preset: "all" }, NOW);
    // Весь август + 15 дней сентября из 30
    expect(expenseForPeriod(amount("MONTHLY", 3_000_000, "2026-08-01"), all, NO_BASES)).toBe(4_500_000);
  });
});

describe("expenseForPeriod: процент", () => {
  const bases: ExpenseBases = {
    REVENUE: [
      { at: new Date("2026-09-05T10:00:00Z"), kopecks: 1_000_000 },
      { at: new Date("2026-09-20T10:00:00Z"), kopecks: 2_000_000 },
      { at: new Date("2026-08-20T10:00:00Z"), kopecks: 5_000_000 },
    ],
    MARGIN: [
      { at: new Date("2026-09-05T10:00:00Z"), kopecks: 300_000 },
      { at: new Date("2026-09-06T10:00:00Z"), kopecks: -500_000 },
    ],
    PAYMENTS: [{ at: new Date("2026-09-10T10:00:00Z"), kopecks: 700_000 }],
  };

  it("от своей базы за период", () => {
    const month = period("2026-09-01", "2026-09-30");
    expect(expenseForPeriod(percent("REVENUE", 600, "2026-01-01"), month, bases)).toBe(180_000);
    expect(expenseForPeriod(percent("PAYMENTS", 250, "2026-01-01"), month, bases)).toBe(17_500);
  });

  it("только за дни действия расхода", () => {
    const month = period("2026-09-01", "2026-09-30");
    expect(expenseForPeriod(percent("REVENUE", 1000, "2026-09-10"), month, bases)).toBe(200_000);
    expect(expenseForPeriod(percent("REVENUE", 1000, "2026-01-01", "2026-09-05"), month, bases)).toBe(100_000);
  });

  it("убыточная база — ноль, а не отрицательный расход", () => {
    expect(expenseForPeriod(percent("MARGIN", 1000, "2026-01-01"), period("2026-09-01", "2026-09-30"), bases)).toBe(0);
  });

  it("округление до копейки", () => {
    const rule = percent("REVENUE", 333, "2026-01-01");
    const oneOrder: ExpenseBases = { ...NO_BASES, REVENUE: [{ at: new Date("2026-09-05T10:00:00Z"), kopecks: 1_001 }] };
    // 1001 × 3,33% = 33,33
    expect(expenseForPeriod(rule, period("2026-09-01", "2026-09-30"), oneOrder)).toBe(33);
  });
});

describe("summarizeExpenses", () => {
  it("только действующие в периоде, по убыванию, с итогом", () => {
    const expenses = [
      { name: "Аренда", ...amount("MONTHLY", 3_000_000, "2026-01-01") },
      { name: "Выставка", ...amount("ONCE", 5_000_000, "2026-03-01") },
      { name: "Реклама", ...amount("ONCE", 4_000_000, "2026-09-02") },
      { name: "Налог", ...percent("REVENUE", 600, "2026-01-01") },
    ];
    const summary = summarizeExpenses(expenses, period("2026-09-01", "2026-09-30"), NO_BASES);
    expect(summary.lines.map((line) => [line.name, line.periodKopecks])).toEqual([
      ["Реклама", 4_000_000],
      ["Аренда", 3_000_000],
      ["Налог", 0],
    ]);
    expect(summary.totalKopecks).toBe(7_000_000);
  });
});

describe("describeExpense", () => {
  it("сумма с периодичностью и процент с базой", () => {
    expect(describeExpense(amount("MONTHLY", 1_000_000, "2026-01-01"))).toBe(`${formatRub(1_000_000)} в месяц`);
    expect(describeExpense(amount("ONCE", 50_000, "2026-01-01"))).toBe(`${formatRub(50_000)} разово`);
    expect(describeExpense(percent("REVENUE", 650, "2026-01-01"))).toBe("6,5% от выручки");
  });
});

describe("expenseInputSchema", () => {
  const base = { name: " Аренда ", comment: "", startsOn: "2026-09-01" };

  it("сумма: периодичность и даты, пустой комментарий — null", () => {
    const parsed = expenseInputSchema.parse({
      ...base,
      kind: "AMOUNT",
      recurrence: "MONTHLY",
      amountKopecks: 100,
      endsOn: "2026-12-31",
    });
    expect(parsed).toMatchObject({
      name: "Аренда",
      comment: null,
      recurrence: "MONTHLY",
      amountKopecks: 100,
      percentHundredths: null,
      base: null,
      startsOn: day("2026-09-01"),
      endsOn: day("2026-12-31"),
    });
  });

  it("у разового дата окончания отбрасывается", () => {
    const parsed = expenseInputSchema.parse({
      ...base,
      kind: "AMOUNT",
      recurrence: "ONCE",
      amountKopecks: 100,
      endsOn: "2026-12-31",
    });
    expect(parsed.endsOn).toBeNull();
  });

  it("процент: без периодичности, бессрочный", () => {
    const parsed = expenseInputSchema.parse({ ...base, kind: "PERCENT", base: "MARGIN", percentHundredths: 550 });
    expect(parsed).toMatchObject({ recurrence: null, amountKopecks: null, percentHundredths: 550, base: "MARGIN" });
    expect(parsed.endsOn).toBeNull();
  });

  it("ошибки: пустое название, нулевая сумма, процент больше 100, окончание раньше начала, нет даты", () => {
    const amountInput = { ...base, kind: "AMOUNT", recurrence: "MONTHLY", amountKopecks: 100 } as const;
    expect(expenseInputSchema.safeParse({ ...amountInput, name: "  " }).success).toBe(false);
    expect(expenseInputSchema.safeParse({ ...amountInput, amountKopecks: 0 }).success).toBe(false);
    expect(expenseInputSchema.safeParse({ ...amountInput, endsOn: "2026-08-31" }).success).toBe(false);
    expect(expenseInputSchema.safeParse({ ...amountInput, startsOn: "" }).success).toBe(false);
    expect(
      expenseInputSchema.safeParse({ ...base, kind: "PERCENT", base: "REVENUE", percentHundredths: 10_001 }).success,
    ).toBe(false);
  });
});
