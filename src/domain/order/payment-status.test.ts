import { describe, expect, it } from "vitest";
import { isFullyPaid, paidTotal, paymentStatus, remainingToPay } from "./payment-status";

describe("paidTotal", () => {
  it("складывает платежи", () => {
    expect(paidTotal([{ amountKopecks: 100_000 }, { amountKopecks: 50_000 }])).toBe(150_000);
  });

  it("без платежей — ноль", () => {
    expect(paidTotal([])).toBe(0);
  });
});

describe("paymentStatus", () => {
  it("ноль оплат — «Не оплачен»", () => {
    expect(paymentStatus(100_000, 0)).toBe("UNPAID");
  });

  it("часть суммы — «Частично»", () => {
    expect(paymentStatus(100_000, 40_000)).toBe("PARTIAL");
  });

  it("ровно итог — «Оплачен»", () => {
    expect(paymentStatus(100_000, 100_000)).toBe("PAID");
  });

  it("больше итога — «Переплата»", () => {
    expect(paymentStatus(100_000, 120_000)).toBe("OVERPAID");
  });

  it("пустой заказ без оплат не считается оплаченным", () => {
    expect(paymentStatus(0, 0)).toBe("UNPAID");
  });

  it("отрицательная сумма оплат — ошибка", () => {
    expect(() => paymentStatus(100_000, -1)).toThrow(/отрицательной/);
  });

  it("не принимает дробные копейки", () => {
    expect(() => paymentStatus(100_000.5, 0)).toThrow(/целым числом копеек/);
  });
});

describe("remainingToPay", () => {
  it("возвращает остаток", () => {
    expect(remainingToPay(100_000, 30_000)).toBe(70_000);
  });

  it("при переплате остаток нулевой", () => {
    expect(remainingToPay(100_000, 150_000)).toBe(0);
  });
});

describe("isFullyPaid", () => {
  it("оплата ровно в итог переводит в PAID", () => {
    expect(isFullyPaid(100_000, 100_000)).toBe(true);
  });

  it("переплата тоже переводит в PAID", () => {
    expect(isFullyPaid(100_000, 100_001)).toBe(true);
  });

  it("недоплата не переводит", () => {
    expect(isFullyPaid(100_000, 99_999)).toBe(false);
  });

  it("заказ с нулевым итогом без платежей сам в PAID не уходит", () => {
    expect(isFullyPaid(0, 0)).toBe(false);
  });
});
