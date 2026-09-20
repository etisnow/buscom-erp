import "server-only";
import type { Kopecks } from "@/domain/money";
import { db } from "@/server/db";
import { ForbiddenError } from "@/server/errors";
import type { SessionUser } from "@/server/session";

/** Кто правит каталог: цены и карточку — менеджеры и выше (PRD, роли). */
const CATALOG_ROLES = ["MANAGER", "HEAD", "ADMIN"] as const;

export type ProductDraft = {
  sku: string;
  name: string;
  category?: string | null;
  priceKopecks: Kopecks;
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
      compatibility: draft.compatibility ?? [],
      isActive: draft.isActive ?? true,
    },
    select: { id: true },
  });
}

export async function updateProduct(id: string, draft: Partial<ProductDraft>, user: SessionUser): Promise<void> {
  if (!CATALOG_ROLES.includes(user.role as (typeof CATALOG_ROLES)[number])) {
    throw new ForbiddenError("Недостаточно прав, чтобы менять карточку товара");
  }

  await db.product.update({
    where: { id },
    data: {
      ...(draft.sku !== undefined ? { sku: draft.sku.trim() } : {}),
      ...(draft.name !== undefined ? { name: draft.name.trim() } : {}),
      ...(draft.category !== undefined ? { category: draft.category?.trim() || null } : {}),
      ...(draft.priceKopecks !== undefined ? { priceKopecks: draft.priceKopecks } : {}),
      ...(draft.compatibility !== undefined ? { compatibility: draft.compatibility } : {}),
      ...(draft.isActive !== undefined ? { isActive: draft.isActive } : {}),
    },
  });
}

export function canEditCatalog(role: SessionUser["role"]): boolean {
  return CATALOG_ROLES.includes(role as (typeof CATALOG_ROLES)[number]);
}
