/**
 * CSV для выгрузок списков (PRD, M7).
 *
 * Формат выбран под Excel с русской локалью: разделитель — точка с запятой, перевод
 * строки CRLF, в начале файла BOM. С запятой и без BOM Excel открывает файл одной
 * колонкой и ломает кириллицу, а выгрузка нужна именно для двойного клика, а не для
 * мастера импорта. LibreOffice и «Google Таблицы» такой файл тоже понимают.
 */

const DELIMITER = ";";
const NEWLINE = "\r\n";
const BOM = "﻿";

export type CsvCell = string | number | null | undefined;

/** Ячейка, которую Excel мог бы выполнить как формулу. Число со знаком минус — не она. */
function looksLikeFormula(text: string): boolean {
  if (/^[=+@\t\r]/.test(text)) return true;
  return text.startsWith("-") && !/^-[\d\s.,]+$/.test(text);
}

function escapeCell(value: CsvCell): string {
  if (value === null || value === undefined) return "";

  const text = String(value);
  // Апостроф перед формулой: Excel покажет текст, а не выполнит его (CSV injection).
  const safe = looksLikeFormula(text) ? `'${text}` : text;

  return /["\r\n;]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/** Строки таблицы (первая — заголовки) в готовое содержимое файла. */
export function toCsv(rows: CsvCell[][]): string {
  return BOM + rows.map((row) => row.map(escapeCell).join(DELIMITER)).join(NEWLINE) + NEWLINE;
}
