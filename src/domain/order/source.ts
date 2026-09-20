import type { OrderSource } from "@/generated/prisma/enums";

/** Откуда пришёл заказ. Один список на список заказов, карточку и выгрузку. */
export const ORDER_SOURCE_LABELS: Record<OrderSource, string> = {
  SITE: "Сайт",
  PHONE: "Телефон",
  EMAIL: "Почта",
  MESSENGER: "Мессенджер",
  OTHER: "Другое",
};
