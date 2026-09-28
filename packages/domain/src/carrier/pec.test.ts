import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formatWeekSchedule, parsePecBranches } from "./pec";

/**
 * Филиал по образцу ответа `/branches/all/` из документации ПЭК (kabinet.pecom.ru/api/v1/help/branches):
 * основное отделение, ПВЗ, закрывающееся отделение без склада, отделение только на приём
 */
const fixture = JSON.parse(readFileSync(join(__dirname, "fixtures", "pec-branches.json"), "utf8")) as unknown;

describe("parsePecBranches", () => {
  it("склад отделения — пункт; закрывающееся отделение без склада пропускается", () => {
    const { terminals, skipped } = parsePecBranches(fixture);
    expect(skipped).toBe(0);
    expect(terminals.map((terminal) => terminal.externalId)).toEqual([
      "c496b0c6-8e45-11df-bb3b-0019bbc941ce",
      "5c7775d4-0013-11ec-80cf-00155d4a0436",
      "8188a022-128d-11ea-80ce-00155d4a0436",
    ]);
  });

  it("основное отделение: город по ссылке из списка городов, график по дням, без ограничений — null", () => {
    expect(parsePecBranches(fixture).terminals[0]).toEqual({
      externalId: "c496b0c6-8e45-11df-bb3b-0019bbc941ce",
      cityName: "Армавир",
      cityCode: null,
      name: "Армавир",
      address: "г.Армавир, ул.Мичурина 7",
      fullAddress: "Россия, Краснодарский край, Армавир, улица Мичурина, 7",
      latitude: 44.98426,
      longitude: 41.100951,
      schedule: "пн-пт 09:00-18:00; сб 10:00-14:00; вс выходной",
      phone: "8(86137) 638-08",
      receivesCargo: true,
      givesOutCargo: true,
      isPickupPoint: false,
      maxWeightKg: null,
      maxLengthCm: null,
      maxWidthCm: null,
      maxHeightCm: null,
    });
  });

  it("ПВЗ помечен, ограничение места — в наших единицах", () => {
    expect(parsePecBranches(fixture).terminals[1]).toMatchObject({
      isPickupPoint: true,
      givesOutCargo: true,
      receivesCargo: false,
      maxWeightKg: 30,
      maxLengthCm: 80,
      phone: null,
    });
  });

  it("операции берутся только автоперевозки; отделение вне списка городов — город филиала", () => {
    expect(parsePecBranches(fixture).terminals[2]).toMatchObject({
      cityName: "Армавир",
      givesOutCargo: false,
      receivesCargo: true,
      schedule: null,
    });
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
