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
});
