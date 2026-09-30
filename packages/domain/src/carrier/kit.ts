import { z } from "zod";
import type { CarrierTerminalRecord } from "./terminals";

/**
 * Пункты «КИТ» (capi.tk-kit.com). Справочник собирается из трёх методов:
 * - `/1.1/tdd/city/get-list` — города с названиями (по коду города КИТ);
 * - `/1.0/geography/city/get-list` — связка id города географии ↔ код города КИТ;
 * - `/1.1/geography/address/get-list` — адреса терминалов с кодом терминала и телефонами.
 * Графика работы в этих методах нет — в корзине он не показывается.
 */

const text = z.string().trim();
/** КИТ присылает числа то числом, то строкой */
const id = z.union([z.string(), z.number()]).transform((value) => String(value).trim());
const coordinate = z
  .union([z.string(), z.number()])
  .nullish()
  .transform((value) => {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  });
const flag = z
  .union([z.number(), z.string(), z.boolean()])
  .nullish()
  .transform((value) => value === true || value === 1 || value === "1");

const citySchema = z.object({
  code: id,
  name: text.min(1),
  type: text.nullish(),
  /** У города с обязательной доставкой терминала выдачи нет — груз везут до двери */
  required_pickup: flag,
  required_delivery: flag,
});

const geographyCitySchema = z.object({ id, tdd_city_code: id });

const addressSchema = z.object({
  id,
  geography_city_id: id,
  value: text.min(1),
  address_code: id.nullish(),
  lat: coordinate,
  lon: coordinate,
  phone: z.array(z.object({ value: text })).nullish(),
});

export type KitDirectory = {
  /** `/1.1/tdd/city/get-list` */
  cities: unknown[];
  /** `/1.0/geography/city/get-list` */
  geographyCities: unknown[];
  /** `/1.1/geography/address/get-list` с телефонами */
  addresses: unknown[];
};

/** Запись справочника: негодные записи пропускаются и считаются — одна битая не срывает обновление. */
function parseAll<T>(schema: z.ZodType<T>, items: unknown[]): { valid: T[]; skipped: number } {
  const valid: T[] = [];
  let skipped = 0;
  for (const item of items) {
    const parsed = schema.safeParse(item);
    if (parsed.success) valid.push(parsed.data);
    else skipped++;
  }
  return { valid, skipped };
}

export function parseKitTerminals(directory: KitDirectory): { terminals: CarrierTerminalRecord[]; skipped: number } {
  for (const [name, list] of Object.entries(directory)) {
    if (!Array.isArray(list)) throw new Error(`Справочник КИТ в неожиданном формате: «${name}» — не список`);
  }
  const cities = parseAll(citySchema, directory.cities);
  const geography = parseAll(geographyCitySchema, directory.geographyCities);
  const addresses = parseAll(addressSchema, directory.addresses);
  let skipped = cities.skipped + geography.skipped + addresses.skipped;

  const cityByCode = new Map(cities.valid.map((city) => [city.code, city]));
  const codeByGeographyId = new Map(geography.valid.map((city) => [city.id, city.tdd_city_code]));

  const terminals: CarrierTerminalRecord[] = [];
  const seen = new Set<string>();
  for (const address of addresses.valid) {
    // Без кода терминала это не пункт выдачи, а просто адрес (офис)
    const terminalCode = address.address_code;
    if (!terminalCode) continue;
    const city = cityByCode.get(codeByGeographyId.get(address.geography_city_id) ?? "");
    if (!city) {
      skipped++;
      continue;
    }
    if (seen.has(terminalCode)) continue;
    seen.add(terminalCode);

    const cityName = city.name;
    terminals.push({
      externalId: terminalCode,
      cityName,
      cityCode: city.code,
      name: `Терминал КИТ, ${cityName}`,
      address: address.value,
      fullAddress: `${cityName}, ${address.value}`,
      latitude: address.lat,
      longitude: address.lon,
      schedule: null,
      phone: address.phone?.map((phone) => phone.value).find(Boolean) ?? null,
      receivesCargo: !city.required_pickup,
      givesOutCargo: !city.required_delivery,
      isPickupPoint: false,
      maxWeightKg: null,
      maxLengthCm: null,
      maxWidthCm: null,
      maxHeightCm: null,
    });
  }
  return { terminals, skipped };
}
