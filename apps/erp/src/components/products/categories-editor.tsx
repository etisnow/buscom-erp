"use client";

import { useState, useTransition } from "react";
import { Check, FolderPlus, Globe, GripVertical, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { CategorySelect } from "@/components/products/category-select";
import { CategorySiteDialog } from "@/components/site/category-site-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  buildCategoryTree,
  CATEGORY_MAX_DEPTH,
  flattenCategoryTree,
  reorderSiblings,
  withDescendants,
} from "@buscom/domain/product/categories";
import { cn } from "@/lib/utils";
import type { CategoryRow } from "@/server/products/categories";
import {
  createCategoryAction,
  deleteCategoryAction,
  reorderCategoriesAction,
  updateCategoryAction,
  type CategoryResult,
} from "@/app/(app)/products/categories/actions";

type Mode =
  | { kind: "idle" }
  | { kind: "add"; parentId: string | null }
  | { kind: "edit"; id: string }
  | { kind: "delete"; id: string };

type DropTarget = { id: string; place: "before" | "after" };

/**
 * Дерево категорий с правкой на месте: подкатегория добавляется прямо под
 * раздел, переименование и перенос в другой раздел — одной формой в строке.
 * Порядок внутри раздела — перетаскиванием строки (подкатегории едут вместе
 * с разделом); тот же порядок в меню сайта.
 * Проверки (цикл, глубина, повтор названия, непустая категория) делает сервер.
 */
