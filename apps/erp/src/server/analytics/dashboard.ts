import "server-only";
import type { Period } from "@/domain/analytics/period";
import {
  revenueSeries,
  summarizeCompleted,
  topProducts,
  type CompletedOrderInput,
  type CompletedSummary,
  type SeriesPoint,
  type TopProduct,
} from "@/domain/analytics/summary";
import type { Kopecks } from "@/domain/money";
import { ORDER_STATUSES } from "@/domain/order/status";
import { ANALYTICS_ROLES, hasRole } from "@/domain/user/role";
import type { OrderStatus } from "@buscom/db/enums";
import { db } from "@/server/db";
import { ForbiddenError } from "@/server/errors";
import type { SessionUser } from "@/server/session";

/**
 * Данные экрана «Аналитика» (PRD, M7) за период.
 *
 * Три разных среза, и у каждого своя дата — это видно в подписях на экране:
 * - выручка, маржа, средний чек, график и топ товаров — выполненные заказы по дате
 *   выполнения. «Выполнен» конечный, поэтому время последней смены статуса у
 *   такого заказа и есть время выполнения (у архивных — дата заказа);
 * - поступившие оплаты — по дате платежа;
 * - заказы по статусам — созданные в периоде, по текущему статусу.
 *
 * Считается в приложении, а не SQL-агрегатами: маржа заказа — доменная функция с
 * округлениями комиссии, её нельзя повторить в запросе, не разойдясь с карточкой.
 * Объёмы позволяют: около 50 заказов в месяц, «Всё время» — несколько тысяч.
 */

export type StatusCount = { status: OrderStatus; orders: number; totalKopecks: Kopecks };

export type Dashboard = {
  completed: CompletedSummary;
  series: SeriesPoint[];
  topProducts: TopProduct[];
  payments: { count: number; amountKopecks: Kopecks };
  /** Все четыре статуса по порядку, в том числе нулевые */
  byStatus: StatusCount[];
  createdOrders: number;
};

function range(period: Period) {
  return { ...(period.from ? { gte: period.from } : {}), lt: period.to };
}

export async function getDashboard(period: Period, user: SessionUser): Promise<Dashboard> {
  if (!hasRole(user.role, ANALYTICS_ROLES)) {
    throw new ForbiddenError("Аналитику видят руководитель и администратор");
  }

  const [completedRows, payments, statusGroups] = await Promise.all([
    db.order.findMany({
      where: { deletedAt: null, status: "COMPLETED", statusChangedAt: range(period) },
      select: {
        statusChangedAt: true,
        totalKopecks: true,
        discountKopecks: true,
        items: {
          select: {
            productId: true,
            sku: true,
            name: true,
            priceKopecks: true,
            quantity: true,
            discountKopecks: true,
            supplierId: true,
            purchasePriceKopecks: true,
            purchaseCostKopecks: true,
          },
        },
        supplierTracks: {
          select: {
            supplierId: true,
            orderCostKopecks: true,
            profitCommissionHundredths: true,
            supplier: { select: { name: true } },
          },
        },
      },
    }),
    db.payment.aggregate({
      where: { paidAt: range(period), order: { deletedAt: null } },
      _count: { _all: true },
      _sum: { amountKopecks: true },
    }),
    db.order.groupBy({
      by: ["status"],
      where: { deletedAt: null, createdAt: range(period) },
      _count: { _all: true },
      _sum: { totalKopecks: true },
    }),
  ]);

  const completed: CompletedOrderInput[] = completedRows.map((order) => ({
    completedAt: order.statusChangedAt,
    totalKopecks: order.totalKopecks,
    discountKopecks: order.discountKopecks,
    items: order.items.map((item) => ({
      productId: item.productId,
      sku: item.sku,
      name: item.name,
      priceKopecks: item.priceKopecks,
      quantity: item.quantity,
      discountKopecks: item.discountKopecks,
      supplierId: item.supplierId,
      // Как в карточке заказа: снимок стоимости для нас, у позиций до «Экономики цены» — номинал
      costKopecks: item.supplierId ? (item.purchaseCostKopecks ?? item.purchasePriceKopecks) : null,
    })),
    suppliers: order.supplierTracks.map((track) => ({
      supplierId: track.supplierId,
      name: track.supplier.name,
      orderCostKopecks: track.orderCostKopecks,
      profitCommissionHundredths: track.profitCommissionHundredths,
    })),
  }));

  const byStatus = ORDER_STATUSES.map((status) => {
    const group = statusGroups.find((row) => row.status === status);
    return { status, orders: group?._count._all ?? 0, totalKopecks: group?._sum.totalKopecks ?? 0 };
  });

  return {
    completed: summarizeCompleted(completed),
    series: revenueSeries(completed, period),
    topProducts: topProducts(completed),
    payments: { count: payments._count._all, amountKopecks: payments._sum.amountKopecks ?? 0 },
    byStatus,
    createdOrders: byStatus.reduce((sum, row) => sum + row.orders, 0),
  };
}
