"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SUPPLIER_ACTIONS } from "@buscom/domain/supplier/actions";
import { setSupplierActionsAction } from "@/app/(app)/suppliers/actions";

/**
 * Раздел «Действия и артефакты»: какие кнопки и загрузчики файлов видны у
 * этого поставщика в заказе. Список функций фиксирован в коде
 * (`packages/domain/src/supplier/actions.ts`), здесь — только чекбоксы для включения.
 */
export function SupplierActionsEditor({
  supplierId,
  initial,
  editable,
}: {
  supplierId: string;
  initial: string[];
  editable: boolean;
}) {
  const [enabled, setEnabled] = useState<string[]>(initial);
  const [pending, startTransition] = useTransition();
  const dirty = enabled.length !== initial.length || enabled.some((key) => !initial.includes(key));

  function toggle(key: string, checked: boolean) {
    setEnabled((current) => (checked ? [...current, key] : current.filter((item) => item !== key)));
  }

  function save() {
    startTransition(async () => {
      const result = await setSupplierActionsAction(supplierId, enabled);
      if (result.ok) toast.success(result.message);
      else toast.error(result.error);
    });
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4">
      <div>
        <h2 className="font-heading font-medium">Действия и артефакты</h2>
        <p className="text-muted-foreground text-sm">
          Включённые здесь функции появляются у этого поставщика в карточке заказа.
        </p>
      </div>

      <ul className="flex flex-col gap-3">
        {SUPPLIER_ACTIONS.map((action) => (
          <li key={action.key} className="flex items-start gap-2">
            <input
              type="checkbox"
              id={`supplier-action-${action.key}`}
              checked={enabled.includes(action.key)}
              onChange={(event) => toggle(action.key, event.target.checked)}
              disabled={!editable || pending}
              className="mt-0.5 size-4 shrink-0"
            />
            <label htmlFor={`supplier-action-${action.key}`} className="flex flex-col gap-0.5 text-sm">
              <span className="font-medium">{action.label}</span>
              <span className="text-muted-foreground text-xs">{action.description}</span>
            </label>
          </li>
        ))}
      </ul>

      {editable && dirty ? (
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" disabled={pending} onClick={() => setEnabled(initial)}>
            Отменить правки
          </Button>
          <Button size="sm" disabled={pending} onClick={save}>
            Сохранить
          </Button>
        </div>
      ) : null}
    </section>
  );
}
