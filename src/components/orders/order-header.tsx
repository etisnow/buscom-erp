"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { OrderStatusBadge, PaymentBadge } from "@/components/orders/status-badge";
import { CancelDialog } from "@/components/orders/cancel-dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ORDER_STATUS_LABELS, availableTransitions } from "@/domain/order/status";
import { formatMoscowDateTime } from "@/domain/datetime";
import type { OrderStatus, UserRole } from "@/generated/prisma/enums";
import {
  assignManagerAction,
  changeStatusAction,
  takeOrderAction,
  type ActionResult,
} from "@/app/(app)/orders/[number]/actions";

export type OrderHeaderProps = {
  orderId: string;
  orderNumber: number;
  externalId: string | null;
  status: OrderStatus;
  totalKopecks: number;
  paidKopecks: number;
  createdAt: Date;
  manager: { id: string; name: string } | null;
  managers: { id: string; name: string }[];
  role: UserRole;
  canReassign: boolean;
};

export function OrderHeader(props: OrderHeaderProps) {
  const [pending, startTransition] = useTransition();
  const [cancelOpen, setCancelOpen] = useState(false);

  // Кнопки показываем ровно те, что разрешает статусная машина для этой роли.
  const transitions = availableTransitions(props.status, props.role).filter((to) => to !== "CANCELLED");
  const canCancel = availableTransitions(props.status, props.role).includes("CANCELLED");
  const canTake = props.status === "NEW" && props.role !== "WAREHOUSE";

  function handle(result: Promise<ActionResult>, successMessage: string) {
    startTransition(async () => {
      const outcome = await result;
      if (outcome.ok) toast.success(successMessage);
      else toast.error(outcome.error);
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-heading text-xl font-semibold">Заказ №{props.orderNumber}</h1>
        <OrderStatusBadge status={props.status} />
        <PaymentBadge totalKopecks={props.totalKopecks} paidKopecks={props.paidKopecks} />
        {props.externalId ? (
          <span className="text-muted-foreground text-sm">№ на сайте: {props.externalId}</span>
        ) : null}
        <span className="text-muted-foreground ml-auto text-sm">Создан {formatMoscowDateTime(props.createdAt)}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground text-sm">Ответственный:</span>
        {props.canReassign ? (
          <Select
            value={props.manager?.id ?? ""}
            disabled={pending}
            onValueChange={(managerId) =>
              handle(assignManagerAction(props.orderId, props.orderNumber, managerId), "Ответственный изменён")
            }
          >
            <SelectTrigger className="w-56" size="sm">
              <SelectValue placeholder="не назначен" />
            </SelectTrigger>
            <SelectContent>
              {props.managers.map((manager) => (
                <SelectItem key={manager.id} value={manager.id}>
                  {manager.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className={props.manager ? "text-sm" : "text-muted-foreground text-sm"}>
            {props.manager?.name ?? "не назначен"}
          </span>
        )}

        {canTake ? (
          <Button
            size="sm"
            disabled={pending}
            onClick={() => handle(takeOrderAction(props.orderId, props.orderNumber), "Заказ взят в работу")}
          >
            Взять себе
          </Button>
        ) : null}
      </div>

      {transitions.length > 0 || canCancel ? (
        <div className="flex flex-wrap gap-2 border-t pt-3">
          {transitions.map((to) => (
            <Button
              key={to}
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() =>
                handle(
                  changeStatusAction({
                    orderId: props.orderId,
                    orderNumber: props.orderNumber,
                    to,
                    expectedStatus: props.status,
                  }),
                  `Статус изменён: ${ORDER_STATUS_LABELS[to]}`,
                )
              }
            >
              {ORDER_STATUS_LABELS[to]}
            </Button>
          ))}
          {canCancel ? (
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive"
              disabled={pending}
              onClick={() => setCancelOpen(true)}
            >
              Отменить заказ
            </Button>
          ) : null}
        </div>
      ) : (
        <p className="text-muted-foreground border-t pt-3 text-sm">
          Заказ в статусе «{ORDER_STATUS_LABELS[props.status]}» — доступных переходов нет.
        </p>
      )}

      <CancelDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        pending={pending}
        onConfirm={(reason, comment) =>
          handle(
            changeStatusAction({
              orderId: props.orderId,
              orderNumber: props.orderNumber,
              to: "CANCELLED",
              expectedStatus: props.status,
              cancelReason: reason,
              cancelComment: comment,
            }),
            "Заказ отменён",
          )
        }
      />
    </div>
  );
}
