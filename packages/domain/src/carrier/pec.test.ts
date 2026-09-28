import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formatWeekSchedule, parsePecBranches } from "./pec";

/**
 * Выдержка из настоящего ответа `/branches/all/` (29.09.2026): филиал Нижний Новгород —
 * основное отделение, обычное отделение и ПВЗ; из Иванова — отделение только на приём.
 * Без описаний проезда и календарей праздников
 */
const fixture = JSON.parse(readFileSync(join(__dirname, "fixtures", "pec-branches.json"), "utf8")) as unknown;

describe("parsePecBranches", () => {
  it("пункт — склад отделения, код — id склада", () => {
    const { terminals, skipped } = parsePecBranches(fixture);
    expect(skipped).toBe(0);
    expect(terminals.map((terminal) => terminal.externalId)).toEqual([
      "dda1b157-7e66-11e7-80c8-00155d668927",
      "36cf9b40-a415-11dc-a911-000a5e19ccb4",
      "1e4e60db-6513-11e9-80cd-00155d4a0436",
      "b4e07661-7058-11e2-86bb-80c16e64f59a",
    ]);
  });

  it("основное отделение: город, график по дням, операции отделения, без ограничений — null", () => {
    expect(parsePecBranches(fixture).terminals[0]).toMatchObject({
      cityName: "Нижний Новгород",
      name: "Нижний Новгород",
      address: "Нижний Новгород,ул.Вторчермета,1,к2",
      schedule: "пн-пт 08:00-19:00; сб 10:00-16:00; вс выходной",
      receivesCargo: true,
      givesOutCargo: true,
      isPickupPoint: false,
      maxWeightKg: null,
      maxLengthCm: null,
    });
  });

  it("ПВЗ помечен, ограничение места — в наших единицах", () => {
    expect(parsePecBranches(fixture).terminals[2]).toMatchObject({
      isPickupPoint: true,
      givesOutCargo: true,
      maxWeightKg: 25,
      maxLengthCm: 120,
    });
  });

  it("отделение только на приём груз не выдаёт", () => {
    expect(parsePecBranches(fixture).terminals[3]).toMatchObject({
      cityName: "Иваново",
      receivesCargo: true,
      givesOutCargo: false,
    });
  });

  it("отделение без склада (скоро закроется) пропускается, вне списка городов — город филиала", () => {
    const division = (id: string, warehouses: unknown[]) => ({
      id,
      name: `Отделение ${id}`,
      departmentTypeId: 0,
      warehouses,
      kindsOfTransportation: [{ type: 3, operations: ["Выдача грузов"] }],
    });
    const { terminals } = parsePecBranches({
      branches: [
        {
          title: "Армавир",
          cities: [],
          divisions: [division("1", []), division("2", [{ id: "w2", address: "ул. Мичурина, 7" }])],
        },
      ],
    });
    expect(terminals.map((terminal) => [terminal.externalId, terminal.cityName])).toEqual([["w2", "Армавир"]]);
  });

  it("чужой формат ответа — ошибка", () => {
    expect(() => parsePecBranches({ error: { title: "Неверный логин или ключ API" } })).toThrow("Справочник ПЭК");
  });
});

describe("formatWeekSchedule", () => {
  it("одинаковые дни подряд склеиваются, пропущенный день — выходной", () => {
    expect(
      formatWeekSchedule([
        { day: 1, from: "08:00", to: "20:00" },
        { day: 2, from: "08:00", to: "20:00" },
        { day: 4, from: "08:00", to: "20:00" },
        { day: 6, from: "10:00", to: "16:00" },
        { day: 7, from: "10:00", to: "16:00" },
      ]),
    ).toBe("пн-вт 08:00-20:00; ср выходной; чт 08:00-20:00; пт выходной; сб-вс 10:00-16:00");
  });

  it("без рабочих дней — null", () => {
    expect(formatWeekSchedule([])).toBeNull();
  });
});
