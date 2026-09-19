import { describe, expect, it } from "vitest";
import { formatRub, rublesToKopecks } from "./money";

describe("rublesToKopecks", () => {
  it.each([
    ["1234", 123400],
    ["1234.5", 123450],
    ["1 234,50", 123450],
    ["0,01", 1],
    [99.99, 9999],
    ["-10", -1000],
  ])("%s → %d", (input, expected) => {
    expect(rublesToKopecks(input)).toBe(expected);
  });

  it.each(["", "abc", "1.234", "12,3,4"])("отклоняет %j", (input) => {
    expect(() => rublesToKopecks(input)).toThrow();
  });
});

describe("formatRub", () => {
  it("форматирует по-русски", () => {
    // Intl использует неразрывные пробелы — нормализуем для сравнения
    expect(formatRub(123450).replace(/\s/g, " ")).toBe("1 234,5 ₽");
  });
});
