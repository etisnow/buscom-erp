import "server-only";
import type { Kopecks } from "@/domain/money";
import { db } from "@/server/db";
import { ForbiddenError } from "@/server/errors";
import type { Tx } from "@/server/orders/internal";
import type { SessionUser } from "@/server/session";

/** Кто правит каталог: цены и карточку — менеджеры и выше (PRD, роли). */
const CATALOG_ROLES = ["MANAGER", "HEAD", "ADMIN"] as const;

/** Поставщик товара и его закупочная цена. Цена продажи — `priceKopecks` товара. */
export type ProductSupplierDraft = {
  supplierId: string;
  purchasePriceKopecks: Kopecks;
};

export type ProductDraft = {
  sku: string;
  name: string;
  category?: string | null;
  priceKopecks: Kopecks;
  compatibility?: string[];
  isActive?: boolean;
  /** Полный список поставщиков товара; не задан — привязки не трогаем */
  suppliers?: ProductSupplierDraft[];
};

export async function createProduct(draft: ProductDraft, user: SessionUser): Promise<{ id: string }> {
  if (!CATALOG_ROLES.includes(user.role as (typeof CATALOG_ROLES)[number])) {
    throw new ForbiddenError("Заводить товары может менеджер, руководитель или администратор");
  }

  const sku = draft.sku.trim();
  const existing = await db.product.findUnique({ where: { sku }, select: { id: true } });
  if (existing) throw new Error(`Товар с артикулом ${sku} уже есть`);

  return db.$transaction(async (tx) => {
    const product = await tx.product.create({
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
    if (draft.suppliers) await replaceProductSuppliers(tx, product.id, draft.suppliers);
    return product;
  });
}

export async function updateProduct(id: string, draft: Partial<ProductDraft>, user: SessionUser): Promise<void> {
  if (!CATALOG_ROLES.includes(user.role as (typeof CATALOG_ROLES)[number])) {
    throw new ForbiddenError("Недостаточно прав, чтобы менять карточку товара");
  }

  await db.$transaction(async (tx) => {
    await tx.product.update({
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
    if (draft.suppliers) await replaceProductSuppliers(tx, id, draft.suppliers);
  });
}

/**
 * Привязки товара к поставщикам заменяются целиком. Позиции уже оформленных
 * заказов это не задевает: закупочная цена в них — снимок.
 */
async function replaceProductSuppliers(tx: Tx, productId: string, suppliers: ProductSupplierDraft[]): Promise<void> {
  const ids = suppliers.map((item) => item.supplierId);
  if (new Set(ids).size !== ids.length) {
    throw new Error("Один поставщик указан у товара дважды");
  }

  await tx.productSupplier.deleteMany({ where: { productId } });
  if (suppliers.length > 0) {
    await tx.productSupplier.createMany({
      data: suppliers.map((item) => ({
        productId,
        supplierId: item.supplierId,
        purchasePriceKopecks: item.purchasePriceKopecks,
      })),
    });
  }
}

export function canEditCatalog(role: SessionUser["role"]): boolean {
  return CATALOG_ROLES.includes(role as (typeof CATALOG_ROLES)[number]);
}
