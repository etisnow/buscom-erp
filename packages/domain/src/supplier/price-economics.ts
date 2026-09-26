/**
 * «Экономика цены» у поставщика: во что нам на самом деле обходится товар.
 *
 * Номинал — закупочная цена у поставщика (`ProductSupplier.purchasePriceKopecks`),
 * её видит сам поставщик в «Заказе поставщику». К ней по порядку применяются
 * шаги формулы — комиссии, доставка до нас, округление — и получается стоимость
 * закупки для нас за штуку. Расходы на заказ (за отправку независимо от
 * количества) в цену штуки не выразить — они идут отдельным блоком и
 * добавляются к заказу у этого поставщика один раз.
 *
 * Хранится `Supplier.priceFormula: Json` — форма `PriceFormula` ниже.
 * Проценты — в сотых долях процента (5,5% = 550), суммы — в копейках;
 * посчитанное по проценту — до целых рублей, половина — в нашу пользу.
 */
import { z } from "zod";
import { assertKopecks, formatRub, roundToRublesHalfDown, type Kopecks } from "../money";

export const PRICE_STEPS_MAX = 20;

const kopecks = z.number().int().min(0, { error: "Сумма не может быть отрицательной" });
const label = z.string().trim().max(100, { error: "Название шага — не длиннее 100 символов" });

const percentStep = z.object({
  kind: z.literal("PERCENT"),
  label,
  /** Сотые доли процента: 550 = 5,5%. Отрицательный — скидка поставщика */
  percentHundredths: z
    .number()
    .int()
    .min(-10_000, { error: "Скидка — не больше 100%" })
    .max(100_000, { error: "Надбавка — не больше 1000%" }),
  /** От чего считать процент: от номинала или от суммы, накопленной предыдущими шагами */
  base: z.enum(["NOMINAL", "RUNNING"]),
});

const perUnitStep = z.object({
  kind: z.literal("PER_UNIT"),
  label,
  amountKopecks: kopecks,
});

const roundStep = z.object({
  kind: z.literal("ROUND"),
  label,
  /** Кратность: 1000 = до 10 ₽ */
  stepKopecks: z.number().int().positive({ error: "Округлять можно до положительной суммы" }),
  mode: z.enum(["UP", "NEAREST", "DOWN"]),
});

export const priceStepSchema = z.discriminatedUnion("kind", [percentStep, perUnitStep, roundStep]);

export const orderCostSchema = z.object({ label, amountKopecks: kopecks });

export const priceFormulaSchema = z.object({
  unitSteps: z.array(priceStepSchema).max(PRICE_STEPS_MAX, { error: `Шагов — не больше ${PRICE_STEPS_MAX}` }),
  orderCosts: z.array(orderCostSchema).max(PRICE_STEPS_MAX, { error: `Расходов — не больше ${PRICE_STEPS_MAX}` }),
});

export type PriceStep = z.infer<typeof priceStepSchema>;
export type OrderCost = z.infer<typeof orderCostSchema>;
export type PriceFormula = z.infer<typeof priceFormulaSchema>;

export const EMPTY_PRICE_FORMULA: PriceFormula = { unitSteps: [], orderCosts: [] };

/**
 * Формула из базы. Битая или пустая — значит «без надбавок»: стоимость для нас
 * равна номиналу. Ломать карточку поставщика и заказы из-за неё нельзя.
 */
export function parsePriceFormula(value: unknown): PriceFormula {
  const parsed = priceFormulaSchema.safeParse(value);
  return parsed.success ? parsed.data : EMPTY_PRICE_FORMULA;
}

export function isEmptyPriceFormula(formula: PriceFormula): boolean {
  return formula.unitSteps.length === 0 && formula.orderCosts.length === 0;
}

export type CostLine = {
  /** Подпись шага для расшифровки */
  label: string;
  /** На сколько шаг изменил сумму */
  deltaKopecks: Kopecks;
  /** Сумма после шага */
  totalKopecks: Kopecks;
};

export type UnitCost = {
  nominalKopecks: Kopecks;
  costKopecks: Kopecks;
  lines: CostLine[];
};

function roundTo(value: number, step: number, mode: "UP" | "NEAREST" | "DOWN"): number {
  const units = value / step;
  const rounded = mode === "UP" ? Math.ceil(units) : mode === "DOWN" ? Math.floor(units) : Math.round(units);
  return rounded * step;
}

