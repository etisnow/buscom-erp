"use client";

import { Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { rublesToKopecks } from "@/domain/money";
import type { OptionGroupDraft } from "@/domain/product/options";

/** Группа опций в форме: надбавка — строкой в рублях, как её вводят. */
export type OptionGroupForm = {
  id?: string;
  /** Ключ строки для React: у новой группы id ещё нет */
  key: string;
  name: string;
  required: boolean;
  values: { id?: string; key: string; name: string; delta: string }[];
};

let nextKey = 0;
function newKey(): string {
  nextKey += 1;
  return `new-${nextKey}`;
}

export function toOptionForms(
  groups: {
    id: string;
    name: string;
    required: boolean;
    values: { id: string; name: string; priceDeltaKopecks: number }[];
  }[],
): OptionGroupForm[] {
  return groups.map((group) => ({
    id: group.id,
    key: group.id,
    name: group.name,
    required: group.required,
    values: group.values.map((value) => ({
      id: value.id,
      key: value.id,
      name: value.name,
      delta: (value.priceDeltaKopecks / 100).toFixed(2),
    })),
  }));
}

/** Форма → черновик для сервера. Некорректная надбавка — ошибка с понятным текстом. */
export function toOptionDrafts(groups: OptionGroupForm[]): OptionGroupDraft[] {
  return groups.map((group) => ({
    id: group.id,
    name: group.name,
    required: group.required,
    values: group.values.map((value) => {
      let priceDeltaKopecks: number;
      try {
        priceDeltaKopecks = rublesToKopecks(value.delta.trim() === "" ? "0" : value.delta.trim().replace(",", "."));
      } catch {
        throw new Error(`Некорректная надбавка у варианта «${value.name || "без названия"}»`);
      }
      return { id: value.id, name: value.name, priceDeltaKopecks };
    }),
  }));
}

/**
 * Редактор опций товара: группы («Ремень») и варианты с надбавкой к цене
 * («Трехточечный +1 750 ₽»). Надбавка бывает и нулевой — «Нет», «Серый».
 */
export function ProductOptionsEditor({
  groups,
  onChange,
}: {
  groups: OptionGroupForm[];
  onChange: (groups: OptionGroupForm[]) => void;
}) {
  function updateGroup(index: number, patch: Partial<OptionGroupForm>) {
    onChange(groups.map((group, i) => (i === index ? { ...group, ...patch } : group)));
  }

  function updateValue(groupIndex: number, valueIndex: number, patch: Partial<OptionGroupForm["values"][number]>) {
    const group = groups[groupIndex];
    updateGroup(groupIndex, {
      values: group.values.map((value, i) => (i === valueIndex ? { ...value, ...patch } : value)),
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {groups.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          Опций нет. Опции нужны, когда у товара есть варианты с разной ценой: ремень, материал, конкретное стекло.
        </p>
      ) : null}

      {groups.map((group, groupIndex) => (
        <div key={group.key} className="flex flex-col gap-2 rounded-md border p-2">
          <div className="flex items-center gap-2">
            <Input
              value={group.name}
              onChange={(event) => updateGroup(groupIndex, { name: event.target.value })}
              placeholder="Группа, например «Ремень»"
              aria-label="Название группы опций"
              className="h-8 flex-1"
            />
            <label className="flex items-center gap-1.5 text-xs whitespace-nowrap">
              <input
                type="checkbox"
                checked={group.required}
                onChange={(event) => updateGroup(groupIndex, { required: event.target.checked })}
                className="size-4"
              />
              обязательная
            </label>
            <Button
              variant="destructive"
              size="icon"
              className="size-8"
              aria-label="Убрать группу"
              onClick={() => onChange(groups.filter((_, i) => i !== groupIndex))}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>

          {group.values.map((value, valueIndex) => (
            <div key={value.key} className="flex items-center gap-2 pl-4">
              <Input
                value={value.name}
                onChange={(event) => updateValue(groupIndex, valueIndex, { name: event.target.value })}
                placeholder="Вариант"
                aria-label="Название варианта"
                className="h-8 flex-1"
              />
              <span className="text-muted-foreground text-xs">+</span>
              <Input
                inputMode="decimal"
                value={value.delta}
                onChange={(event) => updateValue(groupIndex, valueIndex, { delta: event.target.value })}
                aria-label="Надбавка, ₽"
                className="h-8 w-28 text-right"
              />
              <span className="text-muted-foreground text-xs">₽</span>
              <Button
                variant="destructive"
                size="icon"
                className="size-8"
                aria-label="Убрать вариант"
                onClick={() => updateGroup(groupIndex, { values: group.values.filter((_, i) => i !== valueIndex) })}
              >
                <X className="size-4" />
              </Button>
            </div>
          ))}

          <div className="pl-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                updateGroup(groupIndex, { values: [...group.values, { key: newKey(), name: "", delta: "0.00" }] })
              }
            >
              <Plus />
              Вариант
            </Button>
          </div>
        </div>
      ))}

      <div>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            onChange([
              ...groups,
              { key: newKey(), name: "", required: false, values: [{ key: newKey(), name: "", delta: "0.00" }] },
            ])
          }
        >
          <Plus />
          Добавить группу опций
        </Button>
      </div>
    </div>
  );
}
