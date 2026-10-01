import "server-only";
import type { Prisma } from "@buscom/db/client";
import type { ProductLogAction } from "@buscom/db/enums";
import { formatRub } from "@buscom/domain/money";
import {
  describeNewProduct,
  diffProductSnapshots,
  type ProductLogChange,
  type ProductLogSnapshot,
} from "@buscom/domain/product/log";
import { db } from "@/server/db";
import type { Tx } from "@/server/orders/internal";
import type { SessionUser } from "@/server/session";

/**
 * Состояние товара для журнала: всё, что человек правит в карточке, — текстом.
 * Читается внутри транзакции правки, до и после, поэтому разница — ровно эта правка.
 */
export async function snapshotProduct(tx: Tx, id: string): Promise<ProductLogSnapshot | null> {
  const product = await tx.product.findUnique({
    where: { id },
    select: {
      sku: true,
      name: true,
      description: true,
      priceKopecks: true,
      compatibility: true,
      isActive: true,
      isHit: true,
      salonKit: true,
      seatType: true,
      slug: true,
      metaTitle: true,
      metaDescription: true,
      category: { select: { name: true } },
      suppliers: {
        select: {
          purchasePriceKopecks: true,
          url: true,
          supplier: { select: { name: true } },
          optionPrices: {
            select: { purchasePriceKopecks: true, optionValue: { select: { name: true } } },
          },
        },
      },
      options: {
        orderBy: { sortOrder: "asc" },
        select: {
          name: true,
          required: true,
          values: { orderBy: { sortOrder: "asc" }, select: { name: true, priceDeltaKopecks: true } },
        },
      },
    },
  });
  if (!product) return null;

  const suppliers = product.suppliers
    .map((item) => {
      const optionPrices = item.optionPrices
        .map((price) => `${price.optionValue.name}: ${formatRub(price.purchasePriceKopecks)}`)
        .sort()
        .join(", ");
      return [
        `${item.supplier.name} — ${formatRub(item.purchasePriceKopecks)}`,
        item.url ? ` (${item.url})` : "",
        optionPrices ? ` [опции: ${optionPrices}]` : "",
      ].join("");
    })
    .sort();
  const options = product.options.map(
    (group) =>
      `${group.name}${group.required ? " (обязательная)" : ""}: ` +
      group.values.map((value) => `${value.name} ${formatRub(value.priceDeltaKopecks)}`).join(", "),
  );

  return {
    sku: product.sku,
    name: product.name,
    description: product.description,
    category: product.category?.name ?? null,
    price: formatRub(product.priceKopecks),
    compatibility: product.compatibility.join(", "),
    isActive: product.isActive,
    isHit: product.isHit,
    salonKit: product.salonKit,
    seatType: product.seatType,
    slug: product.slug,
    metaTitle: product.metaTitle,
    metaDescription: product.metaDescription,
    suppliers: suppliers.join("\n"),
    options: options.join("\n"),
  };
}

async function writeLog(
  tx: Tx,
  entry: {
    productId: string;
    sku: string;
    name: string;
    action: ProductLogAction;
    changes?: ProductLogChange[];
    user: SessionUser;
  },
): Promise<void> {
  await tx.productLog.create({
    data: {
      productId: entry.productId,
      sku: entry.sku,
      name: entry.name,
      action: entry.action,
      changes: entry.changes && entry.changes.length > 0 ? entry.changes : undefined,
      userId: entry.user.id,
    },
  });
}

export async function logProductCreated(tx: Tx, id: string, user: SessionUser): Promise<void> {
  const after = await snapshotProduct(tx, id);
  if (!after) return;
  await writeLog(tx, {
    productId: id,
    sku: String(after.sku),
    name: String(after.name),
    action: "CREATED",
    changes: describeNewProduct(after),
    user,
  });
}

/**
 * Правка: изменения полей — одна запись «Изменён», смена «В каталоге» — «Скрыт» или
 * «Возвращён в каталог». Сохранение без отличий журнал не пополняет.
 */
export async function logProductUpdated(
  tx: Tx,
  id: string,
  before: ProductLogSnapshot | null,
  user: SessionUser,
): Promise<void> {
  const after = await snapshotProduct(tx, id);
  if (!before || !after) return;
  const base = { productId: id, sku: String(after.sku), name: String(after.name), user };

  if (before.isActive !== after.isActive) {
    await writeLog(tx, { ...base, action: after.isActive ? "SHOWN" : "HIDDEN" });
  }
  const changes = diffProductSnapshots(before, after);
  if (changes.length > 0) await writeLog(tx, { ...base, action: "UPDATED", changes });
}

export async function logProductDeleted(tx: Tx, id: string, user: SessionUser): Promise<void> {
  const snapshot = await snapshotProduct(tx, id);
  if (!snapshot) return;
  await writeLog(tx, {
    productId: id,
    sku: String(snapshot.sku),
    name: String(snapshot.name),
    action: "DELETED",
    user,
  });
}

export const PRODUCT_LOG_PAGE_SIZE = 50;

export type ProductLogFilters = {
  action?: ProductLogAction;
  /** Артикул или название — как в записи на момент действия */
  query?: string;
  page?: number;
};

export type ProductLogRow = {
  id: string;
  productId: string;
  sku: string;
  name: string;
  action: ProductLogAction;
  changes: ProductLogChange[];
  userName: string | null;
  createdAt: Date;
};

export async function listProductLogs(filters: ProductLogFilters) {
  const query = filters.query?.trim();
  const where: Prisma.ProductLogWhereInput = {
    ...(filters.action ? { action: filters.action } : {}),
    ...(query
      ? {
          OR: [{ sku: { contains: query, mode: "insensitive" } }, { name: { contains: query, mode: "insensitive" } }],
        }
      : {}),
  };
  const page = Math.max(1, filters.page ?? 1);

  const [total, rows] = await Promise.all([
    db.productLog.count({ where }),
    db.productLog.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * PRODUCT_LOG_PAGE_SIZE,
      take: PRODUCT_LOG_PAGE_SIZE,
      include: { user: { select: { name: true } } },
    }),
  ]);

  return {
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / PRODUCT_LOG_PAGE_SIZE)),
    rows: rows.map((row): ProductLogRow => ({
      id: row.id,
      productId: row.productId,
      sku: row.sku,
      name: row.name,
      action: row.action,
      changes: Array.isArray(row.changes) ? (row.changes as ProductLogChange[]) : [],
      userName: row.user?.name ?? null,
      createdAt: row.createdAt,
    })),
  };
}
