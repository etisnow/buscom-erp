import { describe, expect, it } from "vitest";
import {
  landingCombos,
  landingDescription,
  landingPath,
  landingPhrase,
  landingTitle,
  MIN_LANDING_PRODUCTS,
} from "./model-landing";

describe("адрес и тексты посадочной", () => {
  it("адрес — семейство и категория", () => {
    expect(landingPath("gazel-next", "sidenja-dlya-microavtobusov")).toBe(
      "/modeli/gazel-next/sidenja-dlya-microavtobusov",
    );
  });

  it("название: «для» ставится, если его ещё нет в названии категории", () => {
    expect(landingPhrase("Сиденья", "Ford Transit")).toBe("Сиденья для Ford Transit");
    expect(landingPhrase("Опоры сидений", "ГАЗель Next")).toBe("Опоры сидений для ГАЗель Next");
    expect(landingPhrase("Сиденья для микроавтобусов", "Ford Transit")).toBe("Сиденья для микроавтобусов Ford Transit");
    expect(landingPhrase("Комплектующие для сидений", "Mercedes Sprinter")).toBe(
      "Комплектующие для сидений Mercedes Sprinter",
    );
  });

  it("раздел и подкатегория с похожими названиями получают разные заголовки", () => {
    expect(landingPhrase("Сиденья", "Ford Transit")).not.toBe(
      landingPhrase("Сиденья для микроавтобусов", "Ford Transit"),
    );
  });

  it("title и description", () => {
    expect(landingTitle("Сиденья для Ford Transit")).toBe("Сиденья для Ford Transit — купить | Баском");
    expect(landingDescription("Сиденья для Ford Transit", 1)).toMatch(/^Сиденья для Ford Transit: 1 товар\. /);
    expect(landingDescription("Сиденья для Ford Transit", 8)).toMatch(/: 8 товаров\. /);
    expect(landingDescription("Сиденья для Ford Transit", 3)).toMatch(/: 3 товара\. /);
  });
});

describe("landingCombos", () => {
  const seat = (compat: string[]) => ({ categoryPath: ["seats", "root"], compatibility: compat });

  it("порог — не меньше трёх товаров", () => {
    expect(MIN_LANDING_PRODUCTS).toBe(3);
    const products = [seat(["ГАЗель Next"]), seat(["ГАЗель Next"])];
    expect(landingCombos(products)).toEqual([]);
    expect(
      landingCombos([...products, seat(["ГАЗель Next"])]).map((c) => [c.familySlug, c.categoryId, c.productCount]),
    ).toEqual([
      ["gazel-next", "seats", 3],
      ["gazel-next", "root", 3],
    ]);
  });

  it("поколения одного семейства считаются как один товар", () => {
    const products = [
      seat(["Ford Transit 2000–2014", "Ford Transit 2015+"]),
      seat(["Ford Transit 2015+"]),
      seat(["Ford Transit"]),
    ];
    const combos = landingCombos(products);
    expect(combos).toHaveLength(2);
    expect(combos.every((c) => c.family === "Ford Transit" && c.productCount === 3)).toBe(true);
  });

  it("разные семейства — разные страницы; товар без совместимости ничего не даёт", () => {
    const products = [
      ...Array.from({ length: 3 }, () => seat(["ГАЗель Next"])),
      ...Array.from({ length: 3 }, () => seat(["ГАЗ Соболь"])),
      seat([]),
    ];
    const slugs = new Set(landingCombos(products).map((c) => c.familySlug));
    expect(slugs).toEqual(new Set(["gazel-next", "gaz-sobol"]));
  });

  it("порядок — по числу товаров, затем по алфавиту", () => {
    const products = [
      ...Array.from({ length: 4 }, () => ({ categoryPath: ["a"], compatibility: ["ГАЗель Next"] })),
      ...Array.from({ length: 3 }, () => ({ categoryPath: ["a"], compatibility: ["ГАЗ Соболь"] })),
    ];
    expect(landingCombos(products).map((c) => c.family)).toEqual(["ГАЗель Next", "ГАЗ Соболь"]);
  });
});
