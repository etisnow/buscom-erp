import { describe, expect, it } from "vitest";
import {
  buildOptionSnapshot,
  describeOptions,
  normalizeOptionGroups,
  parseOrderItemOptions,
  priceWithOptions,
  ProductOptionError,
  type OptionGroup,
} from "./options";

const seat: OptionGroup[] = [
  {
    id: "g1",
    name: "Опора",
    required: false,
    values: [
      { id: "v1", name: "Нет", priceDeltaKopecks: 0 },
      { id: "v2", name: "Есть", priceDeltaKopecks: 175_000 },
    ],
  },
  {
    id: "g2",
    name: "Ремень",
    required: true,
    values: [
      { id: "v3", name: "Двухточечный", priceDeltaKopecks: 145_000 },
      { id: "v4", name: "Трехточечный", priceDeltaKopecks: 175_000 },
    ],
  },
];

describe("выбор опций в позиции", () => {
  it("собирает снимок в порядке групп и считает цену с надбавками", () => {
    const snapshot = buildOptionSnapshot(seat, ["v4", "v2"]);
    expect(snapshot).toEqual([
      { valueId: "v2", optionName: "Опора", valueName: "Есть", priceDeltaKopecks: 175_000 },
      { valueId: "v4", optionName: "Ремень", valueName: "Трехточечный", priceDeltaKopecks: 175_000 },
    ]);
    expect(priceWithOptions(1_000_000, snapshot)).toBe(1_350_000);
    expect(describeOptions(snapshot)).toBe("Опора: Есть; Ремень: Трехточечный");
  });

  it("необязательную группу можно пропустить, обязательную — нет", () => {
    expect(buildOptionSnapshot(seat, ["v3"])).toHaveLength(1);
    expect(() => buildOptionSnapshot(seat, ["v2"], "Сиденье")).toThrow("не выбрана обязательная опция «Ремень»");
  });

  it("два варианта в одной группе и чужой вариант отклоняются", () => {
    expect(() => buildOptionSnapshot(seat, ["v3", "v4"])).toThrow(/больше одного/);
    expect(() => buildOptionSnapshot(seat, ["v3", "чужой"])).toThrow(ProductOptionError);
  });

  it("товар без опций — пустой снимок, цена как у товара", () => {
    expect(buildOptionSnapshot([], [])).toEqual([]);
    expect(priceWithOptions(50_000, [])).toBe(50_000);
  });

  it("битый снимок из базы читается как пустой", () => {
    expect(parseOrderItemOptions(null)).toEqual([]);
    expect(parseOrderItemOptions([{ foo: 1 }])).toEqual([]);
  });
});

describe("опции в карточке товара", () => {
  it("обрезает пробелы в названиях", () => {
    const [group] = normalizeOptionGroups([
      { name: " Цвет ", required: false, values: [{ name: " Серый ", priceDeltaKopecks: 0 }] },
    ]);
    expect(group.name).toBe("Цвет");
    expect(group.values[0].name).toBe("Серый");
  });

  it("отклоняет пустое название, повтор группы и варианта, группу без вариантов", () => {
    const value = { name: "Да", priceDeltaKopecks: 0 };
    expect(() => normalizeOptionGroups([{ name: "", required: false, values: [value] }])).toThrow(ProductOptionError);
    expect(() =>
      normalizeOptionGroups([
        { name: "Цвет", required: false, values: [value] },
        { name: "цвет", required: false, values: [value] },
      ]),
    ).toThrow(/повторяется/);
    expect(() => normalizeOptionGroups([{ name: "Цвет", required: false, values: [value, value] }])).toThrow(
      /вариант «Да» повторяется/,
    );
    expect(() => normalizeOptionGroups([{ name: "Цвет", required: false, values: [] }])).toThrow(/нет ни одного/);
  });
});
