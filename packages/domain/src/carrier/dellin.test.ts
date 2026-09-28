import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseDellinTerminals } from "./dellin";

/** Выдержка из настоящего справочника ДЛ (terminals_v3.json, 28.09.2026): без картинок карт и подробных графиков */
const fixture = JSON.parse(readFileSync(join(__dirname, "fixtures", "dellin-terminals.json"), "utf8")) as unknown;

describe("parseDellinTerminals", () => {
  it("разбирает все пункты всех городов", () => {
    const { terminals, skipped } = parseDellinTerminals(fixture);
    expect(skipped).toBe(0);
    expect(terminals.map((terminal) => terminal.externalId)).toEqual(["296", "667", "764", "125", "762", "18"]);
  });

  it("город, адрес, координаты, график выдачи и ограничения — в наших единицах", () => {
    const { terminals } = parseDellinTerminals(fixture);
    expect(terminals[0]).toEqual({
      externalId: "296",
      cityName: "Нижний Новгород",
      cityCode: "5200100000000000000000000",
      name: "Нижний Новгород Московское (основной)",
      address: "Московское ш., 52",
      fullAddress: "603028, Нижегородская обл, Нижний Новгород г, Московское ш, дом № 52",
      latitude: 56.312901,
      longitude: 43.904121,
      schedule: "пн-пт: 08:00-20:00; сб: 09:00-17:00; вс: 11:00-16:00",
      phone: "7 (831) 200-00-03",
      receivesCargo: true,
      givesOutCargo: true,
      isPickupPoint: false,
      maxWeightKg: 3000,
      maxLengthCm: 1200,
      maxWidthCm: 242,
      maxHeightCm: 245,
    });
  });

  it("склад без выдачи груза помечен, пустой график — null", () => {
    const warehouse = parseDellinTerminals(fixture).terminals.find((terminal) => terminal.externalId === "764");
    expect(warehouse).toMatchObject({ givesOutCargo: false, receivesCargo: false, schedule: null });
  });

  it("битый пункт пропускается и считается, остальные разбираются", () => {
    const raw = {
      city: [
        {
          name: "Город",
          code: "1",
          terminals: {
            terminal: [
              { id: "1", name: "Без адреса" },
              { ...goodTerminal, id: "2" },
            ],
          },
        },
      ],
    };
    const { terminals, skipped } = parseDellinTerminals(raw);
    expect(skipped).toBe(1);
    expect(terminals.map((terminal) => terminal.externalId)).toEqual(["2"]);
  });

  it("город без пунктов не мешает, чужой формат файла — ошибка", () => {
    expect(
      parseDellinTerminals({ city: [{ name: "Пусто", code: "1", terminals: { terminal: [] } }] }).terminals,
    ).toEqual([]);
    expect(() => parseDellinTerminals({ cities: [] })).toThrow("Справочник ДЛ");
  });
});

const goodTerminal = {
  name: "Пункт",
  address: "ул. Ленина, 1",
  fullAddress: "",
  latitude: "",
  longitude: "abc",
  receiveCargo: true,
  giveoutCargo: true,
};

describe("parseDellinTerminals: необязательные поля", () => {
  it("пустые и негодные координаты, адрес и ограничения — null", () => {
    const { terminals } = parseDellinTerminals({
      city: [{ name: "Город", code: "", terminals: { terminal: [{ ...goodTerminal, id: "7" }] } }],
    });
    expect(terminals[0]).toMatchObject({
      cityCode: null,
      fullAddress: null,
      latitude: null,
      longitude: null,
      phone: null,
      maxWeightKg: null,
      maxLengthCm: null,
    });
  });
});
