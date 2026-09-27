"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { toggleModel } from "@buscom/domain/product/compatibility";
import { setCompatibilityAction } from "@/app/(app)/products/actions";
import { Button } from "@/components/ui/button";
import type { CompatibilityReviewRow } from "@/server/products/compatibility-review";

/**
 * Список разбора: у каждого товара однозначные модели уже отмечены, поколения
 * из «уточните» — на выбор. Сохранение пишет только совместимость.
 */
export function CompatibilityReview({ rows, editable }: { rows: CompatibilityReviewRow[]; editable: boolean }) {
  if (rows.length === 0) {
    return <p className="text-muted-foreground text-sm">Разбирать нечего — подсказок для товаров без моделей нет.</p>;
  }
  return (
    <ul className="divide-y rounded-lg border">
      {rows.map((row) => (
        <ReviewRow key={row.id} row={row} editable={editable} />
      ))}
    </ul>
  );
}

function ReviewRow({ row, editable }: { row: CompatibilityReviewRow; editable: boolean }) {
  const [selected, setSelected] = useState<string[]>(row.suggested);
  const [pending, startTransition] = useTransition();
  const chip = (model: string) => (
    <button
      key={model}
      type="button"
      disabled={!editable}
      aria-pressed={selected.includes(model)}
      onClick={() => setSelected((current) => toggleModel(current, model))}
      className={
        selected.includes(model)
          ? "bg-primary text-primary-foreground border-primary rounded-md border px-2 py-0.5 text-xs"
          : "text-muted-foreground hover:bg-accent rounded-md border px-2 py-0.5 text-xs"
      }
    >
      {model}
    </button>
  );

  function save() {
    startTransition(async () => {
      const result = await setCompatibilityAction(row.id, selected);
      if (result.ok) toast.success(`${row.name}: ${result.message.toLowerCase()}`);
      else toast.error(result.error);
    });
  }

  return (
    <li className="flex flex-col gap-2 p-3 md:flex-row md:items-start md:gap-4">
      <div className="min-w-0 md:w-80 md:shrink-0">
        <p className="text-sm font-medium">{row.name}</p>
        <p className="text-muted-foreground font-mono text-xs">{row.sku}</p>
      </div>
      <div className="flex min-w-0 grow flex-col gap-1.5">
        {row.suggested.length > 0 && <div className="flex flex-wrap gap-1.5">{row.suggested.map(chip)}</div>}
        {row.unclear.map((item) => (
          <div key={item.family} className="flex flex-wrap items-center gap-1.5">
            <span className="text-muted-foreground text-xs">{item.family} — какое поколение?</span>
            {item.candidates.filter((model) => !row.suggested.includes(model)).map(chip)}
          </div>
        ))}
      </div>
      {editable && (
        <Button size="sm" onClick={save} disabled={pending || selected.length === 0} className="md:shrink-0">
          Сохранить
        </Button>
      )}
    </li>
  );
}
