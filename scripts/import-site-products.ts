/**
 * Перенос каталога bus-com.ru в ERP — второй шаг после `pnpm fetch:site-products`.
 *
 *   pnpm import:site-products misc/site-products.json --dry-run
 *   pnpm import:site-products misc/site-products.json
 *
 * Ключ повторного прогона — `product_id` сайта в `Product.externalId`: второй
 * прогон ничего не задвоит, а обновит товары по сайту. Правила переноса —
 * `src/server/products/site-import.ts` и `src/domain/product/site-catalog.ts`.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { db } from "../src/server/db";
import { importSiteProducts, siteProductRowSchema } from "../src/server/products/site-import";

const args = process.argv.slice(2);
const file = args.find((arg) => !arg.startsWith("--")) ?? "misc/site-products.json";
const dryRun = args.includes("--dry-run");

async function main(): Promise<void> {
  const rows = z.array(siteProductRowSchema).parse(JSON.parse(readFileSync(file, "utf8")));
  console.log(`Файл: ${file} · товаров: ${rows.length} · режим: ${dryRun ? "проверка, без записи" : "запись в базу"}`);

  const report = await importSiteProducts(rows, { dryRun });

  console.log("");
  console.log("Итог:");
  console.log(`  всего товаров:     ${report.всего}`);
  console.log(`  создано:           ${report.создано}`);
  console.log(`  обновлено:         ${report.обновлено}`);
  console.log(`  без изменений:     ${report.безИзменений}`);
  console.log(`  опции записаны у:  ${report.сОпциями}`);
  console.log(`  артикул с суффиксом (на сайте повторяется): ${report.артикулИзменён.length}`);
  for (const item of report.артикулИзменён) console.log(`    ${item.sku} — ${item.name}`);

  if (dryRun) console.log("\nЭто была проверка — в базу ничего не записано.");
}

main()
  .catch((error: unknown) => {
    console.error("Импорт не выполнен:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
