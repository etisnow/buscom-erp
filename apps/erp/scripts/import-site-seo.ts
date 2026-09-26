/**
 * Слуги, метатеги и переадресации старого bus-com.ru — в базу. Шаг после
 * `pnpm snapshot:old-site` (этап 2, `docs/SITE-PLAN.md`).
 *
 *   pnpm import:site-seo --dry-run
 *   pnpm import:site-seo
 *   pnpm import:site-seo docs/site-snapshot/pages.json
 *
 * Правила — `src/domain/site/seo-import.ts`. Повторный прогон ничего не задвоит.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { db } from "../src/server/db";
import { importSiteSeo, snapshotRowSchema } from "../src/server/site/seo-import";

const args = process.argv.slice(2);
const file = args.find((arg) => !arg.startsWith("--")) ?? "../../docs/site-snapshot/pages.json";
const dryRun = args.includes("--dry-run");

async function main(): Promise<void> {
  const rows = z.array(snapshotRowSchema).parse(JSON.parse(readFileSync(file, "utf8")));
  console.log(
    `Снимок: ${file} · адресов: ${rows.length} · режим: ${dryRun ? "проверка, без записи" : "запись в базу"}`,
  );

  const plan = await importSiteSeo(rows, { dryRun });
  const count = (predicate: (r: (typeof plan.redirects)[number]) => boolean) => plan.redirects.filter(predicate).length;

  console.log("");
  console.log(`Товаров со слугом и метатегами: ${plan.products.length}`);
  console.log(`Категорий со слугом и метатегами: ${plan.categories.length}`);
  console.log(`Переадресаций: ${plan.redirects.length}`);
  console.log(`  на товар:     ${count((r) => r.productId !== null)}`);
  console.log(`  на категорию: ${count((r) => r.categoryId !== null)}`);
  console.log(`  на главную:   ${count((r) => r.toPath === "/")}`);
  console.log(`  410:          ${count((r) => r.statusCode === 410)}`);
  console.log(`Слуги построены заново (не было ЧПУ): ${plan.generatedSlugs.length}`);
  for (const item of plan.generatedSlugs) console.log(`  ${item.externalId} ${item.name} → /${item.slug}`);
  console.log(`Категории старого сайта, которых нет в ERP: ${plan.unmatchedCategories.length}`);
  for (const item of plan.unmatchedCategories) console.log(`  ${item.path} «${item.name}» → ${item.target}`);
  if (plan.problems.length > 0) {
    console.log(`Проблемы: ${plan.problems.length}`);
    for (const line of plan.problems) console.log(`  ${line}`);
  }
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
