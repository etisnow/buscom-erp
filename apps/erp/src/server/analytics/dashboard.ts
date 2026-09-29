import "server-only";
import { summarizeExpenses, type ExpensesSummary, type ExpenseRule } from "@buscom/domain/analytics/expenses";
import type { Period } from "@buscom/domain/analytics/period";
import {
  revenueSeries,
  summarizeCompleted,
  topProducts,
  type CompletedOrderInput,
  type CompletedSummary,
  type SeriesPoint,
  type TopProduct,
} from "@buscom/domain/analytics/summary";
import type { Kopecks } from "@buscom/domain/money";
import { calculateOrderMargin } from "@buscom/domain/order/margin";
import { ORDER_STATUSES } from "@buscom/domain/order/status";
import { ANALYTICS_ROLES, hasRole } from "@buscom/domain/user/role";
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
 * - заказы по статусам — созданные в периоде, по текущему статусу;
 * - расходы — доля каждого расхода, действующего в периоде (`analytics/expenses`);
 *   процент берёт базу из тех же выручки, маржи и оплат по их датам.
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
  expenses: ExpensesSummary<ExpenseRule & { id: string; name: string }>;
  /** Маржа минус расходы; null — маржа не известна ни по одному заказу */
  profitKopecks: Kopecks | null;
};

function range(period: Period) {
  return { ...(period.from ? { gte: period.from } : {}), lt: period.to };
}

export async function getDashboard(period: Period, user: SessionUser): Promise<Dashboard> {
  if (!hasRole(user.role, ANALYTICS_ROLES)) {
    throw new ForbiddenError("Аналитику видят руководитель и администратор");
  }

  const [completedRows, paymentRows, statusGroups, expenseRows] = await Promise.all([
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
    db.payment.findMany({
      where: { paidAt: range(period), order: { deletedAt: null } },
      select: { paidAt: true, amountKopecks: true },
    }),
    db.order.groupBy({
      by: ["status"],
      where: { deletedAt: null, createdAt: range(period) },
      _count: { _all: true },
      _sum: { totalKopecks: true },
    }),
    // Расходов десятки — отбор по периоду делает домен, у разового и регулярного он разный
    db.expense.findMany({
      select: {
        id: true,
        name: true,
        recurrence: true,
        amountKopecks: true,
        percentHundredths: true,
        base: true,
        startsOn: true,
        endsOn: true,
      },
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

  const summary = summarizeCompleted(completed);
  const expenses = summarizeExpenses(expenseRows, period, {
    REVENUE: completed.map((order) => ({ at: order.completedAt, kopecks: order.totalKopecks })),
    MARGIN: completed.flatMap((order) => {
      const margin = calculateOrderMargin(order);
      return margin.known ? [{ at: order.completedAt, kopecks: margin.marginKopecks }] : [];
    }),
    PAYMENTS: paymentRows.map((payment) => ({ at: payment.paidAt, kopecks: payment.amountKopecks })),
  });

  return {
    completed: summary,
    series: revenueSeries(completed, period),
    topProducts: topProducts(completed),
    payments: {
      count: paymentRows.length,
      amountKopecks: paymentRows.reduce((sum, payment) => sum + payment.amountKopecks, 0),
    },
    byStatus,
    createdOrders: byStatus.reduce((sum, row) => sum + row.orders, 0),
    expenses,
    profitKopecks: summary.margin.knownOrders > 0 ? summary.margin.marginKopecks - expenses.totalKopecks : null,
  };
}
