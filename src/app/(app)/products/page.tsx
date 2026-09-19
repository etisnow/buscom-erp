import type { Metadata } from "next";
import { Suspense } from "react";
import { ProductsTable } from "@/components/products/products-table";
import { ProductsToolbar } from "@/components/products/products-toolbar";
import { listProducts } from "@/server/products/list";
import { canEditCatalog, canEditStock } from "@/server/products/service";
import { requireUser } from "@/server/session";

export const metadata: Metadata = {
  title: "Товары — BusCom ERP",
};

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ProductsPage({ searchParams }: PageProps<"/products">) {
  const user = await requireUser();
  const params = await searchParams;

  const page = Number(single(params.page) ?? "1");
  const result = await listProducts({
    query: single(params.q),
    category: single(params.category),
    onlyShortage: single(params.shortage) === "1",
    onlyInactive: single(params.inactive) === "1",
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
  });

  return (
    <main className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="font-heading text-xl font-semibold">Товары</h1>
        <span className="text-muted-foreground text-sm">
          Всего: {result.total}
          {result.pageCount > 1 ? ` · страница ${result.page} из ${result.pageCount}` : ""}
        </span>
      </div>

      <Suspense fallback={null}>
        <ProductsToolbar categories={result.categories} canEditCatalog={canEditCatalog(user.role)} />
      </Suspense>

      <ProductsTable
        rows={result.rows}
        canEditCatalog={canEditCatalog(user.role)}
        canEditStock={canEditStock(user.role)}
      />
    </main>
  );
}
