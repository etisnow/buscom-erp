import "server-only";
import type { OptionGroup } from "@buscom/domain/product/options";
import type { OptionPurchase } from "@buscom/domain/product/option-matching";
import { parsePriceFormula, unitCostFor, type PriceFormula } from "@buscom/domain/supplier/price-economics";
import { db } from "@/server/db";
import { matchProductsCaseInsensitive } from "@/server/products/name-match";

export type ProductSupplierOption = {
  id: string;
  name: string;
  purchasePriceKopecks: number;
  /** Стоимость закупки для нас за штуку — номинал через «Экономику цены» поставщика */
  costKopecks: number;
  /** Закупка вариантов опций у поставщика — добавляется к номиналу по выбранным вариантам */
  optionPrices: OptionPurchase[];
  /** «Экономика цены» — чтобы пересчитать стоимость для нас с учётом опций */
  priceFormula: PriceFormula;
};

export type ProductSuggestion = {
  id: string;
  sku: string;
  name: string;
  priceKopecks: number;
  /** Поставщики товара, самый дешёвый первым — его форма и подставляет */
  suppliers: ProductSupplierOption[];
  /** Группы опций товара — менеджер выбирает варианты при добавлении позиции */
  options: OptionGroup[];
};

/** Подбор товара по артикулу или названию — для добавления позиции в заказ. */
export async function searchProducts(query: string): Promise<ProductSuggestion[]> {
  const search = query.trim();
  if (search.length < 2) return [];

  const products = await db.product.findMany({
    where: {
      // Без учёта регистра — в приложении: база кириллицу по регистру не сворачивает
      id: { in: await matchProductsCaseInsensitive(search, true) },
    },
    select: {
      id: true,
      sku: true,
      name: true,
      priceKopecks: true,
      suppliers: {
        orderBy: { purchasePriceKopecks: "asc" },
        select: {
          purchasePriceKopecks: true,
          optionPrices: { select: { optionValueId: true, purchasePriceKopecks: true } },
          supplier: { select: { id: true, name: true, priceFormula: true } },
        },
      },
      options: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          name: true,
          required: true,
          values: { orderBy: { sortOrder: "asc" }, select: { id: true, name: true, priceDeltaKopecks: true } },
        },
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
      costKopecks: unitCostFor(link.purchasePriceKopecks, link.supplier.priceFormula),
      optionPrices: link.optionPrices,
      priceFormula: parsePriceFormula(link.supplier.priceFormula),
    })),
    options: product.options,
  }));
}
