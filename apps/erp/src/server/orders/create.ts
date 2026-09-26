import "server-only";
import { assertDiscountWithinLimit } from "@/domain/order/discount";
import { ORDER_SOURCE_LABELS } from "@/domain/order/source";
import type { Kopecks } from "@/domain/money";
import type { DeliveryMethod, OrderSource } from "@buscom/db/enums";
import { db } from "@/server/db";
import { findOrCreateCustomer, type CustomerDraft } from "@/server/customers/match";
import {
  orderInclude,
  recalculateOrderTotals,
  slaDueAtFor,
  writeOrderEvent,
  type OrderWithItems,
} from "@/server/orders/internal";
import type { OrderItemDraft } from "@/server/orders/items";
import { assertManualSource } from "@/server/orders/source";
import { resolveItemOptions } from "@/server/orders/options";
import { resolveItemSuppliers, syncSupplierTracks } from "@/server/orders/suppliers";
import { notifyOrderCreated } from "@/server/notifications/queue";
import { getSettings } from "@/server/settings/service";
import type { SessionUser } from "@/server/session";

export type CreateOrderInput = {
  /** Источник из справочника — что выбрал менеджер в форме */
  sourceItemId?: string | null;
  /** Технический канал; у заказа, заведённого руками, по умолчанию `OTHER` */
  source?: OrderSource;
  /** Существующий клиент или данные для поиска и создания нового */
  customerId?: string;
  customer?: CustomerDraft;
  items: OrderItemDraft[];
  discountKopecks?: Kopecks;
  deliveryMethod?: DeliveryMethod | null;
  carrier?: string | null;
  deliveryAddress?: string | null;
  deliveryPriceKopecks?: Kopecks;
  customerComment?: string | null;
  user: SessionUser;
};

/**
 * Ручное создание заказа (звонок, почта, мессенджер).
 * Заказ сразу в IN_PROGRESS с автором в роли менеджера, в журнале — CREATED (PRD).
 */
export async function createOrder(input: CreateOrderInput): Promise<OrderWithItems> {
  if (input.items.length === 0) {
    throw new Error("В заказе должна быть хотя бы одна позиция");
  }

  const { discountLimitPercent, slaMinutes } = await getSettings();

  const discountKopecks = input.discountKopecks ?? 0;
  assertDiscountWithinLimit({
    limitPercent: discountLimitPercent,
    items: input.items.map((item) => ({
      priceKopecks: item.priceKopecks,
      quantity: item.quantity,
      discountKopecks: item.discountKopecks ?? 0,
    })),
    orderDiscountKopecks: discountKopecks,
    role: input.user.role,
  });

  return db.$transaction(async (tx) => {
    const customerId = input.customerId ?? (await findOrCreateCustomer(tx, requireCustomer(input))).id;
    const sourceItem = input.sourceItemId ? await assertManualSource(tx, input.sourceItemId) : null;
    const suppliers = await resolveItemSuppliers(tx, input.items);
    const options = await resolveItemOptions(tx, input.items);

    const order = await tx.order.create({
      data: {
        source: input.source ?? "OTHER",
        sourceItemId: sourceItem?.id ?? null,
        status: "IN_PROGRESS",
        slaDueAt: slaDueAtFor("IN_PROGRESS", new Date(), slaMinutes),
        customerId,
        managerId: input.user.id,
        discountKopecks,
        deliveryMethod: input.deliveryMethod ?? null,
        carrier: input.carrier ?? null,
        deliveryAddress: input.deliveryAddress ?? null,
        deliveryPriceKopecks: input.deliveryPriceKopecks ?? 0,
        customerComment: input.customerComment ?? null,
        items: {
          create: input.items.map((item, index) => ({
            productId: item.productId ?? null,
            sku: item.sku,
            name: item.name,
            priceKopecks: item.priceKopecks,
            quantity: item.quantity,
            discountKopecks: item.discountKopecks ?? 0,
            sortOrder: index,
            ...suppliers[index],
            options: options[index],
          })),
        },
      },
    });

    await recalculateOrderTotals(tx, order.id);
    await syncSupplierTracks(tx, order.id);

    await writeOrderEvent(tx, {
      orderId: order.id,
      user: input.user,
      type: "CREATED",
      toStatus: "IN_PROGRESS",
      comment: `Заказ создан вручную (${sourceItem?.name ?? ORDER_SOURCE_LABELS[input.source ?? "OTHER"]})`,
    });

    await notifyOrderCreated(tx, {
      orderId: order.id,
      actorId: input.user.id,
      channel: "MANUAL",
      sourceLabel: ORDER_SOURCE_LABELS[input.source ?? "OTHER"],
    });

    return tx.order.findUniqueOrThrow({ where: { id: order.id }, include: orderInclude });
  });
}

function requireCustomer(input: CreateOrderInput): CustomerDraft {
  if (!input.customer?.name?.trim()) {
    throw new Error("Нужно выбрать клиента или указать его имя");
  }
  return input.customer;
}
