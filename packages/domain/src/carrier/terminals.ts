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
const TERMINAL_CARRIERS: Record<string, TerminalCarrier> = { "Деловые линии": "DELLIN" };

export function terminalCarrierOf(carrierName: string | null | undefined): TerminalCarrier | null {
  return (carrierName && TERMINAL_CARRIERS[carrierName]) || null;
}

/**
 * Снимок выбранного терминала в заказе — на момент оформления, как снимок позиции:
 * пункт могут переименовать или закрыть, а в заказе должно остаться, куда ехать.
 */
export const terminalSnapshotSchema = z.object({
  carrier: z.enum(["DELLIN"] satisfies TerminalCarrier[]),
  /** Код пункта у перевозчика */
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(300),
  city: z.string().min(1).max(200),
  address: z.string().min(1).max(500),
  /** График выдачи груза */
  schedule: z.string().max(500).nullable(),
});

export type TerminalSnapshot = z.infer<typeof terminalSnapshotSchema>;

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
