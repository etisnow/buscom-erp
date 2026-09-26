/**
 * Контракт входящего заказа с сайта, версия 1 (docs/PRD.md, «Интеграция с bus-com.ru»).
 * Схема зафиксирована здесь: при несовместимых изменениях заводится /v2, а не правится эта.
 */
import { z } from "zod";
import { orderItemOptionSchema } from "../product/options";

const kopecks = z.number().int().min(0, { error: "Суммы — целые копейки, не меньше нуля" });

export const siteOrderSchema = z.object({
  externalId: z.string().min(1, { error: "Нужен externalId" }),
  createdAt: z.iso.datetime({ offset: true }).optional(),
  customer: z.object({
    type: z.enum(["PERSON", "COMPANY"]).default("PERSON"),
    name: z.string().min(1, { error: "Нужно имя клиента" }),
    phone: z.string().nullish(),
    email: z.string().nullish(),
    inn: z.string().nullish(),
    /** Добавлено 2026-09-23, необязательное — совместимо с v1. Выбирает филиал среди клиентов с одним ИНН */
    kpp: z.string().nullish(),
    companyName: z.string().nullish(),
  }),
  items: z
    .array(
      z.object({
        externalProductId: z.string().nullish(),
        sku: z.string().nullish(),
        name: z.string().min(1, { error: "У позиции должно быть название" }),
        priceKopecks: kopecks,
        quantity: z.number().int().positive({ error: "Количество — целое положительное число" }),
        /**
         * Добавлено 2026-09-26, необязательное — совместимо с v1. Снимок выбранных
         * опций (новый сайт на общей базе); цена позиции уже включает их надбавки
         */
        options: z.array(orderItemOptionSchema).optional(),
      }),
    )
    .min(1, { error: "В заказе должна быть хотя бы одна позиция" }),
  delivery: z
    .object({
      method: z.enum(["PICKUP", "CARRIER", "COURIER"]).nullish(),
      carrier: z.string().nullish(),
      address: z.string().nullish(),
      priceKopecks: kopecks.default(0),
    })
    .optional(),
  payment: z
    .object({
      method: z.enum(["INVOICE", "ONLINE", "CASH", "COD"]).nullish(),
      paidKopecks: kopecks.default(0),
    })
    .optional(),
  totalKopecks: kopecks.optional(),
  comment: z.string().nullish(),
  /**
   * Добавлено 2026-09-26, необязательное — совместимо с v1. `true` — у сайта своего
   * номера заказа нет, покупателю сообщают номер ERP (новый сайт). Тогда номер
   * сайта не сохраняется, а письма с «№ …» в теме ищут заказ по номеру ERP.
   */
  numberedByErp: z.boolean().optional(),
});

export type SiteOrderPayload = z.infer<typeof siteOrderSchema>;

export type ParseResult = { ok: true; order: SiteOrderPayload } | { ok: false; error: string };

/** Разбор тела запроса. Ошибку отдаём текстом — она ляжет в журнал интеграции. */
export function parseSiteOrder(input: unknown): ParseResult {
  const parsed = siteOrderSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: z.prettifyError(parsed.error) };
  }
  return { ok: true, order: parsed.data };
}

/** Имя клиента: у юрлица предпочитаем название компании, если оно пришло отдельно. */
export function customerName(payload: SiteOrderPayload): string {
  const { customer } = payload;
  if (customer.type === "COMPANY" && customer.companyName?.trim()) {
    return customer.companyName.trim();
  }
  return customer.name.trim();
}

/** Сумма позиций по данным сайта — для сверки с пересчётом ERP. */
export function declaredItemsTotal(payload: SiteOrderPayload): number {
  return payload.items.reduce((sum, item) => sum + item.priceKopecks * item.quantity, 0);
}
