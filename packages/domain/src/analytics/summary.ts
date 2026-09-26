/**
 * Сводка экрана «Аналитика» по выполненным заказам (PRD, M7).
 *
 * Выручка — сумма выполненных заказов (итог заказа, как в списке и в счёте) по
 * дате выполнения: заказ попадает в тот месяц, когда ушёл в «Выполнен».
 * Отменённые и незакрытые в выручку не входят (решение владельца, 2026-09-24).
 *
 * Маржа — сумма маржи тех заказов, где она известна (`calculateOrderMargin`: у
 * всех позиций выбран поставщик). Остальные в неё не входят, и это видно рядом —
 * «посчитано по N из M»: у архивных заказов из прежней ERP закупки нет вовсе.
 */
import type { Kopecks } from "../money";
import { calculateOrderMargin, type MarginInput } from "../order/margin";
import { lineTotal } from "../order/totals";
import { bucketKey, bucketLabel, bucketStarts, type Period } from "./period";

export type CompletedOrderInput = MarginInput & {
  completedAt: Date;
  totalKopecks: Kopecks;
  items: (MarginInput["items"][number] & { productId: string | null; sku: string; name: string })[];
};

export type MarginSummary = {
  /** Заказы с известной маржой */
  knownOrders: number;
  marginKopecks: Kopecks;
  /** Товары со скидками по тем же заказам — база процента */
  revenueKopecks: Kopecks;
  /** Доля маржи, сотые доли процента; null — считать не из чего */
  percentHundredths: number | null;
};

export type TopProduct = {
  key: string;
  productId: string | null;
  sku: string;
  name: string;
  quantity: number;
  /** Сумма по позициям со скидками на позицию; скидка на заказ целиком не раскладывается */
  revenueKopecks: Kopecks;
  orders: number;
};

export type SeriesPoint = { key: string; label: string; start: Date; revenueKopecks: Kopecks; orders: number };

export type CompletedSummary = {
  orders: number;
  revenueKopecks: Kopecks;
  /** Средний чек, до копейки; null — выполненных нет */
  averageKopecks: Kopecks | null;
  margin: MarginSummary;
};

export function summarizeCompleted(orders: CompletedOrderInput[]): CompletedSummary {
  const revenueKopecks = orders.reduce((sum, order) => sum + order.totalKopecks, 0);
  const margin: MarginSummary = { knownOrders: 0, marginKopecks: 0, revenueKopecks: 0, percentHundredths: null };
  for (const order of orders) {
    const result = calculateOrderMargin(order);
    if (!result.known) continue;
    margin.knownOrders += 1;
    margin.marginKopecks += result.marginKopecks;
    margin.revenueKopecks += result.revenueKopecks;
  }
  if (margin.revenueKopecks > 0) {
    margin.percentHundredths = Math.round((margin.marginKopecks * 10_000) / margin.revenueKopecks);
  }
  return {
    orders: orders.length,
    revenueKopecks,
    averageKopecks: orders.length > 0 ? Math.round(revenueKopecks / orders.length) : null,
    margin,
  };
}

/**
 * Топ товаров по сумме продаж. Позиция из каталога группируется по товару,
 * произвольная (без товара) — по артикулу и названию. Название и артикул берутся
 * из самого свежего заказа: каталог могли переименовать.
 */
export function topProducts(orders: CompletedOrderInput[], limit = 10): TopProduct[] {
  const rows = new Map<string, TopProduct>();
  // Когда позиция встречалась последний раз — чтобы взять свежее название
  const lastAt = new Map<string, number>();
  for (const order of orders) {
    const at = order.completedAt.getTime();
    const seenInOrder = new Set<string>();
    for (const item of order.items) {
      const key = item.productId ?? `${item.sku}\u0000${item.name}`;
      let row = rows.get(key);
      if (!row) {
        row = {
          key,
          productId: item.productId,
          sku: item.sku,
          name: item.name,
          quantity: 0,
          revenueKopecks: 0,
          orders: 0,
        };
        rows.set(key, row);
      }
      if (at >= (lastAt.get(key) ?? at)) {
        Object.assign(row, { sku: item.sku, name: item.name });
        lastAt.set(key, at);
      }
      row.quantity += item.quantity;
      row.revenueKopecks += lineTotal(item);
      if (!seenInOrder.has(key)) {
        seenInOrder.add(key);
        row.orders += 1;
      }
    }
  }
  return [...rows.values()]
    .sort(
      (a, b) => b.revenueKopecks - a.revenueKopecks || b.quantity - a.quantity || a.name.localeCompare(b.name, "ru"),
    )
    .slice(0, limit);
}

/** Выручка и число выполненных заказов по ячейкам периода — дни или месяцы, пустые тоже. */
export function revenueSeries(orders: CompletedOrderInput[], period: Period): SeriesPoint[] {
  const firstAt = orders.reduce<Date | null>(
    (min, order) => (min === null || order.completedAt < min ? order.completedAt : min),
    null,
  );
  const points = bucketStarts(period, firstAt).map((start) => ({
    key: bucketKey(start, period.bucket),
    label: bucketLabel(start, period.bucket),
    start,
    revenueKopecks: 0,
    orders: 0,
  }));
  const byKey = new Map(points.map((point) => [point.key, point]));
  for (const order of orders) {
    const point = byKey.get(bucketKey(order.completedAt, period.bucket));
    if (!point) continue;
    point.revenueKopecks += order.totalKopecks;
    point.orders += 1;
  }
  return points;
}
