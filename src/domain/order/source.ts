import type { OrderSource } from "@/generated/prisma/enums";

/**
 * Откуда пришёл заказ. Что видит пользователь — пункт справочника источников
 * (`Order.sourceItem`, правит администратор). Enum `OrderSource` остался техническим
 * каналом: по нему идемпотентность интеграции и импорта. Эти подписи — запасные,
 * для заказа без пункта справочника и для названий системных пунктов по умолчанию.
 */
export const ORDER_SOURCE_LABELS: Record<OrderSource, string> = {
  SITE: "Сайт",
  PHONE: "Телефон",
  EMAIL: "Почта",
  MESSENGER: "Мессенджер",
  OTHER: "Другое",
  LEGACY: "Прежняя ERP",
};

/** Каналы, которые ставит система: заказ с сайта (интеграция) и перенесённый из прежней ERP (импорт). */
export const SYSTEM_ORDER_SOURCES = ["SITE", "LEGACY"] as const satisfies readonly OrderSource[];

export type SystemOrderSource = (typeof SYSTEM_ORDER_SOURCES)[number];

export function isSystemOrderSource(source: OrderSource): source is SystemOrderSource {
  return (SYSTEM_ORDER_SOURCES as readonly OrderSource[]).includes(source);
}

/**
 * Источник меняется только у заказов, заведённых руками. Заказ с сайта и архивный
 * привязаны к внешнему номеру `(source, externalId)` — сменить им источник значило бы
 * соврать о происхождении заказа.
 */
export function canChangeOrderSource(source: OrderSource): boolean {
  return !isSystemOrderSource(source);
}

/** Подпись источника: пункт справочника, а без него — запасная подпись канала. */
export function orderSourceLabel(source: OrderSource, sourceItemName: string | null | undefined): string {
  return sourceItemName ?? ORDER_SOURCE_LABELS[source];
}
