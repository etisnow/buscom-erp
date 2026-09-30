import { z } from "zod";
import type { CargoStatusResult } from "./cargo-status";

/**
 * Статус груза «КИТ» (`/1.0/order/status/get`): список смен статуса с датой и
 * временем (по Москве, без пояса). Груз забран получателем, когда есть статус
 * «Выдан» (код `04`); «Отменен» (`ZZ`) показываем как есть. Коды `F1`–`F3` —
 * плановые сроки и «принят на доставку», в итоговый статус не идут, кроме того
 * что `F3` — этап перед выдачей.
 */

const statusSchema = z.object({
  code: z.string(),
  name: z.string().nullish(),
  date: z.string().nullish(),
  time: z.string().nullish(),
});

const responseSchema = z.object({ status: z.array(statusSchema) });

export const KIT_PICKED_UP_CODE = "04";
/** Коды плановых сроков — не события, последним статусом груза они быть не могут */
const PLANNED_CODES = new Set(["F1", "F2"]);

function toMoscowIso(date: string | null | undefined, time: string | null | undefined): string | null {
  const day = date?.trim();
  if (!day) return null;
  const iso = `${day}T${time?.trim() || "00:00:00"}+03:00`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

/** Ответ метода → последний статус груза. */
export function parseKitCargoStatus(body: unknown): CargoStatusResult {
  const parsed = responseSchema.safeParse(body);
  if (!parsed.success) return { ok: false, error: "КИТ ответили в неожиданном формате" };

  const events = parsed.data.status
    .filter((item) => !PLANNED_CODES.has(item.code.toUpperCase()))
    .map((item) => ({ item, at: toMoscowIso(item.date, item.time) }));
  if (events.length === 0) return { ok: false, error: "КИТ не нашли такой груз" };

  // Порядок в ответе не гарантирован — берём самый поздний; при равном времени — как в ответе
  const at = (value: (typeof events)[number]) => (value.at ? Date.parse(value.at) : 0);
  const last = events.reduce((latest, event) => (at(event) >= at(latest) ? event : latest));
  const pickup = events.find((event) => event.item.code === KIT_PICKED_UP_CODE);
  const shown = pickup ?? last;

  return {
    ok: true,
    status: {
      stateName: shown.item.name?.trim() || shown.item.code,
      stateDate: shown.at,
      pickedUp: pickup !== undefined,
    },
  };
}

/** Перевозчик из справочника — это «КИТ» (ГТД): регистр и знаки не важны. */
export function isKitCarrier(carrier: string | null | undefined): boolean {
  // Целым словом: «Китай» и подобное — не КИТ
  return /(^|[^а-яёa-z])(кит|kit|tk-kit)($|[^а-яёa-z])/i.test((carrier ?? "").replace(/ё/gi, "е"));
}
