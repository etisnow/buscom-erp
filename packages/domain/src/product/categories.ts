/**
 * Справочник категорий товаров — дерево (docs/DECISIONS.md, «Справочник категорий»).
 * Чистые функции над плоским списком `{ id, name, parentId }`: построить дерево,
 * подписать путь, собрать потомков для фильтра, проверить перенос.
 */

/** Глубже — это уже не каталог, а лабиринт; на сайте два уровня. */
export const CATEGORY_MAX_DEPTH = 4;

export type CategoryNode = { id: string; name: string; parentId: string | null };

export type CategoryTreeItem<T extends CategoryNode = CategoryNode> = T & {
  depth: number;
  children: CategoryTreeItem<T>[];
};

export class CategoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CategoryError";
  }
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "ru");

/** Дерево из плоского списка, на каждом уровне — по алфавиту. Сироты (родитель не найден) — в корень. */
export function buildCategoryTree<T extends CategoryNode>(categories: readonly T[]): CategoryTreeItem<T>[] {
  const ids = new Set(categories.map((category) => category.id));
  const childrenOf = new Map<string | null, T[]>();
  for (const category of categories) {
    const parent = category.parentId && ids.has(category.parentId) ? category.parentId : null;
    childrenOf.set(parent, [...(childrenOf.get(parent) ?? []), category]);
  }

  const build = (parentId: string | null, depth: number, seen: Set<string>): CategoryTreeItem<T>[] =>
    [...(childrenOf.get(parentId) ?? [])]
      .filter((category) => !seen.has(category.id))
      .sort(byName)
      .map((category) => {
        const path = new Set(seen).add(category.id);
        return { ...category, depth, children: build(category.id, depth + 1, path) };
      });

  return build(null, 0, new Set());
}

/** Дерево в список по порядку обхода — для выпадающих списков с отступом по `depth`. */
export function flattenCategoryTree<T extends CategoryNode>(
  tree: readonly CategoryTreeItem<T>[],
): CategoryTreeItem<T>[] {
  return tree.flatMap((item) => [item, ...flattenCategoryTree(item.children)]);
}

/** Путь от корня: «Климат / Люки». Для списков и выгрузки, где дерева не видно. */
export function categoryPath(id: string | null | undefined, categories: readonly CategoryNode[]): string {
  if (!id) return "";
  const byId = new Map(categories.map((category) => [category.id, category]));
  const names: string[] = [];
  let current = byId.get(id);
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    names.unshift(current.name);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return names.join(" / ");
}

/** Категория и все её потомки: фильтр по разделу показывает и товары подкатегорий. */
export function withDescendants(id: string, categories: readonly CategoryNode[]): string[] {
  const result = [id];
  for (let index = 0; index < result.length; index += 1) {
    for (const category of categories) {
      if (category.parentId === result[index] && !result.includes(category.id)) result.push(category.id);
    }
  }
  return result;
}

function depthOf(id: string | null, categories: readonly CategoryNode[]): number {
  let depth = 0;
  let current = id ? categories.find((category) => category.id === id) : undefined;
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    depth += 1;
    current = current.parentId ? categories.find((category) => category.id === current?.parentId) : undefined;
  }
  return depth;
}

/** Высота поддерева: 1 — у листа. */
function subtreeHeight(id: string, categories: readonly CategoryNode[], seen = new Set<string>()): number {
  if (seen.has(id)) return 0;
  seen.add(id);
  const children = categories.filter((category) => category.parentId === id);
  return 1 + Math.max(0, ...children.map((child) => subtreeHeight(child.id, categories, seen)));
}

/**
 * Можно ли поставить категорию `id` (или новую, если id нет) под `parentId`.
 * Нельзя под саму себя и под своих потомков — получился бы цикл; нельзя глубже
 * `CATEGORY_MAX_DEPTH` с учётом собственных подкатегорий.
 */
export function assertCategoryPlacement(
  id: string | null,
  parentId: string | null,
  categories: readonly CategoryNode[],
): void {
  if (parentId && !categories.some((category) => category.id === parentId)) {
    throw new CategoryError("Родительская категория не найдена — обновите страницу");
  }
  if (id && parentId && withDescendants(id, categories).includes(parentId)) {
    throw new CategoryError("Нельзя перенести категорию внутрь самой себя");
  }
  const height = id ? subtreeHeight(id, categories) : 1;
  if (depthOf(parentId, categories) + height > CATEGORY_MAX_DEPTH) {
    throw new CategoryError(`Вложенность — не больше ${CATEGORY_MAX_DEPTH} уровней`);
  }
}

/**
 * Название без лишних пробелов; повтор среди соседей (без учёта регистра)
 * отклоняется — две «Люки» в одном разделе путали бы выбор в карточке товара.
 */
export function normalizeCategoryName(
  name: string,
  parentId: string | null,
  categories: readonly CategoryNode[],
  selfId: string | null = null,
): string {
  const value = name.replace(/\s+/g, " ").trim();
  if (!value) throw new CategoryError("Укажите название категории");
  const key = value.toLocaleLowerCase("ru");
  const clash = categories.find(
    (category) =>
      category.id !== selfId &&
      (category.parentId ?? null) === parentId &&
      category.name.toLocaleLowerCase("ru") === key,
  );
  if (clash) throw new CategoryError(`Категория «${clash.name}» здесь уже есть`);
  return value;
}
