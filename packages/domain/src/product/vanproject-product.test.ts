import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { matchCategory, parseVanprojectProduct, pricingFromCombos, suggestVanprojectSku } from "./vanproject-product";

const fixture = (name: string) => readFileSync(join(__dirname, "fixtures", name), "utf8");

describe("parseVanprojectProduct", () => {
  // Отопитель ОСА-3000 (снята 28.09.2026): вариант «Напряжение», пять снимков
  const osa = parseVanprojectProduct(fixture("vanproject-product-osa.html"))!;

  it("название, id на сайте и цена карточки", () => {
    expect(osa.name).toBe("Отопитель жидкостный ОСА-3000");
    expect(osa.productId).toBe("42");
    expect(osa.priceKopecks).toBe(810_000);
  });

  it("снимки — оригиналы галереи, абсолютные адреса, без уменьшенных копий", () => {
    expect(osa.imageUrls).toHaveLength(5);
    expect(osa.imageUrls[0]).toBe("https://vanproject.ru/assets/images/products/42/osa-3000-foto-1.jpg");
    expect(osa.imageUrls.every((url) => !url.includes("cache_image"))).toBe(true);
  });

  it("описание — текст карточки, а не подписи бокового меню", () => {
    expect(osa.description).toMatch(/^Универсальный компактный жидкостный отопитель/);
    expect(osa.description).toContain("напряжение 12в или 24в");
    expect(osa.description).not.toContain("Стекла и стеклопакеты");
    // Абзацы на сайте разделены переводами строк Windows — пустых строк подряд быть не должно
    expect(osa.description).not.toMatch(/\r|\n{3,}/);
  });

  it("варианты товара и путь раздела", () => {
    expect(osa.form?.options.map((option) => option.label)).toEqual(["Напряжение"]);
    expect(osa.form?.options[0].values.map((value) => value.value)).toEqual(["12В", "24В"]);
    expect(osa.categoryPath).toEqual(["Отопители"]);
  });

  it("путь раздела вложенный; повтор соседних разделов схлопнут", () => {
    const luk = parseVanprojectProduct(fixture("vanproject-product-luk.html"))!;
    expect(luk.categoryPath).toEqual(["Люки и вентиляторы", "Люки Россия"]);
    expect(luk.imageUrls.length).toBeGreaterThan(0);
  });

  it("не страница товара — null", () => {
    expect(parseVanprojectProduct("<html><h1>Каталог</h1></html>")).toBeNull();
  });
});

describe("matchCategory", () => {
  const categories = [
    { id: "climate", name: "Климат", parentId: null },
    { id: "heaters", name: "Отопление", parentId: "climate" },
    { id: "hatches", name: "Люки", parentId: "climate" },
    { id: "luki-ru", name: "Люки  Россия", parentId: "hatches" },
  ];

  it("самый узкий раздел с тем же названием, без учёта регистра и пробелов", () => {
    expect(matchCategory(["Люки и вентиляторы", "люки россия"], categories)).toBe("luki-ru");
  });

  it("совпадения нет — null, категорию выберет человек", () => {
    expect(matchCategory(["Отопители"], categories)).toBeNull();
  });
});

it("артикул-подсказка — по id на сайте поставщика", () => {
  expect(suggestVanprojectSku("42")).toBe("VP-42");
  expect(suggestVanprojectSku(null)).toBe("");
});

describe("pricingFromCombos", () => {
  const options = [
    {
      key: "voltage",
      label: "Напряжение:",
      values: [
        { value: "12В", requires: {} },
        { value: "24В", requires: {} },
      ],
    },
  ];

  it("база — самая дешёвая закупка, доплата варианта — разница закупок", () => {
    const pricing = pricingFromCombos(options, [
      { selection: { voltage: "12В" }, label: "12В", priceKopecks: 810_000 },
      { selection: { voltage: "24В" }, label: "24В", priceKopecks: 850_000 },
    ]);
    expect(pricing.basePurchaseKopecks).toBe(810_000);
    expect(pricing.baseSelection).toEqual({ voltage: "12В" });
    expect(pricing.groups).toEqual([
      {
        name: "Напряжение",
        required: true,
        values: [
          { name: "12В", priceDeltaKopecks: 0 },
          { name: "24В", priceDeltaKopecks: 40_000 },
        ],
      },
    ]);
  });

  it("сочетание без цены не учитывается, у варианта без цен доплата 0", () => {
    const pricing = pricingFromCombos(options, [
      { selection: { voltage: "12В" }, label: "12В", priceKopecks: 810_000 },
      { selection: { voltage: "24В" }, label: "24В", priceKopecks: null },
    ]);
    expect(pricing.groups[0].values[1]).toEqual({ name: "24В", priceDeltaKopecks: 0 });
  });

  it("ни одной цены — базы нет", () => {
    expect(pricingFromCombos(options, []).basePurchaseKopecks).toBeNull();
  });
});
