"use client";

import { useState, useTransition } from "react";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ProductOptionsChooser, type OptionsSelection } from "@/components/orders/product-options-chooser";
import { Input } from "@/components/ui/input";
import { formatRub } from "@buscom/domain/money";
import { searchProductsAction } from "@/app/(app)/orders/[number]/actions";
import type { ProductSuggestion } from "@/server/products/search";

/** Добавление позиции: поиск по каталогу или произвольная строка (PRD, карточка заказа). */
export function ProductPicker({
  onPick,
  onCustom,
}: {
  /** selection — выбранные опции; у товара без опций null */
  onPick: (product: ProductSuggestion, selection: OptionsSelection | null) => void;
  onCustom: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductSuggestion[]>([]);
  const [pending, startTransition] = useTransition();
  // Товар с опциями: второй шаг диалога — выбор вариантов.
  const [configuring, setConfiguring] = useState<ProductSuggestion | null>(null);

  function finish(product: ProductSuggestion, selection: OptionsSelection | null) {
    onPick(product, selection);
    setOpen(false);
    setConfiguring(null);
    setQuery("");
    setResults([]);
  }

  function search(value: string) {
    setQuery(value);
    startTransition(async () => {
      setResults(await searchProductsAction(value));
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setConfiguring(null);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus />
          Добавить позицию
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Добавить позицию</DialogTitle>
          <DialogDescription>Найдите товар по артикулу или названию либо добавьте свою строку.</DialogDescription>
        </DialogHeader>

        {configuring ? (
          <ProductOptionsChooser
            product={configuring}
            onConfirm={(selection) => finish(configuring, selection)}
            onBack={() => setConfiguring(null)}
          />
        ) : (
          <>
            <div className="relative">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
              <Input
                autoFocus
                value={query}
                onChange={(event) => search(event.target.value)}
                placeholder="Артикул или название"
                className="pl-8"
              />
            </div>

            <div className="flex max-h-72 flex-col gap-1 overflow-y-auto">
              {results.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  className="hover:bg-accent flex items-center justify-between gap-3 rounded-md px-2 py-2 text-left text-sm"
                  onClick={() => (product.options.length > 0 ? setConfiguring(product) : finish(product, null))}
                >
                  <span className="flex flex-col">
                    <span>{product.name}</span>
                    <span className="text-muted-foreground text-xs">
                      {product.sku}
                      {product.options.length > 0 ? ` · опции: ${product.options.length}` : ""}
                    </span>
                  </span>
                  <span className="whitespace-nowrap">{formatRub(product.priceKopecks)}</span>
                </button>
              ))}

              {query.trim().length >= 2 && results.length === 0 && !pending ? (
                <p className="text-muted-foreground px-2 py-4 text-sm">Ничего не найдено.</p>
              ) : null}
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                onCustom();
                setOpen(false);
              }}
            >
              Добавить произвольную позицию
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
