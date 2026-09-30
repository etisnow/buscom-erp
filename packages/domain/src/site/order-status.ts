import { z } from "zod";
import { moscowParts } from "../datetime";
import { normalizePhone } from "../customer/phone";

/**
 * Блок «Проверить статус заказа» на главной сайта: запрос покупателя и ответ ERP
 * (`POST /api/integrations/site/order-status`). Форма ответа — общая для ERP, которая
 * её отдаёт, и сайта, который её показывает.
 */

export const orderStatusFormSchema = z.object({
  number: z
    .string()
    .trim()
    .regex(/^\d{1,10}$/, { error: "Номер заказа — только цифры, как в письме-подтверждении" })
    .transform(Number)
    .refine((value) => value > 0 && value <= 2_000_000_000, { error: "Проверьте номер заказа" }),
  phone: z
    .string()
    .trim()
    .refine((value) => normalizePhone(value) !== null, { error: "Телефон в формате +7 910 123-45-67" }),
});

export const clientOrderStatusSchema = z.object({
  number: z.number(),
  totalKopecks: z.number(),
  current: z.string(),
  headline: z.string(),
  steps: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      at: z.string().nullable(),
      state: z.enum(["done", "current", "pending", "partial"]),
      note: z.string().nullable().optional(),
    }),
  ),
  delivery: z.object({ expected: z.string().nullable(), address: z.string().nullable() }),
  tracking: z
    .object({
      carrier: z.string(),
      number: z.string(),
      url: z.string().nullable(),
      live: z.object({ text: z.string(), at: z.string().nullable(), pickedUp: z.boolean() }).nullable(),
    })
    .nullable(),
});

export type ClientOrderStatus = z.infer<typeof clientOrderStatusSchema>;

const SHORT_MONTHS = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"] as const;
const GENITIVE_MONTHS = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
] as const;

/** `2026-09-28T…` → «28 сен» — подпись шага под шкалой; день по Москве. */
export function formatStepDate(iso: string): string {
  const { day, month } = moscowParts(new Date(iso));
  return `${day} ${SHORT_MONTHS[month]}`;
}

/** `2026-10-03T…` → «3 октября» — ожидаемая доставка; день по Москве. */
export function formatDeliveryDate(iso: string): string {
  const { day, month } = moscowParts(new Date(iso));
  return `${day} ${GENITIVE_MONTHS[month]}`;
}
