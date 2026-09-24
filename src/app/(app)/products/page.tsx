import type { Metadata } from "next";
import Link from "next/link";
import { Download, FolderTree } from "lucide-react";
import { Suspense } from "react";
import { toSearchParams } from "@/app/(app)/search-params";
import { ProductsTable } from "@/components/products/products-table";
import { ListPagination } from "@/components/layout/list-pagination";
import { ProductsToolbar } from "@/components/products/products-toolbar";
import { Button } from "@/components/ui/button";
import { listCategories } from "@/server/products/categories";
import { listProducts } from "@/server/products/list";
import { canEditCatalog } from "@/server/products/service";
import { getCarModels } from "@/server/settings/service";
import { listSupplierOptions } from "@/server/suppliers/list";
import { requirePageUser } from "@/server/session";
import { parseProductListParams } from "./params";

export const metadata: Metadata = {
  title: "Товары — BusCom ERP",
};

export default async function ProductsPage({ searchParams }: PageProps<"/products">) {
  const user = await requirePageUser();
  const params = await searchParams;

  const [result, suppliers, categories, carModels] = await Promise.all([
    listProducts(parseProductListParams(params)),
    listSupplierOptions(),
    listCategories(),
    getCarModels(),
  ]);
  const urlParams = toSearchParams(params);

  return (
    <main className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="font-heading text-xl font-semibold">Товары</h1>
        <div className="flex items-center gap-3">
          <Button asChild size="sm" variant="outline">
            <Link href="/products/categories">
              <FolderTree />
              Категории
            </Link>
          </Button>
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
        <ProductsToolbar
          categories={categories}
          canEditCatalog={canEditCatalog(user.role)}
          suppliers={suppliers}
          carModels={carModels}
        />
      </Suspense>

      <ProductsTable
        rows={result.rows}
        canEditCatalog={canEditCatalog(user.role)}
        suppliers={suppliers}
        categories={categories}
        carModels={carModels}
      />

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
