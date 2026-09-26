import { describe, expect, it } from "vitest";
import {
  assertCategoryPlacement,
  buildCategoryTree,
  CATEGORY_MAX_DEPTH,
  categoryPath,
  CategoryError,
  flattenCategoryTree,
  normalizeCategoryName,
  withDescendants,
} from "./categories";

const flat = [
  { id: "salon", name: "Детали салона", parentId: null },
  { id: "klimat", name: "Климат", parentId: null },
  { id: "ljuki", name: "Люки", parentId: "klimat" },
  { id: "polki", name: "Полки", parentId: "salon" },
  { id: "air", name: "Воздуховоды", parentId: "klimat" },
];

describe("дерево категорий", () => {
  it("строит дерево, на каждом уровне по алфавиту, с глубиной", () => {
    const tree = buildCategoryTree(flat);
    expect(tree.map((item) => item.name)).toEqual(["Детали салона", "Климат"]);
    expect(tree[1].children.map((item) => [item.name, item.depth])).toEqual([
      ["Воздуховоды", 1],
      ["Люки", 1],
    ]);
  });

  it("разворачивается в список по порядку обхода — для выпадающего списка", () => {
    expect(flattenCategoryTree(buildCategoryTree(flat)).map((item) => item.id)).toEqual([
      "salon",
      "polki",
      "klimat",
      "air",
      "ljuki",
    ]);
  });

  it("путь от корня и потомки для фильтра", () => {
    expect(categoryPath("ljuki", flat)).toBe("Климат / Люки");
    expect(categoryPath(null, flat)).toBe("");
    expect(withDescendants("klimat", flat).sort()).toEqual(["air", "klimat", "ljuki"]);
  });

  it("битые данные с циклом не вешают построение", () => {
    const loop = [
      { id: "a", name: "А", parentId: "b" },
      { id: "b", name: "Б", parentId: "a" },
    ];
    expect(() => buildCategoryTree(loop)).not.toThrow();
    expect(() => categoryPath("a", loop)).not.toThrow();
  });
});

describe("перенос и название", () => {
  it("нельзя перенести раздел внутрь самого себя или своего потомка", () => {
    expect(() => assertCategoryPlacement("klimat", "ljuki", flat)).toThrow(/внутрь самой себя/);
    expect(() => assertCategoryPlacement("klimat", "klimat", flat)).toThrow(CategoryError);
    expect(() => assertCategoryPlacement("ljuki", "salon", flat)).not.toThrow();
  });

  it("ограничивает глубину с учётом собственных подкатегорий", () => {
    const deep = Array.from({ length: CATEGORY_MAX_DEPTH }, (_, index) => ({
      id: `l${index}`,
      name: `Уровень ${index}`,
      parentId: index === 0 ? null : `l${index - 1}`,
    }));
    expect(() => assertCategoryPlacement(null, `l${CATEGORY_MAX_DEPTH - 1}`, deep)).toThrow(/не больше/);
    expect(() => assertCategoryPlacement(null, `l${CATEGORY_MAX_DEPTH - 2}`, deep)).not.toThrow();
    // «Климат» с подкатегорией уже двухуровневый — под предпоследний уровень не влезет.
    expect(() => assertCategoryPlacement("klimat", `l${CATEGORY_MAX_DEPTH - 2}`, [...deep, ...flat])).toThrow(
      /не больше/,
    );
  });

  it("название без лишних пробелов, повтор у соседей отклоняется, в другом разделе — можно", () => {
    expect(normalizeCategoryName("  Люки   круглые ", "klimat", flat)).toBe("Люки круглые");
    expect(() => normalizeCategoryName("люки", "klimat", flat)).toThrow(/уже есть/);
    expect(normalizeCategoryName("Люки", "salon", flat)).toBe("Люки");
    expect(normalizeCategoryName("Люки", "klimat", flat, "ljuki")).toBe("Люки");
  });
});
