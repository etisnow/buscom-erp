"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import type { LeadKind } from "@buscom/domain/site/lead";
import { sendLeadAction } from "@/app/_actions/lead";
import { reachGoal } from "@/components/analytics/metrika";
import { COMPANY } from "@/config/company";

/**
 * Заявка с сайта: «обратный звонок» (имя и телефон) или «салон целиком» (плюс модель
 * и задача). Уходит письмом на почту компании через ERP (src/server/leads.ts).
 */
export function LeadForm({ kind, submitLabel }: { kind: LeadKind; submitLabel: string }) {
  const pathname = usePathname();
  const [requestId] = useState(() => crypto.randomUUID());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  if (sent) {
    return (
      <p className="bg-brand-soft rounded-md p-4" role="status">
        Заявка отправлена. Перезвоним в рабочее время: {COMPANY.hours}.
      </p>
    );
  }

  function submit(formData: FormData) {
    const form = {
      requestId,
      kind,
      name: formData.get("name"),
      phone: formData.get("phone"),
      model: formData.get("model") ?? undefined,
      task: formData.get("task") ?? undefined,
      consent: formData.get("consent") === "on",
      website: formData.get("website"),
    };
    startTransition(async () => {
      const result = await sendLeadAction(form, pathname);
      if (result.ok) {
        reachGoal("lead_sent", { kind });
        setSent(true);
        return;
      }
      setErrors(result.fieldErrors ?? {});
      setMessage(result.error);
    });
  }

  const input = "border-line w-full rounded-md border bg-white px-3 py-2";
  const field = (key: string) => (errors[key] ? <p className="mt-1 text-sm text-red-700">{errors[key]}</p> : null);

  return (
    <form action={submit} noValidate className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm">Имя *</span>
          <input name="name" autoComplete="name" className={input} />
          {field("name")}
        </label>
        <label className="block">
          <span className="text-sm">Телефон *</span>
          <input name="phone" type="tel" autoComplete="tel" placeholder="+7" className={input} />
          {field("phone")}
        </label>
      </div>
      {kind === "salon" && (
        <>
          <label className="block">
            <span className="text-sm">Модель автомобиля</span>
            <input name="model" placeholder="Например, ГАЗель Next" className={input} />
          </label>
          <label className="block">
            <span className="text-sm">Задача</span>
            <textarea
              name="task"
              rows={3}
              placeholder="Сколько мест, что поменять: сиденья, обшивка, пол, свет…"
              className={input}
            />
          </label>
        </>
      )}
      {/* Поле-ловушка для ботов: скрыто от людей и от программ чтения экрана */}
      <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
      <label className="flex items-start gap-2 text-sm">
        <input name="consent" type="checkbox" className="mt-1" />
        <span>
          Согласен на обработку персональных данных в соответствии с{" "}
          <Link href="/privacy" target="_blank" className="text-brand underline">
            политикой обработки персональных данных
          </Link>
        </span>
      </label>
      {field("consent")}
      {message && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{message}</p>}
      <button
        type="submit"
        disabled={pending}
        className="bg-brand hover:bg-brand-hover rounded-md px-5 py-2 font-semibold text-white disabled:opacity-50"
      >
        {pending ? "Отправляем…" : submitLabel}
      </button>
    </form>
  );
}
