import { describe, expect, it } from "vitest";
import { canManageOrderDocuments, isOrderDocumentKind } from "./order-document";

describe("isOrderDocumentKind", () => {
  it("знает транспортную накладную", () => {
    expect(isOrderDocumentKind("WAYBILL")).toBe(true);
  });

  it("чужие ключи и свойства прототипа не принимает", () => {
    expect(isOrderDocumentKind("SUPPLIER_INVOICE")).toBe(false);
    expect(isOrderDocumentKind("toString")).toBe(false);
    expect(isOrderDocumentKind("")).toBe(false);
  });
});

describe("canManageOrderDocuments", () => {
  it("можно, пока заказ открыт", () => {
    expect(canManageOrderDocuments("NEW", "MANAGER")).toBe(true);
    expect(canManageOrderDocuments("IN_PROGRESS", "HEAD")).toBe(true);
  });

  it("нельзя у выполненного и отменённого", () => {
    expect(canManageOrderDocuments("COMPLETED", "ADMIN")).toBe(false);
    expect(canManageOrderDocuments("CANCELLED", "MANAGER")).toBe(false);
  });
});
