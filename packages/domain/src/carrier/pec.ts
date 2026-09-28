import { z } from "zod";
import type { CarrierTerminalRecord } from "./terminals";

/**
 * Справочник отделений ПЭК (`/branches/all/`, kabinet.pecom.ru/api/v1/help/branches):
 * филиалы → отделения → склады, одно отделение — один склад. Пункт для нас — склад:
 * его `id` ПЭК принимает в расчёте стоимости и заявках. Город отделения — из списка
 * городов филиала (`cities[].divisions` ссылается на отделения).
 */

/** Автоперевозка в `kindsOfTransportation`: операции других тарифов (авиа) нам не нужны */
const AUTO_TRANSPORT = 3;
/** Тип отделения «ПВЗ» — мелкий пункт с лимитом в десятки килограммов */
const PICKUP_POINT_TYPE = 1;

const DAYS = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"] as const;

export type WorkDay = { day: number; from: string; to: string };

/**
 * График недели одной строкой: одинаковые дни подряд склеиваются,
 * день без записи — выходной. `day` — 1 (понедельник) … 7 (воскресенье).
 */
export function formatWeekSchedule(days: readonly WorkDay[]): string | null {
  if (days.length === 0) return null;
  const hours = DAYS.map((_, index) => {
    const day = days.find((item) => item.day === index + 1);
    return day ? `${day.from || "00:00"}-${day.to}` : "выходной";
  });
  const parts: string[] = [];
  let start = 0;
  for (let index = 1; index <= DAYS.length; index++) {
    if (index < DAYS.length && hours[index] === hours[start]) continue;
    const label = index - 1 === start ? DAYS[start] : `${DAYS[start]}-${DAYS[index - 1]}`;
    parts.push(`${label} ${hours[start]}`);
    start = index;
  }
  return parts.join("; ");
}

const text = z.string().trim();
const optionalText = text.nullish().transform((value) => value || null);
/** У ПЭК 0 в ограничении значит «общие ограничения тарифа» — для нас это «не задано» */
const limit = z
  .number()
  .nullish()
  .transform((value) => (value && value > 0 ? value : null));

const kindsSchema = z.array(z.object({ type: z.number(), operations: z.array(z.string()) })).nullish();

const warehouseSchema = z.object({
  id: text.min(1),
  address: text.min(1),
  addressDivision: optionalText,
  coordinatesobj: z.object({ latitude: z.number(), longitude: z.number() }).nullish(),
  telephone: optionalText,
  maxWeightPerPlace: limit,
  maxDimension: limit,
  departmentClosingDate: z.string().nullish(),
  divisionTimeOfWork: z
    .array(z.object({ workFrom: z.string().nullish(), workTo: z.string(), dayOfWeek: z.coerce.number() }))
    .nullish(),
  kindsOfTransportation: kindsSchema,
});

const divisionSchema = z.object({
  id: text.min(1),
  name: text.min(1),
  departmentTypeId: z.number().nullish(),
  warehouses: z.array(z.unknown()).nullish(),
  /** Операции — у отделения (так в живом ответе, 29.09.2026); пример в документации кладёт их в склад */
  kindsOfTransportation: kindsSchema,
});

/** Отделения разбираются поштучно: одно битое не должно сорвать обновление справочника */
const fileSchema = z.object({
  branches: z.array(
    z.object({
      title: text.min(1),
      cities: z.array(z.object({ title: text.min(1), divisions: z.array(z.string()).nullish() })).nullish(),
      divisions: z.array(z.unknown()).nullish(),
    }),
  ),
});

export function parsePecBranches(raw: unknown): { terminals: CarrierTerminalRecord[]; skipped: number } {
  const file = fileSchema.safeParse(raw);
  if (!file.success) throw new Error(`Справочник ПЭК в неожиданном формате: ${z.prettifyError(file.error)}`);

  const terminals: CarrierTerminalRecord[] = [];
  let skipped = 0;
  for (const branch of file.data.branches) {
    const cityOfDivision = new Map<string, string>();
    for (const city of branch.cities ?? []) {
      for (const id of city.divisions ?? []) if (!cityOfDivision.has(id)) cityOfDivision.set(id, city.title);
    }

    for (const item of branch.divisions ?? []) {
      const division = divisionSchema.safeParse(item);
      if (!division.success) {
        skipped++;
        continue;
      }
      // Пустой список складов — отделение скоро закроется (документация ПЭК)
      for (const raw of division.data.warehouses ?? []) {
        const warehouse = warehouseSchema.safeParse(raw);
        if (!warehouse.success) {
          skipped++;
          continue;
        }
        const data = warehouse.data;
        if (data.departmentClosingDate) continue;
        const operations = (division.data.kindsOfTransportation ?? data.kindsOfTransportation ?? [])
          .filter((kind) => kind.type === AUTO_TRANSPORT)
          .flatMap((kind) => kind.operations);
        terminals.push({
          externalId: data.id,
          cityName: cityOfDivision.get(division.data.id) ?? branch.title,
          cityCode: null,
          name: division.data.name,
          address: data.address,
          fullAddress: data.addressDivision,
          latitude: data.coordinatesobj?.latitude ?? null,
          longitude: data.coordinatesobj?.longitude ?? null,
          schedule: formatWeekSchedule(
            (data.divisionTimeOfWork ?? []).map((day) => ({
              day: day.dayOfWeek,
              from: day.workFrom ?? "",
              to: day.workTo,
            })),
          ),
          phone: data.telephone,
          receivesCargo: operations.includes("Прием грузов"),
          givesOutCargo: operations.includes("Выдача грузов"),
          isPickupPoint: division.data.departmentTypeId === PICKUP_POINT_TYPE,
          maxWeightKg: data.maxWeightPerPlace === null ? null : Math.round(data.maxWeightPerPlace),
          maxLengthCm: data.maxDimension === null ? null : Math.round(data.maxDimension * 100),
          maxWidthCm: null,
          maxHeightCm: null,
        });
      }
    }
  }
  return { terminals, skipped };
}
