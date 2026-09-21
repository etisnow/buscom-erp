import type { OrderSource } from "@/generated/prisma/enums";

/** Откуда пришёл заказ. Один список на список заказов, карточку и выгрузку. */
export const ORDER_SOURCE_LABELS: Record<OrderSource, string> = {
  SITE: "Сайт",
  PHONE: "Телефон",
  EMAIL: "Почта",
  MESSENGER: "Мессенджер",
  OTHER: "Другое",
  LEGACY: "Прежняя ERP",
};

/** Все источники — для фильтра списка и разбора параметров URL. */
export const ORDER_SOURCES = Object.keys(ORDER_SOURCE_LABELS) as OrderSource[];

/**
 * Источники, доступные при заведении заказа руками. `LEGACY` сюда не входит:
 * его ставит только скрипт импорта, и выбрать его в форме нельзя.
 */
export const ORDER_CREATE_SOURCES = ORDER_SOURCES.filter((source) => source !== "LEGACY");
