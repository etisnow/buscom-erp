"use client";

import { useState, useTransition } from "react";
import { ExternalLink, Plus, RefreshCw, Trash2 } from "lucide-react";
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
import { CategorySelect } from "@/components/products/category-select";
import { ProductImageEditor } from "@/components/products/product-image";
import {
  ProductOptionsEditor,
  toOptionDrafts,
  toOptionForms,
  type OptionGroupForm,
} from "@/components/products/product-options-editor";
import type { ProductRow } from "@/server/products/list";
import type { CategoryRow } from "@/server/products/categories";
import type { SupplierOption } from "@/server/suppliers/list";
import { createProductAction, fetchSupplierPriceAction, updateProductAction } from "@/app/(app)/products/actions";

/** Поставщик товара в форме: закупочная цена — строкой, как её вводят. */
type SupplierDraft = { supplierId: string; price: string; url: string };

/** Заведение и правка товара. `product` не задан — создаём новый. */
export function ProductDialog({
  product,
  suppliers,
  categories,
  open,
  onOpenChange,
}: {
  product?: ProductRow;
  suppliers: SupplierOption[];
  categories: CategoryRow[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [sku, setSku] = useState(product?.sku ?? "");
  const [name, setName] = useState(product?.name ?? "");
  const [categoryId, setCategoryId] = useState<string | null>(product?.categoryId ?? null);
  const [price, setPrice] = useState(((product?.priceKopecks ?? 0) / 100).toFixed(2));
  // Совместимые модели вводятся через запятую — так быстрее, чем тегами.
  const [compatibility, setCompatibility] = useState((product?.compatibility ?? []).join(", "));
  const [links, setLinks] = useState<SupplierDraft[]>(
    (product?.suppliers ?? []).map((link) => ({
      supplierId: link.supplierId,
      price: (link.purchasePriceKopecks / 100).toFixed(2),
      url: link.url ?? "",
    })),
  );
  const [optionGroups, setOptionGroups] = useState<OptionGroupForm[]>(toOptionForms(product?.options ?? []));
  const [pending, startTransition] = useTransition();
  /** Индекс строки, для которой сейчас тянется цена; null — ничего не тянется. */
  const [fetching, setFetching] = useState<number | null>(null);

  /**
   * Подставляет закупочную цену со страницы поставщика. Значение только
   * попадает в поле — сохранит его человек кнопкой «Сохранить».
   */
  async function pullPrice(index: number): Promise<void> {
    const url = links[index]?.url.trim();
    if (!url) return;

    setFetching(index);
    try {
      const result = await fetchSupplierPriceAction(url);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const price = (result.priceKopecks / 100).toFixed(2);
      setLinks((current) => current.map((row, i) => (i === index ? { ...row, price } : row)));
      toast.success(`Цена подтянута: ${price} ₽`);
    } finally {
      setFetching(null);
    }
  }

  function submit() {
    let priceKopecks: number;
    try {
      priceKopecks = rublesToKopecks(price === "" ? "0" : price);
    } catch {
      toast.error("Некорректная цена");
      return;
    }

    const supplierLinks: { supplierId: string; purchasePriceKopecks: number; url: string }[] = [];
    for (const link of links) {
      if (!link.supplierId) {
        toast.error("Выберите поставщика в каждой строке или уберите пустую");
        return;
      }
      try {
        supplierLinks.push({
          supplierId: link.supplierId,
          url: link.url.trim(),
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
      categoryId,
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
      {/* minmax(0,1fr): иначе колонка сетки растягивается под длинное имя поставщика и контент вылезает за окно */}
      <DialogContent className="max-h-[90vh] grid-cols-[minmax(0,1fr)] overflow-x-hidden overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{product ? "Товар" : "Новый товар"}</DialogTitle>
          <DialogDescription>
            Позиции уже оформленных заказов не изменятся: они хранят снимок названия и цены.
          </DialogDescription>
        </DialogHeader>

        {product ? (
          <ProductImageEditor productId={product.id} imageId={product.images[0]?.id ?? null} name={product.name} />
        ) : (
          <p className="text-muted-foreground text-xs">Картинку можно будет добавить после сохранения товара.</p>
        )}

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
            <CategorySelect
              id="product-category"
              categories={categories}
              value={categoryId}
              onChange={setCategoryId}
              emptyLabel="Без категории"
              className="w-full"
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
              onClick={() => setLinks((current) => [...current, { supplierId: "", price: "0.00", url: "" }])}
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
            <div key={index} className="flex flex-col gap-2 rounded-md border p-2">
              <div className="flex items-end gap-2">
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
                          (option) =>
                            option.id === link.supplierId || !links.some((row) => row.supplierId === option.id),
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
                  variant="destructive"
                  size="icon"
                  className="size-8"
                  aria-label="Убрать поставщика"
                  onClick={() => setLinks((current) => current.filter((_, i) => i !== index))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>

              <div className="flex min-w-0 flex-col gap-1.5">
                <Label className="text-xs">Ссылка на товар у поставщика</Label>
                <div className="flex min-w-0 items-center gap-2">
                  <Input
                    type="url"
                    inputMode="url"
                    placeholder="https://"
                    value={link.url}
                    onChange={(event) =>
                      setLinks((current) =>
                        current.map((row, i) => (i === index ? { ...row, url: event.target.value } : row)),
                      )
                    }
                    className="h-8 min-w-0"
                  />
                  {/* Открывается в новой вкладке: карточка товара при этом не теряется */}
                  {link.url.trim() ? (
                    <Button variant="ghost" size="icon" className="size-8 shrink-0" asChild>
                      <a href={link.url} target="_blank" rel="noopener noreferrer" aria-label="Открыть у поставщика">
                        <ExternalLink className="size-4" />
                      </a>
                    </Button>
                  ) : null}
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 shrink-0"
                    disabled={fetching !== null || !link.url.trim()}
                    onClick={() => pullPrice(index)}
                  >
                    <RefreshCw className={fetching === index ? "animate-spin" : undefined} />
                    Подтянуть цену
                  </Button>
                </div>
              </div>
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
