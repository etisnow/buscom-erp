"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { buildCategoryTree, flattenCategoryTree, type CategoryNode } from "@buscom/domain/product/categories";

const EMPTY = "__empty__";

/**
 * Выбор категории деревом: подкатегории с отступом под своим разделом.
 * `emptyLabel` — подпись пункта «ничего не выбрано» («Все категории» в фильтре,
 * «Без категории» в карточке товара).
 */
export function CategorySelect({
  categories,
  value,
  onChange,
  emptyLabel,
  id,
  className,
  size = "sm",
}: {
  categories: readonly CategoryNode[];
  value: string | null;
  onChange: (value: string | null) => void;
  emptyLabel: string;
  id?: string;
  className?: string;
  size?: "sm" | "default";
}) {
  const options = flattenCategoryTree(buildCategoryTree(categories));

  return (
    <Select value={value ?? EMPTY} onValueChange={(next) => onChange(next === EMPTY ? null : next)}>
      <SelectTrigger id={id} size={size} className={className}>
        <SelectValue placeholder={emptyLabel} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={EMPTY}>{emptyLabel}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.id} value={option.id}>
            {/* Отступ по глубине показывает, под каким разделом подкатегория. */}
            <span style={{ paddingLeft: option.depth * 16 }} className={option.depth === 0 ? "font-medium" : undefined}>
              {option.name}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
