import { describe, expect, it } from "vitest";
import {
  applyCatalogQuery,
  catalogModels,
  catalogQueryHref,
  DEFAULT_CATALOG_QUERY,
  isCatalogQueryActive,
  parseCatalogQuery,
  type FilterableProduct,
} from "./catalog-query";

const product = (name: string, priceKopecks: number, extra: Partial<FilterableProduct> = {}): FilterableProduct => ({
  name,
  priceKopecks,
  isHit: false,
  compatibility: [],
  ...extra,
});

const shelf = product("Полка багажная", 450_000, { compatibility: ["ГАЗель Next", "Ford Transit"] });
const seat = product("Сиденье Турист", 1_500_050, { isHit: true, compatibility: ["ГАЗель Next"] });
const glue = product("Клей для ткани", 90_000);
const hatch = product("Люк аварийный", 0, { compatibility: ["Ford Transit"] });
const all = [shelf, seat, glue, hatch];

const names = (items: FilterableProduct[]) => items.map((item) => item.name);

describe("parseCatalogQuery", () => {
  it("пустой адрес — значения по умолчанию", () => {
    expect(parseCatalogQuery({})).toEqual(DEFAULT_CATALOG_QUERY);
  });

  it("разбирает все параметры, цену — целыми рублями с пробелами и запятой", () => {
    expect(parseCatalogQuery({ sort: "price-desc", min: "1 000", max: "2500,90", model: " ГАЗель Next " })).toEqual({
      sort: "price-desc",
      minRub: 1000,
      maxRub: 2500,
      model: "ГАЗель Next",
    });
  });

  it("мусор в адресе не ломает страницу", () => {
    expect(parseCatalogQuery({ sort: "hack", min: "-5", max: "abc", model: "" })).toEqual(DEFAULT_CATALOG_QUERY);
  });

  it("повтор параметра — берётся первый; перепутанные границы меняются местами", () => {
    expect(parseCatalogQuery({ sort: ["name", "price-asc"], min: "5000", max: "100" })).toMatchObject({
      sort: "name",
      minRub: 100,
      maxRub: 5000,
    });
  });

  it("«от 0» — не граница", () => {
    expect(parseCatalogQuery({ min: "0" }).minRub).toBeNull();
  });
});

describe("isCatalogQueryActive", () => {
  it("по умолчанию — чистая категория, любой параметр — выборка", () => {
    expect(isCatalogQueryActive(DEFAULT_CATALOG_QUERY)).toBe(false);
    expect(isCatalogQueryActive(parseCatalogQuery({ sort: "name" }))).toBe(true);
    expect(isCatalogQueryActive(parseCatalogQuery({ model: "Ford Transit" }))).toBe(true);
  });
});

describe("applyCatalogQuery", () => {
  it("по умолчанию — сначала дешевле, «по запросу» в конце", () => {
    expect(names(applyCatalogQuery(all, DEFAULT_CATALOG_QUERY))).toEqual([
      "Клей для ткани",
      "Полка багажная",
      "Сиденье Турист",
      "Люк аварийный",
    ]);
  });

  it("по цене — «по запросу» в конце в обе стороны", () => {
    const asc = applyCatalogQuery(all, { ...DEFAULT_CATALOG_QUERY, sort: "price-asc" });
    expect(names(asc)).toEqual(["Клей для ткани", "Полка багажная", "Сиденье Турист", "Люк аварийный"]);
    const desc = applyCatalogQuery(all, { ...DEFAULT_CATALOG_QUERY, sort: "price-desc" });
    expect(names(desc)).toEqual(["Сиденье Турист", "Полка багажная", "Клей для ткани", "Люк аварийный"]);
  });

  it("фильтр по модели", () => {
    expect(names(applyCatalogQuery(all, { ...DEFAULT_CATALOG_QUERY, sort: "name", model: "Ford Transit" }))).toEqual([
      "Люк аварийный",
      "Полка багажная",
    ]);
  });

  it("цена: границы включительно, копейки внутри верхней, «по запросу» не проходит", () => {
    const query = { ...DEFAULT_CATALOG_QUERY, sort: "price-asc" as const, minRub: 900, maxRub: 15_000 };
    expect(names(applyCatalogQuery(all, query))).toEqual(["Клей для ткани", "Полка багажная", "Сиденье Турист"]);
    expect(names(applyCatalogQuery(all, { ...query, maxRub: 14_999 }))).toEqual(["Клей для ткани", "Полка багажная"]);
    expect(names(applyCatalogQuery(all, { ...query, minRub: 901 }))).toEqual(["Полка багажная", "Сиденье Турист"]);
  });

  it("не меняет исходный список", () => {
    const copy = [...all];
    applyCatalogQuery(all, { ...DEFAULT_CATALOG_QUERY, sort: "price-desc" });
    expect(all).toEqual(copy);
  });
});

describe("catalogModels", () => {
  it("модели товаров категории, частые выше, повтор у товара считается раз", () => {
    const doubled = product("Поручень", 100, { compatibility: ["Ford Transit", "Ford Transit"] });
    expect(catalogModels([...all, doubled])).toEqual([
      { model: "Ford Transit", count: 3 },
      { model: "ГАЗель Next", count: 2 },
    ]);
  });
});

describe("catalogQueryHref", () => {
  it("без фильтров — адрес категории без параметров", () => {
    expect(catalogQueryHref("/sidenja", DEFAULT_CATALOG_QUERY)).toBe("/sidenja");
  });

  it("переносит в адрес всё, кроме значений по умолчанию, и кодирует модель", () => {
    const query = { sort: "price-desc", minRub: 1000, maxRub: 5000, model: "ГАЗель Next" } as const;
    expect(catalogQueryHref("/sidenja", query)).toBe(
      "/sidenja?model=%D0%93%D0%90%D0%97%D0%B5%D0%BB%D1%8C+Next&min=1000&max=5000&sort=price-desc",
    );
  });

  it("читается обратно тем же набором фильтров", () => {
    const query = { sort: "price-desc", minRub: null, maxRub: 20000, model: "Ford Transit" } as const;
    const params = Object.fromEntries(new URL(catalogQueryHref("/x", query), "https://bus-com.ru").searchParams);
    expect(parseCatalogQuery(params)).toEqual(query);
  });
});
