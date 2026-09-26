import { describe, expect, it } from "vitest";
import {
  assertDiscountWithinLimit,
  DiscountLimitError,
  discountPercent,
  grossItemsTotal,
  maxDiscountKopecks,
  totalDiscount,
} from "./discount";

const items = [
  { priceKopecks: 100_000, quantity: 2 },
  { priceKopecks: 50_000, quantity: 1 },
];

describe("grossItemsTotal", () => {
  it("считает сумму до скидок", () => {
    expect(grossItemsTotal(items)).toBe(250_000);
  });

  it("скидки на позициях базу не уменьшают", () => {
    expect(grossItemsTotal([{ priceKopecks: 100_000, quantity: 1, discountKopecks: 30_000 }])).toBe(100_000);
  });

  it("нулевое количество — ошибка", () => {
    expect(() => grossItemsTotal([{ priceKopecks: 100_000, quantity: 0 }])).toThrow(/Количество/);
  });
});

describe("totalDiscount", () => {
  it("складывает скидки позиций и скидку заказа", () => {
    expect(totalDiscount([{ priceKopecks: 100_000, quantity: 1, discountKopecks: 5_000 }], 3_000)).toBe(8_000);
  });
});

describe("maxDiscountKopecks", () => {
  it("10% от суммы", () => {
    expect(maxDiscountKopecks(250_000)).toBe(25_000);
  });

  it("округляет вниз, чтобы не превысить лимит", () => {
    expect(maxDiscountKopecks(999)).toBe(99);
  });

  it("процент вне диапазона — ошибка", () => {
    expect(() => maxDiscountKopecks(100_000, 101)).toThrow(/от 0 до 100/);
  });
});

describe("discountPercent", () => {
  it("считает долю скидки", () => {
    expect(discountPercent(250_000, 25_000)).toBe(10);
  });

  it("пустой заказ — 0%", () => {
    expect(discountPercent(0, 0)).toBe(0);
  });
});

describe("assertDiscountWithinLimit", () => {
  it("скидка в пределах лимита проходит у менеджера", () => {
    expect(() => assertDiscountWithinLimit({ items, orderDiscountKopecks: 25_000, role: "MANAGER" })).not.toThrow();
  });

  it("скидка на копейку выше лимита у менеджера отклоняется", () => {
    expect(() => assertDiscountWithinLimit({ items, orderDiscountKopecks: 25_001, role: "MANAGER" })).toThrow(
      DiscountLimitError,
    );
  });

  it("менеджеру лимит писан", () => {
    expect(() => assertDiscountWithinLimit({ items, orderDiscountKopecks: 25_001, role: "MANAGER" })).toThrow(
      DiscountLimitError,
    );
  });

  it("руководитель и админ дают скидку выше лимита", () => {
    expect(() => assertDiscountWithinLimit({ items, orderDiscountKopecks: 100_000, role: "HEAD" })).not.toThrow();
    expect(() => assertDiscountWithinLimit({ items, orderDiscountKopecks: 100_000, role: "ADMIN" })).not.toThrow();
  });

  it("скидка больше суммы товаров отклоняется даже у руководителя", () => {
    expect(() => assertDiscountWithinLimit({ items, orderDiscountKopecks: 250_001, role: "HEAD" })).toThrow(
      /больше суммы товаров/,
    );
  });

  it("учитывает скидки на позициях вместе со скидкой на заказ", () => {
    const withItemDiscounts = [
      { priceKopecks: 100_000, quantity: 2, discountKopecks: 20_000 },
      { priceKopecks: 50_000, quantity: 1 },
    ];
    // 20 000 на позиции + 6 000 на заказ = 26 000 при лимите 25 000
    expect(() =>
      assertDiscountWithinLimit({ items: withItemDiscounts, orderDiscountKopecks: 6_000, role: "MANAGER" }),
    ).toThrow(DiscountLimitError);
    expect(() =>
      assertDiscountWithinLimit({ items: withItemDiscounts, orderDiscountKopecks: 5_000, role: "MANAGER" }),
    ).not.toThrow();
  });

  it("свой лимит из настроек перекрывает значение по умолчанию", () => {
    expect(() =>
      assertDiscountWithinLimit({ items, orderDiscountKopecks: 50_000, role: "MANAGER", limitPercent: 20 }),
    ).not.toThrow();
  });

  it("в сообщении видно и скидку, и лимит", () => {
    try {
      assertDiscountWithinLimit({ items, orderDiscountKopecks: 30_000, role: "MANAGER" });
      expect.unreachable("должно было выбросить ошибку");
    } catch (error) {
      expect(error).toBeInstanceOf(DiscountLimitError);
      expect((error as DiscountLimitError).maxKopecks).toBe(25_000);
      expect((error as DiscountLimitError).message).toContain("10%");
    }
  });
});
