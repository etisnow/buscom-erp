import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { pageNumber, single, toSearchParams } from "@/app/(app)/search-params";
import { ListPagination } from "@/components/layout/list-pagination";
import { NewSupplierDialog } from "@/components/suppliers/new-supplier-dialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CUSTOMER_TYPE_LABELS } from "@/domain/customer/type";
import { formatPhone } from "@/domain/datetime";
import { listSuppliers } from "@/server/suppliers/list";
import { canEditSuppliers } from "@/server/suppliers/service";
import { requirePageUser } from "@/server/session";

export const metadata: Metadata = {
  title: "Поставщики — BusCom ERP",
};

export default async function SuppliersPage({ searchParams }: PageProps<"/suppliers">) {
  const user = await requirePageUser();
  const params = await searchParams;
  const query = single(params.q) ?? "";

  const result = await listSuppliers({ query, page: pageNumber(params.page) });

  return (
    <main className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="font-heading text-xl font-semibold">Поставщики</h1>
        {canEditSuppliers(user.role) ? <NewSupplierDialog /> : null}
      </div>

      {/* Обычная GET-форма: поиск сразу попадает в URL, как у остальных списков. */}
      <form action="/suppliers" className="relative w-fit">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
        <Input
          name="q"
          type="search"
          placeholder="Название, контакт, телефон или ИНН"
          defaultValue={query}
          className="h-8 w-80 pl-8"
        />
      </form>

      {result.rows.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
          {query ? "Поставщиков по запросу нет." : "Поставщиков пока нет."}
        </p>
      ) : (
        <div className="min-w-0 overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Поставщик</TableHead>
                <TableHead className="w-24">Тип</TableHead>
                <TableHead>Контактное лицо</TableHead>
                <TableHead className="w-44">Телефон</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="w-32">ИНН</TableHead>
                <TableHead className="w-24 text-right">Товаров</TableHead>
                <TableHead className="w-24 text-right">Этапов</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.rows.map((supplier) => (
                <TableRow key={supplier.id}>
                  <TableCell>
                    <Link href={`/suppliers/${supplier.id}`} className="underline-offset-4 hover:underline">
                      {supplier.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="font-normal">
                      {CUSTOMER_TYPE_LABELS[supplier.type]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{supplier.contactPerson ?? "—"}</TableCell>
                  <TableCell className="whitespace-nowrap">{formatPhone(supplier.phone)}</TableCell>
                  <TableCell className="text-muted-foreground break-all">{supplier.email ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{supplier.inn ?? "—"}</TableCell>
                  <TableCell className="text-right">{supplier._count.products}</TableCell>
                  <TableCell className="text-right">{supplier._count.stages}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ListPagination
        page={result.page}
        pageCount={result.pageCount}
        total={result.total}
        params={toSearchParams(params)}
        basePath="/suppliers"
        label="Всего поставщиков"
      />
    </main>
  );
}
