/**
 * Импорт клиентской базы из прежней ERP.
 *
 *   pnpm import:customers misc/clientbase.csv --dry-run
 *   pnpm import:customers misc/clientbase.csv
 *
 * Файл ждём в том виде, в каком его отдаёт прежняя ERP: CSV, разделитель `;`,
 * кодировка cp1251 (для UTF-8 — `--encoding=utf8`). Разбор колонок и решения по
 * полям — `src/domain/customer/legacy-import.ts` и `docs/STATUS.md`.
 *
 * Сначала `--dry-run`: он ничего не пишет, только считает, что получится.
 * Выгрузка содержит персональные данные — файл держим в `misc`, она в `.gitignore`.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { parseCsvRows } from "../src/domain/csv";
import { importLegacyCustomers } from "../src/server/customers/import";
import { db } from "../src/server/db";

const args = process.argv.slice(2);
const file = args.find((arg) => !arg.startsWith("--"));
const dryRun = args.includes("--dry-run");
const onlyKeyed = args.includes("--only-keyed");
const encoding = args.find((arg) => arg.startsWith("--encoding="))?.split("=")[1] ?? "cp1251";

async function main(): Promise<void> {
  if (!file) {
    console.error("Укажите файл: pnpm import:customers misc/clientbase.csv --dry-run");
    process.exitCode = 1;
    return;
  }

  // cp1251 Node сам не декодирует — идём через TextDecoder, windows-1251 он знает.
  const bytes = readFileSync(file);
  const text =
    encoding === "cp1251" ? new TextDecoder("windows-1251").decode(bytes) : bytes.toString(encoding as BufferEncoding);

  const rows = parseCsvRows(text);
  console.log(`Файл: ${file} · строк: ${rows.length} · режим: ${dryRun ? "проверка, без записи" : "запись в базу"}`);

  const report = await importLegacyCustomers(rows, {
    dryRun,
    onlyKeyed,
    onProgress: (done, total) => {
      if (done % 500 === 0 || done === total) console.log(`  обработано ${done} из ${total}`);
    },
  });

  console.log("");
  console.log("Итог:");
  console.log(`  всего строк:            ${report.всего}`);
  console.log(`  создано клиентов:       ${report.создано}`);
  console.log(`  дополнено существующих: ${report.дополнено}`);
  console.log(`  без изменений:          ${report.безИзменений}`);
  console.log(`  пропущено без имени:    ${report.безИмени}`);
  console.log(`  слито внутри файла:     ${report.слитоВнутриФайла}`);
  console.log(
    `  без телефона и ИНН:     ${report.безКлюча}${onlyKeyed ? " (пропущены)" : " (повторный прогон задвоит)"}`,
  );

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
