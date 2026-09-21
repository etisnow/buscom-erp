import "server-only";
import { db } from "@/server/db";

export type ProductSupplierOption = {
  id: string;
  name: string;
  purchasePriceKopecks: number;
};

export type ProductSuggestion = {
  id: string;
  sku: string;
  name: string;
  priceKopecks: number;
  /** Поставщики товара, самый дешёвый первым — его форма и подставляет */
  suppliers: ProductSupplierOption[];
};

/** Подбор товара по артикулу или названию — для добавления позиции в заказ. */
export async function searchProducts(query: string): Promise<ProductSuggestion[]> {
  const search = query.trim();
  if (search.length < 2) return [];

  const products = await db.product.findMany({
    where: {
      isActive: true,
      OR: [{ sku: { contains: search, mode: "insensitive" } }, { name: { contains: search, mode: "insensitive" } }],
    },
    select: {
      id: true,
      sku: true,
      name: true,
      priceKopecks: true,
      suppliers: {
        orderBy: { purchasePriceKopecks: "asc" },
        select: { purchasePriceKopecks: true, supplier: { select: { id: true, name: true } } },
      },
    },
    orderBy: { name: "asc" },
    take: 10,
  });

  return products.map((product) => ({
    id: product.id,
    sku: product.sku,
    name: product.name,
    priceKopecks: product.priceKopecks,
    suppliers: product.suppliers.map((link) => ({
      id: link.supplier.id,
      name: link.supplier.name,
      purchasePriceKopecks: link.purchasePriceKopecks,
    })),
  }));
}
