"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveClientStatusesAction } from "@/app/(app)/admin/client-statuses/actions";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  clientStatusLabel,
  DEFAULT_ORDER_STATUS_MAP,
  ORDER_STATUS_KEYS,
  PROGRESS_STEPS,
  type ClientStatusMapping,
  type MappedStatus,
  type ProgressStep,
} from "@buscom/domain/order/client-status";
import { ORDER_STATUS_LABELS } from "@buscom/domain/order/status";

/** «Этап ничего не меняет»: в таблице этапов такого этапа нет */
const NONE = "__none__";

export type SupplierWithStages = { id: string; name: string; stages: { id: string; name: string }[] };

const ORDER_OPTIONS: MappedStatus[] = [...PROGRESS_STEPS, "CANCELLED"];

/**
 * Две таблицы соответствия: «статус заказа ERP → клиентский» и «этап поставщика → клиентский».
 * «Передан в ТК» в списке без названия перевозчика: у клиента подставится ТК его заказа.
 */
export function ClientStatusesEditor({
  mapping,
  suppliers,
}: {
  mapping: ClientStatusMapping;
  suppliers: SupplierWithStages[];
}) {
  const [orderStatuses, setOrderStatuses] = useState(() =>
    Object.fromEntries(
      ORDER_STATUS_KEYS.map((status) => [status, mapping.orderStatuses[status] ?? DEFAULT_ORDER_STATUS_MAP[status]]),
    ),
  );
  const [stages, setStages] = useState<Record<string, ProgressStep>>(mapping.supplierStages);
  const [pending, startTransition] = useTransition();

  function setStage(stageId: string, value: string) {
    setStages((current) => {
      const next = { ...current };
      if (value === NONE) delete next[stageId];
      else next[stageId] = value as ProgressStep;
      return next;
    });
  }

  function save() {
    startTransition(async () => {
      const result = await saveClientStatusesAction({
        orderStatuses: orderStatuses as ClientStatusMapping["orderStatuses"],
        supplierStages: stages,
      });
      if (result.ok) toast.success(result.message);
      else toast.error(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-3 rounded-lg border p-4">
        <div>
          <h2 className="font-heading font-medium">Статус заказа ERP → клиентский статус</h2>
          <p className="text-muted-foreground text-sm">
            Основа для клиента. «Получен» и «Отменён» этапы поставщиков уже не меняют.
          </p>
        </div>
        <div className="grid max-w-xl gap-2 sm:grid-cols-[1fr_220px] sm:items-center">
          {ORDER_STATUS_KEYS.map((status) => (
            <div key={status} className="contents">
              <span className="text-sm">{ORDER_STATUS_LABELS[status]}</span>
              <Select
                value={orderStatuses[status]}
                onValueChange={(value) =>
                  setOrderStatuses((current) => ({ ...current, [status]: value as MappedStatus }))
                }
              >
                <SelectTrigger size="sm" aria-label={`Клиентский статус для «${ORDER_STATUS_LABELS[status]}»`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ORDER_OPTIONS.map((key) => (
                    <SelectItem key={key} value={key}>
                      {clientStatusLabel(key)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-lg border p-4">
        <div>
          <h2 className="font-heading font-medium">Этап поставщика → клиентский статус</h2>
          <p className="text-muted-foreground text-sm">
            Пока заказ «в работе», этапы поставщиков двигают его по шкале. Если поставщиков несколько, заказ идёт за
            самым отстающим. Этап «не меняет» — оставляет заказ на статусе по таблице выше.
          </p>
        </div>
        {suppliers.length === 0 ? (
          <p className="text-muted-foreground text-sm">У поставщиков пока нет этапов — настройте их в «Поставщиках».</p>
        ) : (
          suppliers.map((supplier) => (
            <div key={supplier.id} className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">{supplier.name}</h3>
              <div className="grid max-w-xl gap-2 sm:grid-cols-[1fr_220px] sm:items-center">
                {supplier.stages.map((stage) => (
                  <div key={stage.id} className="contents">
                    <span className="text-muted-foreground text-sm">{stage.name}</span>
                    <Select value={stages[stage.id] ?? NONE} onValueChange={(value) => setStage(stage.id, value)}>
                      <SelectTrigger size="sm" aria-label={`Клиентский статус для этапа «${stage.name}»`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Не меняет</SelectItem>
                        {PROGRESS_STEPS.map((key) => (
                          <SelectItem key={key} value={key}>
                            {clientStatusLabel(key)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </section>

      <div>
        <Button size="sm" disabled={pending} onClick={save}>
          {pending ? "Сохраняем…" : "Сохранить соответствие"}
        </Button>
      </div>
    </div>
  );
}
