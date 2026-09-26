import { describe, expect, it } from "vitest";
import { calculateOrderMargin, discountShare, profitCommission, type MarginSupplierInput } from "./margin";

const supplier = (supplierId: string, overrides: Partial<MarginSupplierInput> = {}): MarginSupplierInput => ({
  supplierId,
  name: supplierId,
  orderCostKopecks: 0,
  profitCommissionHundredths: 0,
  ...overrides,
});

describe("calculateOrderMargin", () => {
  it("выручка за вычетом скидок минус закупка и расходы на заказ", () => {
    const margin = calculateOrderMargin({
      items: [
        // 2 × 500 ₽ со скидкой 100 ₽ на позицию, закупка 324,45 ₽ за штуку
        { priceKopecks: 50_000, quantity: 2, discountKopecks: 10_000, supplierId: "a", costKopecks: 32_445 },
        { priceKopecks: 100_000, quantity: 1, supplierId: "b", costKopecks: 70_000 },
      ],
      discountKopecks: 5_000,
      suppliers: [supplier("a", { orderCostKopecks: 50_000 }), supplier("b")],
    });

    // выручка: 900 + 1000 − 50 = 1850 ₽; затраты: 648,90 + 700 + 500 = 1848,90 ₽
    expect(margin).toEqual({
      known: true,
      revenueKopecks: 185_000,
      costKopecks: 184_890,
      commissions: [],
      commissionKopecks: 0,
      marginKopecks: 110,
      marginPercentHundredths: 6,
    });
  });

  it("маржа бывает отрицательной — продали дешевле, чем обошлось", () => {
    const margin = calculateOrderMargin({
      items: [{ priceKopecks: 30_000, quantity: 1, supplierId: "a", costKopecks: 32_445 }],
      discountKopecks: 0,
      suppliers: [supplier("a")],
    });
    expect(margin).toMatchObject({ known: true, marginKopecks: -2_445, marginPercentHundredths: -815 });
  });

  it("позиция без поставщика — маржа неизвестна, а не завышена", () => {
    const margin = calculateOrderMargin({
      items: [
        { priceKopecks: 50_000, quantity: 1, supplierId: "a", costKopecks: 30_000 },
        { priceKopecks: 20_000, quantity: 1, supplierId: null, costKopecks: null },
        { priceKopecks: 10_000, quantity: 3, supplierId: null, costKopecks: null },
      ],
      discountKopecks: 0,
      suppliers: [supplier("a")],
    });
    expect(margin).toEqual({ known: false, itemsWithoutCost: 2 });
  });

  it("нулевая выручка — процент не считается", () => {
    const margin = calculateOrderMargin({
      items: [{ priceKopecks: 10_000, quantity: 1, supplierId: "a", costKopecks: 5_000 }],
      discountKopecks: 10_000,
      suppliers: [supplier("a")],
    });
    expect(margin).toMatchObject({ known: true, revenueKopecks: 0, marginPercentHundredths: null });
  });
});

