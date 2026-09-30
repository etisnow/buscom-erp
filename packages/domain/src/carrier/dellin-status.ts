import { z } from "zod";
import type { CargoStatusResult } from "./cargo-status";

/**
 * История статусов заказа «Деловых Линий» (`/v3/orders/statuses_history.json`):
 * по номеру накладной приходит список смен статуса. Груз забран получателем,
 * когда заказ дошёл до «Заказ завершен» (`finished`), — решение владельца.
 */

const historyItemSchema = z.object({
  state: z.string(),
  stateName: z.string().nullish(),
  stateDate: z.string().nullish(),
});

const responseSchema = z.object({
  data: z.object({
    statusHistory: z.record(z.string(), z.array(historyItemSchema)).optional(),
    info: z.array(z.object({ number: z.string(), message: z.string() })).optional(),
  }),
});

export const DELLIN_FINISHED_STATE = "finished";

/** Ответ метода → последний статус накладной `docId`. */
export function parseDellinStatusHistory(body: unknown, docId: string): CargoStatusResult {
  const parsed = responseSchema.safeParse(body);
  if (!parsed.success) return { ok: false, error: "ДЛ ответили в неожиданном формате" };

  const { statusHistory, info } = parsed.data.data;
  const history = statusHistory?.[docId] ?? Object.values(statusHistory ?? {})[0];
  if (!history || history.length === 0) {
    return { ok: false, error: info?.find((item) => item.number === docId)?.message ?? "ДЛ не нашли такую накладную" };
  }

  // Порядок в ответе не гарантирован — берём самый поздний статус по дате
  const byDate = (item: (typeof history)[number]) => (item.stateDate ? Date.parse(item.stateDate) : 0);
  const last = history.reduce((latest, item) => (byDate(item) >= byDate(latest) ? item : latest));

  return {
    ok: true,
    status: {
      stateName: last.stateName?.trim() || last.state,
      stateDate: last.stateDate ?? null,
      pickedUp: history.some((item) => item.state === DELLIN_FINISHED_STATE),
    },
  };
}

/** Перевозчик из справочника — это «Деловые линии» (как ТК подписана в заказе, регистр и знаки не важны). */
export function isDellinCarrier(carrier: string | null | undefined): boolean {
  const squashed = (carrier ?? "").toLowerCase().replace(/[^a-zа-яё0-9]/g, "");
  return squashed.includes("деловыелинии") || squashed.includes("dellin") || squashed === "дл";
}
