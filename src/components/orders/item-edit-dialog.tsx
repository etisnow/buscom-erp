"use client";

import { useState } from "react";
import { OptionGroupSelects, useOptionChoice } from "@/components/orders/product-options-chooser";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatRub, rublesToKopecks } from "@/domain/money";
import {
  buildOptionSnapshot,
  priceWithOptions,
  type OptionGroup,
  type OrderItemOption,
} from "@/domain/product/options";

/** Что нужно окну от каталога: базовая цена и группы опций товара. */
export type ItemCatalog = { priceKopecks: number; options: OptionGroup[] };

export type ItemEditPatch = {
  sku: string;
  name: string;
  priceKopecks: number;
  quantity: number;
  discountKopecks: number;
  optionValueIds: string[];
  options: OrderItemOption[];
};

type EditableItem = {
  name: string;
  sku: string;
  priceKopecks: number;
  quantity: number;
  discountKopecks: number;
  optionValueIds: string[];
};

const toRubles = (kopecks: number) => (kopecks / 100).toFixed(2);

function parseRubles(value: string): number | null {
  try {
    return rublesToKopecks(value.trim().replace(",", ".") || "0");
  } catch {
    return null;
  }
}

/**
 * Правка позиции заказа: артикул и название, перевыбор опций товара, цена,
 * количество, скидка. На телефоне это единственный способ править позицию —
 * таблицы с полями в строке там нет.
 * Меняет только эту позицию, каталог не трогает. Смена опций пересчитывает цену
 * по каталогу (базовая + надбавки) — её можно поправить руками, как любую цену
 * позиции. Применяется к составу на экране; в базу — кнопкой «Сохранить состав».
 */
export function ItemEditDialog({
  item,
  catalog,
  onApply,
  onClose,
}: {
  item: EditableItem;
  /** Данные товара из каталога; у произвольной позиции — null, тогда опций нет */
  catalog: ItemCatalog | null;
  onApply: (patch: ItemEditPatch) => void;
  onClose: () => void;
}) {
  const groups = catalog?.options ?? [];
  const { chosen, valueIds, choose } = useOptionChoice(groups, item.optionValueIds);
  const [sku, setSku] = useState(item.sku);
  const [name, setName] = useState(item.name);
  const [price, setPrice] = useState(toRubles(item.priceKopecks));
  const [quantity, setQuantity] = useState(String(item.quantity));
  const [discount, setDiscount] = useState(toRubles(item.discountKopecks));

  let snapshot: OrderItemOption[] = [];
  let problem: string | null = null;
  try {
    snapshot = buildOptionSnapshot(groups, valueIds, item.name);
  } catch (error) {
    problem = error instanceof Error ? error.message : "Выберите опции";
  }
  const catalogPrice = catalog ? priceWithOptions(catalog.priceKopecks, snapshot) : null;

  function chooseOption(groupId: string, valueId: string) {
    choose(groupId, valueId);
    // Цена следует за опциями: пересчитываем по каталогу, дальше менеджер волен поправить.
    if (!catalog) return;
    const next = { ...chosen, [groupId]: valueId };
    try {
      const ids = Object.values(next).filter((id) => groups.some((group) => group.values.some((v) => v.id === id)));
      setPrice(toRubles(priceWithOptions(catalog.priceKopecks, buildOptionSnapshot(groups, ids, item.name))));
    } catch {
      // Обязательная группа ещё не выбрана — цену не трогаем, ошибка видна ниже.
    }
  }

  const priceKopecks = parseRubles(price);
  const discountKopecks = parseRubles(discount);
  const qty = Number(quantity);
  const qtyValid = Number.isInteger(qty) && qty > 0;
  const valid = !problem && name.trim() !== "" && priceKopecks !== null && discountKopecks !== null && qtyValid;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Позиция заказа</DialogTitle>
          <DialogDescription>
            {item.name}
            {item.sku ? ` · ${item.sku}` : ""}. Меняется только этот заказ, карточка товара остаётся как есть.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-[1fr_2fr] gap-3">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs" htmlFor="item-edit-sku">
              Артикул
            </Label>
            <Input id="item-edit-sku" value={sku} onChange={(event) => setSku(event.target.value)} className="h-8" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs" htmlFor="item-edit-name">
              Название
            </Label>
            <Input
              id="item-edit-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="h-8"
              aria-invalid={name.trim() === ""}
            />
          </div>
        </div>

        {groups.length > 0 ? (
          <div className="flex flex-col gap-2">
            <OptionGroupSelects groups={groups} chosen={chosen} onChoose={chooseOption} />
            {problem ? <p className="text-destructive text-sm">{problem}</p> : null}
          </div>
        ) : null}

        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs" htmlFor="item-edit-price">
              Цена, ₽
            </Label>
            <Input
              id="item-edit-price"
              inputMode="decimal"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              className="h-8 text-right"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs" htmlFor="item-edit-qty">
              Количество
            </Label>
            <Input
              id="item-edit-qty"
              type="number"
              min={1}
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              className="h-8 text-right"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs" htmlFor="item-edit-discount">
              Скидка, ₽
            </Label>
            <Input
              id="item-edit-discount"
              inputMode="decimal"
              value={discount}
              onChange={(event) => setDiscount(event.target.value)}
              className="h-8 text-right"
            />
          </div>
        </div>
        {catalogPrice !== null ? (
          <p className="text-muted-foreground text-xs">
            По каталогу с выбранными опциями: {formatRub(catalogPrice)}
            {priceKopecks !== null && priceKopecks !== catalogPrice ? " — цена в позиции отличается" : ""}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Отмена
          </Button>
          <Button
            size="sm"
            disabled={!valid}
            onClick={() => {
              if (!valid || priceKopecks === null || discountKopecks === null) return;
              onApply({
                sku: sku.trim(),
                name: name.trim(),
                priceKopecks,
                quantity: qty,
                discountKopecks,
                optionValueIds: valueIds,
                options: snapshot,
              });
            }}
          >
            Применить
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
