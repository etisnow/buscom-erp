import { describe, expect, it } from "vitest";
import { defaultCategoryDescription, defaultTitle, descriptionSnippet } from "./meta";

describe("шаблоны метатегов", () => {
  it("title из названия", () => {
    expect(defaultTitle("Полки")).toBe("Полки — купить | Баском");
  });

  it("description категории не повторяет «для микроавтобусов»", () => {
    expect(defaultCategoryDescription("Полки")).toBe("Полки для микроавтобусов — каталог Баском");
    expect(defaultCategoryDescription("Диваны для микроавтобусов")).toBe("Диваны для микроавтобусов — каталог Баском");
    expect(defaultCategoryDescription("Сиденья для микроавтобуса")).toBe("Сиденья для микроавтобуса — каталог Баском");
  });

  it("отрывок описания: одна строка, до 160 знаков, пусто — нет", () => {
    expect(descriptionSnippet("Первая\n\n• вторая  строка")).toBe("Первая вторая строка");
    expect(descriptionSnippet("## Про **сиденье**\n> *цитата* и [сайт](https://a.ru)")).toBe(
      "Про сиденье цитата и сайт",
    );
    expect(descriptionSnippet("а".repeat(200))).toHaveLength(160);
    expect(descriptionSnippet(null)).toBeUndefined();
  });
});
