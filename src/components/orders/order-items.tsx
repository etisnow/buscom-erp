"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ProductPicker } from "@/components/orders/product-picker";
import { ItemSupplierCell } from "@/components/orders/item-supplier";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatRub, rublesToKopecks } from "@/domain/money";
import { DEFAULT_DISCOUNT_LIMIT_PERCENT, maxDiscountKopecks } from "@/domain/order/discount";
import { calculateOrderTotals } from "@/domain/order/totals";
import { describeOptions, type OrderItemOption } from "@/domain/product/options";
import { updateItemsAction } from "@/app/(app)/orders/[number]/actions";
import type { ProductSupplierOption } from "@/server/products/search";

export type ItemRow = {
  productId: string | null;
  sku: string;
  name: string;
  priceKopecks: number;
  quantity: number;
  discountKopecks: number;
  supplierId: string | null;
  /** Имя поставщика позиции — для показа, даже если товар у него уже не числится */
  supplierName: string | null;
  /** Снимок закупочной цены; у несохранённой позиции его ещё нет */
  purchasePriceKopecks: number | null;
  /** Из кого выбирать: поставщики товара по каталогу */
  supplierOptions: ProductSupplierOption[];
  /** Выбранные варианты опций и их снимок — для показа под названием */
  optionValueIds: string[];
  options: OrderItemOption[];
};

/** Рубли в поле ввода: показываем с копейками, обратно переводим через rublesToKopecks. */
function toRubles(kopecks: number): string {
  return (kopecks / 100).toFixed(2);
}

function parseRubles(value: string): number | null {
  try {
    return rublesToKopecks(value === "" ? "0" : value);
  } catch {
    return null;
  }
}

