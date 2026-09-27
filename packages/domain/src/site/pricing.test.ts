import { describe, expect, it } from "vitest";
import { isNoneOptionValue } from "./pricing";

describe("isNoneOptionValue", () => {
  it("«Нет» без доплаты — отказ от опции, в любом регистре и с пробелами", () => {
    expect(isNoneOptionValue({ name: "Нет", priceDeltaKopecks: 0 })).toBe(true);
    expect(isNoneOptionValue({ name: " нет ", priceDeltaKopecks: 0 })).toBe(true);
  });

  it("с доплатой или с другим названием — обычный вариант", () => {
    expect(isNoneOptionValue({ name: "Нет", priceDeltaKopecks: 100 })).toBe(false);
    expect(isNoneOptionValue({ name: "Нет подголовника", priceDeltaKopecks: 0 })).toBe(false);
  });
});
