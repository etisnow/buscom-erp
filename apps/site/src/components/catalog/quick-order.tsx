"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { quickOrderAction } from "@/app/korzina/actions";
import { ecommerce, reachGoal } from "@/components/analytics/metrika";
import { COMPANY } from "@/config/company";
import { PhoneInput } from "@/components/phone-input";
import { submitWithoutReset } from "@/components/submit-without-reset";

/**
 * «Купить в 1 клик» (экран 03 макета): имя и телефон — заказ сразу уходит в ERP с
 * пометкой «перезвонить». Позиция — та же, что выбрана в конфигураторе; цену
 * пересчитает сервер. `requestId` — как в корзине: двойное нажатие не создаст
 * второй заказ.
 */
export function QuickOrder({
  line,
  sku,
  name,
  priceKopecks,
}: {
  line: { productId: string; valueIds: string[]; quantity: number };
  sku: string;
  name: string;
  priceKopecks: number;
}) {
  const [open, setOpen] = useState(false);
  const [requestId] = useState(() => crypto.randomUUID());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [orderNumber, setOrderNumber] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  if (orderNumber !== null) {
    return (
      <div className="bg-brand-soft col-span-full rounded-[10px] p-4" role="status">
        <p className="font-semibold">Заказ № {orderNumber} принят</p>
        <p className="text-ink-2 mt-1 text-sm">
          Менеджер перезвонит в рабочее время ({COMPANY.hours}), уточнит доставку и оплату.
        </p>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="border-brand text-brand hover:bg-brand-soft h-[54px] rounded-[10px] border-[1.5px] px-4 text-[15px] font-semibold"
      >
        Купить в 1 клик
      </button>
    );
  }

  function submit(formData: FormData) {
    const form = {
      requestId,
      name: formData.get("name"),
      phone: formData.get("phone"),
      consent: formData.get("consent") === "on",
      website: formData.get("website"),
    };
    startTransition(async () => {
      const result = await quickOrderAction(line, form);
      if (result.ok) {
        reachGoal("order_placed");
        ecommerce({
          purchase: {
            actionField: { id: String(result.orderNumber) },
            products: [{ id: sku, name, price: priceKopecks / 100, quantity: line.quantity }],
          },
        });
        setOrderNumber(result.orderNumber);
        return;
      }
      setErrors(result.fieldErrors ?? {});
      setMessage(result.error);
    });
  }

  const input = "border-line w-full rounded-md border bg-white px-3 py-3";
  const field = (key: string) => (errors[key] ? <p className="mt-1 text-sm text-red-700">{errors[key]}</p> : null);

  return (
    <form
      onSubmit={submitWithoutReset(submit)}
      noValidate
      className="border-line col-span-full w-full space-y-3 rounded-[10px] border bg-white p-4"
    >
      <p className="font-semibold">Купить в 1 клик</p>
      <p className="text-muted text-sm">Оставьте телефон — менеджер перезвонит, уточнит доставку и оплату.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm">ФИО *</span>
          <input name="name" autoComplete="name" className={input} />
          {field("name")}
        </label>
        <label className="block">
          <span className="text-sm">Телефон *</span>
          <PhoneInput name="phone" className={input} />
          {field("phone")}
        </label>
      </div>
      {/* Поле-ловушка для ботов: скрыто от людей и от программ чтения экрана */}
      <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
      <label className="flex items-start gap-2 text-sm">
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
      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="bg-brand hover:bg-brand-hover h-12 rounded-md px-6 font-semibold text-white disabled:opacity-50"
        >
          {pending ? "Отправляем…" : "Отправить"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-muted hover:text-ink h-12 px-2 text-sm">
          Отмена
        </button>
      </div>
    </form>
  );
}
