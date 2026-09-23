"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatRub } from "@/domain/money";
import { purchaseWithOptions } from "@/domain/product/option-matching";
import { calculateUnitCost } from "@/domain/supplier/price-economics";
import type { ProductSupplierOption } from "@/server/products/search";

const NO_SUPPLIER = "__none__";

type SupplierItem = {
  supplierId: string | null;
  supplierName: string | null;
  purchasePriceKopecks: number | null;
  purchaseCostKopecks: number | null;
  supplierOptions: ProductSupplierOption[];
  /** Выбранные варианты опций: у них бывает своя закупка у поставщика */
  optionValueIds: string[];
};

/** Закупка и стоимость для нас по поставщику с учётом выбранных вариантов опций. */
function optionAware(option: ProductSupplierOption, optionValueIds: string[]): { price: number; cost: number } {
  const price = purchaseWithOptions(option.purchasePriceKopecks, option.optionPrices, optionValueIds);
  return { price, cost: calculateUnitCost(price, option.priceFormula).costKopecks };
}

/** «закупка 300 ₽ · для нас 324,45 ₽»; без надбавок — только закупка. */
function PurchaseLine({ price, cost }: { price: number | null; cost: number | null }) {
  if (price === null) return null;
  return (
    <span className="text-muted-foreground text-xs">
      закупка {formatRub(price)}
      {cost !== null && cost !== price ? <> · для нас {formatRub(cost)}</> : null}
    </span>
  );
}

/**
 * Поставщик позиции заказа. Выбор — только из поставщиков товара в каталоге:
 * закупочную цену сервер берёт из этой привязки. У произвольной позиции
 * поставщика нет.
 */
export function ItemSupplierCell({
  item,
  editable,
  onChange,
}: {
  item: SupplierItem;
  editable: boolean;
  onChange: (supplierId: string | null, supplierName: string | null) => void;
}) {
  // Снимок в заказе важнее текущего прайса; у новой позиции снимка ещё нет — показываем прайс.
  const option = item.supplierOptions.find((row) => row.id === item.supplierId);
  const current = option ? optionAware(option, item.optionValueIds) : null;
  const price = item.purchasePriceKopecks ?? current?.price ?? null;
  const cost = item.purchasePriceKopecks !== null ? item.purchaseCostKopecks : (current?.cost ?? null);

  if (!editable || item.supplierOptions.length === 0) {
    if (!item.supplierId) return <span className="text-muted-foreground">—</span>;
    return (
      <span className="flex flex-col text-sm">
        <span>{item.supplierName}</span>
        <PurchaseLine price={price} cost={cost} />
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      <Select
        value={item.supplierId ?? NO_SUPPLIER}
        onValueChange={(value) => {
          const option = item.supplierOptions.find((row) => row.id === value);
          onChange(option?.id ?? null, option?.name ?? null);
        }}
      >
        <SelectTrigger size="sm" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_SUPPLIER}>без поставщика</SelectItem>
          {item.supplierOptions.map((option) => {
            const { price: optionPrice, cost: optionCost } = optionAware(option, item.optionValueIds);
            return (
              <SelectItem key={option.id} value={option.id}>
                {option.name} · {formatRub(optionPrice)}
                {optionCost !== optionPrice ? ` → ${formatRub(optionCost)}` : ""}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
      <PurchaseLine price={price} cost={cost} />
    </div>
  );
}
