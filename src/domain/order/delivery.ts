/**
 * Подписи способов доставки. Вынесены из компонента карточки: тот же текст
 * нужен и в заказе поставщику (`supplier-request.ts`), а расходиться подписям
 * нельзя — менеджер и поставщик должны видеть одно и то же.
 */
import type { DeliveryMethod } from "@/generated/prisma/enums";

export const DELIVERY_METHOD_LABELS: Record<DeliveryMethod, string> = {
  PICKUP: "Самовывоз",
  CARRIER: "Транспортная компания",
  COURIER: "Своя доставка",
};

export function deliveryMethodLabel(method: DeliveryMethod | null): string | null {
  return method ? DELIVERY_METHOD_LABELS[method] : null;
}
