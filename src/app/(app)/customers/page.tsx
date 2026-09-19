import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CustomersToolbar } from "@/components/customers/customers-toolbar";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMoscowDate, formatPhone } from "@/domain/datetime";
import { formatRub } from "@/domain/money";
import type { CustomerType } from "@/generated/prisma/enums";
import { listCustomers } from "@/server/customers/list";
import { requireUser } from "@/server/session";

export const metadata: Metadata = {
  title: "Клиенты — BusCom ERP",
};

const TYPE_LABELS: Record<CustomerType, string> = {
  PERSON: "Физлицо",
  COMPANY: "Юрлицо",
};

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function CustomersPage({ searchParams }: PageProps<"/customers">) {
  await requireUser();
  const params = await searchParams;

  const type = single(params.type);
  const page = Number(single(params.page) ?? "1");
  const result = await listCustomers({
    query: single(params.q),
    type: type === "PERSON" || type === "COMPANY" ? type : undefined,
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
  });

  return (
    <main className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="font-heading text-xl font-semibold">Клиенты</h1>
        <span className="text-muted-foreground text-sm">
          Всего: {result.total}
          {result.pageCount > 1 ? ` · страница ${result.page} из ${result.pageCount}` : ""}
        </span>
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
                      {TYPE_LABELS[customer.type]}
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
