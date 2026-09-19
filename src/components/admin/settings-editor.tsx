"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ORDER_STATUS_LABELS } from "@/domain/order/status";
import { WORKING_MINUTES_PER_DAY, formatWorkingMinutes } from "@/domain/sla";
import type { SellerRequisites } from "@/domain/settings";
import type { OrderStatus } from "@/generated/prisma/enums";
import {
  saveDiscountLimitAction,
  saveRequisitesAction,
  saveSlaAction,
  type SettingsResult,
} from "@/app/(app)/admin/dictionaries/actions";

const STATUSES = Object.keys(ORDER_STATUS_LABELS) as OrderStatus[];

const REQUISITE_FIELDS: { key: keyof SellerRequisites; label: string }[] = [
  { key: "name", label: "Название организации" },
  { key: "inn", label: "ИНН" },
  { key: "kpp", label: "КПП" },
  { key: "address", label: "Юридический адрес" },
  { key: "bankName", label: "Банк" },
  { key: "bankAccount", label: "Расчётный счёт" },
  { key: "correspondentAccount", label: "Корреспондентский счёт" },
  { key: "bic", label: "БИК" },
  { key: "signerName", label: "Подписант" },
  { key: "phone", label: "Телефон" },
];

function useSettingsAction() {
  const [pending, startTransition] = useTransition();

  function handle(action: Promise<SettingsResult>) {
    startTransition(async () => {
      const result = await action;
      if (result.ok) toast.success(result.message);
      else toast.error(result.error);
    });
  }

  return { pending, handle };
}

export function DiscountLimitEditor({ percent }: { percent: number }) {
  const [value, setValue] = useState(String(percent));
  const { pending, handle } = useSettingsAction();

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4">
      <div>
        <h2 className="font-heading font-medium">Лимит скидки менеджера</h2>
        <p className="text-muted-foreground text-sm">
          Сумма всех скидок заказа в процентах от стоимости товаров до скидок. Выше лимита скидку согласует
          руководитель.
        </p>
      </div>

      <div className="flex items-end gap-2">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs" htmlFor="discount-limit">
            Процент
          </Label>
          <Input
            id="discount-limit"
            inputMode="decimal"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className="h-8 w-24 text-right"
          />
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => handle(saveDiscountLimitAction(Number(value)))}
        >
          Сохранить
        </Button>
      </div>
    </section>
  );
}

export function SlaEditor({ slaMinutes }: { slaMinutes: Record<OrderStatus, number | null> }) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(STATUSES.map((status) => [status, slaMinutes[status]?.toString() ?? ""])),
  );
  const { pending, handle } = useSettingsAction();

  function save() {
    const payload: Record<string, number | null> = {};
    for (const status of STATUSES) {
      const raw = values[status]?.trim() ?? "";
      if (raw === "") {
        payload[status] = null;
        continue;
      }
      const minutes = Number(raw);
      if (!Number.isInteger(minutes) || minutes <= 0) {
        toast.error(`Для статуса «${ORDER_STATUS_LABELS[status]}» нужно целое число минут или пусто`);
        return;
      }
      payload[status] = minutes;
    }
    handle(saveSlaAction(payload));
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4">
      <div>
        <h2 className="font-heading font-medium">SLA по статусам</h2>
        <p className="text-muted-foreground text-sm">
          В рабочих минутах: пн–пт 09:00–18:00 по Москве, рабочий день — {WORKING_MINUTES_PER_DAY} минут. Пусто — срок
          не контролируется.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {STATUSES.map((status) => {
          const raw = values[status] ?? "";
          const minutes = Number(raw);
          const hint =
            raw && Number.isInteger(minutes) && minutes > 0 ? formatWorkingMinutes(minutes) : "не контролируется";

          return (
            <div key={status} className="flex items-center gap-2">
              <Label className="w-40 text-sm font-normal" htmlFor={`sla-${status}`}>
                {ORDER_STATUS_LABELS[status]}
              </Label>
              <Input
                id={`sla-${status}`}
                inputMode="numeric"
                value={raw}
                onChange={(event) => setValues((current) => ({ ...current, [status]: event.target.value }))}
                className="h-8 w-24 text-right"
              />
              <span className="text-muted-foreground text-xs">{hint}</span>
            </div>
          );
        })}
      </div>

      <div>
        <Button size="sm" variant="outline" disabled={pending} onClick={save}>
          Сохранить нормативы
        </Button>
      </div>
    </section>
  );
}

export function RequisitesEditor({ requisites }: { requisites: SellerRequisites }) {
  const [values, setValues] = useState<SellerRequisites>(requisites);
  const { pending, handle } = useSettingsAction();

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4">
      <div>
        <h2 className="font-heading font-medium">Реквизиты продавца</h2>
        <p className="text-muted-foreground text-sm">Подставляются в счёт на оплату для юрлиц.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {REQUISITE_FIELDS.map((field) => (
          <div key={field.key} className="flex flex-col gap-1.5">
            <Label className="text-xs" htmlFor={`req-${field.key}`}>
              {field.label}
            </Label>
            <Input
              id={`req-${field.key}`}
              value={values[field.key]}
              onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))}
              className="h-8"
            />
          </div>
        ))}
      </div>

      <div>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => handle(saveRequisitesAction(values))}>
          Сохранить реквизиты
        </Button>
      </div>
    </section>
  );
}
