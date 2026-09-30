import { describe, expect, it } from "vitest";
import { parseKitTerminals, type KitDirectory } from "./kit";

const directory = (overrides: Partial<KitDirectory> = {}): KitDirectory => ({
  cities: [
    { code: "660002900000", name: "Ирбит", type: "гор.", region_code: "66", required_pickup: 0, required_delivery: 0 },
    { code: "910000900000", name: "Алушта", type: "гор.", required_pickup: 1, required_delivery: 1 },
  ],
  geographyCities: [
    { id: "699", tdd_city_code: "660002900000", sxgeo_city_id: "713513" },
    { id: "695", tdd_city_code: "910000900000" },
  ],
  addresses: [
    {
      id: "522",
      geography_city_id: "699",
      value: "ул. Михайловское шоссе. д.23",
      address_code: "3101",
      lat: "50.579762",
      lon: "36.633863",
      phone: [{ value: "+7 (4722) 400-676", comment: "" }, { value: "+7 (800) 234-56-50" }],
    },
    { id: "523", geography_city_id: "695", value: "ул. Ленина, 1", address_code: 3102, lat: 44.6, lon: 34.4 },
  ],
  ...overrides,
});

describe("parseKitTerminals", () => {
  it("собирает пункт из адреса, города и названия города", () => {
    const { terminals, skipped } = parseKitTerminals(directory());
    expect(skipped).toBe(0);
    expect(terminals[0]).toEqual({
      externalId: "3101",
      cityName: "Ирбит",
      cityCode: "660002900000",
      name: "Терминал КИТ, Ирбит",
      address: "ул. Михайловское шоссе. д.23",
      fullAddress: "Ирбит, ул. Михайловское шоссе. д.23",
      latitude: 50.579762,
      longitude: 36.633863,
      schedule: null,
      phone: "+7 (4722) 400-676",
      receivesCargo: true,
      givesOutCargo: true,
      isPickupPoint: false,
      maxWeightKg: null,
      maxLengthCm: null,
      maxWidthCm: null,
      maxHeightCm: null,
    });
  });

  it("город с обязательной доставкой — терминал груз не выдаёт, код терминала числом читается", () => {
    const { terminals } = parseKitTerminals(directory());
    expect(terminals[1]).toMatchObject({ externalId: "3102", givesOutCargo: false, receivesCargo: false });
  });

  it("адрес без кода терминала — не пункт, а офис; повтор кода не плодит пунктов", () => {
    const base = directory();
    const { terminals, skipped } = parseKitTerminals(
      directory({
        addresses: [
          ...base.addresses,
          { id: "600", geography_city_id: "699", value: "офис" },
          { id: "601", geography_city_id: "699", value: "дубль", address_code: "3101" },
        ],
      }),
    );
    expect(terminals.map((terminal) => terminal.externalId)).toEqual(["3101", "3102"]);
    expect(skipped).toBe(0);
  });

  it("неизвестный город и битые записи пропускаются и считаются", () => {
    const { terminals, skipped } = parseKitTerminals(
      directory({
        addresses: [
          { id: "1", geography_city_id: "999", value: "нет города", address_code: "1" },
          { id: "2", value: "битая запись" },
        ],
      }),
    );
    expect(terminals).toEqual([]);
    expect(skipped).toBe(2);
  });

  it("ответ не списком — понятная ошибка", () => {
    expect(() => parseKitTerminals({ ...directory(), cities: {} as unknown as unknown[] })).toThrow(
      "Справочник КИТ в неожиданном формате",
    );
  });
});
