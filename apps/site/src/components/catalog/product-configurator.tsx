"use client";

import Link from "next/link";
import { useState } from "react";
import { formatRub } from "@buscom/domain/money";
import { MAX_QUANTITY } from "@buscom/domain/site/cart";
import { isNoneOptionValue } from "@buscom/domain/site/pricing";
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
}: {
  productId: string;
  sku: string;
  name: string;
  basePriceKopecks: number;
  groups: Group[];
  isActive: boolean;
}) {
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const [selected, setSelected] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      groups.filter((group) => group.required && group.values[0]).map((group) => [group.id, group.values[0].id]),
    ),
  );
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
              onClick={() => {
                cartActions.add({ productId, valueIds: Object.values(selected), quantity });
                setAdded(true);
                reachGoal("add_to_cart");
                ecommerce({ add: { products: [{ id: sku, name, price: price / 100, quantity }] } });
              }}
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
        <p className="text-muted text-[13px] leading-normal">
          Наличие и сроки уточнит менеджер после заказа. Вопросы — {COMPANY.phone.display} или Max {COMPANY.max.display}
          .
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
