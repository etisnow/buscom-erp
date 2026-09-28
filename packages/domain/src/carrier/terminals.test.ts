import { describe, expect, it } from "vitest";
import {
  canDeactivateMissing,
  suggestCities,
  terminalAddressLine,
  terminalCarrierOf,
  terminalSnapshotSchema,
  type TerminalSnapshot,
} from "./terminals";

describe("canDeactivateMissing", () => {
  it("первая загрузка и обычное обновление гасят пропавшие пункты", () => {
    expect(canDeactivateMissing(0, 265)).toBe(true);
    expect(canDeactivateMissing(265, 262)).toBe(true);
  });

  it("выгрузка заметно меньше того, что есть, — подозрительна: ничего не гасим", () => {
    expect(canDeactivateMissing(265, 100)).toBe(false);
    expect(canDeactivateMissing(265, 0)).toBe(false);
  });
});

describe("снимок терминала", () => {
  const snapshot: TerminalSnapshot = {
    carrier: "DELLIN",
    code: "296",
    name: "Нижний Новгород Московское (основной)",
    city: "Нижний Новгород",
    address: "Московское ш., 52",
    schedule: "пн-пт: 08:00-20:00",
  };

  it("терминалы загружаются у ДЛ и ПЭК", () => {
    expect(terminalCarrierOf("Деловые линии")).toBe("DELLIN");
    expect(terminalCarrierOf("ПЭК")).toBe("PEC");
    expect(terminalCarrierOf("СДЭК")).toBeNull();
    expect(terminalCarrierOf(undefined)).toBeNull();
  });

  it("адрес доставки строкой: город, адрес и какой терминал", () => {
    expect(terminalAddressLine(snapshot)).toBe(
      "Нижний Новгород, Московское ш., 52 (терминал «Нижний Новгород Московское (основной)»)",
    );
  });

  it("снимок проходит схему, чужой перевозчик — нет", () => {
    expect(terminalSnapshotSchema.parse(snapshot)).toEqual(snapshot);
    expect(terminalSnapshotSchema.safeParse({ ...snapshot, carrier: "CDEK" }).success).toBe(false);
  });
});

describe("suggestCities", () => {
  const cities = ["Альметьевск", "Москва", "Мурманск", "Набережные Челны", "Нижний Новгород", "Орёл", "Смоленск"];

  it("сначала города с набранного начала, потом — со слова внутри и с середины", () => {
    expect(suggestCities(cities, "м")).toEqual(["Москва", "Мурманск", "Альметьевск", "Смоленск"]);
    expect(suggestCities(cities, "новг")).toEqual(["Нижний Новгород"]);
  });

  it("регистр и «ё» не важны, пустой ввод — ничего, лимит соблюдается", () => {
    expect(suggestCities(cities, "ОРЕ")).toEqual(["Орёл"]);
    expect(suggestCities(cities, "ОРЕЛ")).toEqual([]);
    expect(suggestCities(cities, "  ")).toEqual([]);
    expect(suggestCities(cities, "н", 2)).toEqual(["Набережные Челны", "Нижний Новгород"]);
  });

  it("город совпал целиком — подсказка не нужна", () => {
    expect(suggestCities(cities, "москва")).toEqual([]);
  });
});
