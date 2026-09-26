import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { Suspense } from "react";
import { toSearchParams } from "@/app/(app)/search-params";
import { CustomersToolbar } from "@/components/customers/customers-toolbar";
import { ListPagination } from "@/components/layout/list-pagination";
import { NewCustomerDialog } from "@/components/customers/new-customer-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CUSTOMER_TYPE_LABELS } from "@buscom/domain/customer/type";
import { formatMoscowDate, formatPhone } from "@buscom/domain/datetime";
import { formatRub } from "@buscom/domain/money";
import { listCustomers } from "@/server/customers/list";
import { canEditCustomers } from "@/server/customers/service";
import { requirePageUser } from "@/server/session";
import { parseCustomerListParams } from "./params";

export const metadata: Metadata = {
  title: "Клиенты — BusCom ERP",
};

export default async function CustomersPage({ searchParams }: PageProps<"/customers">) {
  const user = await requirePageUser();
  const params = await searchParams;

  const result = await listCustomers(parseCustomerListParams(params));
  const urlParams = toSearchParams(params);

  return (
    <main className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h1 className="font-heading text-xl font-semibold">Клиенты</h1>
        <div className="flex items-center gap-3">
          {/* Выгружается текущий список целиком — те же фильтры, но без пагинации. */}
          {/* На телефоне файл не нужен — кнопка только занимает место в шапке */}
          <Button asChild size="sm" variant="outline" className="max-md:hidden">
            <Link href={`/api/customers/export?${urlParams.toString()}`} prefetch={false}>
              <Download />
              Выгрузить CSV
            </Link>
          </Button>
          {canEditCustomers(user.role) ? <NewCustomerDialog /> : null}
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
        <>
          {/* На телефоне — карточки. Нажатие ведёт в карточку клиента (ссылка на имени
              растянута на весь блок), телефон — отдельная ссылка поверх: сразу звонок */}
          <ul className="flex flex-col gap-2 md:hidden">
            {result.rows.map((customer) => (
              <li key={customer.id} className="active:bg-muted relative flex flex-col gap-1.5 rounded-lg border p-3">
                <div className="flex items-start gap-2">
                  <Link
                    href={`/customers/${customer.id}`}
                    className="min-w-0 flex-1 font-medium break-words after:absolute after:inset-0"
                  >
                    {customer.name}
                  </Link>
                  <Badge variant="secondary" className="shrink-0 font-normal">
                    {CUSTOMER_TYPE_LABELS[customer.type]}
                  </Badge>
                </div>
                <div className="flex items-center justify-between gap-3 text-sm">
                  {customer.phone ? (
                    <a
                      href={`tel:${customer.phone}`}
                      className="text-primary relative z-10 -my-2 inline-flex min-h-11 items-center"
                    >
                      {formatPhone(customer.phone)}
                    </a>
                  ) : (
                    <span className="text-muted-foreground">{customer.email ?? "нет телефона"}</span>
                  )}
                  <span className="text-muted-foreground text-right whitespace-nowrap">
                    заказов {customer.ordersCount}
                    {customer.purchasedKopecks ? ` · ${formatRub(customer.purchasedKopecks)}` : ""}
                  </span>
                </div>
              </li>
            ))}
          </ul>

          <div className="min-w-0 overflow-x-auto rounded-lg border max-md:hidden">
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
                    <TableCell className="text-right whitespace-nowrap">
                      {formatRub(customer.purchasedKopecks)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatMoscowDate(customer.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <ListPagination
        page={result.page}
        pageCount={result.pageCount}
        total={result.total}
        params={urlParams}
        basePath="/customers"
        label="Всего клиентов"
      />

      <p className="text-muted-foreground text-xs">
        «Куплено на» — сумма выполненных заказов. Обычно клиенты появляются сами при приёме заказа: по телефону и email
        ERP узнаёт постоянного покупателя. «Новый клиент» нужен, когда заказа ещё нет.
      </p>
    </main>
  );
}
