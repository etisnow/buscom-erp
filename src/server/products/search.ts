import "server-only";
import { db } from "@/server/db";

export type ProductSuggestion = {
  id: string;
  sku: string;
  name: string;
  priceKopecks: number;
};

/** Подбор товара по артикулу или названию — для добавления позиции в заказ. */
export async function searchProducts(query: string): Promise<ProductSuggestion[]> {
  const search = query.trim();
  if (search.length < 2) return [];

  return db.product.findMany({
    where: {
      isActive: true,
      OR: [{ sku: { contains: search, mode: "insensitive" } }, { name: { contains: search, mode: "insensitive" } }],
    },
    select: { id: true, sku: true, name: true, priceKopecks: true },
    orderBy: { name: "asc" },
    take: 10,
  });
}
