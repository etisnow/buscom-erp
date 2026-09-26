import { describe, expect, it } from "vitest";
import { assertCanEditItems, canEditItems, canReassignManager, OrderEditError } from "./editing";

describe("canEditItems", () => {
  it("менеджер правит состав созданного заказа и заказа в работе до оплаты", () => {
    expect(canEditItems("NEW", "MANAGER")).toBe(true);
    expect(canEditItems("IN_PROGRESS", "MANAGER")).toBe(true);
  });

  it("после первой оплаты — только руководитель", () => {
    expect(canEditItems("IN_PROGRESS", "MANAGER", 100_000)).toBe(false);
    expect(canEditItems("IN_PROGRESS", "HEAD", 100_000)).toBe(true);
    expect(canEditItems("IN_PROGRESS", "ADMIN", 100_000)).toBe(true);
  });

  it("в выполненном и отменённом не правит никто", () => {
    for (const role of ["MANAGER", "HEAD", "ADMIN"] as const) {
      expect(canEditItems("COMPLETED", role)).toBe(false);
      expect(canEditItems("CANCELLED", role)).toBe(false);
    }
  });
});

describe("assertCanEditItems", () => {
  it("разрешённую правку пропускает", () => {
    expect(() => assertCanEditItems("IN_PROGRESS", "MANAGER")).not.toThrow();
  });

  it("в финальном статусе объясняет, что заказ закрыт", () => {
    expect(() => assertCanEditItems("COMPLETED", "ADMIN")).toThrow(/изменить нельзя/);
  });

  it("оплаченный заказ менеджеру не даёт и объясняет почему", () => {
    expect(() => assertCanEditItems("IN_PROGRESS", "MANAGER", 1)).toThrow(OrderEditError);
    expect(() => assertCanEditItems("IN_PROGRESS", "MANAGER", 1)).toThrow(/только руководитель/);
  });
});

describe("canReassignManager", () => {
  it("руководитель переназначает в нефинальном статусе", () => {
    expect(canReassignManager("IN_PROGRESS", "HEAD")).toBe(true);
    expect(canReassignManager("NEW", "ADMIN")).toBe(true);
  });

  it("менеджер не переназначает", () => {
    expect(canReassignManager("NEW", "MANAGER")).toBe(false);
  });

  it("в финальном статусе не переназначает никто", () => {
    expect(canReassignManager("COMPLETED", "HEAD")).toBe(false);
    expect(canReassignManager("CANCELLED", "ADMIN")).toBe(false);
  });
});
