import { describe, expect, it } from "vitest";
import { describeNewProduct, diffProductSnapshots } from "./log";

const base = { sku: "A-1", name: "Люк", price: "1 000 ₽", category: null, isActive: true, description: "" };

describe("diffProductSnapshots", () => {
  it("без отличий — пусто", () => {
    expect(diffProductSnapshots(base, { ...base })).toEqual([]);
  });

  it("показывает изменённые поля с подписями", () => {
    const changes = diffProductSnapshots(base, { ...base, price: "1 200 ₽", category: "Люки" });
    expect(changes).toEqual([
      { label: "Категория", from: null, to: "Люки" },
      { label: "Цена", from: "1 000 ₽", to: "1 200 ₽" },
    ]);
  });

  it("пустая строка и null — не изменение", () => {
    expect(diffProductSnapshots(base, { ...base, description: null })).toEqual([]);
  });

  it("«В каталоге» отдельной строкой не идёт", () => {
    expect(diffProductSnapshots(base, { ...base, isActive: false })).toEqual([]);
  });

  it("булевы значения читаются как «да/нет»", () => {
    expect(diffProductSnapshots({ isHit: false }, { isHit: true })).toEqual([{ label: "Хит", from: "нет", to: "да" }]);
  });

  it("длинный текст обрезается", () => {
    const [change] = diffProductSnapshots({ description: "" }, { description: "я".repeat(5000) });
    expect(change?.to?.length).toBe(2001);
  });
});

describe("describeNewProduct", () => {
  it("оставляет только основные поля", () => {
    const changes = describeNewProduct({ ...base, isHit: true, slug: "lyuk" });
    expect(changes.map((change) => change.label)).toEqual(["Артикул", "Название", "Цена"]);
  });
});
