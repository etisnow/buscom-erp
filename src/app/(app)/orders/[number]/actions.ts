"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DiscountLimitError } from "@/domain/order/discount";
import { OrderEditError } from "@/domain/order/editing";
import { OrderTransitionError } from "@/domain/order/status";
import { ProductOptionError } from "@/domain/product/options";
import { SupplierStageError } from "@/domain/supplier/stages";
import { ForbiddenError } from "@/server/errors";
import { assignManager, takeOrder } from "@/server/orders/assignment";
import { addOrderComment } from "@/server/orders/comments";
import { updateOrderDelivery } from "@/server/orders/delivery";
import { OrderConflictError, OrderNotFoundError } from "@/server/orders/internal";
import { updateOrderItems } from "@/server/orders/items";
import { addPayment } from "@/server/orders/payments";
import { changeOrderStatus } from "@/server/orders/status";
import { changeOrderSource } from "@/server/orders/source";
import { changeSupplierStage } from "@/server/orders/suppliers";
import { searchProducts, type ProductSuggestion } from "@/server/products/search";
import { getCancelReasons } from "@/server/settings/service";
import { requireUser } from "@/server/session";

export type ActionResult = { ok: true } | { ok: false; error: string };

const ORDER_STATUSES = ["NEW", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;

/**
 * Единая обёртка: ошибки домена и прав превращаются в текст для формы,
 * всё остальное пробрасывается наверх как настоящая поломка.
 */
async function run(orderNumber: number, action: () => Promise<unknown>): Promise<ActionResult> {
  try {
    await action();
    revalidatePath(`/orders/${orderNumber}`);
    revalidatePath("/orders");
    return { ok: true };
  } catch (error) {
    if (
      error instanceof OrderTransitionError ||
      error instanceof SupplierStageError ||
      error instanceof ProductOptionError ||
      error instanceof OrderEditError ||
      error instanceof DiscountLimitError ||
      error instanceof OrderConflictError ||
      error instanceof OrderNotFoundError ||
      error instanceof ForbiddenError
    ) {
      return { ok: false, error: error.message };
    }
    throw error;
  }
}

const statusSchema = z.object({
  orderId: z.string().min(1),
  orderNumber: z.number().int().positive(),
  to: z.enum(ORDER_STATUSES),
  expectedStatus: z.enum(ORDER_STATUSES).optional(),
  cancelReason: z.string().optional(),
  cancelComment: z.string().optional(),
});

export async function changeStatusAction(input: z.input<typeof statusSchema>): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };
  const data = parsed.data;

  // Причина отмены: пункт справочника плюс необязательное уточнение.
  let cancelReason: string | undefined;
  if (data.to === "CANCELLED") {
    const reason = data.cancelReason?.trim() ?? "";
    // Причина сверяется со справочником на сервере: список из формы доверия не заслуживает.
    const allowed = await getCancelReasons();
    if (!allowed.includes(reason)) {
      return { ok: false, error: "Выберите причину отмены из справочника" };
    }
    const comment = data.cancelComment?.trim();
    cancelReason = comment ? `${reason}. ${comment}` : reason;
  }

  return run(data.orderNumber, () =>
    changeOrderStatus({
      orderId: data.orderId,
      to: data.to,
      user,
      expectedStatus: data.expectedStatus,
      cancelReason,
    }),
  );
}

export async function takeOrderAction(orderId: string, orderNumber: number): Promise<ActionResult> {
  const user = await requireUser();
  return run(orderNumber, () => takeOrder(orderId, user));
}

export async function assignManagerAction(
  orderId: string,
  orderNumber: number,
  managerId: string,
): Promise<ActionResult> {
  const user = await requireUser();
  return run(orderNumber, () => assignManager(orderId, managerId, user));
}

const itemsSchema = z.object({
  orderId: z.string().min(1),
  orderNumber: z.number().int().positive(),
  discountKopecks: z.number().int().min(0),
  items: z
    .array(
      z.object({
        productId: z.string().nullable().optional(),
        sku: z.string().min(1, { error: "Укажите артикул" }),
        name: z.string().min(1, { error: "Укажите название" }),
        priceKopecks: z.number().int().min(0),
        quantity: z.number().int().positive({ error: "Количество должно быть больше нуля" }),
        discountKopecks: z.number().int().min(0),
        supplierId: z.string().nullable().optional(),
        optionValueIds: z.array(z.string().min(1)).optional(),
      }),
    )
    .min(1, { error: "В заказе должна остаться хотя бы одна позиция" }),
});

