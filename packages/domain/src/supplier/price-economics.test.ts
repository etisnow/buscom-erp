import { describe, expect, it } from "vitest";
import {
  calculateUnitCost,
  describeFormula,
  EMPTY_PRICE_FORMULA,
  orderCostsTotal,
  parsePercentInput,
  parsePriceFormula,
  percentInputValue,
  priceFormulaSchema,
  type PriceFormula,
  type PriceStep,
} from "./price-economics";

const percent = (value: number, base: "NOMINAL" | "RUNNING" = "RUNNING", label = ""): PriceStep => ({
  kind: "PERCENT",
  label,
  percentHundredths: Math.round(value * 100),
  base,
});
const perUnit = (rubles: number, label = ""): PriceStep => ({ kind: "PER_UNIT", label, amountKopecks: rubles * 100 });
const round = (rubles: number, mode: "UP" | "NEAREST" | "DOWN" = "UP"): PriceStep => ({
  kind: "ROUND",
  label: "",
  stepKopecks: rubles * 100,
  mode,
});
const formula = (unitSteps: PriceStep[], orderCosts: PriceFormula["orderCosts"] = []): PriceFormula => ({
  unitSteps,
  orderCosts,
});

describe("calculateUnitCost", () => {
  it("без шагов стоимость для нас равна номиналу", () => {
    expect(calculateUnitCost(30_000, EMPTY_PRICE_FORMULA)).toEqual({
      nominalKopecks: 30_000,
      costKopecks: 30_000,
      lines: [],
    });
  });

  it("проценты от текущей суммы складываются по шагам: 300 → +5% → +3%", () => {
    const cost = calculateUnitCost(30_000, formula([percent(5), percent(3)]));
    // 3% от 315 ₽ = 9,45 ₽ → 9 ₽
    expect(cost.lines).toEqual([
      { label: "+5% от текущей суммы", deltaKopecks: 1_500, totalKopecks: 31_500 },
      { label: "+3% от текущей суммы", deltaKopecks: 900, totalKopecks: 32_400 },
    ]);
    expect(cost.costKopecks).toBe(32_400);
  });

  it("проценты от номинала не зависят от порядка: 300 + 5% + 3% = 324", () => {
    expect(calculateUnitCost(30_000, formula([percent(5, "NOMINAL"), percent(3, "NOMINAL")])).costKopecks).toBe(32_400);
    expect(calculateUnitCost(30_000, formula([percent(3, "NOMINAL"), percent(5, "NOMINAL")])).costKopecks).toBe(32_400);
  });

  it("база выбирается у каждого шага: доставка, потом комиссия от номинала и от накопленного", () => {
    const cost = calculateUnitCost(30_000, formula([perUnit(150), percent(2, "NOMINAL"), percent(1, "RUNNING")]));
    // 300 + 150 = 450; + 2% от 300 = 456; + 1% от 456 = 4,56 → 5 ₽ = 461
    expect(cost.lines.map((line) => line.totalKopecks)).toEqual([45_000, 45_600, 46_100]);
  });

  it("процент округляется до целых рублей на своём шаге, половина — в нашу пользу", () => {
    // 1,55% от 333 ₽ = 5,16 ₽ → 5 ₽; 5% от 330 ₽ = 16,5 ₽ → 16 ₽ (надбавка поменьше)
    expect(calculateUnitCost(33_300, formula([percent(1.55)])).costKopecks).toBe(33_800);
    expect(calculateUnitCost(33_000, formula([percent(5)])).costKopecks).toBe(34_600);
    // Копейки номинала не трогаем — округляется только посчитанная надбавка
    expect(calculateUnitCost(30_050, formula([percent(10)])).costKopecks).toBe(33_050);
  });

  it("округление вверх, до ближайших и вниз", () => {
    expect(calculateUnitCost(32_445, formula([round(10, "UP")])).costKopecks).toBe(33_000);
    expect(calculateUnitCost(32_445, formula([round(10, "NEAREST")])).costKopecks).toBe(32_000);
    expect(calculateUnitCost(32_445, formula([round(10, "DOWN")])).costKopecks).toBe(32_000);
    // Уже кратная сумма вверх не округляется
    expect(calculateUnitCost(33_000, formula([round(10, "UP")])).costKopecks).toBe(33_000);
  });

  it("округление — шаг как все: после него надбавки считаются от округлённого", () => {
    const cost = calculateUnitCost(32_445, formula([round(10), percent(10)]));
    expect(cost.costKopecks).toBe(36_300);
  });

  it("скидка поставщика уменьшает сумму, но не ниже нуля", () => {
    expect(calculateUnitCost(30_000, formula([percent(-10)])).costKopecks).toBe(27_000);
    // −5% от 250 ₽ = −12,5 ₽ → −13 ₽: скидка поставщика побольше — тоже в нашу пользу
    expect(calculateUnitCost(25_000, formula([percent(-5)])).costKopecks).toBe(23_700);
    expect(calculateUnitCost(30_000, formula([percent(-100), perUnit(0)])).costKopecks).toBe(0);
  });

  it("своя подпись шага заменяет описание в расшифровке", () => {
    const cost = calculateUnitCost(30_000, formula([percent(5, "RUNNING", "Обналичка")]));
    expect(cost.lines[0]?.label).toBe("Обналичка");
  });
});