export function OrderItems({
  orderId,
  orderNumber,
  initialItems,
  initialDiscountKopecks,
  deliveryPriceKopecks,
  editable,
}: {
  orderId: string;
  orderNumber: number;
  initialItems: ItemRow[];
  initialDiscountKopecks: number;
  deliveryPriceKopecks: number;
  editable: boolean;
}) {
  const [items, setItems] = useState<ItemRow[]>(initialItems);
  const [discount, setDiscount] = useState(toRubles(initialDiscountKopecks));
  const [pending, startTransition] = useTransition();

  const discountKopecks = parseRubles(discount) ?? 0;
  // Итоги считаем и на клиенте — только чтобы показать сумму до сохранения.
  // Настоящий итог придёт с сервера после записи.
  const preview = safeTotals(items, discountKopecks, deliveryPriceKopecks);
  const grossKopecks = items.reduce((sum, item) => sum + item.priceKopecks * item.quantity, 0);
  const itemsDiscount = items.reduce((sum, item) => sum + item.discountKopecks, 0);
  const limit = maxDiscountKopecks(grossKopecks);
  const overLimit = itemsDiscount + discountKopecks > limit;
  const dirty = editable && hasChanges(items, discountKopecks, initialItems, initialDiscountKopecks);

  function update(index: number, patch: Partial<ItemRow>) {
    setItems((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function save() {
    startTransition(async () => {
      const result = await updateItemsAction({
        orderId,
        orderNumber,
        discountKopecks,
        items: items.map((item) => ({
          productId: item.productId,
          sku: item.sku,
          name: item.name,
          priceKopecks: item.priceKopecks,
          quantity: item.quantity,
          discountKopecks: item.discountKopecks,
          supplierId: item.supplierId,
          optionValueIds: item.optionValueIds,
        })),
      });
      if (result.ok) toast.success("Состав заказа сохранён");
      else toast.error(result.error);
    });
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-heading font-medium">Позиции</h2>
        {editable ? (
          <ProductPicker
            onPick={(product, selection) =>
              setItems((current) => [
                ...current,
                {
                  productId: product.id,
                  sku: product.sku,
                  name: product.name,
                  priceKopecks: selection?.priceKopecks ?? product.priceKopecks,
                  quantity: 1,
                  discountKopecks: 0,
                  // Самый дешёвый поставщик — первым в списке, его и подставляем.
                  supplierId: product.suppliers[0]?.id ?? null,
                  supplierName: product.suppliers[0]?.name ?? null,
                  purchasePriceKopecks: null,
                  supplierOptions: product.suppliers,
                  optionValueIds: selection?.optionValueIds ?? [],
                  options: selection?.options ?? [],
                },
              ])
            }
            onCustom={() =>
              setItems((current) => [
                ...current,
                {
                  productId: null,
                  sku: "",
                  name: "",
                  priceKopecks: 0,
                  quantity: 1,
                  discountKopecks: 0,
                  supplierId: null,
                  supplierName: null,
                  purchasePriceKopecks: null,
                  supplierOptions: [],
                  optionValueIds: [],
                  options: [],
                },
              ])
            }
          />
        ) : null}
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-32">Артикул</TableHead>
              <TableHead>Название</TableHead>
              <TableHead className="w-44">Поставщик</TableHead>
              <TableHead className="w-28 text-right">Цена, ₽</TableHead>
              <TableHead className="w-20 text-right">Кол-во</TableHead>
              <TableHead className="w-28 text-right">Скидка, ₽</TableHead>
              <TableHead className="w-28 text-right">Сумма</TableHead>
              {editable ? <TableHead className="w-10" /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item, index) => (
              <TableRow key={`${item.productId ?? "custom"}-${index}`}>
                <TableCell>
                  {editable ? (
                    <Input
                      value={item.sku}
                      onChange={(event) => update(index, { sku: event.target.value })}
                      className="h-8"
                    />
                  ) : (
                    item.sku
                  )}
                </TableCell>
                <TableCell>
                  {editable ? (
                    <Input
                      value={item.name}
                      onChange={(event) => update(index, { name: event.target.value })}
                      className="h-8"
                    />
                  ) : (
                    item.name
                  )}
                  {item.options.length > 0 ? (
                    <p className="text-muted-foreground mt-1 text-xs">{describeOptions(item.options)}</p>
                  ) : null}
                </TableCell>
                <TableCell>
                  <ItemSupplierCell
                    item={item}
                    editable={editable}
                    onChange={(supplierId, supplierName) =>
                      // Снимок закупки относится к прежнему поставщику — до сохранения показываем прайс.
                      update(index, { supplierId, supplierName, purchasePriceKopecks: null })
                    }
                  />
                </TableCell>
                <TableCell className="text-right">
                  {editable ? (
                    <Input
                      inputMode="decimal"
                      value={toRubles(item.priceKopecks)}
                      onChange={(event) => {
                        const kopecks = parseRubles(event.target.value);
                        if (kopecks !== null) update(index, { priceKopecks: kopecks });
                      }}
                      className="h-8 text-right"
                    />
                  ) : (
                    formatRub(item.priceKopecks)
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {editable ? (
                    <Input
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={(event) => update(index, { quantity: Math.max(1, Number(event.target.value) || 1) })}
                      className="h-8 text-right"
                    />
                  ) : (
                    item.quantity
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {editable ? (
                    <Input
                      inputMode="decimal"
                      value={toRubles(item.discountKopecks)}
                      onChange={(event) => {
                        const kopecks = parseRubles(event.target.value);
                        if (kopecks !== null) update(index, { discountKopecks: kopecks });
                      }}
                      className="h-8 text-right"
                    />
                  ) : (
                    formatRub(item.discountKopecks)
                  )}
                </TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  {formatRub(item.priceKopecks * item.quantity - item.discountKopecks)}
                </TableCell>
                {editable ? (
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      aria-label="Удалить позицию"
                      onClick={() => setItems((current) => current.filter((_, i) => i !== index))}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col items-end gap-2 border-t pt-3">
        <div className="flex items-center gap-3">
          <Label htmlFor="order-discount" className="text-sm font-normal">
            Скидка на заказ, ₽
          </Label>
          {editable ? (
            <Input
              id="order-discount"
              inputMode="decimal"
              value={discount}
              onChange={(event) => setDiscount(event.target.value)}
              className="h-8 w-32 text-right"
            />
          ) : (
            <span className="text-sm">{formatRub(initialDiscountKopecks)}</span>
          )}
        </div>

        <dl className="grid grid-cols-[auto_auto] gap-x-6 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Товары</dt>
          <dd className="text-right">{formatRub(preview.itemsTotalKopecks)}</dd>
          <dt className="text-muted-foreground">Доставка</dt>
          <dd className="text-right">{formatRub(deliveryPriceKopecks)}</dd>
          <dt className="text-muted-foreground">Скидка на заказ</dt>
          <dd className="text-right">−{formatRub(discountKopecks)}</dd>
          <dt className="font-medium">Итого</dt>
          <dd className="text-right font-medium">{formatRub(preview.totalKopecks)}</dd>
        </dl>

        {overLimit ? (
          <p className="text-destructive text-sm">
            Скидка превышает лимит {DEFAULT_DISCOUNT_LIMIT_PERCENT}% ({formatRub(limit)}) — сохранить сможет только
            руководитель.
          </p>
        ) : null}

        {editable ? (
          <div className="flex gap-2">
            {dirty ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => {
                  setItems(initialItems);
                  setDiscount(toRubles(initialDiscountKopecks));
                }}
              >
                Отменить правки
              </Button>
            ) : null}
            <Button size="sm" disabled={pending || !dirty || items.length === 0} onClick={save}>
              <Plus />
              Сохранить состав
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** Предпросмотр итогов не должен падать из-за промежуточного ввода (скидка больше суммы). */
function safeTotals(items: ItemRow[], discountKopecks: number, deliveryPriceKopecks: number) {
  try {
    return calculateOrderTotals({ items, discountKopecks, deliveryPriceKopecks });
  } catch {
    const itemsTotalKopecks = items.reduce(
      (sum, item) => sum + Math.max(0, item.priceKopecks * item.quantity - item.discountKopecks),
      0,
    );
    return {
      itemsTotalKopecks,
      totalKopecks: Math.max(0, itemsTotalKopecks - discountKopecks) + deliveryPriceKopecks,
    };
  }
}

function hasChanges(
  items: ItemRow[],
  discountKopecks: number,
  initialItems: ItemRow[],
  initialDiscountKopecks: number,
): boolean {
  if (discountKopecks !== initialDiscountKopecks) return true;
  if (items.length !== initialItems.length) return true;
  return items.some((item, index) => {
    const initial = initialItems[index];
    if (!initial) return true;
    return (
      item.sku !== initial.sku ||
      item.name !== initial.name ||
      item.priceKopecks !== initial.priceKopecks ||
      item.quantity !== initial.quantity ||
      item.discountKopecks !== initial.discountKopecks ||
      item.supplierId !== initial.supplierId ||
      item.optionValueIds.join() !== initial.optionValueIds.join()
    );
  });
}
