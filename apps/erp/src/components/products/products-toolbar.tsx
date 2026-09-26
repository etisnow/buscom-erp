"use client";

import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { CategorySelect } from "@/components/products/category-select";
import { ProductDialog } from "@/components/products/product-dialog";
import type { CategoryRow } from "@/server/products/categories";
import type { SupplierOption } from "@/server/suppliers/list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const ANY = "__any__";

/** Поиск и фильтры каталога. Состояние — в URL, как и в списке заказов. */
export function ProductsToolbar({
  categories,
  canEditCatalog,
  suppliers,
  carModels,
}: {
  categories: CategoryRow[];
  canEditCatalog: boolean;
  suppliers: SupplierOption[];
  /** Модели авто для совместимости в карточке товара */
  carModels: string[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [createOpen, setCreateOpen] = useState(false);

  function apply(changes: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === "" || value === ANY) next.delete(key);
      else next.set(key, value);
    }
    next.delete("page");
    router.push(`/products?${next.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <form
        className="relative"
        onSubmit={(event) => {
          event.preventDefault();
          const value = new FormData(event.currentTarget).get("q");
          apply({ q: typeof value === "string" ? value.trim() : null });
        }}
      >
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
        <Input
          name="q"
          type="search"
          placeholder="Артикул, название или модель целиком: ГАЗель Next"
          defaultValue={searchParams.get("q") ?? ""}
          className="h-8 w-80 pl-8"
        />
      </form>

      <CategorySelect
        categories={categories}
        value={searchParams.get("category")}
        onChange={(value) => apply({ category: value })}
        emptyLabel="Все категории"
        className="w-56"
      />

      <Button
        variant={searchParams.has("inactive") ? "default" : "outline"}
        size="sm"
        onClick={() => apply({ inactive: searchParams.has("inactive") ? null : "1" })}
      >
        Скрытые
      </Button>

      {canEditCatalog ? (
        <>
          <Button size="sm" className="ml-auto" onClick={() => setCreateOpen(true)}>
            <Plus />
            Новый товар
          </Button>
          <ProductDialog
            open={createOpen}
            onOpenChange={setCreateOpen}
            suppliers={suppliers}
            categories={categories}
            carModels={carModels}
          />
        </>
      ) : null}
    </div>
  );
}
