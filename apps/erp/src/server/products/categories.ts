import "server-only";
import {
  assertCategoryPlacement,
  CategoryError,
  normalizeCategoryName,
  withDescendants,
  type CategoryNode,
} from "@buscom/domain/product/categories";
import { db } from "@/server/db";
import { ForbiddenError } from "@/server/errors";
import type { Tx } from "@/server/orders/internal";
import { canEditCatalog } from "@/server/products/service";
import type { SessionUser } from "@/server/session";
import { applySiteSeo, type SiteSeoDraft } from "@/server/site/seo";

export type CategoryRow = CategoryNode & {
  /** Товаров прямо в этой категории (без подкатегорий) */
  productsCount: number;
  /** Адрес и метатеги на сайте bus-com.ru */
  slug: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
};

export async function listCategories(): Promise<CategoryRow[]> {
  const rows = await db.productCategory.findMany({
    select: {
      id: true,
      name: true,
      parentId: true,
      slug: true,
      metaTitle: true,
      metaDescription: true,
      _count: { select: { products: true } },
    },
    orderBy: { name: "asc" },
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    parentId: row.parentId,
    productsCount: row._count.products,
    slug: row.slug,
    metaTitle: row.metaTitle,
    metaDescription: row.metaDescription,
  }));
}

async function allNodes(tx: Tx): Promise<CategoryNode[]> {
  return tx.productCategory.findMany({ select: { id: true, name: true, parentId: true } });
}

function assertEditor(user: SessionUser): void {
  if (!canEditCatalog(user.role)) {
    throw new ForbiddenError("Категории правит менеджер, руководитель или администратор");
  }
}

export async function createCategory(
  input: { name: string; parentId: string | null },
  user: SessionUser,
): Promise<{ id: string }> {
  assertEditor(user);
  return db.$transaction(async (tx) => {
    const nodes = await allNodes(tx);
    assertCategoryPlacement(null, input.parentId, nodes);
    const name = normalizeCategoryName(input.name, input.parentId, nodes);
    return tx.productCategory.create({ data: { name, parentId: input.parentId }, select: { id: true } });
  });
}

/** Переименование и перенос в другой раздел. Товары остаются привязаны к категории. */
export async function updateCategory(
  id: string,
  input: { name: string; parentId: string | null },
  user: SessionUser,
): Promise<void> {
  assertEditor(user);
  await db.$transaction(async (tx) => {
    const nodes = await allNodes(tx);
    if (!nodes.some((node) => node.id === id)) throw new CategoryError("Категория не найдена — обновите страницу");
    assertCategoryPlacement(id, input.parentId, nodes);
    const name = normalizeCategoryName(input.name, input.parentId, nodes, id);
    await tx.productCategory.update({ where: { id }, data: { name, parentId: input.parentId } });
  });
}

/** Адрес и метатеги категории на сайте; при смене адреса — переадресация со старого. */
export async function updateCategorySite(id: string, draft: SiteSeoDraft, user: SessionUser): Promise<void> {
  assertEditor(user);
  await db.$transaction((tx) => applySiteSeo(tx, { kind: "category", id }, draft));
}

/**
 * Удаляется только пустая категория: без товаров и подкатегорий. Иначе товары
 * молча остались бы без категории, а подкатегории — без раздела.
 */
export async function deleteCategory(id: string, user: SessionUser): Promise<void> {
  assertEditor(user);
  const category = await db.productCategory.findUnique({
    where: { id },
    select: { _count: { select: { products: true, children: true } } },
  });
  if (!category) throw new CategoryError("Категория не найдена — обновите страницу");
  if (category._count.children > 0) {
    throw new CategoryError(
      `В категории есть подкатегории (${category._count.children}) — сначала перенесите или удалите их`,
    );
  }
  if (category._count.products > 0) {
    throw new CategoryError(`В категории есть товары (${category._count.products}) — сначала перенесите их в другую`);
  }
  await db.productCategory.delete({ where: { id } });
}

/**
 * Категория по пути названий («Климат», «Люки») для импорта с сайта: находит
 * каждый уровень среди детей предыдущего без учёта регистра, недостающий заводит.
 * Если подкатегории на месте нет, но есть такая же категория верхнего уровня
 * без родителя (так миграция разложила старые текстовые категории), — она
 * переносится под раздел, а не дублируется: товары и id сохраняются.
 */
export async function resolveCategoryPath(tx: Tx, path: readonly string[]): Promise<string | null> {
  const names = path.map((name) => name.replace(/\s+/g, " ").trim()).filter(Boolean);
  if (names.length === 0) return null;

  let parentId: string | null = null;
  for (const [level, name] of names.entries()) {
    const siblings: { id: string; name: string }[] = await tx.productCategory.findMany({
      where: { parentId },
      select: { id: true, name: true },
    });
    const found = siblings.find((item) => item.name.toLocaleLowerCase("ru") === name.toLocaleLowerCase("ru"));
    if (found) {
      parentId = found.id;
      continue;
    }

    if (level > 0) {
      const roots = await tx.productCategory.findMany({ where: { parentId: null }, select: { id: true, name: true } });
      const orphan = roots.find((item) => item.name.toLocaleLowerCase("ru") === name.toLocaleLowerCase("ru"));
      // Раздел с тем же названием, что у подкатегории, — не сирота, а предок: перенос дал бы цикл.
      const isAncestor = orphan && parentId ? withDescendants(orphan.id, await allNodes(tx)).includes(parentId) : false;
      if (orphan && !isAncestor) {
        await tx.productCategory.update({ where: { id: orphan.id }, data: { parentId } });
        parentId = orphan.id;
        continue;
      }
    }

    const created: { id: string } = await tx.productCategory.create({ data: { name, parentId }, select: { id: true } });
    parentId = created.id;
  }
  return parentId;
}
