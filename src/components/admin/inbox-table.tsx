"use client";

import { Fragment, useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMoscowDateTime } from "@/domain/datetime";
import type { InboxStatus } from "@/generated/prisma/enums";
import type { InboxRow } from "@/server/integrations/inbox";
import { retryInboxAction } from "@/app/(app)/admin/integration/actions";

const STATUS_LABELS: Record<InboxStatus, string> = {
  PENDING: "В обработке",
  PROCESSED: "Принято",
  FAILED: "Ошибка",
};

const STATUS_CLASS: Record<InboxStatus, string> = {
  PENDING: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  PROCESSED: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  FAILED: "bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200",
};

export function InboxTable({ rows }: { rows: InboxRow[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function retry(id: string) {
    startTransition(async () => {
      const result = await retryInboxAction(id);
      if (result.ok) toast.success(result.message);
      else toast.error(result.error);
    });
  }

  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
        Входящих заказов пока не было.
      </p>
    );
  }

  return (
    <div className="min-w-0 overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-40">Получено</TableHead>
            <TableHead className="w-36">Источник</TableHead>
            <TableHead className="w-40">№ на сайте</TableHead>
            <TableHead className="w-32">Статус</TableHead>
            <TableHead>Результат</TableHead>
            <TableHead className="w-20 text-right">Попыток</TableHead>
            <TableHead className="w-44" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <Fragment key={row.id}>
              <TableRow>
                <TableCell className="text-muted-foreground whitespace-nowrap">
                  {formatMoscowDateTime(row.receivedAt)}
                </TableCell>
                <TableCell className="text-muted-foreground">{row.source}</TableCell>
                <TableCell>{row.externalId}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className={`${STATUS_CLASS[row.status]} border-0 font-normal`}>
                    {STATUS_LABELS[row.status]}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm">
                  {row.orderNumber ? (
                    <Link href={`/orders/${row.orderNumber}`} className="underline underline-offset-4">
                      Заказ №{row.orderNumber}
                    </Link>
                  ) : (
                    <span className="text-destructive whitespace-pre-line">{row.error ?? "—"}</span>
                  )}
                </TableCell>
                <TableCell className="text-right">{row.attempts}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setOpenId(openId === row.id ? null : row.id)}>
                      {openId === row.id ? "Скрыть JSON" : "Показать JSON"}
                    </Button>
                    {row.status === "FAILED" ? (
                      <Button variant="outline" size="sm" disabled={pending} onClick={() => retry(row.id)}>
                        <RefreshCw />
                        Повторить
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
              {openId === row.id ? (
                <TableRow>
                  <TableCell colSpan={7} className="bg-muted/40">
                    <pre className="max-h-80 overflow-auto text-xs">{JSON.stringify(row.payload, null, 2)}</pre>
                  </TableCell>
                </TableRow>
              ) : null}
            </Fragment>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
