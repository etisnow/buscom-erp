import Link from "next/link";
import { OrderRowLink } from "@/components/orders/order-row-link";
import { OrderStatusBadge, PaymentBadge } from "@/components/orders/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMoscowDateTime, formatPhone } from "@/domain/datetime";
import { formatRub } from "@/domain/money";
import { formatWorkingMinutes, workingMinutesBetween } from "@/domain/sla";
import { isTrackComplete } from "@/domain/supplier/stages";
import { cn } from "@/lib/utils";
import type { OrderListRow } from "@/server/orders/list";

/** Сколько позиций показывать в строке списка; остальные — «ещё N», полный состав в подсказке. */
const ITEMS_SHOWN = 3;

function OrderItemsCell({ items }: { items: OrderListRow["items"] }) {
  if (items.length === 0) return <span className="text-muted-foreground">—</span>;

  const lines = items.map((item) => `${item.name} × ${item.quantity}`);
  const rest = items.length - ITEMS_SHOWN;

  return (
    <ul className="flex max-w-64 flex-col text-xs" title={lines.join("\n")}>
      {items.slice(0, ITEMS_SHOWN).map((item) => (
        <li key={item.id} className="flex gap-1">
          <span className="truncate">{item.name}</span>
          <span className="text-muted-foreground shrink-0">× {item.quantity}</span>
        </li>
      ))}
      {rest > 0 ? <li className="text-muted-foreground">ещё {rest}</li> : null}
    </ul>
  );
}

/** Текущий этап по каждому поставщику заказа — то же, что в блоке «Поставщики» карточки. */
function SupplierStatusesCell({ tracks }: { tracks: OrderListRow["supplierTracks"] }) {
  if (tracks.length === 0) return <span className="text-muted-foreground">—</span>;

  return (
    <ul className="flex max-w-64 flex-col text-xs">
      {tracks.map((track) => {
        const stages = track.supplier.stages;
        const index = stages.findIndex((stage) => stage.id === track.stageId);
        const done = isTrackComplete({
          supplierName: track.supplier.name,
          stageIndex: index === -1 ? null : index,
          stagesCount: stages.length,
        });
        const label = stages.length === 0 ? "цепочка не задана" : index === -1 ? "не начат" : stages[index].name;

        return (
          <li key={track.supplierId} className="flex gap-1">
            <span className="text-muted-foreground shrink-0">{track.supplier.name}:</span>
            <span className={cn("truncate", done && stages.length > 0 && "text-emerald-600 dark:text-emerald-400")}>
              {label}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

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
            <TableHead>Позиции</TableHead>
            <TableHead>Статусы поставщика</TableHead>
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
                <TableCell>
                  <OrderItemsCell items={order.items} />
                </TableCell>
                <TableCell>
                  <SupplierStatusesCell tracks={order.supplierTracks} />
                </TableCell>
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
