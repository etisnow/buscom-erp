"use client";

import Link from "next/link";
import { useState } from "react";
import { formatRub } from "@buscom/domain/money";
import { MAX_QUANTITY } from "@buscom/domain/site/cart";
import { cartActions } from "@/components/cart/cart-store";
import { COMPANY } from "@/config/company";

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
  basePriceKopecks,
  groups,
  isActive,
}: {
  productId: string;
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
    <div className="space-y-5">
      {groups.map((group) => (
        <fieldset key={group.id}>
          <legend className="mb-2 font-medium">
            {group.name}
            {group.required ? "" : " (по желанию)"}
          </legend>
          <div className="flex flex-wrap gap-2">
            {!group.required && (
              <OptionButton
                active={!selected[group.id]}
                onClick={() =>
                  setSelected((current) =>
                    Object.fromEntries(Object.entries(current).filter(([id]) => id !== group.id)),
                  )
                }
              >
                Не нужно
              </OptionButton>
            )}
            {group.values.map((value) => (
              <OptionButton
                key={value.id}
                active={selected[group.id] === value.id}
                onClick={() => setSelected((current) => ({ ...current, [group.id]: value.id }))}
              >
                {value.name}
                {value.priceDeltaKopecks !== 0 && (
                  <span className="text-muted ml-1">
                    {value.priceDeltaKopecks > 0 ? "+" : "−"}
                    {formatRub(Math.abs(value.priceDeltaKopecks))}
                  </span>
                )}
              </OptionButton>
            ))}
          </div>
        </fieldset>
      ))}

      <div className="bg-surface rounded-lg p-4">
        {isActive ? (
          <p className="text-3xl font-bold">{price > 0 ? formatRub(price) : "Цена по запросу"}</p>
        ) : (
          <p className="text-ink-2 text-lg font-semibold">Товар снят с продажи</p>
        )}
        {isActive && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2">
              <span className="text-muted text-sm">Количество</span>
              <input
                type="number"
                min={1}
                max={MAX_QUANTITY}
                value={quantity}
                onChange={(event) => setQuantity(Math.min(MAX_QUANTITY, Math.max(1, Number(event.target.value) || 1)))}
                className="border-line w-20 rounded-md border bg-white px-3 py-2"
              />
            </label>
            <button
              type="button"
              onClick={() => {
                cartActions.add({ productId, valueIds: Object.values(selected), quantity });
                setAdded(true);
              }}
              className="bg-accent hover:bg-accent-hover rounded-md px-6 py-3 font-semibold text-white"
            >
              В корзину
            </button>
            {added && (
              <Link href="/korzina" className="text-brand hover:text-brand-hover font-medium">
                Добавлено · перейти в корзину
              </Link>
            )}
          </div>
        )}
        <p className="text-muted mt-3 text-sm">
          Наличие и сроки уточнит менеджер после заказа. Вопросы — {COMPANY.phone.display} или Max {COMPANY.max.display}
          .
        </p>
      </div>
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
      className={`rounded-md border px-3 py-2 text-left text-sm ${active ? "border-brand bg-brand-soft" : "border-line hover:border-ink-2 bg-white"}`}
    >
      {children}
    </button>
  );
}
