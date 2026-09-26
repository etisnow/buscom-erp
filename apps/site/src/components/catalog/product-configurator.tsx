"use client";

import { useState } from "react";
import { formatRub } from "@buscom/domain/money";
import { COMPANY } from "@/config/company";

type Group = {
  id: string;
  name: string;
  required: boolean;
  values: { id: string; name: string; priceDeltaKopecks: number }[];
};

/**
 * Опции товара с живой ценой (экран 03 макета). Цена здесь — подсказка покупателю:
 * в заказе её пересчитает сервер по базе, суммы с клиента не принимаются (CLAUDE.md).
 * Корзина — этап 5; пока вместо «В корзину» — связь с менеджером.
 */
export function ProductConfigurator({
  basePriceKopecks,
  groups,
  isActive,
}: {
  basePriceKopecks: number;
  groups: Group[];
  isActive: boolean;
}) {
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
        <p className="text-muted mt-2 text-sm">Наличие и сроки уточнит менеджер. Заказ — по телефону или в Max.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <a
            href={COMPANY.phone.href}
            className="bg-brand hover:bg-brand-hover rounded-md px-5 py-3 font-semibold text-white"
          >
            Позвонить {COMPANY.phone.display}
          </a>
          <span className="border-line rounded-md border px-5 py-3 font-medium">Max: {COMPANY.max.display}</span>
        </div>
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