export function CategoriesEditor({ categories, editable }: { categories: CategoryRow[]; editable: boolean }) {
  const [mode, setMode] = useState<Mode>({ kind: "idle" });
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [siteFor, setSiteFor] = useState<CategoryRow | null>(null);
  const [dragged, setDragged] = useState<CategoryRow | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  // Новый порядок показываем сразу, не дожидаясь ответа сервера; свежий список с
  // сервера приходит с тем же порядком, так что подмена ему не мешает
  const [localOrder, setLocalOrder] = useState<Map<string, number>>(new Map());

  const ordered = categories.map((category) =>
    localOrder.has(category.id) ? { ...category, sortOrder: localOrder.get(category.id) } : category,
  );
  const rows = flattenCategoryTree(buildCategoryTree(ordered));
  const byId = new Map(categories.map((category) => [category.id, category]));
  const canDrag = editable && mode.kind === "idle" && !pending;

  function drop(target: DropTarget) {
    if (!dragged) return;
    const siblings = ordered.filter((category) => category.parentId === dragged.parentId);
    const ids = reorderSiblings(siblings, dragged.id, target.id, target.place);
    if (!ids) return;
    const previous = localOrder;
    setLocalOrder(new Map([...localOrder, ...ids.map((id, index) => [id, index] as const)]));
    startTransition(async () => {
      const result = await reorderCategoriesAction({ parentId: dragged.parentId, ids });
      if (result.ok) toast.success(result.message);
      else {
        setLocalOrder(previous);
        toast.error(result.error);
      }
    });
  }

  function handle(action: Promise<CategoryResult>) {
    startTransition(async () => {
      const result = await action;
      if (result.ok) {
        toast.success(result.message);
        setMode({ kind: "idle" });
      } else {
        toast.error(result.error);
      }
    });
  }

  function startAdd(parent: string | null) {
    setName("");
    setMode({ kind: "add", parentId: parent });
  }

  function startEdit(row: CategoryRow) {
    setName(row.name);
    setParentId(row.parentId);
    setMode({ kind: "edit", id: row.id });
  }

  const addForm = (parent: string | null, indent: number) => (
    <form
      className="flex items-center gap-2 py-1"
      style={{ paddingLeft: indent }}
      onSubmit={(event) => {
        event.preventDefault();
        handle(createCategoryAction({ name, parentId: parent }));
      }}
    >
      <Input
        autoFocus
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => event.key === "Escape" && setMode({ kind: "idle" })}
        placeholder={parent ? "Название подкатегории" : "Название раздела"}
        className="h-8 max-w-sm"
      />
      <Button type="submit" size="sm" disabled={pending || !name.trim()}>
        Добавить
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setMode({ kind: "idle" })}>
        Отмена
      </Button>
    </form>
  );

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4">
      {editable ? (
        mode.kind === "add" && mode.parentId === null ? (
          addForm(null, 0)
        ) : (
          <div>
            <Button variant="outline" size="sm" onClick={() => startAdd(null)}>
              <Plus />
              Новый раздел
            </Button>
          </div>
        )
      ) : null}

      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">Категорий пока нет.</p>
      ) : (
        <ul className="flex flex-col">
          {rows.map((row) => {
            const indent = row.depth * 24;
            const isEditing = mode.kind === "edit" && mode.id === row.id;
            const isDeleting = mode.kind === "delete" && mode.id === row.id;
            // Перенести внутрь себя или своих подкатегорий нельзя — такие варианты в списке не предлагаем.
            const blocked = new Set(withDescendants(row.id, categories));

            return (
              <li key={row.id} className="border-b last:border-b-0">
                {isEditing ? (
                  <form
                    className="flex flex-wrap items-center gap-2 py-1.5"
                    style={{ paddingLeft: indent }}
                    onSubmit={(event) => {
                      event.preventDefault();
                      handle(updateCategoryAction(row.id, { name, parentId }));
                    }}
                  >
                    <Input
                      autoFocus
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      onKeyDown={(event) => event.key === "Escape" && setMode({ kind: "idle" })}
                      aria-label="Название категории"
                      className="h-8 w-64"
                    />
                    <span className="text-muted-foreground text-xs">в разделе</span>
                    <CategorySelect
                      categories={categories.filter((category) => !blocked.has(category.id))}
                      value={parentId}
                      onChange={setParentId}
                      emptyLabel="— верхний уровень —"
                      className="w-56"
                    />
                    <Button
                      type="submit"
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      aria-label="Сохранить"
                      disabled={pending || !name.trim()}
                    >
                      <Check className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      aria-label="Отменить"
                      onClick={() => setMode({ kind: "idle" })}
                    >
                      <X className="size-4" />
                    </Button>
                  </form>
                ) : (
                  <div
                    className={cn(
                      "flex min-h-10 items-center gap-2 border-y-2 border-transparent text-sm",
                      dragged?.id === row.id && "opacity-40",
                      dropTarget?.id === row.id &&
                        (dropTarget.place === "before" ? "border-t-primary" : "border-b-primary"),
                    )}
                    style={{ paddingLeft: indent }}
                    draggable={canDrag}
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      setDragged(byId.get(row.id) ?? null);
                    }}
                    onDragEnd={() => {
                      setDragged(null);
                      setDropTarget(null);
                    }}
                    onDragOver={(event) => {
                      // Переставлять можно только внутри своего раздела
                      if (!dragged || dragged.id === row.id || dragged.parentId !== row.parentId) return;
                      event.preventDefault();
                      const box = event.currentTarget.getBoundingClientRect();
                      const place = event.clientY < box.top + box.height / 2 ? "before" : "after";
                      if (dropTarget?.id !== row.id || dropTarget.place !== place) setDropTarget({ id: row.id, place });
                    }}
                    onDragLeave={() => setDropTarget((current) => (current?.id === row.id ? null : current))}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (dropTarget) drop(dropTarget);
                      setDragged(null);
                      setDropTarget(null);
                    }}
                  >
                    {editable ? (
                      <GripVertical
                        className={cn("text-muted-foreground size-4 shrink-0", canDrag ? "cursor-grab" : "opacity-30")}
                        aria-label="Перетащите, чтобы поменять порядок"
                      />
                    ) : null}
                    <span className={row.depth === 0 ? "font-medium" : undefined}>{row.name}</span>
                    {byId.get(row.id)?.slug ? (
                      <span className="text-muted-foreground font-mono text-xs">/{byId.get(row.id)?.slug}</span>
                    ) : null}
                    <span className="text-muted-foreground text-xs">
                      {row.productsCount > 0 ? `товаров: ${row.productsCount}` : "пусто"}
                    </span>
                    {editable ? (
                      <span className="ml-auto flex items-center gap-1">
                        {isDeleting ? (
                          <>
                            <span className="text-muted-foreground text-xs">Удалить?</span>
                            <Button
                              variant="destructive"
                              size="sm"
                              disabled={pending}
                              onClick={() => handle(deleteCategoryAction(row.id))}
                            >
                              Да
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setMode({ kind: "idle" })}>
                              Нет
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              aria-label="Адрес и метатеги на сайте"
                              title="Адрес и метатеги на сайте"
                              disabled={pending}
                              onClick={() => setSiteFor(byId.get(row.id) ?? null)}
                            >
                              <Globe className="size-4" />
                            </Button>
                            {row.depth < CATEGORY_MAX_DEPTH - 1 ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8"
                                aria-label="Добавить подкатегорию"
                                title="Добавить подкатегорию"
                                disabled={pending}
                                onClick={() => startAdd(row.id)}
                              >
                                <FolderPlus className="size-4" />
                              </Button>
                            ) : null}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              aria-label="Переименовать или перенести"
                              title="Переименовать или перенести"
                              disabled={pending}
                              onClick={() => startEdit(row)}
                            >
                              <Pencil className="size-4" />
                            </Button>
                            <Button
                              variant="destructive"
                              size="icon"
                              className="size-8"
                              aria-label="Удалить"
                              title="Удалить"
                              disabled={pending}
                              onClick={() => setMode({ kind: "delete", id: row.id })}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </>
                        )}
                      </span>
                    ) : null}
                  </div>
                )}
                {mode.kind === "add" && mode.parentId === row.id ? addForm(row.id, indent + 24) : null}
              </li>
            );
          })}
        </ul>
      )}
      {siteFor ? <CategorySiteDialog key={siteFor.id} category={siteFor} onClose={() => setSiteFor(null)} /> : null}
    </section>
  );
}
