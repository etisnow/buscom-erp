import { describe, expect, it } from "vitest";
import {
  hasSupplierAction,
  isSupplierActionKey,
  normalizeEnabledActions,
  SUPPLIER_ACTIONS,
} from "@/domain/supplier/actions";

describe("SUPPLIER_ACTIONS", () => {
  it("содержит оба «Заказа поставщику» и «Прикрепить счёт поставщика клиенту»", () => {
    const keys = SUPPLIER_ACTIONS.map((action) => action.key);
    expect(keys).toContain("SUPPLIER_REQUEST");
    expect(keys).toContain("SUPPLIER_REQUEST_OUR_PRICES");
    expect(keys).toContain("SUPPLIER_INVOICE");
  });

  it("у каждого действия есть описание", () => {
    for (const action of SUPPLIER_ACTIONS) {
      expect(action.description.trim()).not.toBe("");
    }
  });
});

describe("isSupplierActionKey", () => {
  it("принимает известные ключи и отклоняет прочее", () => {
    expect(isSupplierActionKey("SUPPLIER_REQUEST")).toBe(true);
    expect(isSupplierActionKey("SUPPLIER_REQUEST_OUR_PRICES")).toBe(true);
    expect(isSupplierActionKey("SUPPLIER_INVOICE")).toBe(true);
    expect(isSupplierActionKey("НЕИЗВЕСТНО")).toBe(false);
    expect(isSupplierActionKey("")).toBe(false);
  });
});

describe("normalizeEnabledActions", () => {
  it("отбрасывает неизвестные ключи молча", () => {
    expect(normalizeEnabledActions(["SUPPLIER_REQUEST", "УСТАРЕЛО"])).toEqual(["SUPPLIER_REQUEST"]);
  });

  it("убирает повторы", () => {
    expect(normalizeEnabledActions(["SUPPLIER_REQUEST", "SUPPLIER_REQUEST"])).toEqual(["SUPPLIER_REQUEST"]);
  });

  it("пустой список остаётся пустым", () => {
    expect(normalizeEnabledActions([])).toEqual([]);
  });
});

describe("hasSupplierAction", () => {
  it("проверяет включённость по ключу", () => {
    expect(hasSupplierAction(["SUPPLIER_REQUEST"], "SUPPLIER_REQUEST")).toBe(true);
    expect(hasSupplierAction(["SUPPLIER_REQUEST"], "SUPPLIER_INVOICE")).toBe(false);
    expect(hasSupplierAction([], "SUPPLIER_REQUEST")).toBe(false);
  });
});
