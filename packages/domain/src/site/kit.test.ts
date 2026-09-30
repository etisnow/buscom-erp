import { describe, expect, it } from "vitest";
import { kitCount, kitFeatureOf, kitLines, kitTotal, type KitGroup, type KitLayout } from "./kit";

const layout: KitLayout = { id: "l", name: "15 мест", seats: 15, armrests: 4, reclinerBacks: 6 };

const groups: KitGroup[] = [
  {
    id: "material",
    name: "Материал",
    required: true,
    values: [
      { id: "jacquard", priceDeltaKopecks: 0 },
      { id: "eco", priceDeltaKopecks: 60_000 },
    ],
  },
  { id: "belt", name: "Ремень", required: false, values: [{ id: "belt3", priceDeltaKopecks: 175_000 }] },
  { id: "armrest", name: "Подлокотник", required: false, values: [{ id: "armrest-yes", priceDeltaKopecks: 265_000 }] },
  {
    id: "recliner",
    name: "Откидная спинка",
    required: false,
    values: [{ id: "recliner-yes", priceDeltaKopecks: 210_000 }],
  },
];

const BASE = 995_000;

describe("kitFeatureOf", () => {
  it("подлокотник и откидная спинка узнаются по названию группы", () => {
    expect(kitFeatureOf({ name: "Подлокотник", required: false })).toBe("armrest");
    expect(kitFeatureOf({ name: "Подлокотники складные", required: false })).toBe("armrest");
    expect(kitFeatureOf({ name: "Откидная спинка", required: false })).toBe("recliner");
    expect(kitFeatureOf({ name: "Откидные спинки", required: false })).toBe("recliner");
    expect(kitFeatureOf({ name: "Спинка", required: false })).toBe("seat");
    // всё, что «на спинку», считается по откидным сиденьям схемы
    expect(kitFeatureOf({ name: "Сетка на спинку", required: false })).toBe("recliner");
    expect(kitFeatureOf({ name: "Столик на спинку", required: false })).toBe("recliner");
    expect(kitFeatureOf({ name: "Столик на спинку", required: true })).toBe("seat");
    expect(kitFeatureOf({ name: "Ремень", required: false })).toBe("seat");
  });

  it("обязательная группа всегда на всех сиденьях, даже если названа «Подлокотник»", () => {
    expect(kitFeatureOf({ name: "Подлокотник", required: true })).toBe("seat");
  });
});

describe("kitTotal: опции «на спинку»", () => {
  const withTable: KitGroup[] = [
    ...groups,
    {
      id: "table",
      name: "Столик на спинку",
      required: false,
      values: [{ id: "table-grey", priceDeltaKopecks: 90_000 }],
    },
  ];

  it("столик на спинку — на число откидных сидений схемы, а не на все места", () => {
    const selection = { material: "jacquard", table: "table-grey" };
    expect(kitTotal(BASE, withTable, selection, layout)).toBe(BASE * 15 + 90_000 * 6);
  });

  it("в корзине столик стоит на тех же сиденьях, что и откидная спинка", () => {
    const selection = { material: "jacquard", recliner: "recliner-yes", table: "table-grey" };
    expect(kitLines(withTable, selection, layout)).toEqual([
      { valueIds: ["jacquard", "recliner-yes", "table-grey"], quantity: 6 },
      { valueIds: ["jacquard"], quantity: 9 },
    ]);
  });
});

describe("kitCount", () => {
  it("берёт число из схемы и не выходит за число мест", () => {
    expect(kitCount("seat", layout)).toBe(15);
    expect(kitCount("armrest", layout)).toBe(4);
    expect(kitCount("recliner", layout)).toBe(6);
    expect(kitCount("armrest", { ...layout, armrests: 99 })).toBe(15);
    expect(kitCount("armrest", { ...layout, armrests: -1 })).toBe(0);
  });
});

describe("kitTotal", () => {
  it("без опций — цена сиденья на число мест", () => {
    expect(kitTotal(BASE, groups, { material: "jacquard" }, layout)).toBe(BASE * 15);
  });

  it("обычные опции — на все места, подлокотники и спинки — на их число в схеме", () => {
    const selection = { material: "eco", belt: "belt3", armrest: "armrest-yes", recliner: "recliner-yes" };
    expect(kitTotal(BASE, groups, selection, layout)).toBe(
      BASE * 15 + 60_000 * 15 + 175_000 * 15 + 265_000 * 4 + 210_000 * 6,
    );
  });

  it("в схеме без подлокотников опция подлокотника ничего не стоит", () => {
    const selection = { material: "jacquard", armrest: "armrest-yes" };
    expect(kitTotal(BASE, groups, selection, { ...layout, armrests: 0 })).toBe(BASE * 15);
  });
});

describe("kitLines", () => {
  const selection = { material: "eco", belt: "belt3", armrest: "armrest-yes", recliner: "recliner-yes" };

  it("без частичных опций — одна позиция на все сиденья", () => {
    expect(kitLines(groups, { material: "eco", belt: "belt3" }, layout)).toEqual([
      { valueIds: ["eco", "belt3"], quantity: 15 },
    ]);
  });

  it("сиденья с обеими опциями, с одной и без — вложенными участками", () => {
    expect(kitLines(groups, selection, layout)).toEqual([
      { valueIds: ["eco", "belt3", "armrest-yes", "recliner-yes"], quantity: 4 },
      { valueIds: ["eco", "belt3", "recliner-yes"], quantity: 2 },
      { valueIds: ["eco", "belt3"], quantity: 9 },
    ]);
  });

  it("одна частичная опция — две позиции; ноль сидений — позиции нет", () => {
    expect(kitLines(groups, { material: "jacquard", armrest: "armrest-yes" }, layout)).toEqual([
      { valueIds: ["jacquard", "armrest-yes"], quantity: 4 },
      { valueIds: ["jacquard"], quantity: 11 },
    ]);
    expect(kitLines(groups, { material: "jacquard", armrest: "armrest-yes" }, { ...layout, armrests: 0 })).toEqual([
      { valueIds: ["jacquard"], quantity: 15 },
    ]);
  });

  it("опция на всех сиденьях (подлокотников столько же, сколько мест) уходит в общий набор", () => {
    expect(kitLines(groups, { material: "jacquard", armrest: "armrest-yes" }, { ...layout, armrests: 15 })).toEqual([
      { valueIds: ["jacquard", "armrest-yes"], quantity: 15 },
    ]);
  });

  it("сумма позиций равна цене комплекта — для любых схем и наборов опций", () => {
    const price = (line: { valueIds: string[] }) =>
      BASE +
      groups.reduce(
        (sum, group) => sum + (group.values.find((value) => line.valueIds.includes(value.id))?.priceDeltaKopecks ?? 0),
        0,
      );
    const selections: Record<string, string>[] = [
      { material: "jacquard" },
      { material: "eco", belt: "belt3" },
      selection,
      { material: "eco", recliner: "recliner-yes" },
    ];
    for (const seats of [14, 15, 16, 18]) {
      for (const armrests of [0, 2, 7, seats]) {
        for (const reclinerBacks of [0, 3, 6, seats]) {
          const scheme = { id: "x", name: "x", seats, armrests, reclinerBacks };
          for (const chosen of selections) {
            const lines = kitLines(groups, chosen, scheme);
            const total = lines.reduce((sum, line) => sum + price(line) * line.quantity, 0);
            expect(total).toBe(kitTotal(BASE, groups, chosen, scheme));
            expect(lines.reduce((sum, line) => sum + line.quantity, 0)).toBe(seats);
          }
        }
      }
    }
  });
});
