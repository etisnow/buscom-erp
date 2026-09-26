import type { SeriesPoint } from "@buscom/domain/analytics/summary";
import { formatRub } from "@buscom/domain/money";

function ordersWord(count: number): string {
  const tens = count % 100;
  const units = count % 10;
  if (tens >= 11 && tens <= 14) return "заказов";
  if (units === 1) return "заказ";
  if (units >= 2 && units <= 4) return "заказа";
  return "заказов";
}

function tooltipPlacement(index: number, count: number): string {
  if (count > 4 && index < count / 5) return "left-0";
  if (count > 4 && index >= count - count / 5) return "right-0";
  return "left-1/2 -translate-x-1/2";
}

/**
 * Выручка по дням или месяцам — столбцы одной серии, без библиотеки графиков:
 * разметка рисуется на сервере, подсказка по наведению — на CSS. Под графиком —
 * те же цифры таблицей, для точных значений и для чтения без графики.
 */
export function RevenueChart({ series }: { series: SeriesPoint[] }) {
  if (series.every((point) => point.orders === 0)) {
    return <p className="text-muted-foreground text-sm">Выполненных заказов за период нет.</p>;
  }

  const max = Math.max(...series.map((point) => point.revenueKopecks));
  // Подписей по оси не больше дюжины, иначе на «Всё время» они слипаются
  const labelStep = Math.ceil(series.length / 12);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <div className="text-muted-foreground flex h-48 flex-col justify-between text-right text-xs tabular-nums">
          <span>{max > 0 ? formatRub(max) : ""}</span>
          <span>0</span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div
            className="border-border flex h-48 items-end gap-0.5 border-b"
            role="img"
            aria-label="Выручка по периодам"
          >
            {series.map((point, index) => (
              <div key={point.key} className="group relative flex h-full min-w-0 flex-1 items-end justify-center">
                <div
                  className="bg-primary group-hover:bg-primary/80 w-full max-w-10 rounded-t-[4px]"
                  style={{ height: max > 0 ? `${(point.revenueKopecks / max) * 100}%` : 0 }}
                />
                {/* Подсказка шире столбца — у крайних столбцов прижимаем её к краю */}
                <div
                  className={`bg-popover text-popover-foreground ring-foreground/10 pointer-events-none absolute bottom-full z-10 mb-1 hidden rounded-md px-2 py-1 text-xs whitespace-nowrap shadow-md ring-1 group-hover:block ${tooltipPlacement(index, series.length)}`}
                >
                  <div className="text-muted-foreground">{point.label}</div>
                  <div className="font-medium tabular-nums">{formatRub(point.revenueKopecks)}</div>
                  <div className="text-muted-foreground">
                    {point.orders} {ordersWord(point.orders)}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="text-muted-foreground flex gap-0.5 pt-1 text-xs">
            {series.map((point, index) => (
              <div key={point.key} className="min-w-0 flex-1 overflow-visible text-center whitespace-nowrap">
                {index % labelStep === 0 ? point.label : ""}
              </div>
            ))}
          </div>
        </div>
      </div>
      <details className="text-sm">
        <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-xs">
          Показать таблицей
        </summary>
        <table className="mt-2 w-full max-w-md">
          <thead className="text-muted-foreground text-xs">
            <tr>
              <th className="py-1 text-left font-normal">Период</th>
              <th className="py-1 text-right font-normal">Заказов</th>
              <th className="py-1 text-right font-normal">Выручка</th>
            </tr>
          </thead>
          <tbody>
            {series.map((point) => (
              <tr key={point.key} className="border-t">
                <td className="py-1">{point.label}</td>
                <td className="py-1 text-right tabular-nums">{point.orders}</td>
                <td className="py-1 text-right tabular-nums">{formatRub(point.revenueKopecks)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