describe("комиссия с прибыли", () => {
  it("процент от прибыли по товарам поставщика: продажа − стоимость для нас − расходы на заказ", () => {
    const margin = calculateOrderMargin({
      items: [
        { priceKopecks: 100_000, quantity: 2, supplierId: "a", costKopecks: 60_000 },
        { priceKopecks: 50_000, quantity: 1, supplierId: "b", costKopecks: 30_000 },
      ],
      discountKopecks: 0,
      suppliers: [supplier("a", { orderCostKopecks: 10_000, profitCommissionHundredths: 2_000 }), supplier("b")],
    });

    // прибыль по «a»: 2000 − 1200 − 100 = 700 ₽; 20% = 140 ₽. «b» комиссию не удерживает.
    expect(margin).toMatchObject({
      known: true,
      revenueKopecks: 250_000,
      costKopecks: 160_000,
      commissions: [
        {
          supplierId: "a",
          name: "a",
          profitKopecks: 70_000,
          profitCommissionHundredths: 2_000,
          commissionKopecks: 14_000,
        },
      ],
      commissionKopecks: 14_000,
      marginKopecks: 76_000,
    });
  });

  it("скидка на заказ уменьшает прибыль пропорционально сумме товаров поставщика", () => {
    const margin = calculateOrderMargin({
      items: [
        { priceKopecks: 300_000, quantity: 1, supplierId: "a", costKopecks: 200_000 },
        { priceKopecks: 100_000, quantity: 1, supplierId: "b", costKopecks: 50_000 },
      ],
      // 400 ₽ на заказ: 3/4 — на товары «a», 1/4 — на «b»
      discountKopecks: 40_000,
      suppliers: [
        supplier("a", { profitCommissionHundredths: 1_000 }),
        supplier("b", { profitCommissionHundredths: 1_000 }),
      ],
    });

    // «a»: 3000 − 300 − 2000 = 700 ₽ → 70 ₽; «b»: 1000 − 100 − 500 = 400 ₽ → 40 ₽
    expect(margin.known && margin.commissions.map((row) => [row.profitKopecks, row.commissionKopecks])).toEqual([
      [70_000, 7_000],
      [40_000, 4_000],
    ]);
  });

  it("половина рубля комиссии остаётся нам: 924 − 389 − 30% от 535 = 375 ₽", () => {
    const margin = calculateOrderMargin({
      items: [{ priceKopecks: 92_400, quantity: 1, supplierId: "a", costKopecks: 38_900 }],
      discountKopecks: 0,
      suppliers: [supplier("a", { profitCommissionHundredths: 3_000 })],
    });
    expect(margin).toMatchObject({ known: true, commissionKopecks: 16_000, marginKopecks: 37_500 });
  });

  it("убыточная позиция уменьшает базу, отрицательная прибыль — комиссия 0", () => {
    const withLoss = calculateOrderMargin({
      items: [
        { priceKopecks: 100_000, quantity: 1, supplierId: "a", costKopecks: 50_000 },
        { priceKopecks: 20_000, quantity: 1, supplierId: "a", costKopecks: 40_000 },
      ],
      discountKopecks: 0,
      suppliers: [supplier("a", { profitCommissionHundredths: 1_000 })],
    });
    // 500 − 200 = 300 ₽ → 30 ₽
    expect(withLoss.known && withLoss.commissions[0]?.commissionKopecks).toBe(3_000);

    const loss = calculateOrderMargin({
      items: [{ priceKopecks: 20_000, quantity: 1, supplierId: "a", costKopecks: 40_000 }],
      discountKopecks: 0,
      suppliers: [supplier("a", { profitCommissionHundredths: 1_000 })],
    });
    expect(loss).toMatchObject({ known: true, commissionKopecks: 0, marginKopecks: -20_000 });
  });
});

describe("discountShare и profitCommission", () => {
  it("доля скидки — пропорционально, до целых рублей, половина — вверх, в нашу пользу", () => {
    // 100 ₽ × 1/3 = 33,33 ₽ → 33 ₽; 100 ₽ × 1/8 = 12,5 ₽ → 13 ₽ (меньше база комиссии)
    expect(discountShare(10_000, 1, 3)).toBe(3_300);
    expect(discountShare(10_000, 1, 8)).toBe(1_300);
    expect(discountShare(10_000, 0, 3)).toBe(0);
    expect(discountShare(0, 1, 3)).toBe(0);
    expect(discountShare(10_000, 1, 0)).toBe(0);
  });

  it("комиссия — только с положительной прибыли, до целых рублей, половина — вниз, в нашу пользу", () => {
    // 30% от 535 ₽ = 160,5 ₽ → 160 ₽; 30% от 533 ₽ = 159,9 ₽ → 160 ₽
    expect(profitCommission(53_500, 3_000)).toBe(16_000);
    expect(profitCommission(53_300, 3_000)).toBe(16_000);
    expect(profitCommission(-10_000, 500)).toBe(0);
    expect(profitCommission(10_000, 0)).toBe(0);
  });
});
