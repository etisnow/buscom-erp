"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatRub } from "@/domain/money";
import type { ProductSupplierOption } from "@/server/products/search";

const NO_SUPPLIER = "__none__";

type SupplierItem = {
  supplierId: string | null;
  supplierName: string | null;
  purchasePriceKopecks: number | null;
  supplierOptions: ProductSupplierOption[];
};

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
  const price =
    item.purchasePriceKopecks ??
    item.supplierOptions.find((option) => option.id === item.supplierId)?.purchasePriceKopecks ??
    null;

  if (!editable || item.supplierOptions.length === 0) {
    if (!item.supplierId) return <span className="text-muted-foreground">—</span>;
    return (
      <span className="flex flex-col text-sm">
        <span>{item.supplierName}</span>
        {price !== null ? <span className="text-muted-foreground text-xs">закупка {formatRub(price)}</span> : null}
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
          {item.supplierOptions.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.name} · {formatRub(option.purchasePriceKopecks)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {price !== null ? <span className="text-muted-foreground text-xs">закупка {formatRub(price)}</span> : null}
    </div>
  );
}
