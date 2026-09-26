import "server-only";
import path from "node:path";
import pdfMake from "pdfmake";
import type { TDocumentDefinitions } from "pdfmake/interfaces";

/**
 * Шрифт берётся из пакета pdfmake (Roboto с кириллицей) — бинарников в репозитории нет.
 * Настраивается один раз на процесс: повторный setFonts на каждый запрос бессмысленно
 * перечитывал бы файлы.
 */
let configured = false;

function ensureFonts(): void {
  if (configured) return;

  // pdfmake выведен из бандла через serverExternalPackages (next.config.ts):
  // он читает свои шрифты с диска, а из бандла путь к пакету не восстановить.
  // Благодаря этому в node_modules рядом с сервером лежит обычный pdfmake,
  // и путь от cwd работает и в dev, и в standalone-сборке.
  const fontsDir = path.join(process.cwd(), "node_modules", "pdfmake", "build", "fonts", "Roboto");
  pdfMake.setFonts({
    Roboto: {
      normal: path.join(fontsDir, "Roboto-Regular.ttf"),
      bold: path.join(fontsDir, "Roboto-Medium.ttf"),
      italics: path.join(fontsDir, "Roboto-Italic.ttf"),
      bolditalics: path.join(fontsDir, "Roboto-MediumItalic.ttf"),
    },
  });

  // Документы собираются только из наших данных: доступ к сети и файлам не нужен.
  pdfMake.setUrlAccessPolicy(() => false);
  pdfMake.setLocalAccessPolicy((filePath) => filePath.startsWith(fontsDir));

  configured = true;
}

export async function renderPdf(definition: TDocumentDefinitions): Promise<Buffer> {
  ensureFonts();
  return pdfMake.createPdf({ defaultStyle: { font: "Roboto", fontSize: 9 }, ...definition }).getBuffer();
}
