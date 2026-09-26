import { describe, expect, it } from "vitest";
import { CargoInputError, formatCargo, formatWeightKg, parseSideCm, parseWeightKg } from "./delivery";

describe("parseWeightKg", () => {
  it("килограммы с запятой или точкой — в граммы", () => {
    expect(parseWeightKg("12,5")).toBe(12_500);
    expect(parseWeightKg("0.075")).toBe(75);
    expect(parseWeightKg(" 1 200 ")).toBe(1_200_000);
    expect(parseWeightKg("3")).toBe(3000);
  });

  it("пусто — вес не задан", () => {
    expect(parseWeightKg("  ")).toBeNull();
  });

  it("мусор, ноль, точность мельче грамма и опечатка в тоннах — ошибка", () => {
    for (const input of ["abc", "-1", "0", "0,0004", "1,2,3", "60000"]) {
      expect(() => parseWeightKg(input), input).toThrow(CargoInputError);
    }
  });
});

describe("parseSideCm", () => {
  it("целые сантиметры; пусто — null", () => {
    expect(parseSideCm("120", "Длина")).toBe(120);
    expect(parseSideCm("", "Длина")).toBeNull();
  });

  it("дробь, ноль и слишком большое — ошибка с названием стороны", () => {
    expect(() => parseSideCm("12,5", "Ширина")).toThrow("Ширина — целое число сантиметров");
    expect(() => parseSideCm("0", "Высота")).toThrow(CargoInputError);
    expect(() => parseSideCm("5001", "Длина")).toThrow(CargoInputError);
  });
});

describe("formatCargo", () => {
  it("вес и габариты одной строкой", () => {
    expect(formatCargo({ weightGrams: 12_500, lengthCm: 120, widthCm: 60, heightCm: 40 })).toBe(
      "12,5 кг · 120 × 60 × 40 см",
    );
  });

  it("незаполненная сторона — знак вопроса; ничего нет — null", () => {
    expect(formatCargo({ weightGrams: null, lengthCm: 120, widthCm: null, heightCm: 40 })).toBe("120 × ? × 40 см");
    expect(formatCargo({ weightGrams: null, lengthCm: null, widthCm: null, heightCm: null })).toBeNull();
  });

  it("вес без лишних нулей", () => {
    expect(formatWeightKg(3000)).toBe("3");
    expect(formatWeightKg(75)).toBe("0,075");
  });
});
