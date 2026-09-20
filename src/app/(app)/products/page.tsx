import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { Suspense } from "react";
import { toSearchParams } from "@/app/(app)/search-params";
import { ProductsTable } from "@/components/products/products-table";
import { ListPagination } from "@/components/layout/list-pagination";
import { ProductsToolbar } from "@/components/products/products-toolbar";
import { Button } from "@/components/ui/button";
import { listProducts } from "@/server/products/list";
import { canEditCatalog } from "@/server/products/service";
import { requirePageUser } from "@/server/session";
import { parseProductListParams } from "./params";

export const metadata: Metadata = {
  title: "Товары — BusCom ERP",
};

export default async function ProductsPage({ searchParams }: PageProps<"/products">) {
  const user = await requirePageUser();
  const params = await searchParams;

  const result = await listProducts(parseProductListParams(params));
  const urlParams = toSearchParams(params);

  return (
    <main className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="font-heading text-xl font-semibold">Товары</h1>
        <div className="flex items-center gap-3">
          {/* Выгружается текущий список целиком — те же фильтры, но без пагинации. */}
          <Button asChild size="sm" variant="outline">
            <Link href={`/api/products/export?${urlParams.toString()}`} prefetch={false}>
              <Download />
              Выгрузить CSV
            </Link>
          </Button>
        </div>
      </div>

      <Suspense fallback={null}>
        <ProductsToolbar categories={result.categories} canEditCatalog={canEditCatalog(user.role)} />
      </Suspense>

      <ProductsTable rows={result.rows} canEditCatalog={canEditCatalog(user.role)} />

      <ListPagination
        page={result.page}
        pageCount={result.pageCount}
        total={result.total}
        params={urlParams}
        basePath="/products"
        label="Всего товаров"
      />
    </main>
  );
}
