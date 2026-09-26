"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DEFAULT_EMAIL_TEMPLATES,
  EMAIL_TEMPLATE_KEYS,
  EMAIL_TEMPLATE_LABELS,
  TEMPLATE_PLACEHOLDERS,
  type EmailTemplates,
} from "@buscom/domain/email/templates";
import { saveEmailTemplatesAction } from "@/app/(app)/admin/mail/actions";

/**
 * Шаблоны писем клиенту. Подстановки в фигурных скобках заполняются данными
 * заказа, когда менеджер выбирает шаблон в карточке, — там же текст можно
 * поправить перед отправкой.
 */
export function EmailTemplatesEditor({ templates }: { templates: EmailTemplates }) {
  const [values, setValues] = useState<EmailTemplates>(templates);
  const [pending, startTransition] = useTransition();

  function update(key: keyof EmailTemplates, field: "subject" | "body", value: string) {
    setValues((current) => ({ ...current, [key]: { ...current[key], [field]: value } }));
  }

  function save() {
    startTransition(async () => {
      const result = await saveEmailTemplatesAction(values);
      if (result.ok) toast.success(result.message);
      else toast.error(result.error);
    });
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4">
      <div>
        <h2 className="font-heading font-medium">Шаблоны писем клиенту</h2>
        <p className="text-muted-foreground text-sm">
          Выбираются в карточке заказа, в блоке «Переписка». Строка, в которой все подстановки оказались пустыми
          (например, «Трек-номер: {"{трек}"}» без трека), в письмо не попадает.
        </p>
      </div>

      <details className="text-sm">
        <summary className="text-muted-foreground hover:text-foreground cursor-pointer">Подстановки</summary>
        <ul className="mt-2 grid gap-x-6 gap-y-0.5 sm:grid-cols-2">
          {TEMPLATE_PLACEHOLDERS.map((item) => (
            <li key={item.key}>
              <code className="bg-muted rounded px-1">{`{${item.key}}`}</code>{" "}
              <span className="text-muted-foreground">— {item.description}</span>
            </li>
          ))}
        </ul>
      </details>

      {EMAIL_TEMPLATE_KEYS.map((key) => (
        <fieldset key={key} className="flex flex-col gap-2 border-t pt-3">
          <div className="flex items-center justify-between gap-2">
            <legend className="text-sm font-medium">{EMAIL_TEMPLATE_LABELS[key]}</legend>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setValues((current) => ({ ...current, [key]: DEFAULT_EMAIL_TEMPLATES[key] }))}
            >
              Вернуть исходный
            </Button>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs" htmlFor={`tpl-${key}-subject`}>
              Тема
            </Label>
            <Input
              id={`tpl-${key}-subject`}
              value={values[key].subject}
              onChange={(event) => update(key, "subject", event.target.value)}
              className="h-8"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs" htmlFor={`tpl-${key}-body`}>
              Текст
            </Label>
            <Textarea
              id={`tpl-${key}-body`}
              value={values[key].body}
              onChange={(event) => update(key, "body", event.target.value)}
              rows={7}
            />
          </div>
        </fieldset>
      ))}

      <div>
        <Button size="sm" variant="outline" disabled={pending} onClick={save}>
          Сохранить шаблоны
        </Button>
      </div>
    </section>
  );
}
