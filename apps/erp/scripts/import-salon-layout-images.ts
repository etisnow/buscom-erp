/**
 * Чертежи схем салона с bus-com.ru — после миграции `salon_layouts`.
 *
 *   pnpm erp import:salon-layout-images --dry-run
 *   pnpm erp import:salon-layout-images
 *
 * Для каждой схемы, у которой есть `imageSourceUrl`, но нет картинки, скачивает файл,
 * проверяет, что это JPEG/PNG/WebP, и кладёт в базу. Повторный прогон ничего не качает.
 */
import "dotenv/config";
import { db } from "../src/server/db";

const dryRun = process.argv.includes("--dry-run");

function detectType(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") {
    return "image/webp";
  }
  return null;
}

async function main(): Promise<void> {
  const rows = await db.salonLayout.findMany({
    where: { imageSourceUrl: { not: null }, imageData: null },
    select: { id: true, name: true, imageSourceUrl: true },
    orderBy: { sortOrder: "asc" },
  });
  console.log(`Схем без картинки: ${rows.length} · режим: ${dryRun ? "проверка, без записи" : "запись в базу"}`);

  let saved = 0;
  for (const row of rows) {
    try {
      const response = await fetch(row.imageSourceUrl!, { headers: { "User-Agent": "BusCom-ERP catalog sync" } });
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
      saved++;
      console.log(`  ${row.name}: ${Math.round(bytes.length / 1024)} КБ, ${contentType}`);
    } catch (error) {
      console.log(`  ${row.name}: ошибка — ${error instanceof Error ? error.message : String(error)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  console.log(`Готово: ${dryRun ? "скачалось бы" : "загружено"} ${saved} из ${rows.length}`);
}

main()
  .catch((error: unknown) => {
    console.error("Импорт не выполнен:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
