import "server-only";
import type { CargoStatusResult } from "@buscom/domain/carrier/cargo-status";
import { isDellinCarrier } from "@buscom/domain/carrier/dellin-status";
import { isKitCarrier } from "@buscom/domain/carrier/kit-status";
import { isPecCarrier } from "@buscom/domain/carrier/pec-status";
import { fetchDellinCargoStatus } from "@/server/carriers/dellin";
import { fetchKitCargoStatus } from "@/server/carriers/kit";
import { fetchPecCargoStatus } from "@/server/carriers/pec";
import { db } from "@/server/db";
import { readSettings } from "@/server/settings/service";

/**
 * Статус груза заказа у перевозчика — только чтение, в заказ ничего не пишется.
 * Умеем ДЛ, ПЭК и КИТ; номер берётся из трек-номера заказа.
 */
export async function checkCargoStatus(orderId: string): Promise<CargoStatusResult> {
  const order = await db.order.findFirst({
    where: { id: orderId, deletedAt: null },
    select: { carrier: true, trackingNumber: true },
  });
  if (!order) return { ok: false, error: "Заказ не найден" };
  const trackingNumber = order.trackingNumber?.trim();
  const dellin = isDellinCarrier(order.carrier);
  const kit = isKitCarrier(order.carrier);
  if (!dellin && !kit && !isPecCarrier(order.carrier)) {
    return { ok: false, error: "Статус груза проверяется только у Деловых линий, ПЭК и КИТ" };
  }
  if (!trackingNumber) return { ok: false, error: "Укажите трек-номер и сохраните доставку" };

  const { dellinAppKey, pecLogin, pecApiKey, kitToken } = (await readSettings()).carriers;
  if (kit) {
    if (!kitToken) return { ok: false, error: "Токен КИТ не задан — «Администрирование → Транспортные компании»" };
    return fetchKitCargoStatus(kitToken, trackingNumber);
  }
  if (dellin) {
    if (!dellinAppKey) return { ok: false, error: "Ключ ДЛ не задан — «Администрирование → Транспортные компании»" };
    return fetchDellinCargoStatus(dellinAppKey, trackingNumber);
  }
  if (!pecLogin || !pecApiKey) {
    return { ok: false, error: "Логин и ключ ПЭК не заданы — «Администрирование → Транспортные компании»" };
  }
  return fetchPecCargoStatus({ login: pecLogin, apiKey: pecApiKey }, trackingNumber);
}
