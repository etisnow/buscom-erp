import "server-only";
import { db } from "@/server/db";

export type ProductSuggestion = {
  id: string;
  sku: string;
  name: string;
  priceKopecks: number;
  available: number;
  madeToOrder: boolean;
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
    select: { id: true, sku: true, name: true, priceKopecks: true, stock: true, reserved: true, madeToOrder: true },
    orderBy: { name: "asc" },
    take: 10,
  });

  return products.map((product) => ({
    id: product.id,
    sku: product.sku,
    name: product.name,
    priceKopecks: product.priceKopecks,
    available: product.stock - product.reserved,
    madeToOrder: product.madeToOrder,
  }));
}
