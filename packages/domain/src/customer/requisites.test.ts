import { describe, expect, it } from "vitest";
import { EMPTY_CUSTOMER_REQUISITES, hasCustomerRequisites, parseCustomerRequisites } from "./requisites";

describe("parseCustomerRequisites", () => {
  it("из null и мусора делает пустые реквизиты", () => {
    expect(parseCustomerRequisites(null)).toEqual(EMPTY_CUSTOMER_REQUISITES);
    expect(parseCustomerRequisites("строка")).toEqual(EMPTY_CUSTOMER_REQUISITES);
    expect(parseCustomerRequisites(42)).toEqual(EMPTY_CUSTOMER_REQUISITES);
  });

  it("недостающие ключи добивает пустыми, а не теряет объект", () => {
    const parsed = parseCustomerRequisites({ ogrn: "1083917001629", bankName: "Сбербанк" });

    expect(parsed.ogrn).toBe("1083917001629");
    expect(parsed.bankName).toBe("Сбербанк");
    expect(parsed.legalAddress).toBe("");
  });

  it("нестроковые значения не подхватывает", () => {
    expect(parseCustomerRequisites({ bic: 42, ogrn: "1" })).toMatchObject({ bic: "", ogrn: "1" });
  });
});

describe("hasCustomerRequisites", () => {
  it("пустые и из одних пробелов — ничего не заполнено", () => {
    expect(hasCustomerRequisites(EMPTY_CUSTOMER_REQUISITES)).toBe(false);
    expect(hasCustomerRequisites({ ...EMPTY_CUSTOMER_REQUISITES, bic: "   " })).toBe(false);
  });

  it("хватает одного заполненного поля", () => {
    expect(hasCustomerRequisites({ ...EMPTY_CUSTOMER_REQUISITES, ogrn: "1083917001629" })).toBe(true);
  });
});
