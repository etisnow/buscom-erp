import { describe, expect, it } from "vitest";
import { parseSavedFilters } from "@/app/(app)/orders/saved-filters";

describe("parseSavedFilters", () => {
  it("возвращает набор известных фильтров", () => {
    expect(parseSavedFilters("status=NEW&manager=abc")).toBe("status=NEW&manager=abc");
  });

  it("читает значение в том виде, в каком его кладёт браузер", () => {
    // document.cookie хранит значение закодированным
    expect(parseSavedFilters(encodeURIComponent("q=люк&status=NEW"))).toBe("q=%D0%BB%D1%8E%D0%BA&status=NEW");
  });

  it("сохраняет несколько значений одного ключа — статусы выбираются пачкой", () => {
    expect(parseSavedFilters("status=NEW&status=IN_PROGRESS")).toBe("status=NEW&status=IN_PROGRESS");
  });

  it("выбрасывает неизвестные ключи: cookie приходит снаружи и идёт в редирект", () => {
    expect(parseSavedFilters("status=NEW&evil=1&redirect=http://zloy.ru")).toBe("status=NEW");
  });

  it("не восстанавливает номер страницы", () => {
    expect(parseSavedFilters("status=NEW&page=7")).toBe("status=NEW");
  });

  it("пустые значения отбрасывает", () => {
    expect(parseSavedFilters("status=&manager=abc")).toBe("manager=abc");
  });

  it("пустая, отсутствующая и бессмысленная cookie дают null", () => {
    expect(parseSavedFilters(undefined)).toBeNull();
    expect(parseSavedFilters("")).toBeNull();
    expect(parseSavedFilters("page=3")).toBeNull();
    expect(parseSavedFilters("мусор")).toBeNull();
  });

  it("слишком длинную cookie не берёт", () => {
    expect(parseSavedFilters(`q=${"a".repeat(2000)}`)).toBeNull();
  });
});
