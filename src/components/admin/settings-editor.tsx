"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ORDER_STATUS_LABELS } from "@/domain/order/status";
import { WORKING_MINUTES_PER_DAY, formatWorkingMinutes } from "@/domain/sla";
import type { SellerRequisites, SmtpSettings } from "@/domain/settings";
import type { OrderStatus } from "@/generated/prisma/enums";
import {
  saveDiscountLimitAction,
  saveRequisitesAction,
  saveSlaAction,
  saveSmtpAction,
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

/** Поля почтового сервера, кроме пароля и признака шифрования — у них своя разметка. */
const SMTP_FIELDS: { key: "host" | "user" | "from"; label: string; hint: string }[] = [
  { key: "host", label: "Сервер (SMTP-хост)", hint: "Например, smtp.yandex.ru. Пустой — почта выключена" },
  { key: "user", label: "Пользователь", hint: "Обычно полный адрес ящика" },
  { key: "from", label: "От кого", hint: "Должен совпадать с ящиком, иначе письмо отклонят" },
];

/**
 * Настройки почты. Сохранённый пароль в браузер не отдаётся: поле приходит
 * пустым, а `hasPassword` говорит, задан ли он. Пустое поле при сохранении
 * означает «оставить прежний».
 */
export function SmtpEditor({ smtp, hasPassword }: { smtp: SmtpSettings; hasPassword: boolean }) {
  const [values, setValues] = useState<SmtpSettings>(smtp);
  const { pending, handle } = useSettingsAction();

  const set = (key: keyof SmtpSettings, value: string | number | boolean) =>
    setValues((current) => ({ ...current, [key]: value }));

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4">
      <div>
        <h2 className="font-heading font-medium">Почта</h2>
        <p className="text-muted-foreground text-sm">
          Через этот сервер уходят письма со ссылкой на смену пароля. Пока сервер не указан, ссылка пишется в лог
          приложения, и сотрудник её не получит.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {SMTP_FIELDS.map((field) => (
          <div key={field.key} className="flex flex-col gap-1.5">
            <Label className="text-xs" htmlFor={`smtp-${field.key}`}>
              {field.label}
            </Label>
            <Input
              id={`smtp-${field.key}`}
              value={values[field.key]}
              onChange={(event) => set(field.key, event.target.value)}
              className="h-8"
            />
            <span className="text-muted-foreground text-xs">{field.hint}</span>
          </div>
        ))}

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs" htmlFor="smtp-password">
            Пароль
          </Label>
          <Input
            id="smtp-password"
            type="password"
            autoComplete="new-password"
            value={values.password}
            onChange={(event) => set("password", event.target.value)}
            className="h-8"
            placeholder={hasPassword ? "сохранён, оставьте пустым" : ""}
          />
          <span className="text-muted-foreground text-xs">
            {hasPassword
              ? "Пустое поле оставит сохранённый пароль"
              : "У Яндекса и mail.ru нужен пароль приложения, а не пароль от ящика"}
          </span>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs" htmlFor="smtp-port">
            Порт
          </Label>
          <Input
            id="smtp-port"
            inputMode="numeric"
            value={String(values.port)}
            onChange={(event) => set("port", event.target.value)}
            className="h-8"
          />
          <span className="text-muted-foreground text-xs">465 с шифрованием, 587 без него</span>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs" htmlFor="smtp-secure">
            Шифрование
          </Label>
          <Select value={values.secure ? "true" : "false"} onValueChange={(value) => set("secure", value === "true")}>
            <SelectTrigger id="smtp-secure" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="true">TLS сразу (порт 465)</SelectItem>
              <SelectItem value="false">STARTTLS (порт 587)</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-muted-foreground text-xs">Не тот вариант — отправка зависнет</span>
        </div>
      </div>

      <div>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => handle(saveSmtpAction(values))}>
          Сохранить настройки почты
        </Button>
      </div>
    </section>
  );
}
