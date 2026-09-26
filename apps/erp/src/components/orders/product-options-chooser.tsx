"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatRub } from "@/domain/money";
import {
  buildOptionSnapshot,
  priceWithOptions,
  type OptionGroup,
  type OrderItemOption,
} from "@/domain/product/options";
import type { ProductSuggestion } from "@/server/products/search";

export type OptionsSelection = {
  optionValueIds: string[];
  options: OrderItemOption[];
  /** Цена по каталогу: базовая плюс надбавки */
  priceKopecks: number;
};

const NONE = "__none__";

function signed(kopecks: number): string {
  return kopecks === 0 ? "" : ` · +${formatRub(kopecks)}`;
}

/**
 * Выбранный вариант по каждой группе. По умолчанию — `initialValueIds` (правка
 * позиции), иначе вариант без надбавки («Нет»), если он есть.
 */
export function useOptionChoice(groups: OptionGroup[], initialValueIds: readonly string[] = []) {
  const [chosen, setChosen] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      groups.map((group) => [
        group.id,
        group.values.find((value) => initialValueIds.includes(value.id))?.id ??
          (initialValueIds.length > 0 ? null : group.values.find((value) => value.priceDeltaKopecks === 0)?.id) ??
          NONE,
      ]),
    ),
  );
  const valueIds = Object.values(chosen).filter((id) => id !== NONE);
  const choose = (groupId: string, valueId: string) => setChosen((current) => ({ ...current, [groupId]: valueId }));
  return { chosen, valueIds, choose };
}

/** Выпадающие списки групп опций — общие для добавления позиции и её правки. */
export function OptionGroupSelects({
  groups,
  chosen,
  onChoose,
}: {
  groups: OptionGroup[];
  chosen: Record<string, string>;
  onChoose: (groupId: string, valueId: string) => void;
}) {
  return (
    <div className="flex max-h-[50vh] flex-col gap-3 overflow-y-auto">
      {groups.map((group) => (
        <div key={group.id} className="flex flex-col gap-1.5">
          <Label className="text-xs">
            {group.name}
            {group.required ? <span className="text-destructive"> *</span> : null}
          </Label>
          <Select value={chosen[group.id]} onValueChange={(value) => onChoose(group.id, value)}>
            <SelectTrigger size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {group.required ? null : <SelectItem value={NONE}>не выбрано</SelectItem>}
              {group.required && chosen[group.id] === NONE ? (
                <SelectItem value={NONE} disabled>
                  выберите вариант
                </SelectItem>
              ) : null}
              {group.values.map((value) => (
                <SelectItem key={value.id} value={value.id}>
                  {value.name}
                  {signed(value.priceDeltaKopecks)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ))}
    </div>
  );
}

/**
 * Выбор опций при добавлении товара в заказ. По умолчанию в группе стоит вариант
 * без надбавки («Нет»), если он есть, — так добавление сиденья «как есть» занимает
 * один клик. Обязательная группа без такого варианта ждёт выбора.
 */
export function ProductOptionsChooser({
  product,
  onConfirm,
  onBack,
}: {
  product: ProductSuggestion;
  onConfirm: (selection: OptionsSelection) => void;
  onBack: () => void;
}) {
  const { chosen, valueIds, choose } = useOptionChoice(product.options);
  let snapshot: OrderItemOption[] | null = null;
  let problem: string | null = null;
  try {
    snapshot = buildOptionSnapshot(product.options, valueIds, product.name);
  } catch (error) {
    problem = error instanceof Error ? error.message : "Выберите опции";
  }
  const price = snapshot ? priceWithOptions(product.priceKopecks, snapshot) : null;

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="font-medium">{product.name}</p>
        <p className="text-muted-foreground text-xs">
          {product.sku} · базовая цена {formatRub(product.priceKopecks)}
        </p>
      </div>

      <OptionGroupSelects groups={product.options} chosen={chosen} onChoose={choose} />

      <div className="flex items-center justify-between gap-3 border-t pt-3">
        <span className="text-sm">
          {price !== null ? (
            <>
              Цена: <span className="font-medium">{formatRub(price)}</span>
            </>
          ) : (
            <span className="text-muted-foreground">{problem}</span>
          )}
        </span>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onBack}>
            Назад
          </Button>
          <Button
            size="sm"
            disabled={!snapshot}
            onClick={() => {
              if (snapshot && price !== null)
                onConfirm({ optionValueIds: valueIds, options: snapshot, priceKopecks: price });
            }}
          >
            Добавить в заказ
          </Button>
        </div>
      </div>
    </div>
  );
}
