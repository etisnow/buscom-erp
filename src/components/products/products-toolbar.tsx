"use client";

import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { ProductDialog } from "@/components/products/product-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ANY = "__any__";

/** Поиск и фильтры каталога. Состояние — в URL, как и в списке заказов. */
export function ProductsToolbar({ categories, canEditCatalog }: { categories: string[]; canEditCatalog: boolean }) {
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

      <Select value={searchParams.get("category") ?? ANY} onValueChange={(value) => apply({ category: value })}>
        <SelectTrigger size="sm" className="w-48">
          <SelectValue placeholder="Все категории" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Все категории</SelectItem>
          {categories.map((category) => (
            <SelectItem key={category} value={category}>
              {category}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

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
          <ProductDialog open={createOpen} onOpenChange={setCreateOpen} />
        </>
      ) : null}
    </div>
  );
}
