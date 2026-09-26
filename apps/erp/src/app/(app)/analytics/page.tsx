import type { Metadata } from "next";
import Link from "next/link";
import { PeriodPicker } from "@/components/analytics/period-picker";
import { RevenueChart } from "@/components/analytics/revenue-chart";
import { OrderStatusBadge } from "@/components/orders/status-badge";
import { lastDayInclusive, resolvePeriod, type Period } from "@buscom/domain/analytics/period";
import { toDateInput } from "@buscom/domain/datetime";
import { formatRub } from "@buscom/domain/money";
import { formatPercent } from "@buscom/domain/supplier/price-economics";
import { ANALYTICS_ROLES } from "@buscom/domain/user/role";
import type { OrderStatus } from "@buscom/db/enums";
import { getDashboard } from "@/server/analytics/dashboard";
import { requirePageUser } from "@/server/session";
import { single } from "@/app/(app)/search-params";

export const metadata: Metadata = {
  title: "Аналитика — BusCom ERP",
};

/** Ссылка в список заказов на те же заказы: созданные в периоде, с этим статусом. */
function ordersHref(period: Period, status: OrderStatus): string {
  const params = new URLSearchParams({ view: "all", status });
  if (period.from) params.set("from", toDateInput(period.from));
  params.set("to", toDateInput(lastDayInclusive(period.to)));
  return `/orders?${params.toString()}`;
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border p-4">
      <div className="text-muted-foreground text-sm">{label}</div>
      <div className="font-heading text-2xl font-semibold tabular-nums">{value}</div>
      {hint ? <div className="text-muted-foreground text-xs">{hint}</div> : null}
    </div>
  );
}

export default async function AnalyticsPage({ searchParams }: PageProps<"/analytics">) {
  const user = await requirePageUser(ANALYTICS_ROLES);
  const params = await searchParams;
  const period = resolvePeriod({
    preset: single(params.period),
    from: single(params.from),
    to: single(params.to),
  });
  const dashboard = await getDashboard(period, user);
  const { completed } = dashboard;
  const { margin } = completed;
  const maxStatus = Math.max(1, ...dashboard.byStatus.map((row) => row.orders));

  return (
    <main className="flex flex-col gap-4">
      <h1 className="font-heading text-xl font-semibold">Аналитика</h1>
      <PeriodPicker period={period} />

      <section className="grid grid-cols-1 gap-3 *:min-w-0 sm:grid-cols-2 xl:grid-cols-4">
        <Tile
          label="Выручка"
          value={formatRub(completed.revenueKopecks)}
          hint={`${completed.orders} выполн. заказов, по дате выполнения`}
        />
        <Tile
          label="Средний чек"
          value={completed.averageKopecks === null ? "—" : formatRub(completed.averageKopecks)}
          hint="по выполненным заказам"
        />
        <Tile
          label="Маржа"
          value={margin.knownOrders > 0 ? formatRub(margin.marginKopecks) : "—"}
          hint={
            completed.orders === 0
              ? "нет выполненных заказов"
              : `${margin.percentHundredths !== null ? `${formatPercent(margin.percentHundredths)} от товаров · ` : ""}посчитана по ${margin.knownOrders} из ${completed.orders} заказов`
          }
        />
        <Tile
          label="Поступило оплат"
          value={formatRub(dashboard.payments.amountKopecks)}
          hint={`${dashboard.payments.count} платежей, по дате платежа`}
        />
      </section>

      {margin.knownOrders < completed.orders ? (
        <p className="text-muted-foreground -mt-1 text-xs">
          Маржа не считается у заказов, где хотя бы у одной позиции не выбран поставщик, — в том числе у всех архивных
          заказов из прежней ERP: закупки в них нет.
        </p>
      ) : null}

      <section className="flex flex-col gap-3 rounded-lg border p-4">
        <h2 className="font-heading font-medium">
          Выручка по {period.bucket === "day" ? "дням" : "месяцам"}
          <span className="text-muted-foreground ml-2 text-sm font-normal">выполненные заказы</span>
        </h2>
        <RevenueChart series={dashboard.series} />
      </section>

      <div className="grid grid-cols-1 gap-4 *:min-w-0 lg:grid-cols-2">
        <section className="flex flex-col gap-3 rounded-lg border p-4">
          <h2 className="font-heading font-medium">
            Заказы по статусам
            <span className="text-muted-foreground ml-2 text-sm font-normal">
              созданные в периоде: {dashboard.createdOrders}
            </span>
          </h2>
          <ul className="flex flex-col gap-2">
            {dashboard.byStatus.map((row) => (
              <li key={row.status}>
                <Link
                  href={ordersHref(period, row.status)}
                  className="hover:bg-muted/50 -mx-2 grid grid-cols-[7rem_1fr_auto] items-center gap-3 rounded-md px-2 py-1"
                >
                  <OrderStatusBadge status={row.status} />
                  <div className="bg-muted h-2 overflow-hidden rounded-full">
                    <div
                      className="bg-primary h-full rounded-full"
                      style={{ width: `${(row.orders / maxStatus) * 100}%` }}
                    />
                  </div>
                  <div className="text-right text-sm tabular-nums">
                    {row.orders}
                    <span className="text-muted-foreground ml-2 inline-block w-12">
                      {dashboard.createdOrders > 0
                        ? `${Math.round((row.orders / dashboard.createdOrders) * 100)}%`
                        : ""}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground text-xs">
            По текущему статусу заказа. Строка открывает эти заказы списком.
          </p>
        </section>

        <section className="flex flex-col gap-3 rounded-lg border p-4">
          <h2 className="font-heading font-medium">
            Топ товаров
            <span className="text-muted-foreground ml-2 text-sm font-normal">по выполненным заказам</span>
          </h2>
          {dashboard.topProducts.length === 0 ? (
            <p className="text-muted-foreground text-sm">Продаж за период нет.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-muted-foreground text-xs">
                <tr>
                  <th className="py-1 text-left font-normal">Товар</th>
                  <th className="py-1 pl-3 text-right font-normal">Шт.</th>
                  <th className="py-1 pl-3 text-right font-normal">Заказов</th>
                  <th className="py-1 pl-3 text-right font-normal">Сумма</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.topProducts.map((row) => (
                  <tr key={row.key} className="border-t">
                    <td className="py-1.5 pr-2">
                      <div className="line-clamp-2">{row.name}</div>
                      {row.sku ? <div className="text-muted-foreground text-xs">{row.sku}</div> : null}
                    </td>
                    <td className="py-1.5 pl-3 text-right tabular-nums">{row.quantity}</td>
                    <td className="py-1.5 pl-3 text-right tabular-nums">{row.orders}</td>
                    <td className="py-1.5 pl-2 text-right whitespace-nowrap tabular-nums">
                      {formatRub(row.revenueKopecks)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="text-muted-foreground text-xs">
            Сумма — по позициям со скидкой на позицию; скидка на заказ целиком и доставка не учитываются.
          </p>
        </section>
      </div>
    </main>
  );
}
