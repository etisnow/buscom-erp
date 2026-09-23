import "server-only";
import { categoryPath } from "@/domain/product/categories";
import { csvFileName, EXPORT_LIMIT, toCsv } from "@/domain/csv";
import { formatRubPlain } from "@/domain/money";
import { db } from "@/server/db";
import { productsWhere, type ProductFilters } from "@/server/products/list";

/**
 * Выгрузка каталога в CSV (PRD, M7: «выгрузка любого списка»).
 *
 * Схема та же, что у заказов и клиентов: те же фильтры, что на экране, без
 * пагинации. Количеств в каталоге нет — склада в проекте не ведут.
 */

const HEADERS = ["Артикул", "Название", "Описание", "Категория", "Цена, ₽", "Совместимость", "В каталоге"];

export type ProductsCsv = {
  csv: string;
  fileName: string;
  /** Выгрузка упёрлась в потолок — в файле не весь каталог по фильтру. */
  truncated: boolean;
};

export async function exportProductsCsv(filters: ProductFilters): Promise<ProductsCsv> {
  const now = new Date();

  // Путь категории («Климат / Люки») собирается из справочника — он маленький, берём целиком.
  const categories = await db.productCategory.findMany({ select: { id: true, name: true, parentId: true } });
  const products = await db.product.findMany({
    where: await productsWhere(filters),
    select: {
      sku: true,
      name: true,
      description: true,
      category: { select: { id: true } },
      priceKopecks: true,
      compatibility: true,
      isActive: true,
    },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    take: EXPORT_LIMIT + 1,
  });

  const truncated = products.length > EXPORT_LIMIT;
  const rows = truncated ? products.slice(0, EXPORT_LIMIT) : products;

  const table = [
    HEADERS,
    ...rows.map((product) => [
      product.sku,
      product.name,
      // Описание многострочное: переводы строк внутри ячейки экранирует toCsv
      product.description ?? "",
      categoryPath(product.category?.id, categories),
      formatRubPlain(product.priceKopecks),
      // Совместимость — массив моделей; точку с запятой внутри ячейки экранирует toCsv.
      product.compatibility.join(", "),
      product.isActive ? "да" : "скрыт",
    ]),
  ];

  return { csv: toCsv(table), fileName: csvFileName("tovary", now, truncated), truncated };
}