export async function updateItemsAction(input: z.input<typeof itemsSchema>): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = itemsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };
  const data = parsed.data;

  return run(data.orderNumber, () =>
    updateOrderItems({
      orderId: data.orderId,
      items: data.items,
      discountKopecks: data.discountKopecks,
      user,
    }),
  );
}

const paymentSchema = z.object({
  orderId: z.string().min(1),
  orderNumber: z.number().int().positive(),
  method: z.enum(["INVOICE", "ONLINE", "CASH", "COD"]),
  amountKopecks: z.number().int().positive({ error: "Сумма должна быть больше нуля" }),
  paidAt: z.string().min(1),
  reference: z.string().optional(),
});

export async function addPaymentAction(input: z.input<typeof paymentSchema>): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = paymentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };
  const data = parsed.data;

  // Дата из поля «дата оплаты» — календарный день по Москве, время не спрашиваем.
  const paidAt = new Date(`${data.paidAt}T12:00:00+03:00`);
  if (Number.isNaN(paidAt.getTime())) {
    return { ok: false, error: "Некорректная дата оплаты" };
  }

  return run(data.orderNumber, () =>
    addPayment({
      orderId: data.orderId,
      method: data.method,
      amountKopecks: data.amountKopecks,
      paidAt,
      reference: data.reference?.trim() || null,
      user,
    }),
  );
}

const deliverySchema = z.object({
  orderId: z.string().min(1),
  orderNumber: z.number().int().positive(),
  deliveryMethod: z.enum(["PICKUP", "CARRIER", "COURIER"]).nullable(),
  carrier: z.string().optional(),
  deliveryAddress: z.string().optional(),
  deliveryPriceKopecks: z.number().int().min(0).optional(),
  trackingNumber: z.string().optional(),
});

export async function updateDeliveryAction(input: z.input<typeof deliverySchema>): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = deliverySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };
  const data = parsed.data;

  return run(data.orderNumber, () =>
    updateOrderDelivery({
      orderId: data.orderId,
      user,
      deliveryMethod: data.deliveryMethod,
      carrier: data.carrier?.trim() || null,
      deliveryAddress: data.deliveryAddress?.trim() || null,
      trackingNumber: data.trackingNumber?.trim() || null,
      ...(data.deliveryPriceKopecks === undefined ? {} : { deliveryPriceKopecks: data.deliveryPriceKopecks }),
    }),
  );
}

export async function addCommentAction(orderId: string, orderNumber: number, text: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!text.trim()) {
    return { ok: false, error: "Комментарий не может быть пустым" };
  }
  return run(orderNumber, () => addOrderComment(orderId, text, user));
}

/** Подсказки товаров для добавления позиции. */
export async function searchProductsAction(query: string): Promise<ProductSuggestion[]> {
  await requireUser();
  return searchProducts(query);
}

const stageSchema = z.object({
  orderId: z.string().min(1),
  orderNumber: z.number().int().positive(),
  supplierId: z.string().min(1),
  toStageId: z.string().min(1).nullable(),
  expectedStageId: z.string().min(1).nullable(),
});

/** Смена этапа поставщика в заказе — шаг вперёд или назад по его цепочке. */
export async function changeSupplierStageAction(input: z.input<typeof stageSchema>): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = stageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };
  const data = parsed.data;

  return run(data.orderNumber, () =>
    changeSupplierStage({
      orderId: data.orderId,
      supplierId: data.supplierId,
      toStageId: data.toStageId,
      expectedStageId: data.expectedStageId,
      user,
    }),
  );
}

/** Смена источника заказа из справочника — только у заказов, заведённых руками. */
export async function changeSourceAction(
  orderId: string,
  orderNumber: number,
  sourceItemId: string,
): Promise<ActionResult> {
  const user = await requireUser();
  if (!sourceItemId) return { ok: false, error: "Выберите источник" };
  return run(orderNumber, () => changeOrderSource(orderId, sourceItemId, user));
}
