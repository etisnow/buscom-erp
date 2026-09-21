"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatMoscowDateTime } from "@/domain/datetime";
import { ORDER_STATUS_LABELS } from "@/domain/order/status";
import type { OrderEventType, OrderStatus } from "@/generated/prisma/enums";
import { addCommentAction } from "@/app/(app)/orders/[number]/actions";

const EVENT_LABELS: Record<OrderEventType, string> = {
  CREATED: "Заказ создан",
  STATUS_CHANGED: "Смена статуса",
  ASSIGNED: "Назначен ответственный",
  UPDATED: "Изменение заказа",
  ITEMS_CHANGED: "Изменён состав",
  PAYMENT_ADDED: "Отмечена оплата",
  COMMENT: "Комментарий",
  SUPPLIER_STAGE_CHANGED: "Этап поставщика",
};

export type HistoryEvent = {
  id: string;
  type: OrderEventType;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus | null;
  comment: string | null;
  createdAt: Date;
  authorName: string | null;
};

export function OrderHistory({
  orderId,
  orderNumber,
  events,
}: {
  orderId: string;
  orderNumber: number;
  events: HistoryEvent[];
}) {
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await addCommentAction(orderId, orderNumber, text);
      if (result.ok) {
        toast.success("Комментарий добавлен");
        setText("");
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4">
      <h2 className="font-heading font-medium">История</h2>

      <div className="flex flex-col gap-2">
        <Textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Внутренний комментарий — виден только сотрудникам"
          rows={2}
        />
        <div>
          <Button size="sm" variant="outline" disabled={pending || !text.trim()} onClick={submit}>
            Добавить комментарий
          </Button>
        </div>
      </div>

      <ol className="flex flex-col gap-3 border-t pt-3">
        {events.map((event) => (
          <li key={event.id} className="flex flex-col gap-0.5 text-sm">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="font-medium">{EVENT_LABELS[event.type]}</span>
              {/* После упрощения статусов у старых записей from и to совпадают — прежний переход в комментарии. */}
              {event.fromStatus && event.toStatus && event.fromStatus !== event.toStatus ? (
                <span className="text-muted-foreground">
                  {ORDER_STATUS_LABELS[event.fromStatus]} → {ORDER_STATUS_LABELS[event.toStatus]}
                </span>
              ) : null}
              <span className="text-muted-foreground text-xs">
                {/* Автор null — действие системы: интеграция или автопереход по оплате. */}
                {event.authorName ?? "система"} · {formatMoscowDateTime(event.createdAt)}
              </span>
            </div>
            {event.comment ? <p className="text-muted-foreground">{event.comment}</p> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
