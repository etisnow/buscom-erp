"use client";

import { useState, useTransition } from "react";
import { formatRub } from "@buscom/domain/money";
import { formatDeliveryDate, formatStepDate, type ClientOrderStatus } from "@buscom/domain/site/order-status";
import { checkOrderStatusAction } from "@/app/_actions/order-status";
import { reachGoal } from "@/components/analytics/metrika";

/**
 * «Проверить статус заказа» на главной (по макету): слева номер заказа и телефон,
 * справа — шкала шагов, трек-номер ТК и, когда ТК отвечает, её статус по накладной.
 * Статус считает ERP (таблицы соответствия — «Статусы для клиента» в её админке).
 */
export function OrderStatusCheck({
  as = "block",
}: {
  /** `page` — отдельная страница: заголовок — h1, а не h2 блока на главной */ as?: "block" | "page";
}) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [status, setStatus] = useState<ClientOrderStatus | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    startTransition(async () => {
      const result = await checkOrderStatusAction({ number: formData.get("number"), phone: formData.get("phone") });
      if (result.ok) {
        reachGoal("order_status_checked");
        setStatus(result.status);
        setErrors({});
        setMessage(null);
        return;
      }
      setStatus(null);
      setErrors(result.fieldErrors ?? {});
      setMessage(result.error);
    });
  }

  const input =
    "border-line-strong placeholder:text-subtle focus:border-brand h-14 w-full rounded-[10px] border bg-white px-4 text-base outline-none";
  const field = (key: string) => (errors[key] ? <p className="mt-1 text-sm text-red-700">{errors[key]}</p> : null);

  return (
    <section
      id="status-zakaza"
      className="card grid scroll-mt-4 grid-cols-[minmax(0,1fr)] gap-5 rounded-[18px] p-5 md:p-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,8fr)] lg:gap-10"
    >
      <div className="flex flex-col gap-4">
        {as === "page" ? (
          <h1 className="page-title">Проверить статус заказа</h1>
        ) : (
          <h2 className="text-[22px] font-bold tracking-[-.01em] md:text-[30px]">Проверить статус заказа</h2>
        )}
        <p className="text-ink-2 text-[15px] leading-normal md:text-base">
          Номер заказа есть в письме-подтверждении. Телефон — тот, что указали при оформлении.
        </p>
        <form action={submit} noValidate className="flex flex-col gap-3.5">
          <div>
            <label htmlFor="order-status-number" className="text-muted mb-1.5 block text-sm">
              Номер заказа
            </label>
            <input
              id="order-status-number"
              name="number"
              inputMode="numeric"
              autoComplete="off"
              placeholder="3037"
              className={`${input} font-mono`}
            />
            {field("number")}
          </div>
          <div>
            <label htmlFor="order-status-phone" className="text-muted mb-1.5 block text-sm">
              Телефон
            </label>
            <input
              id="order-status-phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              placeholder="+7 910 123-45-67"
              className={input}
            />
            {field("phone")}
          </div>
          {message && (
            <p className="rounded-md bg-red-50 p-3 text-sm text-red-800" role="alert">
              {message}
            </p>
          )}
          <button
            type="submit"
            disabled={pending}
            className="bg-brand hover:bg-brand-hover h-14 rounded-[10px] text-base font-semibold text-white disabled:opacity-50"
          >
            {pending ? "Проверяем…" : "Проверить"}
          </button>
        </form>
      </div>

      <div
        className="bg-surface flex min-h-[220px] flex-col justify-center rounded-[14px] p-5 md:p-8"
        aria-live="polite"
      >
        {status ? (
          <StatusPanel status={status} />
        ) : (
          <p className="text-muted max-w-[420px] text-[15px] leading-normal">
            Введите номер заказа и телефон — покажем, где сейчас заказ, когда он принят, оплачен и передан в
            транспортную компанию.
          </p>
        )}
      </div>
    </section>
  );
}

/**
 * Цвет верхней линии шага: пройден — зелёный, текущий — оранжевый, впереди — серый (как в макете);
 * частичная оплата — наполовину зелёная.
 */
const STEP_LINE = {
  done: "bg-brand",
  current: "bg-accent",
  pending: "bg-line-strong",
  partial: "bg-gradient-to-r from-brand from-50% to-line-strong to-50%",
} as const;

function StatusPanel({ status }: { status: ClientOrderStatus }) {
  const { tracking, delivery } = status;
  const expected = delivery.expected ? `Ожидаемая доставка ${formatDeliveryDate(delivery.expected)}` : null;
  const meta = [expected, delivery.address].filter(Boolean).join(" · ");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="text-muted font-mono text-xs tracking-[.06em]">
            ЗАКАЗ № {status.number} · {formatRub(status.totalKopecks)}
          </span>
          <h3 className="text-[26px] leading-[1.1] font-bold tracking-[-.01em] md:text-[32px]">{status.headline}</h3>
          {meta && <p className="text-ink-2 text-[15px] leading-snug">{meta}</p>}
          {tracking?.live && (
            <p className="text-ink-2 text-[15px] leading-snug">
              {tracking.carrier}: {tracking.live.text}
              {tracking.live.at ? ` · ${formatStepDate(tracking.live.at)}` : ""}
            </p>
          )}
        </div>
        {tracking && (
          <div className="flex flex-col gap-0.5 sm:items-end sm:text-right">
            <span className="text-muted text-[13px]">Трек-номер {tracking.carrier}</span>
            <span className="font-mono text-[17px] font-bold tracking-[.02em]">{tracking.number}</span>
            {tracking.url && (
              <a
                href={tracking.url}
                target="_blank"
                rel="noreferrer"
                className="text-brand hover:text-brand-hover text-sm font-medium"
              >
                Отследить →
              </a>
            )}
          </div>
        )}
      </div>

      <ol className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-[repeat(auto-fit,minmax(0,1fr))]">
        {status.steps.map((step) => (
          <li key={step.key} className="flex min-w-0 flex-col gap-1">
            <span className={`h-[3px] rounded-full ${STEP_LINE[step.state]}`} aria-hidden="true" />
            <span
              className={`mt-1 text-[15px] leading-tight font-semibold ${step.state === "pending" ? "text-subtle" : "text-ink"}`}
            >
              {step.label}
            </span>
            <span className="text-muted text-[13px]">
              {step.state === "pending" ? "ожидается" : step.at ? formatStepDate(step.at) : ""}
            </span>
            {step.note && <span className="text-muted text-[13px] leading-snug">{step.note}</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}
