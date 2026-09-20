import Link from "next/link";
import { OrderRowLink } from "@/components/orders/order-row-link";
import { OrderStatusBadge, PaymentBadge } from "@/components/orders/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMoscowDateTime, formatPhone } from "@/domain/datetime";
import { ORDER_SOURCE_LABELS } from "@/domain/order/source";
import { formatRub } from "@/domain/money";
import { formatWorkingMinutes, workingMinutesBetween } from "@/domain/sla";
import type { OrderListRow } from "@/server/orders/list";

export function OrdersTable({ rows, now }: { rows: OrderListRow[]; now: Date }) {
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
        Заказов по заданным условиям нет.
      </p>
    );
  }

  return (
    <div className="min-w-0 overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">№</TableHead>
            <TableHead className="w-24">№ на сайте</TableHead>
            <TableHead className="w-36">Дата</TableHead>
            <TableHead>Клиент</TableHead>
            <TableHead className="text-right">Сумма</TableHead>
            <TableHead>Статус</TableHead>
            <TableHead>Оплата</TableHead>
            <TableHead>Менеджер</TableHead>
            <TableHead>Источник</TableHead>
            <TableHead className="text-right">В статусе</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((order) => {
            // Просрочка видна сразу: дедлайн посчитан при смене статуса.
            const isOverdue = order.slaDueAt !== null && order.slaDueAt < now;
            const inStatus = workingMinutesBetween(order.statusChangedAt, now);

            return (
              <OrderRowLink
                key={order.id}
                href={`/orders/${order.number}`}
                className={isOverdue ? "bg-rose-50 dark:bg-rose-950/30" : undefined}
              >
                <TableCell className="font-medium">
                  <Link href={`/orders/${order.number}`} className="underline-offset-4 hover:underline">
                    {order.number}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">{order.externalId ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground whitespace-nowrap">
                  {formatMoscowDateTime(order.createdAt)}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span>{order.customer.name}</span>
                    <span className="text-muted-foreground text-xs">{formatPhone(order.customer.phone)}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right whitespace-nowrap">{formatRub(order.totalKopecks)}</TableCell>
                <TableCell>
                  <OrderStatusBadge status={order.status} />
                </TableCell>
                <TableCell>
                  <PaymentBadge totalKopecks={order.totalKopecks} paidKopecks={order.paidKopecks} />
                </TableCell>
                <TableCell className={order.manager ? undefined : "text-muted-foreground"}>
                  {order.manager?.name ?? "не назначен"}
                </TableCell>
                <TableCell className="text-muted-foreground">{ORDER_SOURCE_LABELS[order.source]}</TableCell>
                <TableCell
                  className={`text-right whitespace-nowrap ${isOverdue ? "text-rose-700 dark:text-rose-400" : "text-muted-foreground"}`}
                  title={isOverdue ? "Просрочен по SLA" : undefined}
                >
                  {formatWorkingMinutes(inStatus)}
                </TableCell>
              </OrderRowLink>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
