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
import { formatRub, rublesToKopecks } from "@/domain/money";
import {
  availableValues,
  checkSelection,
  describeSelection,
  type VariantOption,
  type VariantSelection,
} from "@/domain/product/vanproject";
import { calculateUnitCost } from "@/domain/supplier/price-economics";
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
import {
  EMPTY_OPTION_PRICE,
  SupplierOptionPrices,
  type OptionPriceDraft,
} from "@/components/products/supplier-option-prices";
import { matchOptionValue } from "@/domain/product/option-matching";
import {
  createProductAction,
  fetchSupplierCombosAction,
  fetchSupplierPriceAction,
  updateProductAction,
} from "@/app/(app)/products/actions";

/**
 * Поставщик товара в форме: закупочная цена — строкой, как её вводят.
 * `variant` — выбранные варианты товара на странице поставщика, `variantOptions` —
 * списки вариантов, пришедшие с последним «Подтянуть цену» (до него — неизвестны).
 */
type SupplierDraft = {
  supplierId: string;
  price: string;
  url: string;
  variant: VariantSelection;
  variantOptions: VariantOption[] | null;
  /** Закупка вариантов опций у этого поставщика — по `key` варианта в форме опций */
  optionPrices: Record<string, OptionPriceDraft>;
};

/** Выбор вариантов из базы: JSON с парами строк, остальное отбрасываем. */
function toSelection(value: unknown): VariantSelection {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

/** После смены значения в одном списке выкидываем из других то, что к нему больше не подходит. */
function withChoice(
  options: VariantOption[],
  selection: VariantSelection,
  key: string,
  value: string,
): VariantSelection {
  const next: VariantSelection = { ...selection, [key]: value };
  for (const option of options) {
    const current = next[option.key];
    if (option.key !== key && current && !availableValues(option, next).includes(current)) delete next[option.key];
  }
  return next;
}

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
      variant: toSelection(link.variant),
      variantOptions: null,
      // У сохранённых вариантов опций ключ в форме — их id (toOptionForms)
      optionPrices: Object.fromEntries(
        link.optionPrices.map((row) => [
          row.optionValueId,
          {
            ...EMPTY_OPTION_PRICE,
            price: (row.purchasePriceKopecks / 100).toFixed(2),
            variant: row.variant ? toSelection(row.variant) : null,
          },
        ]),
      ),
    })),
  );
  const [optionGroups, setOptionGroups] = useState<OptionGroupForm[]>(toOptionForms(product?.options ?? []));
  const [pending, startTransition] = useTransition();

  /** Индекс строки, для которой сейчас тянется цена; null — ничего не тянется. */
  const [fetching, setFetching] = useState<number | null>(null);

  /** «Для нас» рядом с закупкой — только если «Экономика цены» поставщика её меняет. */
  function costHint(supplierId: string, priceInput: string): string | null {
    const supplier = suppliers.find((option) => option.id === supplierId);
    if (!supplier) return null;
    let nominal: number;
    try {
      nominal = rublesToKopecks(priceInput);
    } catch {
      return null;
    }
    if (nominal < 0) return null;
    const cost = calculateUnitCost(nominal, supplier.priceFormula).costKopecks;
    return cost === nominal ? null : formatRub(cost);
  }
  /**
   * Подставляет закупочную цену со страницы поставщика. Значение только
   * попадает в поле — сохранит его человек кнопкой «Сохранить».
   */
  async function pullPrice(index: number, selection?: VariantSelection): Promise<void> {
    const link = links[index];
    const url = link?.url.trim();
    if (!link || !url) return;

    setFetching(index);
    try {
      const result = await fetchSupplierPriceAction(url, selection ?? link.variant);
      // Списки вариантов показываем, даже если цены ещё нет: выбирать из них и надо
      if (result.variants) {
        const { options, selection: known } = result.variants;
        setLinks((current) =>
          current.map((row, i) => (i === index ? { ...row, variantOptions: options, variant: known } : row)),
        );
      }
      if (!result.ok) {
        if (result.variants) toast.info(result.error);
        else toast.error(result.error);
        return;
      }
      const price = (result.priceKopecks / 100).toFixed(2);
      setLinks((current) => current.map((row, i) => (i === index ? { ...row, price } : row)));
      const variant = result.variants ? describeSelection(result.variants.options, result.variants.selection) : "";
      toast.success(variant ? `Цена подтянута: ${price} ₽ — ${variant}` : `Цена подтянута: ${price} ₽`);
    } finally {
      setFetching(null);
    }
  }

  /**
   * «Подтянуть цены опций»: все варианты со страницы поставщика с ценами, и для
   * каждого нашего варианта опции — однозначное совпадение сразу в цену,
   * неоднозначное — кандидаты на выбор. Ничего не сохраняет.
   */
  async function pullOptionPrices(index: number): Promise<void> {
    const url = links[index]?.url.trim();
    if (!url) return;

    setFetching(index);
    try {
      const result = await fetchSupplierCombosAction(url);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const priced = result.combos.filter((combo) => combo.priceKopecks !== null);
      const counts = { auto: 0, choose: 0, none: 0 };
      const next: Record<string, OptionPriceDraft> = { ...links[index]!.optionPrices };
      for (const value of optionGroups.flatMap((group) => group.values)) {
        const previous = next[value.key] ?? EMPTY_OPTION_PRICE;
        const match = matchOptionValue(value.name, priced);
        if (match.kind === "unique") {
          counts.auto++;
          next[value.key] = {
            price: (match.combo.priceKopecks! / 100).toFixed(2),
            variant: match.combo.selection,
            candidates: null,
            status: "auto",
          };
        } else if (match.kind === "ambiguous") {
          // Прежний выбор среди кандидатов — оставляем и обновляем цену
          const kept = match.candidates.find(
            (combo) => JSON.stringify(combo.selection) === JSON.stringify(previous.variant),
          );
          if (!kept) counts.choose++;
          next[value.key] = {
            price: kept ? (kept.priceKopecks! / 100).toFixed(2) : previous.price,
            variant: kept ? kept.selection : null,
            candidates: match.candidates,
            status: kept ? null : "choose",
          };
        } else {
          counts.none++;
          next[value.key] = { ...previous, candidates: null, status: "none" };
        }
      }
      setLinks((current) => current.map((row, i) => (i === index ? { ...row, optionPrices: next } : row)));
      const parts = [`подобрано: ${counts.auto}`];
      if (counts.choose) parts.push(`выбрать вручную: ${counts.choose}`);
      if (counts.none) parts.push(`не найдено: ${counts.none}`);
      toast.success(`Цены опций: ${parts.join(", ")}`);
    } finally {
      setFetching(null);
    }
  }

  /** Выбор в списке вариантов; выбрано всё — сразу спрашиваем цену этого варианта. */
  function chooseVariant(index: number, key: string, value: string) {
    const link = links[index];
    if (!link?.variantOptions) return;
    const selection = withChoice(link.variantOptions, link.variant, key, value);
    setLinks((current) => current.map((row, i) => (i === index ? { ...row, variant: selection } : row)));
    if (checkSelection(link.variantOptions, selection).ok) void pullPrice(index, selection);
  }

  function submit() {
    let priceKopecks: number;
    try {
      priceKopecks = rublesToKopecks(price === "" ? "0" : price);
    } catch {
      toast.error("Некорректная цена");
      return;
    }

    const supplierLinks: {
      supplierId: string;
      purchasePriceKopecks: number;
      url: string;
      variant: VariantSelection | null;
      optionPrices: { group: string; value: string; purchasePriceKopecks: number; variant: VariantSelection | null }[];
    }[] = [];
    for (const link of links) {
      if (!link.supplierId) {
        toast.error("Выберите поставщика в каждой строке или уберите пустую");
        return;
      }
      try {
        supplierLinks.push({
          supplierId: link.supplierId,
          url: link.url.trim(),
          variant: Object.keys(link.variant).length > 0 ? link.variant : null,
          purchasePriceKopecks: rublesToKopecks(link.price === "" ? "0" : link.price),
          // Пустая закупка у варианта — «не задана», а не ноль
          optionPrices: optionGroups.flatMap((group) =>
            group.values.flatMap((value) => {
              const draft = link.optionPrices[value.key];
              if (!draft || draft.price.trim() === "") return [];
              return [
                {
                  group: group.name,
                  value: value.name,
                  purchasePriceKopecks: rublesToKopecks(draft.price.trim()),
                  variant: draft.variant,
                },
              ];
            }),
          ),
        });
      } catch {
        toast.error("Некорректная закупочная цена — у поставщика или у одной из опций");
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
              onClick={() =>
                setLinks((current) => [
                  ...current,
                  { supplierId: "", price: "0.00", url: "", variant: {}, variantOptions: null, optionPrices: {} },
                ])
              }
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
                {costHint(link.supplierId, link.price) ? (
                  <span
                    className="text-muted-foreground w-24 pb-2 text-right text-xs"
                    title="С учётом «Экономики цены» поставщика"
                  >
                    для нас {costHint(link.supplierId, link.price)}
                  </span>
                ) : null}
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
                        // Другая страница — другие варианты: прежний выбор к ней не относится
                        current.map((row, i) =>
                          i === index ? { ...row, url: event.target.value, variant: {}, variantOptions: null } : row,
                        ),
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
                  {optionGroups.some((group) => group.values.length > 0) ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 shrink-0"
                      disabled={fetching !== null || !link.url.trim()}
                      onClick={() => pullOptionPrices(index)}
                    >
                      <RefreshCw className={fetching === index ? "animate-spin" : undefined} />
                      Подтянуть цены опций
                    </Button>
                  ) : null}
                </div>
              </div>

              <SupplierOptionPrices
                groups={optionGroups}
                prices={link.optionPrices}
                disabled={fetching !== null}
                onChange={(valueKey, draft) =>
                  setLinks((current) =>
                    current.map((row, i) =>
                      i === index ? { ...row, optionPrices: { ...row.optionPrices, [valueKey]: draft } } : row,
                    ),
                  )
                }
              />

              {link.variantOptions ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {link.variantOptions.map((option) => (
                    <div key={option.key} className="flex min-w-0 flex-col gap-1.5">
                      <Label className="text-xs">{option.label}</Label>
                      <Select
                        value={link.variant[option.key] ?? ""}
                        onValueChange={(value) => chooseVariant(index, option.key, value)}
                        disabled={fetching !== null}
                      >
                        <SelectTrigger size="sm" className="w-full">
                          <SelectValue placeholder="Выберите вариант" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableValues(option, link.variant).map((value) => (
                            <SelectItem key={value} value={value}>
                              {value}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              ) : Object.keys(link.variant).length > 0 ? (
                <p className="text-muted-foreground text-xs">
                  Вариант на сайте: {Object.values(link.variant).join(" · ")}. Чтобы сменить — «Подтянуть цену».
                </p>
              ) : null}
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
