/**
 * CSV для выгрузок списков (PRD, M7).
 *
 * Формат выбран под Excel с русской локалью: разделитель — точка с запятой, перевод
 * строки CRLF, в начале файла BOM. С запятой и без BOM Excel открывает файл одной
 * колонкой и ломает кириллицу, а выгрузка нужна именно для двойного клика, а не для
 * мастера импорта. LibreOffice и «Google Таблицы» такой файл тоже понимают.
 */

import { formatMoscowDateTime } from "./datetime";

const DELIMITER = ";";
const NEWLINE = "\r\n";
const BOM = "﻿";

/**
 * Потолок выгрузки, общий для всех списков. Файл собирается в памяти одной
 * строкой, поэтому объём ограничен; упрёмся — следующий шаг отдавать потоком
 * по курсору. Общий, а не свой у каждого списка: причина ограничения одна.
 */
export const EXPORT_LIMIT = 10_000;

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

/** «20.09.2026 14:35»: без запятой, иначе Excel видит в ячейке не дату, а текст. */
export function csvDateTime(date: Date): string {
  return formatMoscowDateTime(date).replace(",", "");
}

/**
 * Имя файла с датой выгрузки по Москве: `klienty-2026-09-20.csv`.
 * Упёрлись в потолок — это видно в самом имени, до открытия файла.
 */
export function csvFileName(prefix: string, now: Date, truncated: boolean): string {
  const [day, month, year] = formatMoscowDateTime(now).slice(0, 10).split(".");
  const suffix = truncated ? `-pervye-${EXPORT_LIMIT}` : "";
  return `${prefix}-${year}-${month}-${day}${suffix}.csv`;
}

/**
 * Разбор CSV — для импорта чужих выгрузок (docs/STATUS.md, «Выгрузка клиентов»).
 * Правила те же, что у сборки: кавычки экранируются удвоением, внутри кавычек
 * бывают и разделитель, и перевод строки — в «Примечании» прежней ERP они есть.
 * Свой разбор, а не библиотека: формат маленький, а зависимость пришлось бы
 * тащить в прод ради разового скрипта.
 */
export function parseCsv(text: string, delimiter = DELIMITER): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  // BOM пришёл бы первым символом первой ячейки и испортил имя колонки.
  const source = text.startsWith(BOM) ? text.slice(1) : text;

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i]!;

    if (quoted) {
      if (char !== '"') {
        cell += char;
      } else if (source[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else {
        quoted = false;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      // CRLF — один конец строки, а не два пустых.
      if (char === "\r" && source[i + 1] === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

/** Строки файла как объекты по заголовкам первой строки. */
export function parseCsvRows(text: string, delimiter = DELIMITER): Record<string, string>[] {
  const [header, ...rest] = parseCsv(text, delimiter);
  if (!header) return [];

  return rest
    .filter((row) => row.some((cell) => cell.trim() !== ""))
    .map((row) => Object.fromEntries(header.map((name, index) => [name.trim(), (row[index] ?? "").trim()])));
}
