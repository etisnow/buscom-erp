import { z } from "zod";
import type { CarrierTerminalRecord } from "./terminals";

/**
 * Справочник терминалов «Деловых Линий» (`/v3/public/terminals.json` отдаёт ссылку
 * на файл `terminals_v3.json`): города, в каждом — пункты. Координаты приходят
 * строками, стороны — в метрах. Пустые строки у ДЛ означают «нет значения».
 */

const text = z.string().trim();
const optionalText = text.optional().transform((value) => value || null);
const coordinate = z
  .union([z.string(), z.number()])
  .optional()
  .transform((value) => {
    if (value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  });
const positive = z
  .number()
  .optional()
  .transform((value) => (value !== undefined && value > 0 ? value : null));

const terminalSchema = z.object({
  id: text.min(1),
  name: text.min(1),
  address: text.min(1),
  fullAddress: optionalText,
  latitude: coordinate,
  longitude: coordinate,
  mainPhone: optionalText,
  receiveCargo: z.boolean(),
  giveoutCargo: z.boolean(),
  /** График выдачи (`arrival`) и приёма (`derival`) — готовой строкой */
  calcSchedule: z.object({ arrival: optionalText }).optional(),
  maxWeight: positive,
  maxLength: positive,
  maxWidth: positive,
  maxHeight: positive,
});

/** Пункты разбираются поштучно: один битый не должен сорвать обновление всего справочника */
const fileSchema = z.object({
  city: z.array(
    z.object({
      name: text.min(1),
      code: optionalText,
      terminals: z.object({ terminal: z.array(z.unknown()) }),
    }),
  ),
});

const metersToCm = (meters: number | null) => (meters === null ? null : Math.round(meters * 100));

export function parseDellinTerminals(raw: unknown): { terminals: CarrierTerminalRecord[]; skipped: number } {
  const file = fileSchema.safeParse(raw);
  if (!file.success) throw new Error(`Справочник ДЛ в неожиданном формате: ${z.prettifyError(file.error)}`);

  const terminals: CarrierTerminalRecord[] = [];
  let skipped = 0;
  for (const city of file.data.city) {
    for (const item of city.terminals.terminal) {
      const parsed = terminalSchema.safeParse(item);
      if (!parsed.success) {
        skipped++;
        continue;
      }
      const terminal = parsed.data;
      terminals.push({
        externalId: terminal.id,
        cityName: city.name,
        cityCode: city.code,
        name: terminal.name,
        address: terminal.address,
        fullAddress: terminal.fullAddress,
        latitude: terminal.latitude,
        longitude: terminal.longitude,
        schedule: terminal.calcSchedule?.arrival ?? null,
        phone: terminal.mainPhone,
        receivesCargo: terminal.receiveCargo,
        givesOutCargo: terminal.giveoutCargo,
        maxWeightKg: terminal.maxWeight === null ? null : Math.round(terminal.maxWeight),
        maxLengthCm: metersToCm(terminal.maxLength),
        maxWidthCm: metersToCm(terminal.maxWidth),
        maxHeightCm: metersToCm(terminal.maxHeight),
      });
    }
  }
  return { terminals, skipped };
}
