"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DictionaryEntry } from "@/server/settings/service";
import {
  addDictionaryItemAction,
  toggleDictionaryItemAction,
  type SettingsResult,
} from "@/app/(app)/admin/dictionaries/actions";

/** Редактор простого списка: добавить, выключить, включить. Удаления нет — см. комментарий в сервисе. */
export function DictionaryEditor({
  type,
  title,
  description,
  items,
  fallbackNote,
}: {
  type: "CANCEL_REASON" | "CARRIER";
  title: string;
  description: string;
  items: DictionaryEntry[];
  fallbackNote?: string;
}) {
  const [value, setValue] = useState("");
  const [pending, startTransition] = useTransition();

  function handle(action: Promise<SettingsResult>) {
    startTransition(async () => {
      const result = await action;
      if (result.ok) toast.success(result.message);
      else toast.error(result.error);
    });
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4">
      <div>
        <h2 className="font-heading font-medium">{title}</h2>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>

      {items.length === 0 && fallbackNote ? (
        <p className="text-muted-foreground rounded-md border border-dashed p-3 text-sm">{fallbackNote}</p>
      ) : null}

      <ul className="flex flex-col gap-1">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-2 text-sm">
            <span className={item.isActive ? "" : "text-muted-foreground line-through"}>{item.name}</span>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto"
              disabled={pending}
              onClick={() => handle(toggleDictionaryItemAction(item.id, !item.isActive))}
            >
              {item.isActive ? "Выключить" : "Включить"}
            </Button>
          </li>
        ))}
      </ul>

      <div className="flex gap-2 border-t pt-3">
        <Input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Новое значение"
          className="h-8 max-w-sm"
        />
        <Button
          size="sm"
          variant="outline"
          disabled={pending || !value.trim()}
          onClick={() => {
            handle(addDictionaryItemAction(type, value));
            setValue("");
          }}
        >
          <Plus />
          Добавить
        </Button>
      </div>
    </section>
  );
}
