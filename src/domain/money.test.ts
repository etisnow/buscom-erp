import { describe, expect, it } from "vitest";
import { formatRub, formatRubPlain, roundToRubles, roundToRublesHalfDown, rublesToKopecks } from "./money";

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

describe("formatRubPlain", () => {
  it.each([
    [123450, "1234,50"],
    [0, "0,00"],
    [1, "0,01"],
    [-1000, "-10,00"],
  ])("%d → %s", (kopecks, expected) => {
    expect(formatRubPlain(kopecks)).toBe(expected);
  });

  it("не ставит разделитель тысяч — иначе Excel увидит текст", () => {
    expect(formatRubPlain(123456789)).toBe("1234567,89");
  });
});

describe("roundToRubles", () => {
  it.each([
    [16_050, 16_100],
    [16_049, 16_000],
    [16_000, 16_000],
    [1_500.5, 1_500],
    [5_161.5, 5_200],
    [49.99, 0],
    [50, 100],
    [-1_250, -1_300],
    [-1_249, -1_200],
    [0, 0],
  ])("%d коп. → %d коп.", (input, expected) => {
    expect(roundToRubles(input)).toBe(expected);
  });
});

describe("roundToRublesHalfDown", () => {
  it.each([
    [16_050, 16_000],
    [16_051, 16_100],
    [16_049, 16_000],
    [16_000, 16_000],
    [50, 0],
    [-1_250, -1_300],
    [-1_249, -1_200],
    [0, 0],
  ])("%d коп. → %d коп.", (input, expected) => {
    expect(roundToRublesHalfDown(input)).toBe(expected);
  });
});
