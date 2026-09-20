"use client";

import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { ProductDialog } from "@/components/products/product-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatRub } from "@/domain/money";
import type { ProductRow } from "@/server/products/list";
import { toggleProductAction, type ProductResult } from "@/app/(app)/products/actions";

export function ProductsTable({ rows, canEditCatalog }: { rows: ProductRow[]; canEditCatalog: boolean }) {
  const [pending, startTransition] = useTransition();
  const [editingProduct, setEditingProduct] = useState<ProductRow | null>(null);

  function handle(action: Promise<ProductResult>) {
    startTransition(async () => {
      const result = await action;
      if (result.ok) toast.success(result.message);
      else toast.error(result.error);
    });
  }

  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
        Товаров по заданным условиям нет.
      </p>
    );
  }

  return (
    <>
      <div className="min-w-0 overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-32">Артикул</TableHead>
              <TableHead>Название</TableHead>
              <TableHead className="w-36">Категория</TableHead>
              <TableHead className="w-28 text-right">Цена</TableHead>
              <TableHead>Совместимость</TableHead>
              {canEditCatalog ? <TableHead className="w-24" /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((product) => (
              <TableRow key={product.id} className={product.isActive ? undefined : "opacity-60"}>
                <TableCell className="font-mono text-xs">{product.sku}</TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span>{product.name}</span>
                    {!product.isActive ? (
                      <span className="text-muted-foreground text-xs">скрыт из каталога</span>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">{product.category ?? "—"}</TableCell>
                <TableCell className="text-right whitespace-nowrap">{formatRub(product.priceKopecks)}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {product.compatibility.map((model) => (
                      <Badge key={model} variant="secondary" className="font-normal">
                        {model}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                {canEditCatalog ? (
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        aria-label="Изменить товар"
                        onClick={() => setEditingProduct(product)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={pending}
                        onClick={() => handle(toggleProductAction(product.id, !product.isActive))}
                      >
                        {product.isActive ? "Скрыть" : "Вернуть"}
                      </Button>
                    </div>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {editingProduct ? (
        <ProductDialog
          product={editingProduct}
          open
          onOpenChange={(open) => {
            if (!open) setEditingProduct(null);
          }}
        />
      ) : null}
    </>
  );
}
