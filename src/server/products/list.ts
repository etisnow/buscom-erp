import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { matchProductsCaseInsensitive } from "@/server/products/name-match";

export type ProductFilters = {
  query?: string;
  /** Категория вместе с подкатегориями */
  categoryId?: string;
  onlyInactive?: boolean;
  page?: number;
};

export const PRODUCTS_PAGE_SIZE = 50;

const listSelect = {
  id: true,
  sku: true,
  name: true,
  categoryId: true,
  priceKopecks: true,
  compatibility: true,
  isActive: true,
  updatedAt: true,
  suppliers: {
    orderBy: { purchasePriceKopecks: "asc" },
    select: {
      supplierId: true,
      purchasePriceKopecks: true,
      url: true,
      variant: true,
      optionPrices: { select: { optionValueId: true, purchasePriceKopecks: true, variant: true } },
      // Формула «Экономики цены» — чтобы показать рядом с номиналом стоимость для нас
      supplier: { select: { name: true, priceFormula: true } },
    },
  },
  // Только id аватарки: байты картинок в список не тянем.
  images: { orderBy: { sortOrder: "asc" }, take: 1, select: { id: true } },
  options: {
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      name: true,
      required: true,
      values: { orderBy: { sortOrder: "asc" }, select: { id: true, name: true, priceDeltaKopecks: true } },
    },
  },
} satisfies Prisma.ProductSelect;

export type ProductRow = Prisma.ProductGetPayload<{ select: typeof listSelect }>;

export type ProductListResult = {
  rows: ProductRow[];
  total: number;
  page: number;
  pageCount: number;
};

/**
 * Условия выборки общие со списком: выгрузка обязана повторять видимое на экране.
 * Поиск — по артикулу, названию и совместимым моделям без учёта регистра; сравнение
 * в приложении (`matchProductsCaseInsensitive`), потому что база кириллицу по
 * регистру не сворачивает.
 */
export async function productsWhere(filters: ProductFilters): Promise<Prisma.ProductWhereInput> {
  const and: Prisma.ProductWhereInput[] = [];

  const query = filters.query?.trim();
  if (query) {
    and.push({ id: { in: await matchProductsCaseInsensitive(query) } });
  }
  // Раздел показывает и товары подкатегорий. Глубина дерева ограничена
  // (CATEGORY_MAX_DEPTH = 4), поэтому хватает цепочки родителей без рекурсии в SQL.
  if (filters.categoryId) {
    const id = filters.categoryId;
    and.push({
      category: {
        OR: [{ id }, { parentId: id }, { parent: { parentId: id } }, { parent: { parent: { parentId: id } } }],
      },
    });
  }
  if (filters.onlyInactive) and.push({ isActive: false });

  return and.length > 0 ? { AND: and } : {};
}

export async function listProducts(filters: ProductFilters): Promise<ProductListResult> {
  const page = Math.max(1, filters.page ?? 1);
  const productWhere = await productsWhere(filters);

  const [rows, total] = await Promise.all([
    db.product.findMany({
      where: productWhere,
      select: listSelect,
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      skip: (page - 1) * PRODUCTS_PAGE_SIZE,
      take: PRODUCTS_PAGE_SIZE,
    }),
    db.product.count({ where: productWhere }),
  ]);

  return {
    rows,
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / PRODUCTS_PAGE_SIZE)),
  };
}

/**
 * Товары по id в том же виде, что и строки списка, — для карточки товара и
 * правки опций прямо из заказа. Скрытые тоже: позиция могла попасть в заказ раньше.
 */
export async function findProductRows(ids: readonly string[]): Promise<ProductRow[]> {
  if (ids.length === 0) return [];
  return db.product.findMany({ where: { id: { in: [...new Set(ids)] } }, select: listSelect });
}
