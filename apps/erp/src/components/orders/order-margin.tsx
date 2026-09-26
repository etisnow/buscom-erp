import { Fragment } from "react";
import { formatRub } from "@buscom/domain/money";
import type { OrderMargin } from "@buscom/domain/order/margin";
import { formatPercent } from "@buscom/domain/supplier/price-economics";
import { cn } from "@/lib/utils";

/**
 * Маржа заказа по сохранённым снимкам закупки (`packages/domain/src/order/margin.ts`).
 * Несохранённые правки позиций сюда не попадают — блок обновится после сохранения.
 */
export function OrderMarginBlock({ margin, orderCostsKopecks }: { margin: OrderMargin; orderCostsKopecks: number }) {
  return (
    <section className="flex flex-col gap-2 rounded-lg border p-4">
      <h2 className="font-heading font-medium">Маржа</h2>
      {margin.known ? (
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Товары со скидками</dt>
          <dd className="text-right tabular-nums">{formatRub(margin.revenueKopecks)}</dd>
          <dt className="text-muted-foreground">
            Закупка для нас
            {orderCostsKopecks > 0 ? `, в том числе расходы на заказ ${formatRub(orderCostsKopecks)}` : ""}
          </dt>
          <dd className="text-right tabular-nums">−{formatRub(margin.costKopecks)}</dd>
          {margin.commissions.map((row) => (
            <Fragment key={row.supplierId}>
              <dt
                className="text-muted-foreground"
                title={`Прибыль по товарам поставщика ${formatRub(row.profitKopecks)}`}
              >
                Комиссия с прибыли: {row.name}, {formatPercent(row.profitCommissionHundredths)}
              </dt>
              <dd className="text-right tabular-nums">−{formatRub(row.commissionKopecks)}</dd>
            </Fragment>
          ))}
          <dt className="border-t pt-1 font-medium">Маржа</dt>
          <dd
            className={cn(
              "border-t pt-1 text-right font-medium tabular-nums",
              margin.marginKopecks < 0 && "text-rose-700 dark:text-rose-400",
            )}
          >
            {formatRub(margin.marginKopecks)}
            {margin.marginPercentHundredths !== null ? (
              <span className="text-muted-foreground ml-2 font-normal">
                {formatPercent(margin.marginPercentHundredths)}
              </span>
            ) : null}
          </dd>
        </dl>
      ) : (
        <p className="text-muted-foreground text-sm">
          {margin.itemsWithoutCost === 1
            ? "Не посчитать: у одной позиции не выбран поставщик — неизвестно, во что она нам обходится."
            : `Не посчитать: у ${margin.itemsWithoutCost} позиций не выбран поставщик — неизвестно, во что они нам обходятся.`}
        </p>
      )}
      <p className="text-muted-foreground text-xs">Доставка клиенту не учитывается — она транзитная.</p>
    </section>
  );
}
