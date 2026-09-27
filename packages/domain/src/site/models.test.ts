import { describe, expect, it } from "vitest";
import { modelDescription, modelPath, modelSlug, modelTitle, siteModels } from "./models";

describe("адреса моделей", () => {
  it("транслитерация названия — формат, утверждённый владельцем", () => {
    expect(modelSlug("ГАЗель Next")).toBe("gazel-next");
    expect(modelPath("ГАЗель Next")).toBe("/modeli/gazel-next");
    expect(modelSlug("Ford Transit 2000–2014")).toBe("ford-transit-2000-2014");
    expect(modelSlug("Fiat Ducato / Peugeot Boxer / Citroen Jumper X250 / X290")).toBe(
      "fiat-ducato-peugeot-boxer-citroen-jumper-x250-x290",
    );
  });
});

describe("siteModels", () => {
  it("модели из совместимости: число товаров, по убыванию, повтор у товара — один раз", () => {
    const models = siteModels([
      { compatibility: ["ГАЗель Next", "ГАЗель NN"] },
      { compatibility: ["ГАЗель Next", " ГАЗель Next "] },
      { compatibility: [] },
      { compatibility: ["Mercedes Sprinter W907"] },
    ]);
    expect(models).toEqual([
      { name: "ГАЗель Next", slug: "gazel-next", productCount: 2 },
      // При равенстве — по алфавиту в русской локали: кириллица раньше латиницы
      { name: "ГАЗель NN", slug: "gazel-nn", productCount: 1 },
      { name: "Mercedes Sprinter W907", slug: "mercedes-sprinter-w907", productCount: 1 },
    ]);
  });

  it("два названия с одним адресом — страница у того, где товаров больше", () => {
    const models = siteModels([
      { compatibility: ["Iveco Daily 2015+"] },
      { compatibility: ["Iveco Daily 2015+"] },
      { compatibility: ["Iveco Daily 2015"] },
    ]);
    expect(models).toEqual([{ name: "Iveco Daily 2015+", slug: "iveco-daily-2015", productCount: 2 }]);
  });
});

describe("метатеги модели", () => {
  it("title и description с правильным числом", () => {
    expect(modelTitle("ГАЗель Next")).toBe("Комплектующие для ГАЗель Next — купить в Нижнем Новгороде | Баском");
    expect(modelDescription("ГАЗель Next", 1)).toMatch(/^1 товар для ГАЗель Next:/);
    expect(modelDescription("ГАЗель Next", 23)).toMatch(/^23 товара /);
    expect(modelDescription("ГАЗель Next", 11)).toMatch(/^11 товаров /);
  });
});
