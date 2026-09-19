import "server-only";
import type { Kopecks } from "@/domain/money";
import { db } from "@/server/db";
import { ForbiddenError } from "@/server/errors";
import type { SessionUser } from "@/server/session";

/** Кто правит каталог: цены и карточку — менеджеры и выше, остаток — ещё и склад (PRD, роли). */
const CATALOG_ROLES = ["MANAGER", "HEAD", "ADMIN"] as const;
const STOCK_ROLES = ["WAREHOUSE", "HEAD", "ADMIN"] as const;

export type ProductDraft = {
  sku: string;
  name: string;
  category?: string | null;
  priceKopecks: Kopecks;
  stock?: number;
  madeToOrder?: boolean;
  leadTimeDays?: number | null;
  compatibility?: string[];
  isActive?: boolean;
};

export async function createProduct(draft: ProductDraft, user: SessionUser): Promise<{ id: string }> {
  if (!CATALOG_ROLES.includes(user.role as (typeof CATALOG_ROLES)[number])) {
    throw new ForbiddenError("Заводить товары может менеджер, руководитель или администратор");
  }

  const sku = draft.sku.trim();
  const existing = await db.product.findUnique({ where: { sku }, select: { id: true } });
  if (existing) throw new Error(`Товар с артикулом ${sku} уже есть`);

  return db.product.create({
    data: {
      sku,
      name: draft.name.trim(),
      category: draft.category?.trim() || null,
      priceKopecks: draft.priceKopecks,
      stock: draft.stock ?? 0,
      madeToOrder: draft.madeToOrder ?? false,
      leadTimeDays: draft.leadTimeDays ?? null,
      compatibility: draft.compatibility ?? [],
      isActive: draft.isActive ?? true,
    },
    select: { id: true },
  });
}

export async function updateProduct(id: string, draft: Partial<ProductDraft>, user: SessionUser): Promise<void> {
  if (!CATALOG_ROLES.includes(user.role as (typeof CATALOG_ROLES)[number])) {
    throw new ForbiddenError("Склад не меняет цены и карточку товара");
  }

  await db.product.update({
    where: { id },
    data: {
      ...(draft.sku !== undefined ? { sku: draft.sku.trim() } : {}),
      ...(draft.name !== undefined ? { name: draft.name.trim() } : {}),
      ...(draft.category !== undefined ? { category: draft.category?.trim() || null } : {}),
      ...(draft.priceKopecks !== undefined ? { priceKopecks: draft.priceKopecks } : {}),
      ...(draft.madeToOrder !== undefined ? { madeToOrder: draft.madeToOrder } : {}),
      ...(draft.leadTimeDays !== undefined ? { leadTimeDays: draft.leadTimeDays } : {}),
      ...(draft.compatibility !== undefined ? { compatibility: draft.compatibility } : {}),
      ...(draft.isActive !== undefined ? { isActive: draft.isActive } : {}),
    },
  });
}

/**
 * Правка остатка — работа склада. Резерв руками не меняется: его ведёт
 * сервис заказов при сменах статуса, иначе он разойдётся с заказами.
 */
export async function setProductStock(id: string, stock: number, user: SessionUser): Promise<void> {
  if (!STOCK_ROLES.includes(user.role as (typeof STOCK_ROLES)[number])) {
    throw new ForbiddenError("Остаток правит склад или руководитель");
  }
  if (!Number.isInteger(stock) || stock < 0) {
    throw new Error("Остаток — целое неотрицательное число");
  }

  await db.product.update({ where: { id }, data: { stock } });
}

export function canEditCatalog(role: SessionUser["role"]): boolean {
  return CATALOG_ROLES.includes(role as (typeof CATALOG_ROLES)[number]);
}

export function canEditStock(role: SessionUser["role"]): boolean {
  return STOCK_ROLES.includes(role as (typeof STOCK_ROLES)[number]);
}
