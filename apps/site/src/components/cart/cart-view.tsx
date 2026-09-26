"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { formatRub } from "@buscom/domain/money";
import { describeOptions } from "@buscom/domain/product/options";
import { CARRIERS, MAX_QUANTITY, type PricedCart } from "@buscom/domain/site/cart";
import { placeOrderAction, priceCartAction } from "@/app/korzina/actions";
import { COMPANY } from "@/config/company";
import { cartActions, useCart } from "./cart-store";

/**
 * Корзина и оформление (экран 04). Цены показываются из пересчёта на сервере
 * (`priceCartAction`) и пересчитываются при каждом изменении корзины; при отправке
 * сервер считает их ещё раз. `requestId` — ключ идемпотентности: двойное нажатие
 * или повтор после обрыва связи не создадут второй заказ в ERP.
 */
export function CartView() {
  const cart = useCart();
  const [priced, setPriced] = useState<PricedCart | null>(null);
  const [done, setDone] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    priceCartAction(cart).then((result) => {
      if (!cancelled) setPriced(result);
    });
    return () => {
      cancelled = true;
    };
  }, [cart]);

  if (done !== null) {
    return (
      <div className="bg-brand-soft max-w-2xl space-y-3 rounded-lg p-6">
        <p className="text-2xl font-bold">Заказ № {done} принят</p>
        <p className="text-ink-2">
          Менеджер свяжется с вами, подтвердит наличие и сроки и пришлёт счёт или реквизиты для оплаты. Вопросы по
          заказу — {COMPANY.phone.display}, назовите номер заказа.
        </p>
        <Link href="/" className="text-brand hover:text-brand-hover font-medium">
          Вернуться в каталог
        </Link>
      </div>
    );
  }

  if (cart.length === 0) {
    return (
      <p className="text-ink-2">
        Корзина пуста.{" "}
        <Link href="/" className="text-brand hover:text-brand-hover font-medium">
          Перейти в каталог
        </Link>
      </p>
    );
  }

  if (!priced) return <p className="text-muted">Считаем корзину…</p>;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_24rem]">
      <div className="space-y-6">
        <CartLines cart={cart} priced={priced} />
        {priced.dropped.length > 0 && (
          <ul className="space-y-1 rounded-lg bg-orange-50 p-4 text-sm text-orange-900">
            {priced.dropped.map((item, index) => (
              <li key={index}>{item.reason} — позиция не попадёт в заказ, удалите её из корзины</li>
            ))}
          </ul>
        )}
        <CheckoutForm cart={cart} onDone={setDone} disabled={priced.lines.length === 0 || priced.dropped.length > 0} />
      </div>
      <aside className="bg-surface h-fit space-y-2 rounded-lg p-5 lg:sticky lg:top-4">
        <p className="flex justify-between text-lg font-semibold">
          <span>Итого</span>
          <span>{formatRub(priced.totalKopecks)}</span>
        </p>
        {priced.lines.some((line) => line.unitPriceKopecks === 0) && (
          <p className="text-muted text-sm">Цену товаров «по запросу» менеджер сообщит после заказа.</p>
        )}
        <p className="text-muted text-sm">
          Доставка оплачивается транспортной компании и в сумму не входит. Онлайн-оплаты нет — счёт или реквизиты
          пришлёт менеджер.
        </p>
      </aside>
    </div>
  );
}

function CartLines({ cart, priced }: { cart: ReturnType<typeof useCart>; priced: PricedCart }) {
  const byIndex = new Map(priced.lines.map((line) => [line.lineIndex, line]));
  return (
    <ul className="divide-line border-line divide-y rounded-lg border bg-white">
      {cart.map((line, index) => {
        const item = byIndex.get(index) ?? null;
        return (
          <li key={index} className="flex flex-wrap items-center gap-4 p-4">
            <div className="min-w-0 grow">
              {item ? (
                <>
                  <Link href={item.slug ? `/${item.slug}` : "#"} className="hover:text-brand font-medium">
                    {item.name}
                  </Link>
                  <p className="text-subtle font-mono text-xs">{item.sku}</p>
                  {item.options.length > 0 && <p className="text-muted text-sm">{describeOptions(item.options)}</p>}
                </>
              ) : (
                <span className="text-muted">Недоступная позиция</span>
              )}
            </div>
            <input
              type="number"
              min={1}
              max={MAX_QUANTITY}
              value={line.quantity}
              aria-label="Количество"
              onChange={(event) =>
                cartActions.setQuantity(index, Math.min(MAX_QUANTITY, Math.max(1, Number(event.target.value) || 1)))
              }
              className="border-line w-20 rounded-md border px-3 py-2"
            />
            <span className="w-32 text-right font-semibold">
              {item ? (item.unitPriceKopecks > 0 ? formatRub(item.totalKopecks) : "по запросу") : "—"}
            </span>
            <button
              type="button"
              onClick={() => cartActions.remove(index)}
              className="text-muted hover:text-ink text-sm"
              aria-label="Удалить из корзины"
            >
              Удалить
            </button>
          </li>
        );
      })}
    </ul>
  );
}

