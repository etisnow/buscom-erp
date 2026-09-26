"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type StageRow = {
  /** id сохранённого этапа; у нового его нет */
  id?: string;
  /** Ключ строки для React: у нового этапа id ещё нет */
  key: string;
  name: string;
  /** Сколько заказов сейчас стоят на этом этапе — такой этап не убрать */
  ordersCount: number;
};

let nextKey = 0;

export function newStageRow(name: string): StageRow {
  nextKey += 1;
  return { key: `new-${nextKey}`, name, ordersCount: 0 };
}

/**
 * Редактор цепочки этапов: порядок стрелками, названия правятся на месте.
 * Сохраняет родитель — редактор только меняет список.
 */
export function StageChainEditor({
  stages,
  onChange,
  disabled = false,
}: {
  stages: StageRow[];
  onChange: (stages: StageRow[]) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState("");

  function move(index: number, delta: number) {
    const next = [...stages];
    const [row] = next.splice(index, 1);
    next.splice(index + delta, 0, row);
    onChange(next);
  }

  function add() {
    if (!draft.trim()) return;
    onChange([...stages, newStageRow(draft.trim())]);
    setDraft("");
  }

  return (
    <div className="flex flex-col gap-2">
      {stages.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Этапов нет — заказ с товарами этого поставщика пойдёт по обычным статусам без подстатусов.
        </p>
      ) : (
        <ol className="flex flex-col gap-1.5">
          {stages.map((stage, index) => (
            <li key={stage.key} className="flex items-center gap-2">
              <span className="text-muted-foreground w-5 text-right text-sm">{index + 1}.</span>
              <Input
                value={stage.name}
                onChange={(event) =>
                  onChange(stages.map((row, i) => (i === index ? { ...row, name: event.target.value } : row)))
                }
                disabled={disabled}
                aria-label={`Этап ${index + 1}`}
                className="h-8 flex-1"
              />
              {stage.ordersCount > 0 ? (
                <span className="text-muted-foreground text-xs whitespace-nowrap">заказов: {stage.ordersCount}</span>
              ) : null}
              {disabled ? null : (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    aria-label="Выше"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    aria-label="Ниже"
                    disabled={index === stages.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown className="size-4" />
                  </Button>
                  <Button
                    variant="destructive"
                    size="icon"
                    className="size-8"
                    aria-label="Убрать этап"
                    // На этапе стоят заказы — сервер всё равно откажет, прячем кнопку заранее.
                    disabled={stage.ordersCount > 0}
                    title={stage.ordersCount > 0 ? "На этом этапе стоят заказы" : undefined}
                    onClick={() => onChange(stages.filter((_, i) => i !== index))}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ol>
      )}

      {disabled ? null : (
        <div className="flex items-center gap-2">
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                add();
              }
            }}
            placeholder="Новый этап, например «Оплачено поставщику»"
            className="h-8 flex-1"
          />
          <Button variant="outline" size="sm" disabled={!draft.trim()} onClick={add}>
            <Plus />
            Добавить этап
          </Button>
        </div>
      )}
    </div>
  );
}
