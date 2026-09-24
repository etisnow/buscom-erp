import { describe, expect, it } from "vitest";
import { normalizeCompatibility, toggleModel, unknownModels } from "./compatibility";

const DICTIONARY = ["Mercedes Sprinter W906", "Ford Transit 2015+", "ГАЗель Next"];

describe("normalizeCompatibility", () => {
  it("раскладывает модели в порядке справочника", () => {
    expect(normalizeCompatibility(["ГАЗель Next", "Mercedes Sprinter W906"], DICTIONARY)).toEqual([
      "Mercedes Sprinter W906",
      "ГАЗель Next",
    ]);
  });

  it("убирает пробелы по краям, пустые строки и повторы", () => {
    expect(normalizeCompatibility([" ГАЗель Next ", "", "ГАЗель Next"], DICTIONARY)).toEqual(["ГАЗель Next"]);
  });

  it("модели не из справочника оставляет в конце в исходном порядке", () => {
    expect(normalizeCompatibility(["Соболь", "ГАЗель Next", "Ford Transit"], DICTIONARY)).toEqual([
      "ГАЗель Next",
      "Соболь",
      "Ford Transit",
    ]);
  });
});

describe("unknownModels", () => {
  it("возвращает модели, которых нет среди разрешённых", () => {
    expect(unknownModels(["ГАЗель Next", "Соболь", " Лада "], DICTIONARY)).toEqual(["Соболь", "Лада"]);
  });

  it("пустой список, если всё известно", () => {
    expect(unknownModels(["Ford Transit 2015+"], DICTIONARY)).toEqual([]);
  });
});

describe("toggleModel", () => {
  it("добавляет модель, которой нет", () => {
    expect(toggleModel(["ГАЗель Next"], "Ford Transit 2015+")).toEqual(["ГАЗель Next", "Ford Transit 2015+"]);
  });

  it("убирает модель, которая есть", () => {
    expect(toggleModel(["ГАЗель Next", "Ford Transit 2015+"], "ГАЗель Next")).toEqual(["Ford Transit 2015+"]);
  });
});
