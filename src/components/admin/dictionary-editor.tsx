"use client";

import { useState, useTransition } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DictionaryEntry } from "@/server/settings/service";
import {
  addDictionaryItemAction,
  deleteDictionaryItemAction,
  renameDictionaryItemAction,
  toggleDictionaryItemAction,
  type SettingsResult,
} from "@/app/(app)/admin/dictionaries/actions";

/**
 * Редактор простого списка: добавить, переименовать, выключить, включить, удалить.
 * Удаление необратимо — подтверждается прямо в строке. Источник, который стоит
 * в заказах, сервер удалить не даст и объяснит почему. Системные пункты
 * (источники «Сайт» и «Прежняя ERP») только переименовываются.
 */
export function DictionaryEditor({
  type,
  title,
  description,
  items,
  fallbackNote,
}: {
  type: "CANCEL_REASON" | "CARRIER" | "ORDER_SOURCE" | "CAR_MODEL";
  title: string;
  description: string;
  items: DictionaryEntry[];
  fallbackNote?: string;
}) {
  const [value, setValue] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handle(action: Promise<SettingsResult>, onSuccess?: () => void) {
    startTransition(async () => {
      const result = await action;
      if (result.ok) {
        toast.success(result.message);
        onSuccess?.();
      } else {
        toast.error(result.error);
      }
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
          <li key={item.id} className="flex min-h-8 items-center gap-2 text-sm">
            {editing?.id === item.id ? (
              <form
                className="flex flex-1 items-center gap-1"
                onSubmit={(event) => {
                  event.preventDefault();
                  handle(renameDictionaryItemAction(item.id, editing.name), () => setEditing(null));
                }}
              >
                <Input
                  autoFocus
                  value={editing.name}
                  onChange={(event) => setEditing({ id: item.id, name: event.target.value })}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") setEditing(null);
                  }}
                  className="h-8 max-w-sm"
                />
                <Button
                  type="submit"
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label="Сохранить название"
                  disabled={pending || !editing.name.trim()}
                >
                  <Check className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label="Отменить"
                  onClick={() => setEditing(null)}
                >
                  <X className="size-4" />
                </Button>
              </form>
            ) : (
              <>
                <span className={item.isActive ? "" : "text-muted-foreground line-through"}>{item.name}</span>
                {item.systemCode ? (
                  <Badge variant="secondary" className="font-normal">
                    системный
                  </Badge>
                ) : null}
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-auto size-8"
                  aria-label="Переименовать"
                  disabled={pending}
                  onClick={() => setEditing({ id: item.id, name: item.name })}
                >
                  <Pencil className="size-4" />
                </Button>
                {item.systemCode ? (
                  // Кнопка не прячется, а гаснет — чтобы ряды не прыгали по ширине.
                  <Button variant="ghost" size="sm" disabled title="Его ставит сама система">
                    Выключить
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() => handle(toggleDictionaryItemAction(item.id, !item.isActive))}
                  >
                    {item.isActive ? "Выключить" : "Включить"}
                  </Button>
                )}
                {item.systemCode ? (
                  <Button variant="destructive" size="icon" className="size-8" aria-label="Удалить" disabled>
                    <Trash2 className="size-4" />
                  </Button>
                ) : confirmDelete === item.id ? (
                  <span className="flex items-center gap-1">
                    <span className="text-muted-foreground text-xs">Удалить?</span>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={pending}
                      onClick={() => {
                        // Подтверждение закрываем при любом исходе: ошибку покажет уведомление.
                        handle(deleteDictionaryItemAction(item.id));
                        setConfirmDelete(null);
                      }}
                    >
                      Да
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(null)}>
                      Нет
                    </Button>
                  </span>
                ) : (
                  <Button
                    variant="destructive"
                    size="icon"
                    className="size-8"
                    aria-label="Удалить"
                    disabled={pending}
                    onClick={() => setConfirmDelete(item.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </>
            )}
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
