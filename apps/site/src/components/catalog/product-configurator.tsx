"use client";

import Link from "next/link";
import { useState } from "react";
import { formatRub } from "@buscom/domain/money";
import { MAX_QUANTITY } from "@buscom/domain/site/cart";
import { isNoneOptionValue } from "@buscom/domain/site/pricing";
import { KIT_SEAT_COUNTS } from "@buscom/domain/site/seats";
import { ecommerce, reachGoal } from "@/components/analytics/metrika";
import { cartActions } from "@/components/cart/cart-store";
import { COMPANY } from "@/config/company";
import { QuickOrder } from "./quick-order";

type Group = {
  id: string;
  name: string;
  required: boolean;
  values: { id: string; name: string; priceDeltaKopecks: number }[];
};

/**
 * Опции товара с живой ценой и «В корзину» (экран 03 макета). Цена здесь — подсказка
 * покупателю: в корзине и заказе её пересчитает сервер по базе, суммы с клиента не
 * принимаются (CLAUDE.md). В корзину уходят только товар, варианты и количество.
 */
export function ProductConfigurator({
  productId,
  sku,
  name,
  basePriceKopecks,
  groups,
  isActive,
  kit = false,
}: {
  productId: string;
  sku: string;
  name: string;
  basePriceKopecks: number;
  groups: Group[];
  isActive: boolean;
  /** Блок «Комплект на салон» — по настройке товара в ERP (showSalonKit) */
  kit?: boolean;
}) {
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const [seats, setSeats] = useState<number>(KIT_SEAT_COUNTS[1]);
  const [selected, setSelected] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      groups.filter((group) => group.required && group.values[0]).map((group) => [group.id, group.values[0].id]),
    ),
  );
  function addToCart(count: number) {
    cartActions.add({ productId, valueIds: Object.values(selected), quantity: count });
    setAdded(true);
    reachGoal("add_to_cart");
    ecommerce({ add: { products: [{ id: sku, name, price: price / 100, quantity: count }] } });
  }

  const price =
    basePriceKopecks +
    groups.reduce(
      (sum, group) => sum + (group.values.find((value) => value.id === selected[group.id])?.priceDeltaKopecks ?? 0),
      0,
    );

  return (
    <div className="flex flex-col gap-5">
      {groups.map((group) => (
        <fieldset key={group.id}>
          <legend className="mb-2.5 text-sm font-semibold">{group.name}</legend>
          <div className="flex flex-wrap gap-1.5">
            {!group.required && (
              <OptionButton
                active={!selected[group.id]}
                onClick={() =>
                  setSelected((current) =>
                    Object.fromEntries(Object.entries(current).filter(([id]) => id !== group.id)),
                  )
                }
              >
                Нет
              </OptionButton>
            )}
            {group.values
              // У необязательной опции «Нет» — это отказ от неё; такой же вариант из данных сайта — повтор
              .filter((value) => group.required || !isNoneOptionValue(value))
              .map((value) => (
                <OptionButton
                  key={value.id}
                  active={selected[group.id] === value.id}
                  onClick={() => setSelected((current) => ({ ...current, [group.id]: value.id }))}
                >
                  {value.name}
                  {value.priceDeltaKopecks !== 0 && (
                    <span className="text-subtle ml-1.5 font-normal">
                      {value.priceDeltaKopecks > 0 ? "+" : "−"}
                      {formatRub(Math.abs(value.priceDeltaKopecks))}
                    </span>
                  )}
                </OptionButton>
              ))}
          </div>
        </fieldset>
      ))}

      <div className={`flex flex-col gap-4 ${groups.length > 0 ? "border-line border-t pt-5" : ""}`}>
        {isActive ? (
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-muted text-[13px]">Цена за 1 шт.</p>
              <p className="text-[30px] leading-tight font-bold md:text-4xl">
                {price > 0 ? formatRub(price) : "Цена по запросу"}
              </p>
            </div>
            <QuantityStepper value={quantity} onChange={setQuantity} />
          </div>
        ) : (
          <p className="text-ink-2 text-lg font-semibold">Товар снят с продажи</p>
        )}
        {isActive && (
          <div className="grid gap-2.5 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => addToCart(quantity)}
              className="bg-accent hover:bg-accent-hover text-ink h-[54px] rounded-[10px] px-6 text-base font-semibold"
            >
              В корзину
            </button>
            <QuickOrder
              line={{ productId, valueIds: Object.values(selected), quantity }}
              sku={sku}
              name={name}
              priceKopecks={price}
            />
            {added && (
              <Link href="/korzina" className="text-brand hover:text-brand-hover col-span-full text-sm font-medium">
                Добавлено · перейти в корзину →
              </Link>
            )}
          </div>
        )}
        {kit && isActive && price > 0 && (
          <section className="bg-brand-soft flex flex-col gap-3.5 rounded-2xl p-5 md:p-6">
            <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
              <h2 className="text-lg font-bold">Комплект на салон</h2>
              <span className="text-ink-2 text-[13px]">с выбранными опциями</span>
            </div>
            <div className="flex gap-1.5" role="group" aria-label="Мест в салоне">
              {KIT_SEAT_COUNTS.map((count) => (
                <button
                  key={count}
                  type="button"
                  aria-pressed={seats === count}
                  onClick={() => setSeats(count)}
                  className={`h-10 flex-1 rounded-[9px] text-sm font-semibold ${
                    seats === count ? "bg-brand text-white" : "hover:text-brand bg-white"
                  }`}
                >
                  {count} мест
                </button>
              ))}
            </div>
            <p className="flex items-center justify-between gap-3">
              <span className="text-[15px]">Итого за {seats} сидений</span>
              <span className="text-[22px] font-bold whitespace-nowrap">{formatRub(price * seats)}</span>
            </p>
            <button
              type="button"
              onClick={() => addToCart(seats)}
              className="border-brand text-brand hover:bg-brand h-11 rounded-[10px] border-[1.5px] bg-white text-sm font-semibold hover:text-white"
            >
              Положить {seats} шт. в корзину
            </button>
            <p className="text-ink-2 text-[13px]">
              Для автопарков — оптовая цена, установка в нашем цехе — рассчитаем отдельно: Max, WhatsApp или Telegram{" "}
              {COMPANY.max.display}
            </p>
          </section>
        )}
        <p className="text-muted text-[13px] leading-normal">
          Наличие и сроки уточнит менеджер после заказа. Вопросы — Max, WhatsApp или Telegram {COMPANY.max.display}.
        </p>
      </div>
    </div>
  );
}

function QuantityStepper({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const set = (next: number) => onChange(Math.min(MAX_QUANTITY, Math.max(1, next || 1)));
  const step = "text-ink-2 hover:text-brand h-full w-10 text-lg disabled:opacity-30";
  return (
    <div className="border-line-strong flex h-12 shrink-0 items-center rounded-[10px] border bg-white">
      <button type="button" onClick={() => set(value - 1)} disabled={value <= 1} aria-label="Меньше" className={step}>
        −
      </button>
      <input
        type="number"
        min={1}
        max={MAX_QUANTITY}
        value={value}
        onChange={(event) => set(Number(event.target.value))}
        aria-label="Количество"
        className="w-10 [appearance:textfield] bg-transparent text-center font-semibold outline-none [&::-webkit-inner-spin-button]:appearance-none"
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

function OptionButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-9 rounded-lg border px-3 py-1.5 text-left text-[13px] font-medium ${active ? "border-brand bg-brand-soft" : "border-line-strong hover:border-ink-2 bg-white"}`}
    >
      {children}
    </button>
  );
}
