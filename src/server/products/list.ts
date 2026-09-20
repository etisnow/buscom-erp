import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";

export type ProductFilters = {
  query?: string;
  category?: string;
  /** Только те, чей свободный остаток меньше или равен нулю */
  onlyShortage?: boolean;
  onlyInactive?: boolean;
  page?: number;
};

export const PRODUCTS_PAGE_SIZE = 50;

const listSelect = {
  id: true,
  sku: true,
  name: true,
  category: true,
  priceKopecks: true,
  stock: true,
  reserved: true,
  madeToOrder: true,
  leadTimeDays: true,
  compatibility: true,
  isActive: true,
  updatedAt: true,
} satisfies Prisma.ProductSelect;

export type ProductRow = Prisma.ProductGetPayload<{ select: typeof listSelect }>;

export type ProductListResult = {
  rows: ProductRow[];
  total: number;
  page: number;
  pageCount: number;
  categories: string[];
};

function where(filters: ProductFilters): Prisma.ProductWhereInput {
  const and: Prisma.ProductWhereInput[] = [];

  const query = filters.query?.trim();
  if (query) {
    and.push({
      OR: [
        { sku: { contains: query, mode: "insensitive" } },
        { name: { contains: query, mode: "insensitive" } },
        // Совместимость — массив строк в Postgres: частичное совпадение внутри элемента
        // Prisma выразить не может, поэтому модель ищется целиком («ГАЗель Next»).
        { compatibility: { has: query } },
      ],
    });
  }
  if (filters.category) and.push({ category: filters.category });
  if (filters.onlyInactive) and.push({ isActive: false });
  // Нехватка считается по свободному остатку, товары «под заказ» не учитываются.
  if (filters.onlyShortage) {
    and.push({ madeToOrder: false, reserved: { gte: db.product.fields.stock } });
  }

  return and.length > 0 ? { AND: and } : {};
}

export async function listProducts(filters: ProductFilters): Promise<ProductListResult> {
  const page = Math.max(1, filters.page ?? 1);
  const productWhere = where(filters);

  const [rows, total, categories] = await Promise.all([
    db.product.findMany({
      where: productWhere,
      select: listSelect,
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      skip: (page - 1) * PRODUCTS_PAGE_SIZE,
      take: PRODUCTS_PAGE_SIZE,
    }),
    db.product.count({ where: productWhere }),
    db.product.findMany({
      where: { category: { not: null } },
      select: { category: true },
      distinct: ["category"],
      orderBy: { category: "asc" },
    }),
  ]);

  return {
    rows,
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / PRODUCTS_PAGE_SIZE)),
    categories: categories.map((row) => row.category).filter((value): value is string => value !== null),
  };
}
