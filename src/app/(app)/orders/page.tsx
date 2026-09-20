import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { Download, Plus } from "lucide-react";
import { OrderFilters } from "@/components/orders/order-filters";
import { OrdersPagination } from "@/components/orders/orders-pagination";
import { OrdersTable } from "@/components/orders/orders-table";
import { OrderViews } from "@/components/orders/order-views";
import { Button } from "@/components/ui/button";
import { ORDER_CREATE_ROLES, hasRole } from "@/domain/user/role";
import { defaultView, listManagers, listOrders } from "@/server/orders/list";
import { requirePageUser } from "@/server/session";
import { parseOrderListParams, toSearchParams } from "./params";

export const metadata: Metadata = {
  title: "Заказы — BusCom ERP",
};

export default async function OrdersPage({ searchParams }: PageProps<"/orders">) {
  const user = await requirePageUser();
  const params = await searchParams;
  const filters = parseOrderListParams(params, defaultView(user));

  const [result, managers] = await Promise.all([listOrders(filters, user), listManagers()]);
  const urlParams = toSearchParams(params);
  const now = new Date();

  return (
    <main className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-heading text-xl font-semibold">Заказы</h1>
        <div className="flex items-center gap-2">
          {/* Выгружается текущий список целиком — те же фильтры, но без пагинации. */}
          <Button asChild size="sm" variant="outline">
            <Link href={`/api/orders/export?${urlParams.toString()}`} prefetch={false}>
              <Download />
              Выгрузить CSV
            </Link>
          </Button>
          {hasRole(user.role, ORDER_CREATE_ROLES) ? (
            <Button asChild size="sm">
              <Link href="/orders/new">
                <Plus />
                Новый заказ
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <OrderViews current={filters.view} counts={result.counts} params={urlParams} />

      <Suspense fallback={null}>
        <OrderFilters managers={managers} />
      </Suspense>

      <OrdersTable rows={result.rows} now={now} />

      <OrdersPagination page={result.page} pageCount={result.pageCount} total={result.total} params={urlParams} />
    </main>
  );
}
