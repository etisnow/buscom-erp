import { describe, expect, it } from "vitest";
import { modelDescription, modelFamily, modelPath, modelSlug, modelTitle, siteModels } from "./models";

describe("адреса моделей", () => {
  it("транслитерация названия — формат, утверждённый владельцем", () => {
    expect(modelSlug("ГАЗель Next")).toBe("gazel-next");
    expect(modelPath("ГАЗель Next")).toBe("/modeli/gazel-next");
    expect(modelSlug("Ford Transit 2000–2014")).toBe("ford-transit-2000-2014");
  });

  it("поколение ведёт на страницу семейства", () => {
    expect(modelPath("Ford Transit 2015+")).toBe("/modeli/ford-transit");
    expect(modelPath("Mercedes Sprinter W907")).toBe("/modeli/mercedes-sprinter");
  });
});

describe("modelFamily", () => {
  it.each([
    ["Ford Transit 2000–2014", "Ford Transit"],
    ["Ford Transit 2015+", "Ford Transit"],
    ["Ford Transit", "Ford Transit"],
    ["Mercedes Sprinter W906", "Mercedes Sprinter"],
    ["Mercedes Sprinter W907", "Mercedes Sprinter"],
    ["Mercedes Sprinter Classic", "Mercedes Sprinter"],
    ["Mercedes Sprinter", "Mercedes Sprinter"],
    ["Volkswagen Crafter W906", "Volkswagen Crafter"],
    ["Volkswagen Crafter 2017", "Volkswagen Crafter"],
    ["Volkswagen Transporter T5", "Volkswagen Transporter"],
    ["Iveco Daily 2006–2014", "Iveco Daily"],
    ["Iveco Daily 2015+", "Iveco Daily"],
    ["Renault Master III", "Renault Master"],
    ["Citroen Jumpy / Peugeot Expert 2017+", "Citroen Jumpy / Peugeot Expert"],
    ["Fiat Ducato 244", "Fiat Ducato / Peugeot Boxer / Citroen Jumper"],
    ["Fiat Ducato / Peugeot Boxer / Citroen Jumper X250 / X290", "Fiat Ducato / Peugeot Boxer / Citroen Jumper"],
  ])("%s → %s", (name, family) => {
    expect(modelFamily(name)).toBe(family);
  });

  it("разные машины остаются разными семействами", () => {
    for (const name of [
      "ГАЗель Next",
      "ГАЗель NN",
      "ГАЗель Бизнес",
      "ГАЗель Next CitiLine",
      "ГАЗон Next",
      "ГАЗ Соболь",
    ]) {
      expect(modelFamily(name)).toBe(name);
    }
    expect(modelFamily("Volkswagen LT")).toBe("Volkswagen LT");
  });

  it("название из одного слова не обрезается до пустоты", () => {
    expect(modelFamily("2015")).toBe("2015");
    expect(modelFamily("  Ford   Transit  2015+ ")).toBe("Ford Transit");
  });
});

describe("siteModels", () => {
  it("модели из совместимости: число товаров, по убыванию, повтор у товара — один раз", () => {
    const models = siteModels([
      { compatibility: ["ГАЗель Next", "ГАЗель NN"] },
      { compatibility: ["ГАЗель Next", " ГАЗель Next "] },
      { compatibility: [] },
      { compatibility: ["Volkswagen LT"] },
    ]);
    expect(models).toEqual([
      { name: "ГАЗель Next", slug: "gazel-next", productCount: 2, members: ["ГАЗель Next"] },
      // При равенстве — по алфавиту в русской локали: кириллица раньше латиницы
      { name: "ГАЗель NN", slug: "gazel-nn", productCount: 1, members: ["ГАЗель NN"] },
      { name: "Volkswagen LT", slug: "volkswagen-lt", productCount: 1, members: ["Volkswagen LT"] },
    ]);
  });

  it("поколения собираются в семейство; товар, подходящий нескольким, считается один раз", () => {
    const models = siteModels([
      { compatibility: ["Ford Transit 2000–2014", "Ford Transit 2015+"] },
      { compatibility: ["Ford Transit 2015+"] },
      { compatibility: ["Ford Transit"] },
      { compatibility: ["Mercedes Sprinter W906"] },
    ]);
    expect(models).toEqual([
      {
        name: "Ford Transit",
        slug: "ford-transit",
        productCount: 3,
        members: ["Ford Transit", "Ford Transit 2000–2014", "Ford Transit 2015+"],
      },
      {
        name: "Mercedes Sprinter",
        slug: "mercedes-sprinter",
        productCount: 1,
        members: ["Mercedes Sprinter W906"],
      },
    ]);
  });

  it("два семейства с одним адресом — страница у того, где товаров больше", () => {
    const models = siteModels([
      { compatibility: ["Ford Transit!"] },
      { compatibility: ["Ford Transit!"] },
      { compatibility: ["Ford Transit?"] },
    ]);
    expect(models).toHaveLength(1);
    expect(models[0]).toMatchObject({ name: "Ford Transit!", productCount: 2 });
  });
});

describe("метатеги модели", () => {
  it("title и description с правильным числом", () => {
    expect(modelTitle("ГАЗель Next")).toBe("Комплектующие для ГАЗель Next — купить | Баском");
    expect(modelDescription("ГАЗель Next", 1)).toMatch(/^1 товар для ГАЗель Next:/);
    expect(modelDescription("ГАЗель Next", 23)).toMatch(/^23 товара /);
    expect(modelDescription("ГАЗель Next", 11)).toMatch(/^11 товаров /);
  });
});
