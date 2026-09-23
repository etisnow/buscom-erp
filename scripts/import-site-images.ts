/**
 * Картинки товаров с bus-com.ru — после `pnpm fetch:site-products` и `pnpm import:site-products`.
 *
 *   pnpm import:site-images misc/site-products.json --dry-run
 *   pnpm import:site-images misc/site-products.json
 *
 * Скачивает всю галерею товара (главную картинку и дополнительные) с превью,
 * проверяет, что это картинки, и сохраняет в ERP. Повторный прогон скачивает
 * только новое. Правила — `src/server/products/site-images.ts`.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { db } from "../src/server/db";
import { importSiteImages } from "../src/server/products/site-images";
import { siteProductRowSchema } from "../src/server/products/site-import";

const args = process.argv.slice(2);
const file = args.find((arg) => !arg.startsWith("--")) ?? "misc/site-products.json";
const dryRun = args.includes("--dry-run");

async function download(url: string): Promise<Uint8Array<ArrayBuffer>> {
  const response = await fetch(url, { headers: { "User-Agent": "BusCom-ERP catalog sync" } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

async function main(): Promise<void> {
  const rows = z.array(siteProductRowSchema).parse(JSON.parse(readFileSync(file, "utf8")));
  console.log(`Файл: ${file} · товаров: ${rows.length} · режим: ${dryRun ? "проверка, без записи" : "запись в базу"}`);

  const report = await importSiteImages(rows, {
    download,
    dryRun,
    pauseMs: 300,
    onProgress: (done, total) => {
      if (done % 25 === 0 || done === total) console.log(`  товаров ${done} из ${total}`);
    },
  });

  console.log("");
  console.log("Итог:");
  console.log(`  всего товаров:         ${report.всего}`);
  console.log(`  картинок загружено:    ${report.загружено}`);
  console.log(`  уже были:              ${report.ужеЕсть}`);
  console.log(`  убрано (нет на сайте): ${report.удалено}`);
  console.log(`  без картинок на сайте: ${report.безКартинки}`);
  console.log(`  нет товара в ERP:      ${report.нетТовара}`);
  if (report.ошибки.length > 0) {
    console.log(`  ошибки:                ${report.ошибки.length}`);
    for (const item of report.ошибки) console.log(`    ${item.externalId} ${item.name}: ${item.error}`);
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
