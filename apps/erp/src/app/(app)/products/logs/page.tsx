import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { pageNumber, single, toSearchParams } from "@/app/(app)/search-params";
import { ListPagination } from "@/components/layout/list-pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMoscowDateTime } from "@buscom/domain/datetime";
import { PRODUCT_LOG_ACTION_LABELS } from "@buscom/domain/product/log";
import { listProductLogs } from "@/server/products/log";
import { requirePageUser } from "@/server/session";

export const metadata: Metadata = {
  title: "Журнал товаров — BusCom ERP",
};

const ACTIONS = Object.keys(PRODUCT_LOG_ACTION_LABELS) as (keyof typeof PRODUCT_LOG_ACTION_LABELS)[];

export default async function ProductLogsPage({ searchParams }: PageProps<"/products/logs">) {
  await requirePageUser();
  const params = await searchParams;

  const actionParam = single(params.action);
  const action = ACTIONS.find((item) => item === actionParam);
  const query = single(params.q)?.trim() ?? "";
  const result = await listProductLogs({ action, query, page: pageNumber(params.page) });

  return (
    <main className="flex flex-col gap-4">
      <Link
        href="/products"
        className="text-muted-foreground inline-flex w-fit items-center gap-1 text-sm hover:underline"
      >
        <ArrowLeft className="size-4" />К списку товаров
      </Link>

      <div>
        <h1 className="font-heading text-xl font-semibold">Журнал товаров</h1>
        <p className="text-muted-foreground text-sm">
          Кто и когда добавил товар, изменил карточку, скрыл из каталога или удалил. Журнал ведётся с 1 октября 2026 —
          более ранних правок в нём нет.
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-3">
        <Input name="q" type="search" placeholder="Артикул или название" defaultValue={query} className="h-8 w-72" />
        <select
          name="action"
          defaultValue={action ?? ""}
          className="border-input bg-background h-8 rounded-md border px-2 text-sm"
        >
          <option value="">Все действия</option>
          {ACTIONS.map((item) => (
            <option key={item} value={item}>
              {PRODUCT_LOG_ACTION_LABELS[item]}
            </option>
          ))}
        </select>
        <Button type="submit" size="sm" variant="outline">
          Найти
        </Button>
      </form>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="whitespace-nowrap">Когда</TableHead>
            <TableHead>Сотрудник</TableHead>
            <TableHead>Действие</TableHead>
            <TableHead>Товар</TableHead>
            <TableHead>Что изменилось</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {result.rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-muted-foreground py-8 text-center">
                Записей нет
              </TableCell>
            </TableRow>
          ) : (
            result.rows.map((row) => (
              <TableRow key={row.id} className="align-top">
                <TableCell className="whitespace-nowrap">{formatMoscowDateTime(row.createdAt)}</TableCell>
                <TableCell>{row.userName ?? "Система"}</TableCell>
                <TableCell className="whitespace-nowrap">{PRODUCT_LOG_ACTION_LABELS[row.action]}</TableCell>
                <TableCell>
                  <div className="font-medium">{row.name}</div>
                  <div className="text-muted-foreground text-xs">{row.sku}</div>
                </TableCell>
                <TableCell className="max-w-xl">
                  {row.changes.length === 0 ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <ul className="flex flex-col gap-1.5 text-sm">
                      {row.changes.map((change) => (
                        <li key={change.label}>
                          <span className="text-muted-foreground">{change.label}: </span>
                          {row.action === "CREATED" ? (
                            <span className="break-words whitespace-pre-wrap">{change.to ?? "—"}</span>
                          ) : (
                            <>
                              <span className="break-words whitespace-pre-wrap line-through decoration-1">
                                {change.from ?? "пусто"}
                              </span>
                              {" → "}
                              <span className="break-words whitespace-pre-wrap">{change.to ?? "пусто"}</span>
                            </>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <ListPagination
        page={result.page}
        pageCount={result.pageCount}
        total={result.total}
        params={toSearchParams(params)}
        basePath="/products/logs"
        label="Всего записей"
      />
    </main>
  );
}
