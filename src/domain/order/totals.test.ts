import { describe, expect, it } from "vitest";
import { calculateOrderTotals, lineTotal } from "./totals";

describe("lineTotal", () => {
  it("цена × количество − скидка", () => {
    expect(lineTotal({ priceKopecks: 150000, quantity: 3, discountKopecks: 5000 })).toBe(445000);
  });

  it("отклоняет дробное и нулевое количество", () => {
    expect(() => lineTotal({ priceKopecks: 100, quantity: 0 })).toThrow();
    expect(() => lineTotal({ priceKopecks: 100, quantity: 1.5 })).toThrow();
  });

  it("отклоняет дробные копейки", () => {
    expect(() => lineTotal({ priceKopecks: 100.5, quantity: 1 })).toThrow();
  });
});

describe("calculateOrderTotals", () => {
  it("складывает позиции и вычитает скидку; доставка в сумму заказа не входит", () => {
    expect(
      calculateOrderTotals({
        items: [
          { priceKopecks: 1250000, quantity: 2 },
          { priceKopecks: 300000, quantity: 1, discountKopecks: 30000 },
        ],
        discountKopecks: 100000,
        deliveryPriceKopecks: 150000,
      }),
    ).toEqual({
      itemsTotalKopecks: 2770000,
      discountKopecks: 100000,
      // Доставку клиент платит транспортной компании сам — она только показывается
      deliveryPriceKopecks: 150000,
      totalKopecks: 2670000,
    });
  });

  it("стоимость доставки по-прежнему проверяется", () => {
    expect(() => calculateOrderTotals({ items: [], deliveryPriceKopecks: -1 })).toThrow();
  });

  it("пустой заказ — нули", () => {
    expect(calculateOrderTotals({ items: [] }).totalKopecks).toBe(0);
  });

  it("скидка не может превышать сумму товаров", () => {
    expect(() =>
      calculateOrderTotals({ items: [{ priceKopecks: 1000, quantity: 1 }], discountKopecks: 2000 }),
    ).toThrow();
  });
});
