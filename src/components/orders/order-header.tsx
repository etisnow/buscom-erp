"use client";

import { useState, useTransition } from "react";
import { CreditCard, FileText, MoreHorizontal, Phone, XCircle } from "lucide-react";
import { toast } from "sonner";
import { OrderStatusBadge, PaymentBadge } from "@/components/orders/status-badge";
import { CancelDialog } from "@/components/orders/cancel-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ORDER_STATUS_LABELS, availableTransitions } from "@/domain/order/status";
import { formatMoscowDateTime } from "@/domain/datetime";
import type { OrderStatus, UserRole } from "@/generated/prisma/enums";
import {
  assignManagerAction,
  changeSourceAction,
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
  cancelReasons: string[];
  /** Подпись источника — из справочника или запасная по каналу */
  sourceLabel: string;
  sourceItemId: string | null;
  /** Из чего выбирать; пусто — источник не меняется (заказ с сайта или архивный) */
  sources: { id: string; name: string }[];
  /** Телефон клиента — для кнопки «Позвонить» в нижней панели на телефоне */
  customerPhone: string | null;
  /** Адрес счёта PDF — для меню «…» в нижней панели на телефоне */
  invoiceHref: string;
};

export function OrderHeader(props: OrderHeaderProps) {
  const [pending, startTransition] = useTransition();
  const [cancelOpen, setCancelOpen] = useState(false);
  /** Смена статуса из нижней панели ждёт подтверждения: большая кнопка под пальцем — лёгкий промах */
  // Цель не сбрасывается при закрытии — иначе пока окно гаснет, в заголовке мелькнуло бы «»
  const [confirmTo, setConfirmTo] = useState<OrderStatus | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const askStatus = (to: OrderStatus) => {
    setConfirmTo(to);
    setConfirmOpen(true);
  };

  // Кнопки показываем ровно те, что разрешает статусная машина для этой роли.
  const transitions = availableTransitions(props.status, props.role, props.paidKopecks).filter(
    (to) => to !== "CANCELLED",
  );
  const canCancel = availableTransitions(props.status, props.role, props.paidKopecks).includes("CANCELLED");
  const canTake = props.status === "NEW";

  const changeStatus = (to: OrderStatus) =>
    handle(
      changeStatusAction({ orderId: props.orderId, orderNumber: props.orderNumber, to, expectedStatus: props.status }),
      `Статус изменён: ${ORDER_STATUS_LABELS[to]}`,
    );
  const take = () => handle(takeOrderAction(props.orderId, props.orderNumber), "Заказ взят в работу");

  // Нижняя панель на телефоне: одно главное действие под большим пальцем, остальное — в «…»
  const primary: { label: string; run: () => void } | null = canTake
    ? { label: "Взять себе", run: take }
    : transitions[0]
      ? { label: ORDER_STATUS_LABELS[transitions[0]], run: () => askStatus(transitions[0]) }
      : null;
  const secondary = canTake ? transitions : transitions.slice(1);

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
        <span className="text-muted-foreground text-sm md:ml-auto">Создан {formatMoscowDateTime(props.createdAt)}</span>
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
            <SelectTrigger className="w-56 max-md:min-w-0 max-md:flex-1" size="sm">
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

        <span className="text-muted-foreground text-sm max-md:basis-full md:ml-4">Источник:</span>
        {props.sources.length > 0 ? (
          <Select
            value={props.sourceItemId ?? undefined}
            disabled={pending}
            onValueChange={(sourceItemId) =>
              handle(changeSourceAction(props.orderId, props.orderNumber, sourceItemId), "Источник изменён")
            }
          >
            <SelectTrigger className="w-48 max-md:min-w-0 max-md:flex-1" size="sm">
              <SelectValue placeholder={props.sourceLabel} />
            </SelectTrigger>
            <SelectContent>
              {props.sources.map((source) => (
                <SelectItem key={source.id} value={source.id}>
                  {source.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="text-sm">{props.sourceLabel}</span>
        )}

        {canTake ? (
          <Button size="sm" disabled={pending} onClick={take} className="max-md:hidden">
            Взять себе
          </Button>
        ) : null}
      </div>

      {transitions.length > 0 || canCancel ? (
        <div className="flex flex-wrap gap-2 border-t pt-3 max-md:hidden">
          {transitions.map((to) => (
            <Button key={to} size="sm" variant="outline" disabled={pending} onClick={() => changeStatus(to)}>
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
        <p className="text-muted-foreground border-t pt-3 text-sm max-md:hidden">
          Заказ в статусе «{ORDER_STATUS_LABELS[props.status]}» — доступных переходов нет.
        </p>
      )}

      <div className="bg-background/95 fixed inset-x-0 bottom-0 z-30 flex items-center gap-2 border-t px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden">
        {primary ? (
          <Button className="min-w-0 flex-1" disabled={pending} onClick={primary.run}>
            <span className="truncate">{primary.label}</span>
          </Button>
        ) : (
          <span className="text-muted-foreground flex-1 truncate text-sm">
            «{ORDER_STATUS_LABELS[props.status]}» — переходов нет
          </span>
        )}
        {props.customerPhone ? (
          <Button asChild variant="outline" size="icon" aria-label="Позвонить клиенту">
            <a href={`tel:${props.customerPhone}`}>
              <Phone />
            </a>
          </Button>
        ) : null}
        {/* modal={false}: пункт открывает окно отмены, а модальное меню вернуло бы фокус себе и закрыло его */}
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" aria-label="Другие действия с заказом">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="min-w-56">
            {secondary.map((to) => (
              <DropdownMenuItem key={to} disabled={pending} onSelect={() => askStatus(to)}>
                {ORDER_STATUS_LABELS[to]}
              </DropdownMenuItem>
            ))}
            {secondary.length ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem asChild>
              <a href="#payments">
                <CreditCard />
                Оплаты
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href={props.invoiceHref} target="_blank" rel="noopener">
                <FileText />
                Счёт PDF
              </a>
            </DropdownMenuItem>
            {canCancel ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" disabled={pending} onSelect={() => setCancelOpen(true)}>
                  <XCircle />
                  Отменить заказ
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Статус «{confirmTo ? ORDER_STATUS_LABELS[confirmTo] : ""}»?</DialogTitle>
            <DialogDescription>
              Заказ №{props.orderNumber} перейдёт из «{ORDER_STATUS_LABELS[props.status]}» в «
              {confirmTo ? ORDER_STATUS_LABELS[confirmTo] : ""}».
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Отмена</Button>
            </DialogClose>
            <Button
              disabled={pending}
              onClick={() => {
                if (confirmTo) changeStatus(confirmTo);
                setConfirmOpen(false);
              }}
            >
              Перевести
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CancelDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        pending={pending}
        reasons={props.cancelReasons}
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
