"use client";

import { useState, useTransition } from "react";
import { Check, FolderPlus, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { CategorySelect } from "@/components/products/category-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  buildCategoryTree,
  CATEGORY_MAX_DEPTH,
  flattenCategoryTree,
  withDescendants,
} from "@buscom/domain/product/categories";
import type { CategoryRow } from "@/server/products/categories";
import {
  createCategoryAction,
  deleteCategoryAction,
  updateCategoryAction,
  type CategoryResult,
} from "@/app/(app)/products/categories/actions";

type Mode =
  | { kind: "idle" }
  | { kind: "add"; parentId: string | null }
  | { kind: "edit"; id: string }
  | { kind: "delete"; id: string };

/**
 * Дерево категорий с правкой на месте: подкатегория добавляется прямо под
 * раздел, переименование и перенос в другой раздел — одной формой в строке.
 * Проверки (цикл, глубина, повтор названия, непустая категория) делает сервер.
 */
export function CategoriesEditor({ categories, editable }: { categories: CategoryRow[]; editable: boolean }) {
  const [mode, setMode] = useState<Mode>({ kind: "idle" });
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const rows = flattenCategoryTree(buildCategoryTree(categories));

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
                  <div className="flex min-h-10 items-center gap-2 text-sm" style={{ paddingLeft: indent }}>
                    <span className={row.depth === 0 ? "font-medium" : undefined}>{row.name}</span>
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
    </section>
  );
}
