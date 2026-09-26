/**
 * Пересчёт итогов заказа. Итоги никогда не принимаются с клиента —
 * сервер вызывает calculateOrderTotals при каждом изменении позиций, скидки или доставки.
 *
 * Доставка в сумму заказа не входит (решение владельца, 2026-09-25): клиент платит
 * транспортной компании сам. Стоимость доставки хранится и показывается в блоке
 * «Доставка», но не попадает ни в итог, ни в счёт, ни в статус оплаты.
 */
import { assertKopecks, type Kopecks } from "../money";

export type OrderItemInput = {
  priceKopecks: Kopecks;
  quantity: number;
  /** Скидка на позицию целиком (не на единицу) */
  discountKopecks?: Kopecks;
};

export type OrderTotalsInput = {
  items: OrderItemInput[];
  /** Скидка на заказ целиком */
  discountKopecks?: Kopecks;
  /** Справочно: в итог не входит */
  deliveryPriceKopecks?: Kopecks;
};

export type OrderTotals = {
  itemsTotalKopecks: Kopecks;
  discountKopecks: Kopecks;
  deliveryPriceKopecks: Kopecks;
  totalKopecks: Kopecks;
};

export function lineTotal({ priceKopecks, quantity, discountKopecks = 0 }: OrderItemInput): Kopecks {
  assertKopecks(priceKopecks);
  assertKopecks(discountKopecks);
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error(`Количество должно быть целым положительным числом, получено: ${quantity}`);
  }
  if (priceKopecks < 0 || discountKopecks < 0) {
    throw new Error("Цена и скидка не могут быть отрицательными");
  }
  const gross = priceKopecks * quantity;
  if (discountKopecks > gross) {
    throw new Error("Скидка на позицию больше её стоимости");
  }
  return gross - discountKopecks;
}

export function calculateOrderTotals({
  items,
  discountKopecks = 0,
  deliveryPriceKopecks = 0,
}: OrderTotalsInput): OrderTotals {
  assertKopecks(discountKopecks);
  assertKopecks(deliveryPriceKopecks);
  if (discountKopecks < 0 || deliveryPriceKopecks < 0) {
    throw new Error("Скидка и стоимость доставки не могут быть отрицательными");
  }

  const itemsTotalKopecks = items.reduce((sum, item) => sum + lineTotal(item), 0);
  if (discountKopecks > itemsTotalKopecks) {
    throw new Error("Скидка на заказ больше суммы товаров");
  }

  return {
    itemsTotalKopecks,
    discountKopecks,
    deliveryPriceKopecks,
    totalKopecks: itemsTotalKopecks - discountKopecks,
  };
}