/**
 * Стоимость закупки для нас за штуку. Шаги — строго по порядку. Надбавка по
 * проценту округляется до целых рублей на своём шаге, половина — в нашу пользу
 * (`roundToRublesHalfDown`: надбавка 16,5 → 16, скидка −12,5 → −13), чтобы
 * расшифровка складывалась ровно в итог.
 * Копейки номинала не трогаем. Скидки не уводят сумму ниже нуля.
 */
export function calculateUnitCost(nominalKopecks: Kopecks, formula: PriceFormula): UnitCost {
  assertKopecks(nominalKopecks);
  let total = nominalKopecks;
  const lines: CostLine[] = [];

  for (const step of formula.unitSteps) {
    let next = total;
    switch (step.kind) {
      case "PERCENT": {
        const base = step.base === "NOMINAL" ? nominalKopecks : total;
        next = total + roundToRublesHalfDown((base * step.percentHundredths) / 10_000);
        break;
      }
      case "PER_UNIT":
        next = total + step.amountKopecks;
        break;
      case "ROUND":
        next = roundTo(total, step.stepKopecks, step.mode);
        break;
    }
    next = Math.max(0, next);
    lines.push({ label: stepLabel(step), deltaKopecks: next - total, totalKopecks: next });
    total = next;
  }

  return { nominalKopecks, costKopecks: total, lines };
}

/** Расходы на заказ у поставщика — добавляются к заказу один раз, сколько бы штук ни было. */
export function orderCostsTotal(formula: PriceFormula): Kopecks {
  return formula.orderCosts.reduce((sum, cost) => sum + cost.amountKopecks, 0);
}

/** «5,5%» из сотых долей процента. */
export function formatPercent(hundredths: number): string {
  const value = (hundredths / 100).toLocaleString("ru-RU", { maximumFractionDigits: 2 });
  return `${value}%`;
}

const ROUND_MODE_LABELS = { UP: "вверх", NEAREST: "до ближайших", DOWN: "вниз" } as const;

/** Подпись шага: своя, если задана, иначе — описание того, что шаг делает. */
export function stepLabel(step: PriceStep): string {
  return step.label.trim() || describeStep(step);
}

export function describeStep(step: PriceStep): string {
  switch (step.kind) {
    case "PERCENT": {
      const sign = step.percentHundredths < 0 ? "−" : "+";
      const base = step.base === "NOMINAL" ? "от номинала" : "от текущей суммы";
      return `${sign}${formatPercent(Math.abs(step.percentHundredths))} ${base}`;
    }
    case "PER_UNIT":
      return `+${formatRub(step.amountKopecks)} за штуку`;
    case "ROUND":
      return `Округление ${ROUND_MODE_LABELS[step.mode]} ${formatRub(step.stepKopecks)}`;
  }
}

/** Кратко для таблиц и подсказок: «+5% от номинала → +150 ₽ за штуку → …». */
export function describeFormula(formula: PriceFormula): string {
  const unit = formula.unitSteps.map(stepLabel);
  const order = formula.orderCosts.map(
    (cost) => `${cost.label.trim() || "расход"} ${formatRub(cost.amountKopecks)} на заказ`,
  );
  return [...unit, ...order].join(" → ") || "без надбавок";
}

/** Ввод процента из формы: «5», «5,5», «-10», «2.75» → сотые доли процента; не число — null. */
export function parsePercentInput(input: string): number | null {
  const normalized = input.replace(/\s/g, "").replace(",", ".");
  if (!/^-?\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const [whole = "0", fraction = ""] = normalized.split(".");
  const sign = whole.startsWith("-") ? -1 : 1;
  return sign * (Math.abs(Number(whole)) * 100 + Number(fraction.padEnd(2, "0")));
}

/** Обратно в поле формы: 550 → «5,5». */
export function percentInputValue(hundredths: number): string {
  return (hundredths / 100).toLocaleString("ru-RU", { maximumFractionDigits: 2, useGrouping: false });
}

/** Стоимость для нас за штуку по номиналу и формуле в том виде, в каком она лежит в базе. */
export function unitCostFor(nominalKopecks: Kopecks, storedFormula: unknown): Kopecks {
  return calculateUnitCost(nominalKopecks, parsePriceFormula(storedFormula)).costKopecks;
}
