/**
 * Импорт заказов из прежней ERP.
 *
 *   pnpm import:orders misc/orders.csv --dry-run
 *   pnpm import:orders misc/orders.csv --renumber
 *
 * Клиентов импортируем первыми (`pnpm import:customers`) — заказ ищет клиента по
 * имени и email, и без клиентской базы почти каждый заказ заведёт нового.
 *
 * `--renumber` двигает номера уже заведённых заказов выше архива: архив занимает
 * номера 1..N. Без флага скрипт откажется, если номера заняты.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { parseCsvRows } from "../src/domain/csv";
import { importLegacyOrders } from "../src/server/orders/import";
import { db } from "../src/server/db";

const args = process.argv.slice(2);
const file = args.find((arg) => !arg.startsWith("--"));
const dryRun = args.includes("--dry-run");
const allowRenumber = args.includes("--renumber");
const encoding = args.find((arg) => arg.startsWith("--encoding="))?.split("=")[1] ?? "cp1251";

async function main(): Promise<void> {
  if (!file) {
    console.error("Укажите файл: pnpm import:orders misc/orders.csv --dry-run");
    process.exitCode = 1;
    return;
  }

  const bytes = readFileSync(file);
  const text =
    encoding === "cp1251" ? new TextDecoder("windows-1251").decode(bytes) : bytes.toString(encoding as BufferEncoding);

  const rows = parseCsvRows(text);
  console.log(`Файл: ${file} · строк: ${rows.length} · режим: ${dryRun ? "проверка, без записи" : "запись в базу"}`);

  const report = await importLegacyOrders(rows, {
    dryRun,
    allowRenumber,
    onProgress: (done, total) => {
      if (done % 500 === 0 || done === total) console.log(`  обработано ${done} из ${total}`);
    },
  });

  console.log("");
  console.log("Итог:");
  console.log(`  всего строк:              ${report.всего}`);
  console.log(`  создано заказов:          ${report.создано}`);
  console.log(`  уже были (повторный прогон): ${report.ужеБыло}`);
  console.log(`  пропущено без даты или ID: ${report.пропущеноБезДаты}`);
  console.log(`  клиент найден:            ${report.клиентНайден}`);
  console.log(`  клиент заведён импортом:  ${report.клиентЗаведён}`);
  console.log(`  перенумеровано рабочих:   ${report.перенумерованоРабочих}`);

  if (dryRun) console.log("\nЭто была проверка — в базу ничего не записано.");
}

main()
  .catch((error: unknown) => {
    console.error("Импорт не выполнен:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
