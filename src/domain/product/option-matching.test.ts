import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  comboLabel,
  enumerateCombos,
  matchOptionValue,
  purchaseWithOptions,
  sizeOf,
  type SupplierCombo,
} from "@/domain/product/option-matching";
import { parseVanprojectForm } from "@/domain/product/vanproject";

// Форма «Стекло PSA/Fiat Ducato x250/290 база средняя L2» с vanproject.ru
const form = parseVanprojectForm(readFileSync(join(__dirname, "fixtures", "vanproject-ducato-l2-form.html"), "utf8"))!;
const combos: SupplierCombo[] = enumerateCombos(form.options).map((selection) => ({
  selection,
  label: comboLabel(form.options, selection),
  priceKopecks: 100_000,
}));

const matched = (name: string) => {
  const match = matchOptionValue(name, combos);
  if (match.kind === "unique") return match.combo.label;
  if (match.kind === "ambiguous") return match.candidates.map((combo) => combo.label);
  return null;
};

describe("сочетания вариантов у поставщика", () => {
  it("перебирает только допустимые сочетания, повторы схлопывает", () => {
    // 3 у сдвижной, 2 у переднего левого, по 2 у задних боковых, по 2 у каждой двери задка
    expect(combos).toHaveLength(13);
    expect(combos[0]?.label).toBe("сдвижной двери · 1401х667мм глухое темное");
  });
});

describe("сопоставление наших опций с вариантами поставщика", () => {
  // Названия — из карточки товара «Стекла на Citroen Jumper L2»
  it("однозначные совпадения: размер + сторона + форточка", () => {
    expect(matched("1) Боковое переднее левое (с форточкой) 1406x667")).toBe(
      "переднее левое · 1406х667мм с форточкой темное",
    );
    expect(matched("2) Боковое переднее левое 1406x667")).toBe("переднее левое · 1406х667мм глухое темное");
    // У сдвижной двери стороны нет — «правое» у нас не мешает
    expect(matched("3) Боковое переднее правое 1401x667")).toBe("сдвижной двери · 1401х667мм глухое темное");
  });

  it("несколько подходящих — кандидаты на выбор человеку", () => {
    expect(matched("4) Боковое переднее правое (с форточкой) 1401x667")).toEqual([
      "сдвижной двери · 1401х667мм с форточкой зеленое",
      "сдвижной двери · 1401х667мм с форточкой темное",
    ]);
    expect(matched("5) Боковое заднее левое 1545x667")).toEqual([
      "заднее левое · 1545х667мм зеленое",
      "заднее левое · 1545х667мм темное",
    ]);
    expect(matched("9) Заднее левое 825x665 (вырез под петли)")).toEqual([
      "двери задка левое · 825х665мм (петли 180˚) темное",
      "двери задка левое · 825х665мм (петли 270˚) темное",
    ]);
  });

  it("сторона отсекает чужие двери задка", () => {
    expect(matched("10) Заднее правое 825x665")).toEqual([
      "двери задка правое · 825х665мм (петли 180˚) темное",
      "двери задка правое · 825х665мм (петли 270˚) темное",
    ]);
  });

  it("размера у поставщика нет — не найдено", () => {
    expect(matched("Лобовое 1700x900")).toBeNull();
  });

  it("без размера в названии не угадываем — выбор из всех", () => {
    const match = matchOptionValue("Заднее левое", combos);
    expect(match.kind).toBe("ambiguous");
    expect(match.kind === "ambiguous" && match.candidates).toHaveLength(13);
  });

  it("размер пишут по-разному, смысл один", () => {
    expect(sizeOf("1406x667")).toBe("1406х667");
    expect(sizeOf("1406 × 667 мм")).toBe("1406х667");
    expect(sizeOf("1406Х667мм")).toBe("1406х667");
    expect(sizeOf("Стекло")).toBeNull();
  });
});

describe("закупка позиции с опциями", () => {
  const prices = [
    { optionValueId: "v1", purchasePriceKopecks: 1_455_000 },
    { optionValueId: "v2", purchasePriceKopecks: 50_000 },
  ];

  it("база плюс закупки выбранных вариантов — как цена продажи с надбавками", () => {
    expect(purchaseWithOptions(0, prices, ["v1"])).toBe(1_455_000);
    expect(purchaseWithOptions(10_000, prices, ["v1", "v2"])).toBe(1_515_000);
  });

  it("вариант без своей закупки ничего не добавляет", () => {
    expect(purchaseWithOptions(10_000, prices, ["v3"])).toBe(10_000);
    expect(purchaseWithOptions(10_000, prices, [])).toBe(10_000);
  });
});
