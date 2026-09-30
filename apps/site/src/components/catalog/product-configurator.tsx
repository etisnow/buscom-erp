"use client";

import Link from "next/link";
import { useState } from "react";
import { formatRub } from "@buscom/domain/money";
import { MAX_QUANTITY } from "@buscom/domain/site/cart";
import { isNoneOptionValue } from "@buscom/domain/site/pricing";
import { kitCount, kitFeatureOf, kitLines, kitTotal, type KitLayout } from "@buscom/domain/site/kit";
import { ecommerce, reachGoal } from "@/components/analytics/metrika";
import { cartActions } from "@/components/cart/cart-store";
import { COMPANY } from "@/config/company";
import { QuickOrder } from "./quick-order";

/** Схема салона из справочника ERP; `imageVersion` — часть адреса чертежа */
type KitScheme = KitLayout & { hasImage: boolean; imageVersion: number };

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
  kitLayouts = [],
}: {
  productId: string;
  sku: string;
  name: string;
  basePriceKopecks: number;
  groups: Group[];
  isActive: boolean;
  /**
   * Схемы для блока «Комплект на салон»; пусто — блока нет (товар не для салона по настройке в ERP
   * или в справочнике нет включённых схем)
   */
  kitLayouts?: KitScheme[];
}) {
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const [layoutId, setLayoutId] = useState<string | null>(kitLayouts[0]?.id ?? null);
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

  const layout = kitLayouts.find((item) => item.id === layoutId) ?? kitLayouts[0] ?? null;

  /**
   * Комплект — несколько позиций корзины: подлокотники и откидные спинки ставятся не на все места,
   * а на их число в схеме (`kit.ts`). Итог позиций равен цене комплекта.
   */
  function addKitToCart() {
    if (!layout) return;
    const lines = kitLines(groups, selected, layout);
    for (const line of lines) cartActions.add({ productId, valueIds: line.valueIds, quantity: line.quantity });
    setAdded(true);
    reachGoal("add_to_cart");
    const unit = (valueIds: string[]) =>
      basePriceKopecks +
      groups.reduce((sum, group) => {
        const value = group.values.find((item) => valueIds.includes(item.id));
        return sum + (value?.priceDeltaKopecks ?? 0);
      }, 0);
    ecommerce({
      add: {
        products: lines.map((line) => ({ id: sku, name, price: unit(line.valueIds) / 100, quantity: line.quantity })),
      },
    });
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
        {layout && isActive && price > 0 && (
          <section className="bg-brand-soft flex flex-col gap-3.5 rounded-2xl p-5 md:p-6">
            <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
              <h2 className="text-lg font-bold">Комплект на салон</h2>
              <span className="text-ink-2 text-[13px]">с выбранными опциями</span>
            </div>
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Схема салона">
              {kitLayouts.map((scheme) => (
                <button
                  key={scheme.id}
                  type="button"
                  aria-pressed={layout.id === scheme.id}
                  onClick={() => setLayoutId(scheme.id)}
                  className={`flex flex-col gap-1 rounded-[10px] border-[1.5px] bg-white p-2 text-left text-[13px] font-semibold ${
                    layout.id === scheme.id ? "border-brand" : "hover:border-brand/50 border-transparent"
                  }`}
                >
                  {scheme.hasImage && (
                    // Чертёж отдаёт наш маршрут /img/salon/…: оптимизатор картинок не нужен
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/img/salon/${scheme.id}?v=${scheme.imageVersion}`}
                      alt={`Схема салона: ${scheme.name}`}
                      loading="lazy"
                      className="aspect-[3/1] w-full object-contain"
                    />
                  )}
                  {scheme.name}
                </button>
              ))}
            </div>
            <p className="flex items-center justify-between gap-3">
              <span className="text-[15px]">Итого за {layout.seats} сидений</span>
              <span className="text-[22px] font-bold whitespace-nowrap">
                {formatRub(kitTotal(basePriceKopecks, groups, selected, layout))}
              </span>
            </p>
            <KitBreakdown groups={groups} selected={selected} layout={layout} />
            <button
              type="button"
              onClick={addKitToCart}
              className="border-brand text-brand hover:bg-brand h-11 rounded-[10px] border-[1.5px] bg-white text-sm font-semibold hover:text-white"
            >
              Положить комплект ({layout.seats} шт.) в корзину
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

/**
 * Из чего сложен комплект: сколько сидений в схеме и, если выбраны подлокотники или откидные спинки,
 * сколько их в этой схеме — на них умножается доплата за опцию.
 */
function KitBreakdown({
  groups,
  selected,
  layout,
}: {
  groups: Group[];
  selected: Record<string, string>;
  layout: KitLayout;
}) {
  const features = new Set(groups.filter((group) => selected[group.id]).map((group) => kitFeatureOf(group)));
  const parts = [`сидений: ${layout.seats}`];
  if (features.has("armrest")) parts.push(`подлокотников: ${kitCount("armrest", layout)}`);
  if (features.has("recliner")) parts.push(`откидных спинок: ${kitCount("recliner", layout)}`);
  return <p className="text-ink-2 text-[13px]">В схеме {parts.join(", ")}</p>;
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
