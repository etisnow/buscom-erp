"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { formatRub } from "@buscom/domain/money";
import { pluralize } from "@buscom/domain/money-words";
import { describeOptions } from "@buscom/domain/product/options";
import { CARRIERS, cartToText, MAX_QUANTITY, type PricedCart } from "@buscom/domain/site/cart";
import { lookupCompanyAction, placeOrderAction, priceCartAction } from "@/app/korzina/actions";
import { ecommerce, reachGoal } from "@/components/analytics/metrika";
import { NoPhoto } from "@/components/catalog/product-card";
import { COMPANY, SITE_ORIGIN } from "@/config/company";
import { cartActions, useCart } from "./cart-store";

/**
 * Корзина и оформление (экран 04). Цены показываются из пересчёта на сервере
 * (`priceCartAction`) и пересчитываются при каждом изменении корзины; при отправке
 * сервер считает их ещё раз. `requestId` — ключ идемпотентности: двойное нажатие
 * или повтор после обрыва связи не создадут второй заказ в ERP.
 */
type DisplayCart = Awaited<ReturnType<typeof priceCartAction>>;
type DeliveryMethod = "PICKUP" | "CARRIER";

export function CartView() {
  const cart = useCart();
  const [priced, setPriced] = useState<DisplayCart | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>("CARRIER");
  const [status, setStatus] = useState<{ pending: boolean; message: string | null }>({ pending: false, message: null });

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
      <div className="card flex max-w-2xl flex-col gap-3 p-6 md:p-8">
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
      <p className="card text-ink-2 p-6">
        Корзина пуста.{" "}
        <Link href="/" className="text-brand hover:text-brand-hover font-medium">
          Перейти в каталог
        </Link>
      </p>
    );
  }

  if (!priced) return <p className="text-muted">Считаем корзину…</p>;

  const disabled = priced.lines.length === 0 || priced.dropped.length > 0;
  const pieces = priced.lines.reduce((sum, line) => sum + line.quantity, 0);
  return (
    <div className="grid grid-cols-1 gap-3 md:gap-5 lg:grid-cols-[minmax(0,1fr)_440px] lg:items-start">
      <div className="flex flex-col gap-3 md:gap-5">
        <div className="card px-4 md:px-6">
          <CartLines cart={cart} priced={priced} />
          <p className="border-line text-ink-2 border-t py-4 text-sm">
            Нужен комплект на весь автопарк? Напишите в Max {COMPANY.max.display} — посчитаем оптовую цену.
          </p>
        </div>
        {priced.dropped.length > 0 && (
          <ul className="flex flex-col gap-1 rounded-xl bg-orange-50 p-4 text-sm text-orange-900">
            {priced.dropped.map((item, index) => (
              <li key={index}>{item.reason} — позиция не попадёт в заказ, удалите её из корзины</li>
            ))}
          </ul>
        )}
        <CheckoutForm
          cart={cart}
          priced={priced}
          onDone={setDone}
          disabled={disabled}
          deliveryMethod={deliveryMethod}
          onDeliveryMethod={setDeliveryMethod}
          onStatus={setStatus}
        />
      </div>
      <aside className="flex flex-col gap-3 lg:sticky lg:top-4">
        <div className="card flex flex-col gap-3 p-5 md:p-6">
          <p className="text-xl font-bold">Ваш заказ</p>
          <p className="text-ink-2 flex justify-between gap-4 text-[15px]">
            <span>
              Товары, {pieces} {pluralize(pieces, ["штука", "штуки", "штук"])}
            </span>
            <span className="text-ink whitespace-nowrap">{formatRub(priced.totalKopecks)}</span>
          </p>
          <p className="text-ink-2 border-line flex justify-between gap-4 border-b pb-4 text-[15px]">
            <span>Доставка</span>
            <span className="text-ink">{deliveryMethod === "PICKUP" ? "Самовывоз, бесплатно" : "По тарифу ТК"}</span>
          </p>
          <p className="flex items-baseline justify-between gap-4 pt-1">
            <span className="font-semibold">Итого</span>
            <span className="text-3xl font-bold whitespace-nowrap">{formatRub(priced.totalKopecks)}</span>
          </p>
          {priced.lines.some((line) => line.unitPriceKopecks === 0) && (
            <p className="text-muted text-sm">Цену товаров «по запросу» менеджер сообщит после заказа.</p>
          )}
          {status.message && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{status.message}</p>}
          {/* Кнопка вне формы — атрибут form; на телефоне своя кнопка внизу формы */}
          <button
            type="submit"
            form="checkout"
            disabled={status.pending || disabled}
            className="bg-accent hover:bg-accent-hover text-ink hidden h-14 rounded-xl text-base font-semibold disabled:opacity-50 lg:block"
          >
            {status.pending ? "Отправляем…" : "Оформить заказ"}
          </button>
          <p className="text-muted text-xs leading-normal">
            Менеджер позвонит, чтобы подтвердить наличие и сроки. Доставка оплачивается транспортной компании и в сумму
            не входит. Онлайн-оплаты нет — счёт или реквизиты пришлёт менеджер.
          </p>
        </div>
        <SendToMax priced={priced} />
      </aside>
    </div>
  );
}

