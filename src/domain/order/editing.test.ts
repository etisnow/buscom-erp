import { describe, expect, it } from "vitest";
import { assertCanEditItems, canEditItems, canReassignManager, OrderEditError } from "./editing";

describe("canEditItems", () => {
  it("менеджер правит состав до оплаты", () => {
    expect(canEditItems("NEW", "MANAGER")).toBe(true);
    expect(canEditItems("IN_PROGRESS", "MANAGER")).toBe(true);
    expect(canEditItems("AWAITING_PAYMENT", "MANAGER")).toBe(true);
  });

  it("после оплаты менеджер состав не правит", () => {
    expect(canEditItems("PAID", "MANAGER")).toBe(false);
    expect(canEditItems("ASSEMBLY", "MANAGER")).toBe(false);
    expect(canEditItems("SHIPPED", "MANAGER")).toBe(false);
  });

  it("после оплаты правит руководитель", () => {
    expect(canEditItems("PAID", "HEAD")).toBe(true);
    expect(canEditItems("ASSEMBLY", "ADMIN")).toBe(true);
  });

  it("в выполненном и отменённом не правит никто", () => {
    for (const role of ["MANAGER", "WAREHOUSE", "HEAD", "ADMIN"] as const) {
      expect(canEditItems("COMPLETED", role)).toBe(false);
      expect(canEditItems("CANCELLED", role)).toBe(false);
    }
  });

  it("склад не правит состав ни в одном статусе", () => {
    for (const status of ["NEW", "IN_PROGRESS", "AWAITING_PAYMENT", "PAID", "ASSEMBLY"] as const) {
      expect(canEditItems(status, "WAREHOUSE")).toBe(false);
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

  it("при нехватке прав говорит про права", () => {
    expect(() => assertCanEditItems("PAID", "MANAGER")).toThrow(OrderEditError);
    expect(() => assertCanEditItems("PAID", "MANAGER")).toThrow(/Недостаточно прав/);
  });
});

describe("canReassignManager", () => {
  it("руководитель переназначает в нефинальном статусе", () => {
    expect(canReassignManager("PAID", "HEAD")).toBe(true);
    expect(canReassignManager("NEW", "ADMIN")).toBe(true);
  });

  it("менеджер и склад не переназначают", () => {
    expect(canReassignManager("NEW", "MANAGER")).toBe(false);
    expect(canReassignManager("NEW", "WAREHOUSE")).toBe(false);
  });

  it("в финальном статусе не переназначает никто", () => {
    expect(canReassignManager("COMPLETED", "HEAD")).toBe(false);
    expect(canReassignManager("CANCELLED", "ADMIN")).toBe(false);
  });
});
