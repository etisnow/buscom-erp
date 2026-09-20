"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { DiscountLimitError } from "@/domain/order/discount";
import { ForbiddenError } from "@/server/errors";
import { lookupCustomers, type CustomerMatch } from "@/server/customers/lookup";
import { createOrder } from "@/server/orders/create";
import { searchProducts, type ProductSuggestion } from "@/server/products/search";
import { ORDER_CREATE_ROLES } from "@/domain/user/role";
import { requireUser } from "@/server/session";

export type CreateResult = { ok: false; error: string };

const createSchema = z.object({
  source: z.enum(["SITE", "PHONE", "EMAIL", "MESSENGER", "OTHER"]),
  customerId: z.string().optional(),
  customer: z
    .object({
      type: z.enum(["PERSON", "COMPANY"]),
      name: z.string().min(1, { error: "Укажите имя клиента" }),
      phone: z.string().optional(),
      email: z.string().optional(),
      inn: z.string().optional(),
    })
    .optional(),
  items: z
    .array(
      z.object({
        productId: z.string().nullable(),
        sku: z.string().min(1, { error: "Укажите артикул" }),
        name: z.string().min(1, { error: "Укажите название" }),
        priceKopecks: z.number().int().min(0),
        quantity: z.number().int().positive(),
        discountKopecks: z.number().int().min(0),
      }),
    )
    .min(1, { error: "Добавьте хотя бы одну позицию" }),
  discountKopecks: z.number().int().min(0),
  deliveryMethod: z.enum(["PICKUP", "CARRIER", "COURIER"]).nullable(),
  carrier: z.string().optional(),
  deliveryAddress: z.string().optional(),
  deliveryPriceKopecks: z.number().int().min(0),
  customerComment: z.string().optional(),
});

/**
 * Создание заказа вручную. При успехе уводит на карточку — возврата в форму нет,
 * поэтому результат возвращается только в случае ошибки.
 */
export async function createOrderAction(input: z.input<typeof createSchema>): Promise<CreateResult> {
  const user = await requireUser(ORDER_CREATE_ROLES);

  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };
  const data = parsed.data;

  if (!data.customerId && !data.customer?.name) {
    return { ok: false, error: "Выберите клиента или заполните его данные" };
  }

  let orderNumber: number;
  try {
    const order = await createOrder({
      source: data.source,
      customerId: data.customerId,
      customer: data.customer,
      items: data.items,
      discountKopecks: data.discountKopecks,
      deliveryMethod: data.deliveryMethod,
      carrier: data.carrier?.trim() || null,
      deliveryAddress: data.deliveryAddress?.trim() || null,
      deliveryPriceKopecks: data.deliveryPriceKopecks,
      customerComment: data.customerComment?.trim() || null,
      user,
    });
    orderNumber = order.number;
  } catch (error) {
    if (error instanceof DiscountLimitError || error instanceof ForbiddenError) {
      return { ok: false, error: error.message };
    }
    if (error instanceof Error && error.message.includes("позиция")) {
      return { ok: false, error: error.message };
    }
    throw error;
  }

  redirect(`/orders/${orderNumber}`);
}

export async function lookupCustomersAction(query: string): Promise<CustomerMatch[]> {
  await requireUser(ORDER_CREATE_ROLES);
  return lookupCustomers(query);
}

export async function searchProductsForNewOrderAction(query: string): Promise<ProductSuggestion[]> {
  await requireUser(ORDER_CREATE_ROLES);
  return searchProducts(query);
}
