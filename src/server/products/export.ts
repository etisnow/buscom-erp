import "server-only";
import { csvFileName, EXPORT_LIMIT, toCsv } from "@/domain/csv";
import { formatRubPlain } from "@/domain/money";
import { db } from "@/server/db";
import { productsWhere, type ProductFilters } from "@/server/products/list";

/**
 * Выгрузка каталога в CSV (PRD, M7: «выгрузка любого списка»).
 *
 * Схема та же, что у заказов и клиентов: те же фильтры, что на экране, без
 * пагинации. «Свободно» считается здесь, а не формулой в файле: на экране это
 * тоже посчитанное значение, и расхождений быть не должно.
 */

const HEADERS = [
  "Артикул",
  "Название",
  "Категория",
  "Цена, ₽",
  "Остаток",
  "Резерв",
  "Свободно",
  "Под заказ",
  "Срок, дн.",
  "Совместимость",
  "В каталоге",
];

export type ProductsCsv = {
  csv: string;
  fileName: string;
  /** Выгрузка упёрлась в потолок — в файле не весь каталог по фильтру. */
  truncated: boolean;
};

export async function exportProductsCsv(filters: ProductFilters): Promise<ProductsCsv> {
  const now = new Date();

  const products = await db.product.findMany({
    where: productsWhere(filters),
    select: {
      sku: true,
      name: true,
      category: true,
      priceKopecks: true,
      stock: true,
      reserved: true,
      madeToOrder: true,
      leadTimeDays: true,
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
      product.category ?? "",
      formatRubPlain(product.priceKopecks),
      product.stock,
      product.reserved,
      product.stock - product.reserved,
      product.madeToOrder ? "да" : "",
      product.leadTimeDays ?? "",
      // Совместимость — массив моделей; точку с запятой внутри ячейки экранирует toCsv.
      product.compatibility.join(", "),
      product.isActive ? "да" : "скрыт",
    ]),
  ];

  return { csv: toCsv(table), fileName: csvFileName("tovary", now, truncated), truncated };
}
