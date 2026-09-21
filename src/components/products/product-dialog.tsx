"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { rublesToKopecks } from "@/domain/money";
import {
  ProductOptionsEditor,
  toOptionDrafts,
  toOptionForms,
  type OptionGroupForm,
} from "@/components/products/product-options-editor";
import type { ProductRow } from "@/server/products/list";
import type { SupplierOption } from "@/server/suppliers/list";
import { createProductAction, updateProductAction } from "@/app/(app)/products/actions";

/** Поставщик товара в форме: закупочная цена — строкой, как её вводят. */
type SupplierDraft = { supplierId: string; price: string };

/** Заведение и правка товара. `product` не задан — создаём новый. */
export function ProductDialog({
  product,
  suppliers,
  open,
  onOpenChange,
}: {
  product?: ProductRow;
  suppliers: SupplierOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [sku, setSku] = useState(product?.sku ?? "");
  const [name, setName] = useState(product?.name ?? "");
  const [category, setCategory] = useState(product?.category ?? "");
  const [price, setPrice] = useState(((product?.priceKopecks ?? 0) / 100).toFixed(2));
  // Совместимые модели вводятся через запятую — так быстрее, чем тегами.
  const [compatibility, setCompatibility] = useState((product?.compatibility ?? []).join(", "));
  const [links, setLinks] = useState<SupplierDraft[]>(
    (product?.suppliers ?? []).map((link) => ({
      supplierId: link.supplierId,
      price: (link.purchasePriceKopecks / 100).toFixed(2),
    })),
  );
  const [optionGroups, setOptionGroups] = useState<OptionGroupForm[]>(toOptionForms(product?.options ?? []));
  const [pending, startTransition] = useTransition();

  function submit() {
    let priceKopecks: number;
    try {
      priceKopecks = rublesToKopecks(price === "" ? "0" : price);
    } catch {
      toast.error("Некорректная цена");
      return;
    }

    const supplierLinks: { supplierId: string; purchasePriceKopecks: number }[] = [];
    for (const link of links) {
      if (!link.supplierId) {
        toast.error("Выберите поставщика в каждой строке или уберите пустую");
        return;
      }
      try {
        supplierLinks.push({
          supplierId: link.supplierId,
          purchasePriceKopecks: rublesToKopecks(link.price === "" ? "0" : link.price),
        });
      } catch {
        toast.error("Некорректная закупочная цена");
        return;
      }
    }

    let options;
    try {
      options = toOptionDrafts(optionGroups);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Некорректные опции");
      return;
    }

    const payload = {
      sku,
      name,
      category,
      priceKopecks,
      compatibility: compatibility
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      suppliers: supplierLinks,
      options,
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
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
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
        </div>

        <div className="flex flex-col gap-2 border-t pt-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">Поставщики</span>
            <Button
              variant="outline"
              size="sm"
              // Каждого поставщика — один раз: свободных не осталось, добавлять некого.
              disabled={links.length >= suppliers.length}
              onClick={() => setLinks((current) => [...current, { supplierId: "", price: "0.00" }])}
            >
              <Plus />
              Добавить поставщика
            </Button>
          </div>

          {suppliers.length === 0 ? (
            <p className="text-muted-foreground text-xs">Поставщиков пока нет — их заводят в разделе «Поставщики».</p>
          ) : links.length === 0 ? (
            <p className="text-muted-foreground text-xs">
              Поставщик выбирается в позиции заказа, и по его цепочке статусов идёт работа с заказом.
            </p>
          ) : null}

          {links.map((link, index) => (
            // Строки без своего id: порядок не меняется, удаление сдвигает хвост целиком.
            <div key={index} className="flex items-end gap-2">
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Label className="text-xs">Поставщик</Label>
                <Select
                  value={link.supplierId}
                  onValueChange={(supplierId) =>
                    setLinks((current) => current.map((row, i) => (i === index ? { ...row, supplierId } : row)))
                  }
                >
                  <SelectTrigger size="sm" className="w-full">
                    <SelectValue placeholder="Выберите" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers
                      .filter(
                        (option) => option.id === link.supplierId || !links.some((row) => row.supplierId === option.id),
                      )
                      .map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex w-32 flex-col gap-1.5">
                <Label className="text-xs">Закупка, ₽</Label>
                <Input
                  inputMode="decimal"
                  value={link.price}
                  onChange={(event) =>
                    setLinks((current) =>
                      current.map((row, i) => (i === index ? { ...row, price: event.target.value } : row)),
                    )
                  }
                  className="h-8 text-right"
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label="Убрать поставщика"
                onClick={() => setLinks((current) => current.filter((_, i) => i !== index))}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2 border-t pt-3">
          <span className="text-sm font-medium">Опции</span>
          <ProductOptionsEditor groups={optionGroups} onChange={setOptionGroups} />
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