type FieldErrors = Record<string, string>;

function CheckoutForm({
  cart,
  onDone,
  disabled,
}: {
  cart: ReturnType<typeof useCart>;
  onDone: (orderNumber: number) => void;
  disabled: boolean;
}) {
  const [requestId] = useState(() => crypto.randomUUID());
  const [customerType, setCustomerType] = useState<"PERSON" | "COMPANY">("PERSON");
  const [deliveryMethod, setDeliveryMethod] = useState<"PICKUP" | "CARRIER">("CARRIER");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    const form = {
      requestId,
      customerType,
      deliveryMethod,
      name: formData.get("name"),
      phone: formData.get("phone"),
      email: formData.get("email"),
      companyName: formData.get("companyName") ?? undefined,
      inn: formData.get("inn") ?? undefined,
      kpp: formData.get("kpp") ?? undefined,
      carrier: formData.get("carrier") || undefined,
      address: formData.get("address") ?? undefined,
      comment: formData.get("comment"),
      consent: formData.get("consent") === "on",
      website: formData.get("website"),
    };
    startTransition(async () => {
      const result = await placeOrderAction(cart, form);
      if (result.ok) {
        cartActions.clear();
        onDone(result.orderNumber);
        return;
      }
      setErrors(result.fieldErrors ?? {});
      setMessage(result.error);
    });
  }

  const field = (name: string) => (errors[name] ? <p className="mt-1 text-sm text-red-700">{errors[name]}</p> : null);
  const input = "border-line w-full rounded-md border bg-white px-3 py-2";

  return (
    <form action={submit} className="border-line space-y-6 rounded-lg border bg-white p-5" noValidate>
      <fieldset className="space-y-3">
        <legend className="mb-2 text-lg font-semibold">1. Покупатель</legend>
        <div className="flex gap-2">
          {(
            [
              ["PERSON", "Частное лицо"],
              ["COMPANY", "Организация"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setCustomerType(value)}
              aria-pressed={customerType === value}
              className={`rounded-md border px-4 py-2 ${customerType === value ? "border-brand bg-brand-soft" : "border-line"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="block">
          <span className="text-sm">Имя *</span>
          <input name="name" autoComplete="name" className={input} />
          {field("name")}
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm">Телефон *</span>
            <input name="phone" type="tel" autoComplete="tel" placeholder="+7" className={input} />
            {field("phone")}
          </label>
          <label className="block">
            <span className="text-sm">Эл. почта</span>
            <input name="email" type="email" autoComplete="email" className={input} />
            {field("email")}
          </label>
        </div>
        {customerType === "COMPANY" && (
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block sm:col-span-3">
              <span className="text-sm">Организация *</span>
              <input name="companyName" autoComplete="organization" className={input} />
              {field("companyName")}
            </label>
            <label className="block">
              <span className="text-sm">ИНН *</span>
              <input name="inn" inputMode="numeric" className={input} />
              {field("inn")}
            </label>
            <label className="block">
              <span className="text-sm">КПП</span>
              <input name="kpp" inputMode="numeric" className={input} />
              {field("kpp")}
            </label>
          </div>
        )}
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-2 text-lg font-semibold">2. Доставка</legend>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["CARRIER", "Транспортной компанией"],
              ["PICKUP", "Самовывоз"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setDeliveryMethod(value)}
              aria-pressed={deliveryMethod === value}
              className={`rounded-md border px-4 py-2 ${deliveryMethod === value ? "border-brand bg-brand-soft" : "border-line"}`}
            >
              {label}
            </button>
          ))}
        </div>
        {deliveryMethod === "PICKUP" ? (
          <p className="text-ink-2 text-sm">
            {COMPANY.warehouse.city}, {COMPANY.warehouse.street}. {COMPANY.hours}.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="text-sm">Транспортная компания *</span>
              <select name="carrier" defaultValue="" className={input}>
                <option value="" disabled>
                  Выберите
                </option>
                {CARRIERS.map((carrier) => (
                  <option key={carrier}>{carrier}</option>
                ))}
              </select>
              {field("carrier")}
            </label>
            <label className="block sm:col-span-2">
              <span className="text-sm">Город и адрес или терминал *</span>
              <input name="address" autoComplete="street-address" className={input} />
              {field("address")}
            </label>
          </div>
        )}
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-2 text-lg font-semibold">3. Оплата и комментарий</legend>
        <p className="text-ink-2 text-sm">
          {customerType === "COMPANY"
            ? "Безналичный расчёт по счёту — счёт пришлёт менеджер после подтверждения наличия."
            : "Способ оплаты согласует менеджер после подтверждения наличия: наличными при самовывозе или переводом."}
        </p>
        <label className="block">
          <span className="text-sm">Комментарий к заказу</span>
          <textarea name="comment" rows={3} className={input} />
        </label>
      </fieldset>

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
        disabled={pending || disabled}
        className="bg-accent hover:bg-accent-hover rounded-md px-6 py-3 font-semibold text-white disabled:opacity-50"
      >
        {pending ? "Отправляем…" : "Оформить заказ"}
      </button>
    </form>
  );
}
