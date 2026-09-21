import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, parseSetting, requisitesReady, DEFAULT_SELLER_REQUISITES } from "./settings";
import { WORKING_MINUTES_PER_DAY } from "./sla";

describe("parseSetting: лимит скидки", () => {
  it("принимает корректный процент", () => {
    expect(parseSetting("discountLimitPercent", 15)).toBe(15);
  });

  it("ноль — допустимое значение, скидки запрещены", () => {
    expect(parseSetting("discountLimitPercent", 0)).toBe(0);
  });

  it("мусор откатывается к умолчанию, а не роняет систему", () => {
    expect(parseSetting("discountLimitPercent", "много")).toBe(DEFAULT_SETTINGS.discountLimitPercent);
    expect(parseSetting("discountLimitPercent", -5)).toBe(DEFAULT_SETTINGS.discountLimitPercent);
    expect(parseSetting("discountLimitPercent", 120)).toBe(DEFAULT_SETTINGS.discountLimitPercent);
    expect(parseSetting("discountLimitPercent", null)).toBe(DEFAULT_SETTINGS.discountLimitPercent);
  });
});

describe("parseSetting: SLA", () => {
  it("частичная настройка дополняется умолчаниями", () => {
    const result = parseSetting("slaMinutes", { NEW: 15 });
    expect(result.NEW).toBe(15);
    expect(result.IN_PROGRESS).toBe(WORKING_MINUTES_PER_DAY);
    expect(result.COMPLETED).toBeNull();
  });

  it("null означает «срок не контролируется»", () => {
    const result = parseSetting("slaMinutes", { NEW: null });
    expect(result.NEW).toBeNull();
  });

  it("неизвестный статус делает значение негодным целиком", () => {
    const result = parseSetting("slaMinutes", { НЕТ_ТАКОГО: 10 });
    expect(result).toEqual(DEFAULT_SETTINGS.slaMinutes);
  });

  it("ноль и дробные минуты не принимаются", () => {
    expect(parseSetting("slaMinutes", { NEW: 0 })).toEqual(DEFAULT_SETTINGS.slaMinutes);
    expect(parseSetting("slaMinutes", { NEW: 10.5 })).toEqual(DEFAULT_SETTINGS.slaMinutes);
  });
});

describe("parseSetting: реквизиты продавца", () => {
  it("недостающие поля заполняются пустыми строками", () => {
    const result = parseSetting("sellerRequisites", { name: "ООО «Баском»", inn: "6671234567" });
    expect(result.name).toBe("ООО «Баском»");
    expect(result.bankAccount).toBe("");
  });

  it("мусор откатывается к пустым реквизитам", () => {
    expect(parseSetting("sellerRequisites", "строка")).toEqual(DEFAULT_SELLER_REQUISITES);
  });
});

describe("requisitesReady", () => {
  it("пустые реквизиты не готовы для счёта", () => {
    expect(requisitesReady(DEFAULT_SELLER_REQUISITES)).toBe(false);
  });

  it("нужны название, ИНН и расчётный счёт", () => {
    expect(requisitesReady({ ...DEFAULT_SELLER_REQUISITES, name: "ООО «Баском»", inn: "6671234567" })).toBe(false);
    expect(
      requisitesReady({
        ...DEFAULT_SELLER_REQUISITES,
        name: "ООО «Баском»",
        inn: "6671234567",
        bankAccount: "40702810000000000001",
      }),
    ).toBe(true);
  });

  it("пробелы не считаются заполненным полем", () => {
    expect(requisitesReady({ ...DEFAULT_SELLER_REQUISITES, name: "   ", inn: "  ", bankAccount: " " })).toBe(false);
  });
});
