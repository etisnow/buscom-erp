import { describe, expect, it } from "vitest";
import { assertTransition, availableTransitions, canTransition, OrderTransitionError } from "./status";

describe("статусная модель заказа", () => {
  it("менеджер берёт новый заказ в работу", () => {
    expect(canTransition("NEW", "IN_PROGRESS", "MANAGER")).toBe(true);
  });

  it("склад не может брать новые заказы", () => {
    expect(availableTransitions("NEW", "WAREHOUSE")).toEqual([]);
  });

  it("отгрузку делает склад, а не менеджер", () => {
    expect(canTransition("ASSEMBLY", "SHIPPED", "WAREHOUSE")).toBe(true);
    expect(canTransition("ASSEMBLY", "SHIPPED", "MANAGER")).toBe(false);
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
});