describe("расходы на заказ", () => {
  it("складываются, в цену штуки не входят", () => {
    const f = formula(
      [percent(5)],
      [
        { label: "Отправка", amountKopecks: 50_000 },
        { label: "Упаковка", amountKopecks: 10_000 },
      ],
    );
    expect(orderCostsTotal(f)).toBe(60_000);
    expect(calculateUnitCost(30_000, f).costKopecks).toBe(31_500);
  });
});

describe("parsePriceFormula", () => {
  it("битая или пустая формула — без надбавок, а не ошибка", () => {
    expect(parsePriceFormula(null)).toEqual(EMPTY_PRICE_FORMULA);
    expect(parsePriceFormula({ unitSteps: [{ kind: "MAGIC" }], orderCosts: [] })).toEqual(EMPTY_PRICE_FORMULA);
  });

  it("правильная формула читается как есть", () => {
    const f = formula([percent(5), round(10)], [{ label: "Отправка", amountKopecks: 50_000 }]);
    expect(parsePriceFormula(JSON.parse(JSON.stringify(f)))).toEqual(f);
  });

  it("схема отвергает дробные копейки и отрицательные суммы", () => {
    expect(priceFormulaSchema.safeParse(formula([{ kind: "PER_UNIT", label: "", amountKopecks: 1.5 }])).success).toBe(
      false,
    );
    expect(priceFormulaSchema.safeParse(formula([], [{ label: "", amountKopecks: -100 }])).success).toBe(false);
  });
});

describe("describeFormula", () => {
  it("цепочка шагов одной строкой", () => {
    const f = formula([percent(5, "NOMINAL"), perUnit(150), round(10)], [{ label: "Отправка", amountKopecks: 50_000 }]);
    // Intl ставит в суммах неразрывные пробелы
    expect(describeFormula(f).replace(/\s/g, " ")).toBe(
      "+5% от номинала → +150 ₽ за штуку → Округление вверх 10 ₽ → Отправка 500 ₽ на заказ",
    );
    expect(describeFormula(EMPTY_PRICE_FORMULA)).toBe("без надбавок");
  });
});

describe("ввод процента", () => {
  it.each([
    ["5", 500],
    ["5,5", 550],
    ["2.75", 275],
    [" -10 ", -1_000],
    ["0,05", 5],
  ])("«%s» → %d сотых", (input, expected) => {
    expect(parsePercentInput(input)).toBe(expected);
  });

  it.each([[""], ["пять"], ["5%"], ["1,234"]])("«%s» — не процент", (input) => {
    expect(parsePercentInput(input)).toBeNull();
  });

  it("обратно в поле — с запятой и без лишних нулей", () => {
    expect(percentInputValue(550)).toBe("5,5");
    expect(percentInputValue(500)).toBe("5");
    expect(percentInputValue(-1_000)).toBe("-10");
    expect(percentInputValue(100_000)).toBe("1000");
  });
});
