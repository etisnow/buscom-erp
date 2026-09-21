import { describe, expect, it } from "vitest";
import { assertTransition, availableTransitions, canTransition, OrderTransitionError } from "./status";

describe("статусная модель заказа", () => {
  it("менеджер берёт новый заказ в работу", () => {
    expect(canTransition("NEW", "IN_PROGRESS", "MANAGER")).toBe(true);
  });

  // Склада в проекте нет: отправку и отгрузку ведёт менеджер.
  it("менеджер отправляет оплаченный заказ и отгружает его", () => {
    expect(canTransition("PAID", "SHIPPING", "MANAGER")).toBe(true);
    expect(canTransition("SHIPPING", "SHIPPED", "MANAGER")).toBe(true);
  });

  it("отмена оплаченного заказа — только руководитель", () => {
    expect(canTransition("PAID", "CANCELLED", "MANAGER")).toBe(false);
    expect(canTransition("PAID", "CANCELLED", "HEAD")).toBe(true);
  });

  it("из финальных статусов переходов нет", () => {
    expect(availableTransitions("COMPLETED", "ADMIN")).toEqual([]);
    expect(availableTransitions("CANCELLED", "ADMIN")).toEqual([]);
  });

  it("непредусмотренный переход отклоняется", () => {
    expect(() => assertTransition({ from: "NEW", to: "SHIPPED", role: "ADMIN" })).toThrow(OrderTransitionError);
  });

  it("отмена требует причину", () => {
    expect(() => assertTransition({ from: "NEW", to: "CANCELLED", role: "MANAGER" })).toThrow(/причину/);
    expect(() =>
      assertTransition({ from: "NEW", to: "CANCELLED", role: "MANAGER", cancelReason: "Дубль" }),
    ).not.toThrow();
  });

  describe("треки поставщиков", () => {
    const done = { supplierName: "Автокомплект", stageIndex: 2, stagesCount: 3 };
    const halfway = { supplierName: "Сидения-Про", stageIndex: 0, stagesCount: 3 };
    const notStarted = { supplierName: "Люки-М", stageIndex: null, stagesCount: 2 };

    it("в «Отправку» не пускает, пока хоть один поставщик не прошёл цепочку, и называет его", () => {
      expect(() =>
        assertTransition({
          from: "PAID",
          to: "SHIPPING",
          role: "MANAGER",
          supplierTracks: [done, halfway, notStarted],
        }),
      ).toThrow("Не пройдены этапы поставщиков: «Сидения-Про», «Люки-М»");
    });

    it("постоплата (из «В работе» сразу в «Отправку») проверяется так же", () => {
      expect(() =>
        assertTransition({ from: "IN_PROGRESS", to: "SHIPPING", role: "MANAGER", supplierTracks: [halfway] }),
      ).toThrow(OrderTransitionError);
    });

    it("все треки на последнем этапе — «Отправка» разрешена", () => {
      expect(() =>
        assertTransition({ from: "PAID", to: "SHIPPING", role: "MANAGER", supplierTracks: [done] }),
      ).not.toThrow();
    });

    it("на остальные переходы и на отмену треки не влияют", () => {
      expect(() =>
        assertTransition({ from: "IN_PROGRESS", to: "AWAITING_PAYMENT", role: "MANAGER", supplierTracks: [halfway] }),
      ).not.toThrow();
      expect(() =>
        assertTransition({
          from: "PAID",
          to: "CANCELLED",
          role: "HEAD",
          cancelReason: "Нет у поставщика",
          supplierTracks: [notStarted],
        }),
      ).not.toThrow();
    });
  });
});
