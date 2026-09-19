"use client";

import { useState, useTransition } from "react";
import { Check, Package, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { ProductDialog } from "@/components/products/product-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatRub } from "@/domain/money";
import type { ProductRow } from "@/server/products/list";
import { setStockAction, toggleProductAction, type ProductResult } from "@/app/(app)/products/actions";

export function ProductsTable({
  rows,
  canEditCatalog,
  canEditStock,
}: {
  rows: ProductRow[];
  canEditCatalog: boolean;
  canEditStock: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [editingStock, setEditingStock] = useState<{ id: string; value: string } | null>(null);
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
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-32">Артикул</TableHead>
              <TableHead>Название</TableHead>
              <TableHead className="w-36">Категория</TableHead>
              <TableHead className="w-28 text-right">Цена</TableHead>
              <TableHead className="w-24 text-right">Остаток</TableHead>
              <TableHead className="w-20 text-right">Резерв</TableHead>
              <TableHead className="w-24 text-right">Свободно</TableHead>
              <TableHead>Совместимость</TableHead>
              {canEditCatalog || canEditStock ? <TableHead className="w-24" /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((product) => {
              const available = product.stock - product.reserved;
              const isEditing = editingStock?.id === product.id;

              return (
                <TableRow key={product.id} className={product.isActive ? undefined : "opacity-60"}>
                  <TableCell className="font-mono text-xs">{product.sku}</TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span>{product.name}</span>
                      {product.madeToOrder ? (
                        <span className="text-muted-foreground text-xs">
                          под заказ
                          {product.leadTimeDays ? `, срок ${product.leadTimeDays} дн.` : ""}
                        </span>
                      ) : null}
                      {!product.isActive ? (
                        <span className="text-muted-foreground text-xs">скрыт из каталога</span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{product.category ?? "—"}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">{formatRub(product.priceKopecks)}</TableCell>
                  <TableCell className="text-right">
                    {isEditing ? (
                      <div className="flex items-center justify-end gap-1">
                        <Input
                          autoFocus
                          type="number"
                          min={0}
                          value={editingStock.value}
                          onChange={(event) => setEditingStock({ id: product.id, value: event.target.value })}
                          className="h-7 w-20 text-right"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          aria-label="Сохранить остаток"
                          disabled={pending}
                          onClick={() => {
                            handle(setStockAction(product.id, Number(editingStock.value)));
                            setEditingStock(null);
                          }}
                        >
                          <Check className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          aria-label="Отменить"
                          onClick={() => setEditingStock(null)}
                        >
                          <X className="size-4" />
                        </Button>
                      </div>
                    ) : canEditStock ? (
                      <button
                        type="button"
                        className="hover:bg-accent rounded px-2 py-0.5"
                        onClick={() => setEditingStock({ id: product.id, value: String(product.stock) })}
                      >
                        {product.stock}
                      </button>
                    ) : (
                      product.stock
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-right">{product.reserved}</TableCell>
                  <TableCell
                    className={`text-right ${available <= 0 && !product.madeToOrder ? "text-rose-700 dark:text-rose-400" : ""}`}
                  >
                    {product.madeToOrder ? "—" : available}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {product.compatibility.map((model) => (
                        <Badge key={model} variant="secondary" className="font-normal">
                          {model}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  {canEditCatalog || canEditStock ? (
                    <TableCell>
                      {canEditCatalog ? (
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
                      ) : null}
                    </TableCell>
                  ) : null}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {canEditStock && !canEditCatalog ? (
        <p className="text-muted-foreground text-xs">
          <Package className="mr-1 inline size-3" />
          Нажмите на остаток, чтобы его исправить. Резерв меняется только заказами.
        </p>
      ) : null}

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
