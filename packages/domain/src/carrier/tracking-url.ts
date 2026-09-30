import { isDellinCarrier } from "./dellin-status";
import { isKitCarrier } from "./kit-status";
import { isPecCarrier } from "./pec-status";

/**
 * Ссылка «Отследить →» на сайте перевозчика по номеру накладной. `null` — ссылки
 * для этой ТК нет (или номер пустой): клиенту показывается только сам номер.
 * Адреса страниц отслеживания не проверялись живыми накладными (docs/STATUS.md).
 */
export function carrierTrackingUrl(
  carrier: string | null | undefined,
  trackingNumber: string | null | undefined,
): string | null {
  const number = trackingNumber?.trim();
  if (!number || !carrier) return null;
  const encoded = encodeURIComponent(number);
  if (/сдэк|cdek/i.test(carrier)) return `https://www.cdek.ru/ru/tracking?order_id=${encoded}`;
  if (isDellinCarrier(carrier)) return `https://www.dellin.ru/tracker/orders/${encoded}/`;
  if (isPecCarrier(carrier)) return `https://pecom.ru/services-are/order-status/?code=${encoded}`;
  // КИТ: страницу отслеживания с прямой ссылкой по номеру не нашли — без ссылки
  if (isKitCarrier(carrier)) return null;
  return null;
}
