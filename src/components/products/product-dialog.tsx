"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { rublesToKopecks } from "@/domain/money";
import type { ProductRow } from "@/server/products/list";
import { createProductAction, updateProductAction } from "@/app/(app)/products/actions";

/** Заведение и правка товара. `product` не задан — создаём новый. */
export function ProductDialog({
  product,
  open,
  onOpenChange,
}: {
  product?: ProductRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [sku, setSku] = useState(product?.sku ?? "");
  const [name, setName] = useState(product?.name ?? "");
  const [category, setCategory] = useState(product?.category ?? "");
  const [price, setPrice] = useState(((product?.priceKopecks ?? 0) / 100).toFixed(2));
  const [stock, setStock] = useState(String(product?.stock ?? 0));
  const [madeToOrder, setMadeToOrder] = useState(product?.madeToOrder ?? false);
  const [leadTimeDays, setLeadTimeDays] = useState(product?.leadTimeDays?.toString() ?? "");
  // Совместимые модели вводятся через запятую — так быстрее, чем тегами.
  const [compatibility, setCompatibility] = useState((product?.compatibility ?? []).join(", "));
  const [pending, startTransition] = useTransition();

  function submit() {
    let priceKopecks: number;
    try {
      priceKopecks = rublesToKopecks(price === "" ? "0" : price);
    } catch {
      toast.error("Некорректная цена");
      return;
    }

    const payload = {
      sku,
      name,
      category,
      priceKopecks,
      madeToOrder,
      leadTimeDays: leadTimeDays.trim() === "" ? null : Number(leadTimeDays),
      compatibility: compatibility
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      ...(product ? {} : { stock: Number(stock) }),
    };

    startTransition(async () => {
      const result = product ? await updateProductAction(product.id, payload) : await createProductAction(payload);
      if (result.ok) {
        toast.success(result.message);
        onOpenChange(false);
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{product ? "Товар" : "Новый товар"}</DialogTitle>
          <DialogDescription>
            Позиции уже оформленных заказов не изменятся: они хранят снимок названия и цены.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs" htmlFor="product-sku">
              Артикул
            </Label>
            <Input id="product-sku" value={sku} onChange={(event) => setSku(event.target.value)} className="h-8" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs" htmlFor="product-category">
              Категория
            </Label>
            <Input
              id="product-category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="h-8"
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label className="text-xs" htmlFor="product-name">
              Название
            </Label>
            <Input id="product-name" value={name} onChange={(event) => setName(event.target.value)} className="h-8" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs" htmlFor="product-price">
              Цена, ₽
            </Label>
            <Input
              id="product-price"
              inputMode="decimal"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              className="h-8 text-right"
            />
          </div>
          {product ? null : (
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs" htmlFor="product-stock">
                Начальный остаток
              </Label>
              <Input
                id="product-stock"
                type="number"
                min={0}
                value={stock}
                onChange={(event) => setStock(event.target.value)}
                className="h-8 text-right"
              />
            </div>
          )}
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label className="text-xs" htmlFor="product-compat">
              Совместимость (через запятую)
            </Label>
            <Input
              id="product-compat"
              value={compatibility}
              onChange={(event) => setCompatibility(event.target.value)}
              placeholder="ГАЗель Next, Ford Transit"
              className="h-8"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              id="product-made-to-order"
              type="checkbox"
              checked={madeToOrder}
              onChange={(event) => setMadeToOrder(event.target.checked)}
              className="size-4"
            />
            <Label className="text-sm font-normal" htmlFor="product-made-to-order">
              Изготавливается под заказ
            </Label>
          </div>
          {madeToOrder ? (
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs" htmlFor="product-lead">
                Срок изготовления, дней
              </Label>
              <Input
                id="product-lead"
                type="number"
                min={1}
                value={leadTimeDays}
                onChange={(event) => setLeadTimeDays(event.target.value)}
                className="h-8 text-right"
              />
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Отмена
          </Button>
          <Button disabled={pending || !sku.trim() || !name.trim()} onClick={submit}>
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
