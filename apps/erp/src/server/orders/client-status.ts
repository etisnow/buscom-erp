import "server-only";
import { carrierTrackingUrl } from "@buscom/domain/carrier/tracking-url";
import { normalizePhone } from "@buscom/domain/customer/phone";
import { buildClientTimeline, clientStatusOf, type ClientTimelineEvent } from "@buscom/domain/order/client-status";
import type { ClientOrderStatus } from "@buscom/domain/site/order-status";
import { SlidingWindowLimiter } from "@buscom/domain/site/rate-limit";
import { db } from "@/server/db";
import { checkCargoStatus } from "@/server/orders/cargo-status";
import { readSettings } from "@/server/settings/service";

/**
 * Статус заказа для клиента — блок «Проверить статус заказа» на сайте. Заказ ищется
 * по номеру и телефону клиента: номера идут подряд, и без телефона чужой заказ
 * (статус, накладная, адрес) мог бы посмотреть кто угодно. Шкала строится по таблицам
 * соответствия из «Администрирование → Статусы для клиента».
 */

/** Перебор телефона по одному номеру заказа: 10 попыток за 10 минут, с любых адресов */
const perOrder = new SlidingWindowLimiter(10, 10 * 60 * 1000);

/** Живой ответ ТК помним 5 минут: страницу открывают часто, а лимиты API у ТК невелики */
const LIVE_TTL_MS = 5 * 60 * 1000;
const liveCache = new Map<string, { at: number; value: NonNullable<ClientOrderStatus["tracking"]>["live"] }>();

async function liveStatus(orderId: string): Promise<NonNullable<ClientOrderStatus["tracking"]>["live"]> {
  const cached = liveCache.get(orderId);
  if (cached && Date.now() - cached.at < LIVE_TTL_MS) return cached.value;
  let value: NonNullable<ClientOrderStatus["tracking"]>["live"] = null;
  try {
    const result = await checkCargoStatus(orderId);
    if (result.ok) {
      value = { text: result.status.stateName, at: result.status.stateDate, pickedUp: result.status.pickedUp };
    }
  } catch (error) {
    console.error("[client-status] ТК не ответила", error);
  }
  liveCache.set(orderId, { at: Date.now(), value });
  return value;
}

export type { ClientOrderStatus };

export type ClientOrderLookup =
  { ok: true; status: ClientOrderStatus } | { ok: false; reason: "not-found" | "too-many" };

export async function findClientOrderStatus(number: number, phoneRaw: string): Promise<ClientOrderLookup> {
  if (!perOrder.take(String(number))) return { ok: false, reason: "too-many" };
  const phone = normalizePhone(phoneRaw);
  if (!phone) return { ok: false, reason: "not-found" };

  const order = await db.order.findFirst({
    where: { number, deletedAt: null, customer: { phone } },
    select: {
      id: true,
      number: true,
      status: true,
      createdAt: true,
      totalKopecks: true,
      carrier: true,
      trackingNumber: true,
      shippedAt: true,
      deliveryAddress: true,
      deliveryDate: true,
      supplierTracks: { select: { supplierId: true, stageId: true } },
      payments: { select: { paidAt: true, amountKopecks: true }, orderBy: { paidAt: "asc" } },
      events: {
        where: { type: { in: ["STATUS_CHANGED", "SUPPLIER_STAGE_CHANGED"] } },
        orderBy: { createdAt: "asc" },
        select: { type: true, toStatus: true, payload: true, createdAt: true },
      },
    },
  });
  // Заказ не найден и телефон не подошёл — один и тот же ответ: не подсказываем, что номер существует
  if (!order) return { ok: false, reason: "not-found" };

  const mapping = (await readSettings()).clientStatuses;
  const events: ClientTimelineEvent[] = [];
  for (const event of order.events) {
    if (event.type === "STATUS_CHANGED" && event.toStatus) {
      events.push({ kind: "STATUS", at: event.createdAt, toStatus: event.toStatus });
    } else if (event.type === "SUPPLIER_STAGE_CHANGED") {
      const payload = event.payload as { supplierId?: unknown; toStageId?: unknown } | null;
      if (typeof payload?.supplierId === "string") {
        events.push({
          kind: "STAGE",
          at: event.createdAt,
          supplierId: payload.supplierId,
          toStageId: typeof payload.toStageId === "string" ? payload.toStageId : null,
        });
      }
    }
  }

  const tracked = order.carrier && order.trackingNumber?.trim();
  const base = clientStatusOf(
    order.status,
    order.supplierTracks.map((track) => track.stageId),
    mapping,
  );
  // ТК спрашиваем, пока заказ не закрыт: по ответу он может оказаться уже «Получен»
  const live = tracked && base !== "CANCELLED" && base !== "DELIVERED" ? await liveStatus(order.id) : null;

  const timeline = buildClientTimeline({
    createdAt: order.createdAt,
    orderStatus: order.status,
    suppliers: order.supplierTracks,
    events,
    mapping,
    totalKopecks: order.totalKopecks,
    payments: order.payments,
    carrier: order.carrier,
    shipped: order.trackingNumber?.trim() ? { at: order.shippedAt } : null,
    delivered: live?.pickedUp ? { at: live.at ? new Date(live.at) : null } : null,
  });

  return {
    ok: true,
    status: {
      number: order.number,
      totalKopecks: order.totalKopecks,
      current: timeline.current,
      headline: timeline.label,
      steps: timeline.steps.map((step) => ({
        key: step.key,
        label: step.label,
        at: step.at?.toISOString() ?? null,
        state: step.state,
        note: step.note ?? null,
      })),
      delivery: {
        expected: order.deliveryDate ? order.deliveryDate.toISOString() : null,
        address: order.deliveryAddress,
      },
      tracking: tracked
        ? {
            carrier: order.carrier!,
            number: order.trackingNumber!.trim(),
            url: carrierTrackingUrl(order.carrier, order.trackingNumber),
            live,
          }
        : null,
    },
  };
}
