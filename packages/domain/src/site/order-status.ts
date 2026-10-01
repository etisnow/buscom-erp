import { z } from "zod";
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

export { formatDeliveryDate, formatStepDate } from "./order-status-format";
