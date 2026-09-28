/**
 * Пункты транспортных компаний — общий вид для всех перевозчиков (docs/SITE-PLAN.md,
 * этап 5а). Разбор ответа конкретной ТК приводит к нему, дальше код одинаков.
 */
import { z } from "zod";
import type { TerminalCarrier } from "@buscom/db/enums";

/**
 * Перевозчики, у которых есть справочник пунктов: название в справочнике ТК
 * (как в `CARRIERS` сайта и в ERP) → код. У остальных ТК адрес вписывается руками.
 */
const TERMINAL_CARRIERS: Record<string, TerminalCarrier> = { "Деловые линии": "DELLIN", ПЭК: "PEC" };

export function terminalCarrierOf(carrierName: string | null | undefined): TerminalCarrier | null {
  return (carrierName && TERMINAL_CARRIERS[carrierName]) || null;
}

/**
 * Снимок выбранного терминала в заказе — на момент оформления, как снимок позиции:
 * пункт могут переименовать или закрыть, а в заказе должно остаться, куда ехать.
 */
export const terminalSnapshotSchema = z.object({
  carrier: z.enum(["DELLIN", "PEC"] satisfies TerminalCarrier[]),
  /** Код пункта у перевозчика */
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(300),
  city: z.string().min(1).max(200),
  address: z.string().min(1).max(500),
  /** График выдачи груза */
  schedule: z.string().max(500).nullable(),
});

export type TerminalSnapshot = z.infer<typeof terminalSnapshotSchema>;

/** Город для сравнения: регистр, пробелы по краям и «ё» не важны */
export function cityKey(city: string): string {
  return city.trim().toLowerCase().replaceAll("ё", "е");
}

/**
 * Подсказки городов при вводе: сначала те, что начинаются с набранного, затем —
 * где с него начинается слово («новг» → «Нижний Новгород»), затем — с середины.
 * Город уже набран целиком — подсказывать нечего.
 */
export function suggestCities(cities: readonly string[], query: string, limit = 8): string[] {
  const needle = cityKey(query);
  if (!needle || cities.some((city) => cityKey(city) === needle)) return [];
  const rank = (city: string) => {
    const key = cityKey(city);
    if (key.startsWith(needle)) return 0;
    if (key.split(/[\s-]+/).some((word) => word.startsWith(needle))) return 1;
    return key.includes(needle) ? 2 : -1;
  };
  return cities
    .map((city) => ({ city, rank: rank(city) }))
    .filter((item) => item.rank >= 0)
    .sort((a, b) => a.rank - b.rank || a.city.localeCompare(b.city, "ru"))
    .slice(0, limit)
    .map((item) => item.city);
}

/** Адрес доставки строкой — для поля адреса заказа, писем и накладных. */
export function terminalAddressLine(terminal: TerminalSnapshot): string {
  return `${terminal.city}, ${terminal.address} (терминал «${terminal.name}»)`;
}

export type CarrierTerminalRecord = {
  /** Код пункта у перевозчика */
  externalId: string;
  cityName: string;
  cityCode: string | null;
  name: string;
  address: string;
  fullAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  /** График выдачи груза текстом */
  schedule: string | null;
  phone: string | null;
  receivesCargo: boolean;
  givesOutCargo: boolean;
  /** Мелкий пункт выдачи (ПВЗ): покупателю не показывается */
  isPickupPoint: boolean;
  /** Ограничения на одно место: вес в килограммах, стороны в сантиметрах */
  maxWeightKg: number | null;
  maxLengthCm: number | null;
  maxWidthCm: number | null;
  maxHeightCm: number | null;
};

/** Доля от уже известных пунктов, меньше которой выгрузка считается битой */
const MIN_SHARE = 0.8;

/**
 * Можно ли погасить пункты, которых нет в новой выгрузке. Если перевозчик
 * вдруг отдал заметно меньше пунктов, чем было, это скорее сбой у него, чем
 * закрытие сети: гасить ничего не надо, иначе покупатели останутся без выбора.
 */
export function canDeactivateMissing(activeCount: number, incomingCount: number): boolean {
  return activeCount === 0 || incomingCount >= activeCount * MIN_SHARE;
}
