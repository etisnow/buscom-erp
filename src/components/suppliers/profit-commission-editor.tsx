"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatRub, rublesToKopecks } from "@/domain/money";
import { profitCommission } from "@/domain/order/margin";
import { parsePercentInput, percentInputValue } from "@/domain/supplier/price-economics";
import { setSupplierProfitCommissionAction } from "@/app/(app)/suppliers/actions";

function parseRubles(value: string): number | null {
  try {
    return rublesToKopecks(value);
  } catch {
    return null;
  }
}

/**
 * «Комиссия с прибыли»: какую долю нашей прибыли по его товарам в заказе
 * удерживает поставщик. Прибыль — продажа минус стоимость для нас (с «Экономикой
 * цены» и расходами на заказ) минус доля скидки на заказ; считает её маржа
 * заказа (`src/domain/order/margin.ts`).
 */
export function ProfitCommissionEditor({
  supplierId,
  initial,
  editable,
}: {
  supplierId: string;
  /** Сотые доли процента; 0 — не удерживает */
  initial: number;
  editable: boolean;
}) {
  const [percent, setPercent] = useState(initial > 0 ? percentInputValue(initial) : "");
  const [sale, setSale] = useState("1000");
  const [cost, setCost] = useState("600");
  const [pending, startTransition] = useTransition();

  // Пустое поле — «не удерживает»
  const hundredths = percent.trim() === "" ? 0 : parsePercentInput(percent);
  const error =
    hundredths === null || hundredths < 0 || hundredths > 10_000 ? "Процент — число от 0 до 100, например 20" : null;
  const dirty = hundredths !== initial;

  const saleKopecks = parseRubles(sale);
  const costKopecks = parseRubles(cost);
  const profit = saleKopecks !== null && costKopecks !== null ? saleKopecks - costKopecks : null;
  const commission = profit !== null && hundredths !== null && !error ? profitCommission(profit, hundredths) : null;

  function save() {
    if (hundredths === null || error) return;
    startTransition(async () => {
      const result = await setSupplierProfitCommissionAction(supplierId, hundredths);
      if (result.ok) toast.success(result.message);
      else toast.error(result.error);
    });
  }

  return (
    <section className="flex flex-col gap-4 rounded-lg border p-4">
      <div>
        <h2 className="font-heading font-medium">Комиссия с прибыли</h2>
        <p className="text-muted-foreground text-sm">
          Какую долю нашей прибыли по его товарам в заказе удерживает поставщик. Прибыль — продажа минус стоимость для
          нас (с «Экономикой цены» и расходами на заказ) и минус доля скидки на заказ; убыток — комиссия 0. Правка
          действует на заказы, где поставщика выберут после сохранения.
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Input
            value={percent}
            onChange={(event) => setPercent(event.target.value)}
            disabled={!editable || pending}
            inputMode="decimal"
            aria-label="Комиссия с прибыли, %"
            className="h-8 w-20 text-right"
          />
          <span className="text-muted-foreground text-sm">% от прибыли</span>
          {hundredths === 0 && !error ? <span className="text-muted-foreground text-xs">— не удерживает</span> : null}
        </div>
        {error ? <p className="text-destructive text-xs">{error}</p> : null}
      </div>

      <div className="bg-muted/40 flex flex-col gap-2 rounded-md p-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <h3 className="font-medium">Проверить:</h3>
          <span className="text-muted-foreground">продажа</span>
          <Input
            value={sale}
            onChange={(event) => setSale(event.target.value)}
            inputMode="decimal"
            aria-label="Продажа для проверки"
            className="h-8 w-28 text-right"
          />
          <span className="text-muted-foreground">₽, стоимость для нас</span>
          <Input
            value={cost}
            onChange={(event) => setCost(event.target.value)}
            inputMode="decimal"
            aria-label="Стоимость для нас для проверки"
            className="h-8 w-28 text-right"
          />
          <span className="text-muted-foreground">₽</span>
        </div>
        {profit !== null && commission !== null ? (
          <table className="w-full max-w-md text-sm">
            <tbody>
              <tr>
                <td className="py-0.5">Прибыль</td>
                <td className="py-0.5 text-right tabular-nums">{formatRub(profit)}</td>
              </tr>
              <tr className="text-muted-foreground">
                <td className="py-0.5">Комиссия поставщику</td>
                <td className="py-0.5 text-right tabular-nums">−{formatRub(commission)}</td>
              </tr>
              <tr className="border-t font-medium">
                <td className="pt-1">Остаётся нам</td>
                <td className="pt-1 text-right tabular-nums">{formatRub(profit - commission)}</td>
              </tr>
            </tbody>
          </table>
        ) : (
          <p className="text-destructive text-xs">Суммы для проверки — в рублях, например 1000</p>
        )}
      </div>

      {editable && dirty ? (
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => setPercent(initial > 0 ? percentInputValue(initial) : "")}
          >
            Отменить правки
          </Button>
          <Button size="sm" disabled={pending || error !== null} onClick={save}>
            Сохранить
          </Button>
        </div>
      ) : null}
    </section>
  );
}
