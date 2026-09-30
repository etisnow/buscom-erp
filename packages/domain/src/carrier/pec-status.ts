import { z } from "zod";
import type { CargoStatusResult } from "./cargo-status";

/**
 * Базовый статус груза ПЭК (`/cargos/basicstatus/`): по коду груза — статус текстом
 * и даты этапов. Груз забран получателем, когда статус «Выдан получателю» или
 * «Доставлен получателю»; выдача частями («Выдан (мест 1 из 2)») — ещё нет.
 */

const cargoSchema = z.object({
  info: z.object({
    cargoStatus: z.string().nullish(),
    giveOutDateTime: z.string().nullish(),
    receivedByClientDateTime: z.string().nullish(),
  }),
  cargo: z.object({ code: z.string().nullish() }).nullish(),
});

const responseSchema = z.object({ cargos: z.array(cargoSchema) });

/** «Выдан (мест 1 из 2)» — выдана только часть груза. */
const PARTIAL = /мест\s*(\d+)\s*из\s*(\d+)/i;

export function isPecPickedUp(cargoStatus: string): boolean {
  const status = cargoStatus.trim().toLowerCase();
  const partial = PARTIAL.exec(status);
  if (partial) return partial[1] === partial[2] && status.startsWith("выдан");
  return status.startsWith("выдан") || status.startsWith("доставлен получателю");
}

/** Время ПЭК — без пояса (по Москве); в примере документации в «T» попала кириллица. */
function toMoscowIso(value: string | null | undefined): string | null {
  const text = value?.trim().replace("Т", "T");
  if (!text) return null;
  const iso = `${text}+03:00`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

/** Ответ метода → статус груза `cargoCode`. */
export function parsePecCargoStatus(body: unknown, cargoCode: string): CargoStatusResult {
  const parsed = responseSchema.safeParse(body);
  if (!parsed.success) return { ok: false, error: "ПЭК ответили в неожиданном формате" };

  const cargo = parsed.data.cargos.find((item) => item.cargo?.code === cargoCode) ?? parsed.data.cargos[0];
  const status = cargo?.info.cargoStatus?.trim();
  if (!cargo || !status) return { ok: false, error: "ПЭК не нашли такой груз" };

  const pickedUp = isPecPickedUp(status);
  return {
    ok: true,
    status: {
      stateName: status.charAt(0).toUpperCase() + status.slice(1),
      // Дату показываем только у выданного груза — это время получения; у остальных этапов её нет
      stateDate: pickedUp
        ? (toMoscowIso(cargo.info.receivedByClientDateTime) ?? toMoscowIso(cargo.info.giveOutDateTime))
        : null,
      pickedUp,
    },
  };
}

/** Перевозчик из справочника — это «ПЭК» (регистр и знаки не важны). */
export function isPecCarrier(carrier: string | null | undefined): boolean {
  const squashed = (carrier ?? "").toLowerCase().replace(/[^a-zа-яё0-9]/g, "");
  return squashed === "пэк" || squashed === "pecom" || squashed === "pek";
}
