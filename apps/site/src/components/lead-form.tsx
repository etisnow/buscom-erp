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

  const input =
    "border-line-strong placeholder:text-subtle focus:border-brand h-12 w-full rounded-[9px] border bg-white px-3.5 text-[15px] outline-none";
  const field = (key: string) => (errors[key] ? <p className="mt-1 text-sm text-red-700">{errors[key]}</p> : null);

  // Поля без подписей, с подсказкой внутри — как в макете; для программ чтения экрана — aria-label
  return (
    <form action={submit} noValidate className="flex flex-col gap-3">
      <div>
        <input name="name" autoComplete="name" placeholder="Имя" aria-label="Имя" className={input} />
        {field("name")}
      </div>
      <div>
        <input
          name="phone"
          type="tel"
          autoComplete="tel"
          placeholder="Телефон, +7…"
          aria-label="Телефон"
          className={input}
        />
        {field("phone")}
      </div>
      {kind === "salon" && (
        <input
          name="task"
          placeholder="Модель авто и что нужно"
          aria-label="Модель авто и что нужно"
          className={input}
        />
      )}
      {/* Поле-ловушка для ботов: скрыто от людей и от программ чтения экрана */}
      <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
      <label className="text-muted flex items-start gap-2 text-xs leading-snug">
        <input name="consent" type="checkbox" className="accent-brand mt-0.5 shrink-0" />
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
        className="bg-accent hover:bg-accent-hover text-ink h-[50px] rounded-[9px] text-[15px] font-semibold disabled:opacity-50"
      >
        {pending ? "Отправляем…" : submitLabel}
      </button>
      <p className="text-muted text-xs leading-snug">Перезвоним в рабочее время: {COMPANY.hours}</p>
    </form>
  );
}
