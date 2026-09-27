import { describe, expect, it } from "vitest";
import { matchesTerms, normalizeSearchText, searchProducts, searchTerms } from "./search";

const catalog = [
  { name: "Поручень вертикальный", sku: "POR-1" },
  { name: "Замок двери", sku: "ZAM-2" },
  { name: "Сиденье «Турист» двухместное", sku: "SEAT-1" },
  { name: "Шторка на окно, серая", sku: "ST-20" },
  { name: "Люк аварийный Ёлка", sku: "LUK-7" },
  { name: "Ремень безопасности трёхточечный", sku: "REM-3" },
  { name: "Опора сиденья", sku: "OP-12" },
];

const names = (query: string) => searchProducts(catalog, query).map((item) => item.name);

describe("normalizeSearchText и searchTerms", () => {
  it("регистр, «ё», знаки препинания", () => {
    expect(normalizeSearchText("  Ёлка, «Турист»!  ")).toBe("елка турист");
  });

  it("пустой и мусорный запрос — искать нечего", () => {
    expect(searchTerms("")).toEqual([]);
    expect(searchTerms(" ,.!? ")).toEqual([]);
  });

  it("окончания отрезаются, короткие слова, цифры и латиница — нет", () => {
    expect(searchTerms("сиденья шторки люк 3 seat")).toEqual(["сидн", "шторк", "люк", "3", "seat"]);
  });

  it("повтор слова не удваивает условие", () => {
    expect(searchTerms("сиденье сиденья")).toEqual(["сидн"]);
  });
});

describe("searchProducts", () => {
  it("другая форма слова находит товар", () => {
    expect(names("сиденья")).toEqual(["Сиденье «Турист» двухместное", "Опора сиденья"]);
    expect(names("шторки")).toEqual(["Шторка на окно, серая"]);
  });

  it("все слова должны найтись", () => {
    expect(names("сиденье опора")).toEqual(["Опора сиденья"]);
    expect(names("сиденье красное")).toEqual([]);
  });

  it("«е» находит «ё» и наоборот", () => {
    expect(names("елка")).toEqual(["Люк аварийный Ёлка"]);
    expect(names("трехточечный")).toEqual(["Ремень безопасности трёхточечный"]);
  });

  it("по коду — с дефисом и без, точный код первым", () => {
    expect(names("seat1")).toEqual(["Сиденье «Турист» двухместное"]);
    expect(names("OP-12")[0]).toBe("Опора сиденья");
  });

  it("название, начинающееся с запроса, — выше", () => {
    expect(names("опора")).toEqual(["Опора сиденья"]);
    expect(names("сиденье")[0]).toBe("Сиденье «Турист» двухместное");
  });

  it("пустой запрос — пустой результат, а не весь каталог", () => {
    expect(names("   ")).toEqual([]);
  });
});

describe("беглая гласная", () => {
  it("«поручни» находят «Поручень», «замки» — «Замок», и обратно", () => {
    expect(names("поручни")).toEqual(["Поручень вертикальный"]);
    expect(names("поручень")).toEqual(["Поручень вертикальный"]);
    expect(names("замки")).toEqual(["Замок двери"]);
  });

  it("недописанное слово по-прежнему находит", () => {
    expect(names("пору")[0]).toBe("Поручень вертикальный");
    expect(names("сиде")).toEqual(["Сиденье «Турист» двухместное", "Опора сиденья"]);
  });
});

describe("matchesTerms", () => {
  it("названия разделов сверяются так же, как товары", () => {
    expect(matchesTerms("Сиденья для микроавтобусов", searchTerms("сиденье"))).toBe(true);
    expect(matchesTerms("Поручни", searchTerms("поручень"))).toBe(true);
    expect(matchesTerms("Полки", searchTerms("люки"))).toBe(false);
  });
});
