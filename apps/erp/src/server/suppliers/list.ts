import "server-only";
import { normalizePhone } from "@/domain/customer/phone";
import type { Prisma } from "@buscom/db/client";
import { parsePriceFormula, type PriceFormula } from "@/domain/supplier/price-economics";
import { db } from "@/server/db";

export type SupplierFilters = {
  query?: string;
  page?: number;
};

export const SUPPLIERS_PAGE_SIZE = 50;

function suppliersWhere(filters: SupplierFilters): Prisma.SupplierWhereInput {
  const query = filters.query?.trim();
  if (!query) return {};

  const phone = normalizePhone(query);
  const digits = query.replace(/\D/g, "");
  return {
    OR: [
      { name: { contains: query, mode: "insensitive" } },
      { contactPerson: { contains: query, mode: "insensitive" } },
      ...(phone ? [{ phone }] : []),
      ...(query.includes("@") ? [{ email: { contains: query, mode: "insensitive" as const } }] : []),
      ...(/^\d{10,12}$/.test(digits) ? [{ inn: digits }] : []),
    ],
  };
}

const listSelect = {
  id: true,
  type: true,
  name: true,
  phone: true,
  email: true,
  inn: true,
  contactPerson: true,
  _count: { select: { products: true, stages: true } },
} satisfies Prisma.SupplierSelect;

export type SupplierListRow = Prisma.SupplierGetPayload<{ select: typeof listSelect }>;

export type SupplierListResult = {
  rows: SupplierListRow[];
  total: number;
  page: number;
  pageCount: number;
};

export async function listSuppliers(filters: SupplierFilters): Promise<SupplierListResult> {
  const page = Math.max(1, filters.page ?? 1);
  const where = suppliersWhere(filters);

  const [rows, total] = await Promise.all([
    db.supplier.findMany({
      where,
      select: listSelect,
      orderBy: { name: "asc" },
      skip: (page - 1) * SUPPLIERS_PAGE_SIZE,
      take: SUPPLIERS_PAGE_SIZE,
    }),
    db.supplier.count({ where }),
  ]);

  return { rows, total, page, pageCount: Math.max(1, Math.ceil(total / SUPPLIERS_PAGE_SIZE)) };
}

const detailsInclude = {
  stages: {
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true, _count: { select: { tracks: true } } },
  },
  products: {
    orderBy: { product: { name: "asc" } },
    select: {
      purchasePriceKopecks: true,
      product: { select: { id: true, sku: true, name: true, priceKopecks: true, isActive: true } },
    },
  },
} satisfies Prisma.SupplierInclude;

export type SupplierDetails = Prisma.SupplierGetPayload<{ include: typeof detailsInclude }>;

export async function findSupplier(id: string): Promise<SupplierDetails | null> {
  return db.supplier.findUnique({ where: { id }, include: detailsInclude });
}

export type SupplierOption = {
  id: string;
  name: string;
  /** «Экономика цены» — чтобы в карточке товара сразу видеть стоимость для нас */
  priceFormula: PriceFormula;
};

/** Все поставщики для выпадающих списков: их десятки, а не тысячи, — постранично не нужно. */
export async function listSupplierOptions(): Promise<SupplierOption[]> {
  const rows = await db.supplier.findMany({
    select: { id: true, name: true, priceFormula: true },
    orderBy: { name: "asc" },
  });
  return rows.map((row) => ({ id: row.id, name: row.name, priceFormula: parsePriceFormula(row.priceFormula) }));
}