function CartLines({ cart, priced }: { cart: ReturnType<typeof useCart>; priced: DisplayCart }) {
  const byIndex = new Map(priced.lines.map((line) => [line.lineIndex, line]));
  return (
    <ul className="divide-line divide-y">
      {cart.map((line, index) => {
        const item = byIndex.get(index) ?? null;
        const imageId = priced.imageIds[line.productId] ?? null;
        return (
          <li
            key={index}
            className="grid grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-3 py-4 md:grid-cols-[96px_minmax(0,1fr)_122px_120px_auto] md:gap-x-5 md:py-5"
          >
            <span className="border-line relative row-span-2 size-16 overflow-hidden rounded-[10px] border bg-white md:row-span-1 md:size-24">
              {imageId ? (
                <Image src={`/img/${imageId}`} alt="" fill sizes="96px" className="object-contain p-1" />
              ) : (
                <NoPhoto />
              )}
            </span>
            <div className="min-w-0">
              {item ? (
                <>
                  <Link
                    href={item.slug ? `/${item.slug}` : "#"}
                    className="hover:text-brand font-medium md:text-[17px]"
                  >
                    {item.name}
                  </Link>
                  {item.options.length > 0 && (
                    <p className="text-muted mt-0.5 text-[13px]">{describeOptions(item.options)}</p>
                  )}
                  <p className="text-subtle mt-0.5 font-mono text-xs">
                    Код {item.sku}
                    {item.unitPriceKopecks > 0 ? ` · ${formatRub(item.unitPriceKopecks)} / шт.` : ""}
                  </p>
                </>
              ) : (
                <span className="text-muted">Недоступная позиция</span>
              )}
            </div>
            <button
              type="button"
              onClick={() => cartActions.remove(index)}
              className="text-subtle hover:text-ink self-start px-1 text-xl leading-none md:order-last md:self-center"
              aria-label="Удалить из корзины"
            >
              ×
            </button>
            <div className="col-start-2 col-end-4 flex items-center justify-between gap-3 md:contents">
              <Stepper value={line.quantity} onChange={(quantity) => cartActions.setQuantity(index, quantity)} />
              <span className="text-right text-lg font-bold whitespace-nowrap md:text-xl">
                {item ? (item.unitPriceKopecks > 0 ? formatRub(item.totalKopecks) : "по запросу") : "—"}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Stepper({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const set = (next: number) => onChange(Math.min(MAX_QUANTITY, Math.max(1, next || 1)));
  const step = "text-ink-2 hover:text-brand h-full w-9 shrink-0 disabled:opacity-30";
  return (
    <div className="border-line-strong flex h-11 w-[122px] shrink-0 items-center rounded-[10px] border bg-white">
      <button type="button" onClick={() => set(value - 1)} disabled={value <= 1} aria-label="Меньше" className={step}>
        −
      </button>
      <input
        type="number"
        min={1}
        max={MAX_QUANTITY}
        value={value}
        aria-label="Количество"
        onChange={(event) => set(Number(event.target.value))}
        className="w-full min-w-0 [appearance:textfield] bg-transparent text-center font-semibold outline-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button
        type="button"
        onClick={() => set(value + 1)}
        disabled={value >= MAX_QUANTITY}
        aria-label="Больше"
        className={step}
      >
        +
      </button>
    </div>
  );
}

type FieldErrors = Record<string, string>;

/** Способы доставки карточками (макет, экран 04). Курьера по городу в MVP нет. */
const DELIVERY_OPTIONS = [
  {
    value: "PICKUP",
    title: "Самовывоз со склада",
    text: `${COMPANY.warehouse.city}, ${COMPANY.warehouse.street}`,
    price: "Бесплатно",
  },
  {
    value: "CARRIER",
    title: "Транспортная компания",
    text: "СДЭК, ПЭК, Деловые линии — по России и в СНГ",
    price: "По тарифу ТК",
  },
] as const;

function CheckoutForm({
  cart,
  priced,
  onDone,
  disabled,
  deliveryMethod,
  onDeliveryMethod,
  onStatus,
}: {
  cart: ReturnType<typeof useCart>;
  priced: PricedCart;
  onDone: (orderNumber: number) => void;
  disabled: boolean;
  deliveryMethod: DeliveryMethod;
  onDeliveryMethod: (method: DeliveryMethod) => void;
  onStatus: (status: { pending: boolean; message: string | null }) => void;
}) {
  const [requestId] = useState(() => crypto.randomUUID());
  const [customerType, setCustomerType] = useState<"PERSON" | "COMPANY">("PERSON");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Кнопка «Оформить заказ» на десктопе — в колонке «Ваш заказ»: ей нужны ожидание и ошибка
  useEffect(() => onStatus({ pending, message }), [pending, message, onStatus]);

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
        reachGoal("order_placed");
        ecommerce({
          purchase: {
            actionField: { id: String(result.orderNumber) },
            products: priced.lines.map((line) => ({
              id: line.sku,
              name: line.name,
              price: line.unitPriceKopecks / 100,
              quantity: line.quantity,
            })),
          },
        });
        cartActions.clear();
        onDone(result.orderNumber);
        return;
      }
      setErrors(result.fieldErrors ?? {});
      setMessage(result.error);
    });
  }

  const field = (name: string) => (errors[name] ? <p className="mt-1 text-sm text-red-700">{errors[name]}</p> : null);
  const input =
    "border-line-strong focus:border-brand h-12 w-full rounded-[10px] border bg-white px-3.5 text-[15px] outline-none";

  return (
    <form id="checkout" action={submit} className="card flex flex-col gap-8 p-5 md:p-7" noValidate>
      <fieldset className="flex flex-col gap-4">
        <Step n={1}>Покупатель</Step>
        <div className="bg-surface flex self-start rounded-xl p-1">
          {(
            [
              ["PERSON", "Частное лицо"],
              ["COMPANY", "Организация / ИП"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setCustomerType(value)}
              aria-pressed={customerType === value}
              className={`h-10 rounded-[9px] px-4 text-sm ${customerType === value ? "bg-white font-semibold shadow-sm" : "text-ink-2"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="flex flex-col gap-1.5">
            <Label>Имя *</Label>
            <input name="name" autoComplete="name" className={input} />
            {field("name")}
          </label>
          <label className="flex flex-col gap-1.5">
            <Label>Телефон *</Label>
            <input name="phone" type="tel" autoComplete="tel" placeholder="+7" className={input} />
            {field("phone")}
          </label>
          <label className="flex flex-col gap-1.5">
            <Label>E-mail</Label>
            <input name="email" type="email" autoComplete="email" placeholder="для документов" className={input} />
            {field("email")}
          </label>
        </div>
        {customerType === "COMPANY" && (
          <div className="bg-surface rounded-xl p-4 md:p-5">
            <CompanyFields input={input} field={field} />
          </div>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <Step n={2}>Доставка</Step>
        <div className="grid gap-2.5 md:grid-cols-2">
          {DELIVERY_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={`flex cursor-pointer gap-3 rounded-xl border p-4 ${
                deliveryMethod === option.value ? "border-brand bg-brand-soft" : "border-line-strong hover:border-ink-2"
              }`}
            >
              <input
                type="radio"
                name="deliveryMethod"
                value={option.value}
                checked={deliveryMethod === option.value}
                onChange={() => onDeliveryMethod(option.value)}
                className="accent-brand mt-1 size-4 shrink-0"
              />
              <span className="flex flex-col gap-1">
                <span className="font-semibold">{option.title}</span>
                <span className="text-ink-2 text-[13px] leading-snug">{option.text}</span>
                <span className="text-[13px] font-semibold">{option.price}</span>
              </span>
            </label>
          ))}
        </div>
        {deliveryMethod === "PICKUP" ? (
          <p className="text-ink-2 text-sm">
            {COMPANY.warehouse.city}, {COMPANY.warehouse.street}. {COMPANY.hours}.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <label className="flex flex-col gap-1.5">
              <Label>Транспортная компания *</Label>
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
            <label className="flex flex-col gap-1.5">
              <Label>Город и адрес терминала или доставки *</Label>
              <input
                name="address"
                autoComplete="street-address"
                placeholder="Например, Казань, ул. Техническая, 20"
                className={input}
              />
              {field("address")}
            </label>
          </div>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <Step n={3}>Оплата</Step>
        <div className="border-brand bg-brand-soft flex gap-3 rounded-xl border p-4">
          <span
            aria-hidden
            className="border-brand mt-1 flex size-4 shrink-0 items-center justify-center rounded-full border-2"
          >
            <span className="bg-brand size-2 rounded-full" />
          </span>
          <span className="flex flex-col gap-1">
            <span className="font-semibold">
              {customerType === "COMPANY" ? "Счёт на оплату" : "После подтверждения"}
            </span>
            <span className="text-ink-2 text-[13px] leading-snug">
              {customerType === "COMPANY"
                ? "Выставим счёт на реквизиты организации после подтверждения наличия."
                : "Менеджер подтвердит наличие и согласует оплату: наличными при самовывозе или переводом."}
            </span>
          </span>
        </div>
        <label className="flex flex-col gap-1.5">
          <Label>Комментарий к заказу</Label>
          <textarea
            name="comment"
            rows={3}
            placeholder="Модель авто, пожелания по цвету, удобное время звонка"
            className={`${input} h-auto py-3`}
          />
        </label>
      </fieldset>

      {/* Поле-ловушка для ботов: скрыто от людей и от программ чтения экрана */}
      <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />

      <div className="flex flex-col gap-3">
        <label className="flex items-start gap-2 text-sm">
          <input name="consent" type="checkbox" className="accent-brand mt-1" />
          <span>
            Согласен на обработку персональных данных в соответствии с{" "}
            <Link href="/privacy" target="_blank" className="text-brand underline">
              политикой обработки персональных данных
            </Link>
          </span>
        </label>
        {field("consent")}
        {message && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800 lg:hidden">{message}</p>}
        <button
          type="submit"
          disabled={pending || disabled}
          className="bg-accent hover:bg-accent-hover text-ink h-14 rounded-xl text-base font-semibold disabled:opacity-50 lg:hidden"
        >
          {pending ? "Отправляем…" : "Оформить заказ"}
        </button>
      </div>
    </form>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <legend className="mb-4 flex items-center gap-3 text-xl font-bold">
      <span className="bg-ink flex size-7 items-center justify-center rounded-full text-sm text-white">{n}</span>
      {children}
    </legend>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="text-muted text-[13px]">{children}</span>;
}

/**
 * Организация, ИНН и КПП. «Заполнить по ИНН» спрашивает реквизиты у ERP (там
 * DaData); найденное подставляется в поля, и их можно поправить руками.
 */
function CompanyFields({ input, field }: { input: string; field: (name: string) => React.ReactNode }) {
  const [companyName, setCompanyName] = useState("");
  const [inn, setInn] = useState("");
  const [kpp, setKpp] = useState("");
  const [note, setNote] = useState<{ text: string; error: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  function fill() {
    startTransition(async () => {
      const result = await lookupCompanyAction(inn);
      if (!result.ok) {
        setNote({ text: result.error, error: true });
        return;
      }
      setCompanyName(result.company.name);
      setKpp(result.company.kpp);
      setNote(
        result.company.active
          ? { text: "Реквизиты заполнены — проверьте их", error: false }
          : { text: "Организация не действует по данным ФНС — проверьте ИНН", error: true },
      );
    });
  }

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <label className="flex flex-col gap-1.5 sm:col-span-2">
        <Label>ИНН *</Label>
        <div className="flex gap-2">
          <input
            name="inn"
            inputMode="numeric"
            value={inn}
            onChange={(event) => setInn(event.target.value)}
            className={input}
          />
          <button
            type="button"
            onClick={fill}
            disabled={pending || inn.trim() === ""}
            className="border-brand text-brand hover:bg-brand-soft h-12 shrink-0 rounded-[10px] border px-3 text-sm font-medium disabled:opacity-50"
          >
            {pending ? "Ищем…" : "Заполнить по ИНН"}
          </button>
        </div>
        {field("inn")}
        {note && (
          <p className={`mt-1 text-sm ${note.error ? "text-red-700" : "text-brand"}`} role="status">
            {note.text}
          </p>
        )}
      </label>
      <label className="flex flex-col gap-1.5">
        <Label>КПП</Label>
        <input
          name="kpp"
          inputMode="numeric"
          value={kpp}
          onChange={(event) => setKpp(event.target.value)}
          className={input}
        />
        {field("kpp")}
      </label>
      <label className="flex flex-col gap-1.5 sm:col-span-3">
        <Label>Название организации *</Label>
        <input
          name="companyName"
          autoComplete="organization"
          value={companyName}
          onChange={(event) => setCompanyName(event.target.value)}
          className={input}
        />
        {field("companyName")}
      </label>
    </div>
  );
}

/**
 * «Отправить корзину в Max»: у Max нет ссылки с готовым текстом сообщения, поэтому
 * состав копируется в буфер, а покупатель вставляет его в чат с менеджером по номеру.
 * Текст после нажатия виден всегда: буфер бывает недоступен (не https, запрет
 * браузера) или не отвечает вовсе — тогда его копируют руками.
 */
function SendToMax({ priced }: { priced: PricedCart }) {
  const [state, setState] = useState<"idle" | "copying" | "copied" | "manual">("idle");
  const text = cartToText(priced, SITE_ORIGIN);
  if (priced.lines.length === 0) return null;

  async function copy() {
    reachGoal("max_click");
    setState("copying");
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 2000));
    try {
      await Promise.race([navigator.clipboard.writeText(text), timeout]);
      setState("copied");
    } catch {
      setState("manual");
    }
  }

  return (
    <div className="bg-brand-soft flex flex-col gap-3 rounded-2xl p-4 md:p-5">
      <button type="button" onClick={copy} className="group flex items-center gap-3.5 text-left">
        <span className="bg-brand flex size-11 shrink-0 items-center justify-center rounded-[10px] text-xs font-bold text-white">
          Max
        </span>
        <span className="flex flex-col">
          <span className="group-hover:text-brand font-semibold">Удобнее в мессенджере?</span>
          <span className="text-ink-2 text-[13px]">Отправьте состав корзины менеджеру в Max</span>
        </span>
      </button>
      {state !== "idle" && (
        <div className="space-y-1 text-sm" role="status">
          <p>
            {state === "copied"
              ? "Состав скопирован. Откройте Max, найдите нас по номеру "
              : state === "copying"
                ? "Копируем… Затем откройте Max и найдите нас по номеру "
                : "Скопируйте текст и отправьте его в Max на номер "}
            <b>{COMPANY.max.display}</b>
            {state === "copied" ? " и вставьте сообщение." : ":"}
          </p>
          <textarea
            readOnly
            value={text}
            onFocus={(event) => event.target.select()}
            className="border-line h-40 w-full rounded-lg border bg-white p-2 font-mono text-xs"
          />
        </div>
      )}
    </div>
  );
}
