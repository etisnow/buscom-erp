/**
 * Чертежи схем салона — после миграции `salon_layouts`.
 *
 *   pnpm erp import:salon-layout-images --dry-run
 *   pnpm erp import:salon-layout-images
 *
 * Два прохода:
 *  1. Свои чертежи — файлы `scripts/salon-layouts/<id схемы>.png|jpg|webp`. Они главнее чертежей
 *     с сайта: схемы 14 и 15 мест перерисованы в стиле схем 17 и 18. Файл кладётся в базу, если там
 *     другая картинка (или её нет); адрес источника у такой схемы стирается — картинка уже не с сайта.
 *  2. Остальные схемы, у которых есть `imageSourceUrl`, но нет картинки, скачиваются с bus-com.ru.
 *
 * Повторный прогон ничего не меняет и ничего не качает.
 */
import "dotenv/config";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { db } from "../src/server/db";

const dryRun = process.argv.includes("--dry-run");
const OWN_DIR = path.join(process.cwd(), "scripts", "salon-layouts");
const OWN_EXTENSIONS = ["png", "jpg", "webp"];

function detectType(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") {
    return "image/webp";
  }
  return null;
}

function ownFile(id: string): Uint8Array<ArrayBuffer> | null {
  for (const extension of OWN_EXTENSIONS) {
    const file = path.join(OWN_DIR, `${id}.${extension}`);
    if (existsSync(file)) return new Uint8Array(readFileSync(file));
  }
  return null;
}

const same = (a: Uint8Array | null, b: Uint8Array) =>
  a !== null && a.length === b.length && a.every((v, i) => v === b[i]);

async function main(): Promise<void> {
  console.log(`Режим: ${dryRun ? "проверка, без записи" : "запись в базу"}`);
  const rows = await db.salonLayout.findMany({
    select: { id: true, name: true, imageData: true, imageSourceUrl: true },
    orderBy: { sortOrder: "asc" },
  });

  let own = 0;
  let downloaded = 0;
  let failed = 0;
  for (const row of rows) {
    const mine = ownFile(row.id);
    if (mine) {
      const contentType = detectType(mine);
      if (!contentType) {
        console.log(`  ${row.name}: свой файл — это не картинка`);
        failed++;
        continue;
      }
      if (same(row.imageData, mine)) continue;
      if (!dryRun) {
        await db.salonLayout.update({
          where: { id: row.id },
          data: { imageData: mine, imageContentType: contentType, imageSourceUrl: null },
        });
      }
      own++;
      console.log(`  ${row.name}: свой чертёж, ${Math.round(mine.length / 1024)} КБ, ${contentType}`);
      continue;
    }

    if (!row.imageSourceUrl || row.imageData) continue;
    try {
      const response = await fetch(row.imageSourceUrl, { headers: { "User-Agent": "BusCom-ERP catalog sync" } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      const contentType = detectType(bytes);
      if (!contentType) throw new Error("это не картинка");
      if (!dryRun) {
        await db.salonLayout.update({
          where: { id: row.id },
          data: { imageData: bytes, imageContentType: contentType },
        });
      }
      downloaded++;
      console.log(`  ${row.name}: с сайта, ${Math.round(bytes.length / 1024)} КБ, ${contentType}`);
    } catch (error) {
      failed++;
      console.log(`  ${row.name}: ошибка — ${error instanceof Error ? error.message : String(error)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  console.log(
    `Готово: своих чертежей ${own}, скачано ${downloaded}, ошибок ${failed}${dryRun ? " (проверка — ничего не записано)" : ""}`,
  );
}

main()
  .catch((error: unknown) => {
    console.error("Импорт не выполнен:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
