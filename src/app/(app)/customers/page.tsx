import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { Suspense } from "react";
import { toSearchParams } from "@/app/(app)/search-params";
import { CustomersToolbar } from "@/components/customers/customers-toolbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CUSTOMER_TYPE_LABELS } from "@/domain/customer/type";
import { formatMoscowDate, formatPhone } from "@/domain/datetime";
import { formatRub } from "@/domain/money";
import { listCustomers } from "@/server/customers/list";
import { requirePageUser } from "@/server/session";
import { parseCustomerListParams } from "./params";

export const metadata: Metadata = {
  title: "Клиенты — BusCom ERP",
};

export default async function CustomersPage({ searchParams }: PageProps<"/customers">) {
  await requirePageUser();
  const params = await searchParams;

  const result = await listCustomers(parseCustomerListParams(params));
  const urlParams = toSearchParams(params);

  return (
    <main className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="font-heading text-xl font-semibold">Клиенты</h1>
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground text-sm">
            Всего: {result.total}
            {result.pageCount > 1 ? ` · страница ${result.page} из ${result.pageCount}` : ""}
          </span>
          {/* Выгружается текущий список целиком — те же фильтры, но без пагинации. */}
          <Button asChild size="sm" variant="outline">
            <Link href={`/api/customers/export?${urlParams.toString()}`} prefetch={false}>
              <Download />
              Выгрузить CSV
            </Link>
          </Button>
        </div>
      </div>

      <Suspense fallback={null}>
        <CustomersToolbar />
      </Suspense>

      {result.rows.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
          Клиентов по заданным условиям нет.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Клиент</TableHead>
                <TableHead className="w-24">Тип</TableHead>
                <TableHead className="w-44">Телефон</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="w-32">ИНН</TableHead>
                <TableHead className="w-24 text-right">Заказов</TableHead>
                <TableHead className="w-32 text-right">Куплено на</TableHead>
                <TableHead className="w-28">Клиент с</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.rows.map((customer) => (
                <TableRow key={customer.id}>
                  <TableCell>
                    <Link href={`/customers/${customer.id}`} className="underline-offset-4 hover:underline">
                      {customer.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="font-normal">
                      {CUSTOMER_TYPE_LABELS[customer.type]}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{formatPhone(customer.phone)}</TableCell>
                  <TableCell className="text-muted-foreground break-all">{customer.email ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{customer.inn ?? "—"}</TableCell>
                  <TableCell className="text-right">{customer.ordersCount}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">{formatRub(customer.purchasedKopecks)}</TableCell>
                  <TableCell className="text-muted-foreground">{formatMoscowDate(customer.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="text-muted-foreground text-xs">
        «Куплено на» — сумма отгруженных и выполненных заказов. Клиенты появляются сами при приёме заказа: по телефону и
        email ERP узнаёт постоянного покупателя.
      </p>
    </main>
  );
}
