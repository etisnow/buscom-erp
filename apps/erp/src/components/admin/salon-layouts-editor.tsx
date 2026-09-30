"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ImageLightbox } from "@/components/ui/image-lightbox";
import { Input } from "@/components/ui/input";
import type { SalonLayoutEntry } from "@/server/settings/salon-layouts";
import {
  addSalonLayoutAction,
  deleteSalonLayoutAction,
  toggleSalonLayoutAction,
  updateSalonLayoutAction,
  type SalonLayoutFormValues,
  type SettingsResult,
} from "@/app/(app)/admin/dictionaries/actions";

type Draft = { name: string; seats: string; armrests: string; reclinerBacks: string };

const EMPTY_DRAFT: Draft = { name: "", seats: "", armrests: "0", reclinerBacks: "0" };

function toDraft(item: SalonLayoutEntry): Draft {
  return {
    name: item.name,
    seats: String(item.seats),
    armrests: String(item.armrests),
    reclinerBacks: String(item.reclinerBacks),
  };
}

/** Пустое поле — не ноль: иначе `Number("")` молча сохранил бы 0 вместо ошибки. */
function toValues(draft: Draft): SalonLayoutFormValues {
  const num = (text: string) => (text.trim() === "" ? Number.NaN : Number(text));
  return {
    name: draft.name,
    seats: num(draft.seats),
    armrests: num(draft.armrests),
    reclinerBacks: num(draft.reclinerBacks),
  };
}

function LayoutFields({ draft, onChange }: { draft: Draft; onChange: (draft: Draft) => void }) {
  const numberField = (key: "seats" | "armrests" | "reclinerBacks", label: string) => (
    <label className="text-muted-foreground flex flex-col gap-0.5 text-xs">
      {label}
      <Input
        inputMode="numeric"
        value={draft[key]}
        onChange={(event) => onChange({ ...draft, [key]: event.target.value })}
        className="h-8 w-24"
      />
    </label>
  );

  return (
    <>
      <label className="text-muted-foreground flex min-w-56 flex-1 flex-col gap-0.5 text-xs">
        Название
        <Input
          value={draft.name}
          onChange={(event) => onChange({ ...draft, name: event.target.value })}
          className="h-8"
        />
      </label>
      {numberField("seats", "Мест")}
      {numberField("armrests", "Подлокотников")}
      {numberField("reclinerBacks", "Откидных спинок")}
    </>
  );
}

/**
 * Справочник «Схемы салонов»: название, число мест, подлокотников и откидных спинок.
 * Схему можно выключить (пропадёт из выбора) или удалить — подтверждение прямо в строке.
 */
export function SalonLayoutsEditor({ items }: { items: SalonLayoutEntry[] }) {
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [newDraft, setNewDraft] = useState<Draft>(EMPTY_DRAFT);
  const [viewing, setViewing] = useState<number | null>(null);
  const withImage = items.filter((item) => item.hasImage);

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
        <h2 className="font-heading font-medium">Схемы салонов</h2>
        <p className="text-muted-foreground text-sm">
          Схемы из окна «Посчитать комплект» на сайте. Для каждой задаётся, сколько в ней мест, подлокотников и откидных
          спинок, — из этого считается цена комплекта пассажирского сиденья. Выключенная схема пропадёт из выбора.
        </p>
      </div>

      <ImageLightbox
        images={withImage.map((item) => ({
          src: `/api/salon-layouts/${item.id}/image`,
          alt: item.name,
          openHref: `/api/salon-layouts/${item.id}/image`,
        }))}
        index={viewing}
        onIndexChange={setViewing}
      />

      <ul className="flex flex-col gap-2">
        {items.map((item) => {
          const draft = drafts[item.id] ?? toDraft(item);
          const original = toDraft(item);
          const changed = (Object.keys(draft) as (keyof Draft)[]).some((key) => draft[key] !== original[key]);
          return (
            <li key={item.id} className="flex flex-wrap items-end gap-2 text-sm">
              {item.hasImage ? (
                <button
                  type="button"
                  onClick={() => setViewing(withImage.indexOf(item))}
                  title="Открыть на весь экран"
                  className="shrink-0"
                >
                  {/* Картинку отдаёт наш маршрут за авторизацией — оптимизатор Next без cookie её не получит. */}
                  <Image
                    src={`/api/salon-layouts/${item.id}/image`}
                    alt={item.name}
                    width={96}
                    height={36}
                    unoptimized
                    className="h-9 w-24 rounded-md border bg-white object-contain"
                  />
                </button>
              ) : (
                <span className="bg-muted text-muted-foreground flex h-9 w-24 shrink-0 items-center justify-center rounded-md text-[10px]">
                  нет чертежа
                </span>
              )}
              <LayoutFields draft={draft} onChange={(next) => setDrafts({ ...drafts, [item.id]: next })} />
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label="Сохранить схему"
                disabled={pending || !changed}
                onClick={() =>
                  handle(updateSalonLayoutAction(item.id, toValues(draft)), () =>
                    setDrafts((current) =>
                      Object.fromEntries(Object.entries(current).filter(([id]) => id !== item.id)),
                    ),
                  )
                }
              >
                <Save className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => handle(toggleSalonLayoutAction(item.id, !item.isActive))}
              >
                {item.isActive ? "Выключить" : "Включить"}
              </Button>
              {confirmDelete === item.id ? (
                <span className="flex items-center gap-1">
                  <span className="text-muted-foreground text-xs">Удалить?</span>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={pending}
                    onClick={() => {
                      handle(deleteSalonLayoutAction(item.id));
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
              {item.isActive ? null : <span className="text-muted-foreground pb-1.5 text-xs">выключена</span>}
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-end gap-2 border-t pt-3">
        <LayoutFields draft={newDraft} onChange={setNewDraft} />
        <Button
          size="sm"
          variant="outline"
          disabled={pending || !newDraft.name.trim() || !newDraft.seats.trim()}
          onClick={() => handle(addSalonLayoutAction(toValues(newDraft)), () => setNewDraft(EMPTY_DRAFT))}
        >
          <Plus />
          Добавить
        </Button>
      </div>
    </section>
  );
}
