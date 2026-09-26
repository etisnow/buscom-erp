import "server-only";
import { normalizePhone } from "@buscom/domain/customer/phone";
import {
  customerName,
  declaredItemsTotal,
  parseSiteOrder,
  type SiteOrderPayload,
} from "@buscom/domain/integration/contract";
import type { Prisma } from "@buscom/db/client";
import { db } from "@/server/db";
import { findOrCreateCustomer } from "@/server/customers/match";
import { notifyOrderCreated } from "@/server/notifications/queue";
import { recalculateOrderTotals, slaDueAtFor, writeOrderEvent, type Tx } from "@/server/orders/internal";
import { resolveSystemSource } from "@/server/orders/source";
import { readSettings } from "@/server/settings/service";

export const SITE_SOURCE = "site";

export type IngestResult =
  /** Заказ создан */
  | { status: 201; orderNumber: number }
  /** Повтор с тем же externalId — ничего не меняем */
  | { status: 200; orderNumber: number; duplicate: true }
  /** Сохранили сырым, но разобрать не смогли — разбор вручную в журнале */
  | { status: 202; inboxId: string; error: string }
  /** Сохранить нельзя: нет externalId */
  | { status: 400; error: string };

/** Достаём externalId до валидации: без него запись в inbox не к чему привязать. */
function readExternalId(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const value = (payload as { externalId?: unknown }).externalId;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Приём заказа с сайта. Порядок обязателен: сначала сохранить сырой payload,
 * потом разбирать (PRD, «Сначала сохранить, потом разбирать») — иначе баг в маппинге
 * теряет заказ. Идемпотентность по `(source, externalId)`.
 */
export async function ingestSiteOrder(payload: unknown): Promise<IngestResult> {
  const externalId = readExternalId(payload);
  if (!externalId) {
    return { status: 400, error: "В теле запроса нет externalId — сохранить заказ не к чему привязать" };
  }

  // Повтор доставки того же заказа: отвечаем тем же номером, ничего не меняем.
  const existing = await db.integrationInbox.findUnique({
    where: { source_externalId: { source: SITE_SOURCE, externalId } },
    select: { id: true, orderId: true, status: true, error: true },
  });

  if (existing?.orderId) {
    const order = await db.order.findUnique({ where: { id: existing.orderId }, select: { number: true } });
    if (order) return { status: 200, orderNumber: order.number, duplicate: true };
  }

  const inbox = existing
    ? await db.integrationInbox.update({
        where: { id: existing.id },
        data: { payload: payload as Prisma.InputJsonValue, attempts: { increment: 1 }, status: "PENDING" },
        select: { id: true },
      })
    : await db.integrationInbox.create({
        data: {
          source: SITE_SOURCE,
          externalId,
          payload: payload as Prisma.InputJsonValue,
          attempts: 1,
        },
        select: { id: true },
      });

  const parsed = parseSiteOrder(payload);
  if (!parsed.ok) {
    await db.integrationInbox.update({
      where: { id: inbox.id },
      data: { status: "FAILED", error: parsed.error, processedAt: new Date() },
    });
    return { status: 202, inboxId: inbox.id, error: parsed.error };
  }

  try {
    const orderNumber = await createOrderFromPayload(parsed.order, inbox.id);
    return { status: 201, orderNumber };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Неизвестная ошибка при создании заказа";
    await db.integrationInbox.update({
      where: { id: inbox.id },
      data: { status: "FAILED", error: message, processedAt: new Date() },
    });
    return { status: 202, inboxId: inbox.id, error: message };
  }
}

export type CreateOrderOptions = {
  /** Текст первой записи журнала заказа — откуда и как пришёл заказ */
  eventComment?: string;
};

/**
 * Заказ из разобранного контракта v1 — общий для эндпоинта и писем с сайта.
 * Запись журнала интеграции помечается обработанной в той же транзакции.
 * `readSettings`, а не `getSettings`: письма разбираются вне HTTP-запроса,
 * где `cache` из React не работает.
 */
export async function createOrderFromPayload(
  payload: SiteOrderPayload,
  inboxId: string,
  options: CreateOrderOptions = {},
): Promise<number> {
  const { slaMinutes } = await readSettings();

  return db.$transaction(async (tx) => {
    const customer = await findOrCreateCustomer(tx, {
      type: payload.customer.type,
      name: customerName(payload),
      phone: payload.customer.phone,
      email: payload.customer.email,
      inn: payload.customer.inn,
      kpp: payload.customer.kpp,
    });

    const items = await matchItems(tx, payload);
    const sourceItemId = await resolveSystemSource(tx, "SITE");
    const createdAt = payload.createdAt ? new Date(payload.createdAt) : new Date();

    const order = await tx.order.create({
      data: {
        source: "SITE",
        sourceItemId,
        externalId: payload.externalId,
        siteNumber: payload.numberedByErp ? null : payload.externalId,
        status: "NEW",
        statusChangedAt: createdAt,
        slaDueAt: slaDueAtFor("NEW", createdAt, slaMinutes),
        createdAt,
        customerId: customer.id,
        deliveryMethod: payload.delivery?.method ?? null,
        carrier: payload.delivery?.carrier ?? null,
        deliveryAddress: payload.delivery?.address ?? null,
        deliveryPriceKopecks: payload.delivery?.priceKopecks ?? 0,
        customerComment: payload.comment ?? null,
        items: {
          create: items.map((item, index) => ({
            productId: item.productId,
            sku: item.sku,
            name: item.name,
            priceKopecks: item.priceKopecks,
            quantity: item.quantity,
            sortOrder: index,
            ...(item.options?.length ? { options: item.options } : {}),
          })),
        },
      },
    });

    await recalculateOrderTotals(tx, order.id);

    // Автор события — система: заказ пришёл без участия сотрудника.
    await writeOrderEvent(tx, {
      orderId: order.id,
      user: null,
      type: "CREATED",
      toStatus: "NEW",
      comment:
        options.eventComment ??
        (payload.numberedByErp
          ? "Заказ оформлен на сайте bus-com.ru"
          : `Заказ принят с сайта, № на сайте ${payload.externalId}`),
    });

    // Предоплата с сайта, если она была, сразу видна в карточке.
    const paidKopecks = payload.payment?.paidKopecks ?? 0;
    if (paidKopecks > 0) {
      await tx.payment.create({
        data: {
          orderId: order.id,
          method: payload.payment?.method ?? "ONLINE",
          amountKopecks: paidKopecks,
          paidAt: createdAt,
          reference: `Оплата на сайте, заказ ${payload.externalId}`,
        },
      });
      await tx.order.update({ where: { id: order.id }, data: { paidKopecks } });
      await writeOrderEvent(tx, {
        orderId: order.id,
        user: null,
        type: "PAYMENT_ADDED",
        payload: { method: payload.payment?.method ?? "ONLINE", amountKopecks: paidKopecks },
      });
    }

    // После предоплаты — чтобы письмо показало статус оплаты с сайта.
    await notifyOrderCreated(tx, { orderId: order.id, actorId: null, channel: "SITE", sourceLabel: "Сайт" });

    // Расхождение сумм не блокирует приём заказа, но должно быть видно (PRD).
    const declared = payload.totalKopecks;
    if (declared !== undefined) {
      const saved = await tx.order.findUniqueOrThrow({
        where: { id: order.id },
        select: { totalKopecks: true, deliveryPriceKopecks: true },
      });
      // «Итого» сайта включает доставку, а сумма заказа в ERP — нет (доставку клиент
      // платит транспортной компании): сверяем товары со скидками плюс доставку
      if (saved.totalKopecks + saved.deliveryPriceKopecks !== declared) {
        await writeOrderEvent(tx, {
          orderId: order.id,
          user: null,
          type: "UPDATED",
          comment: "Сумма с сайта не совпала с пересчётом ERP",
          payload: {
            declaredTotalKopecks: declared,
            calculatedTotalKopecks: saved.totalKopecks,
            declaredItemsTotalKopecks: declaredItemsTotal(payload),
          },
        });
      }
    }

    await tx.integrationInbox.update({
      where: { id: inboxId },
      data: { status: "PROCESSED", orderId: order.id, error: null, processedAt: new Date() },
    });

    return order.number;
  });
}

type MatchedItem = {
  productId: string | null;
  sku: string;
  name: string;
  priceKopecks: number;
  quantity: number;
  options?: SiteOrderPayload["items"][number]["options"];
};

/**
 * Товар ищется по `externalProductId`, затем по `sku`; не нашли — позиция создаётся
 * без связи с каталогом (PRD). Цена и название всегда берутся из заказа: позиция хранит снимок.
 */
async function matchItems(tx: Tx, payload: SiteOrderPayload): Promise<MatchedItem[]> {
  const externalIds = payload.items.map((item) => item.externalProductId).filter((id): id is string => !!id);
  const skus = payload.items.map((item) => item.sku).filter((sku): sku is string => !!sku);

  const products = await tx.product.findMany({
    where: { OR: [{ externalId: { in: externalIds } }, { sku: { in: skus } }] },
    select: { id: true, sku: true, externalId: true },
  });

  const byExternalId = new Map(products.filter((p) => p.externalId).map((p) => [p.externalId as string, p]));
  const bySku = new Map(products.map((p) => [p.sku, p]));

  return payload.items.map((item) => {
    const product =
      (item.externalProductId ? byExternalId.get(item.externalProductId) : undefined) ??
      (item.sku ? bySku.get(item.sku) : undefined);

    return {
      productId: product?.id ?? null,
      sku: item.sku ?? product?.sku ?? "",
      name: item.name,
      priceKopecks: item.priceKopecks,
      quantity: item.quantity,
      options: item.options,
    };
  });
}

/** Нормализованный телефон клиента — для сопоставления дублей. */
export function normalizedPhoneOf(payload: SiteOrderPayload): string | null {
  return normalizePhone(payload.customer.phone);
}
