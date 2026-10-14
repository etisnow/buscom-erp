/**
 * Галерея файлов заказа (`OrderFile`): любые файлы — фото, сканы, таблицы, архивы.
 * Тип узнаётся по сигнатуре: картинки показываются плиткой с миниатюрой и открываются
 * на весь экран, всё остальное — плитка с форматом по расширению и скачивание.
 */
import type { UserRole } from "@buscom/db/enums";
import { detectDocumentType, MAX_DOCUMENT_BYTES } from "./supplier-document";

/** Один файл — как документ заказа: запрос к Server Action ограничен 16 МБ (next.config.ts). */
export const MAX_ORDER_FILE_BYTES = MAX_DOCUMENT_BYTES;
export const MAX_ORDER_FILE_NAME = 200;
/** Неузнанное по сигнатуре: отдаётся только скачиванием. */
export const UNKNOWN_CONTENT_TYPE = "application/octet-stream";

export class OrderFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderFileError";
  }
}

/** Проверка перед сохранением. Возвращает тип по содержимому: имени и Content-Type из формы не доверяем. */
export function assertOrderFile(bytes: Uint8Array): string {
  if (bytes.byteLength === 0) throw new OrderFileError("Файл пустой");
  if (bytes.byteLength > MAX_ORDER_FILE_BYTES) {
    throw new OrderFileError(`Файл больше ${MAX_ORDER_FILE_BYTES / 1024 / 1024} МБ`);
  }
  return detectDocumentType(bytes) ?? UNKNOWN_CONTENT_TYPE;
}

/** Картинка, которую браузер покажет сам (без SVG: в нём бывают скрипты). */
export function isGalleryImage(contentType: string): boolean {
  return contentType === "image/jpeg" || contentType === "image/png" || contentType === "image/webp";
}

/** Расширение для плитки документа: «PDF», «XLSX». Пусто — расширения нет или оно не похоже на расширение. */
export function fileExtension(fileName: string): string {
  const match = /\.([a-z0-9]{1,5})$/i.exec(fileName.trim());
  return match ? match[1].toUpperCase() : "";
}

export type FileFormat = "image" | "pdf" | "word" | "sheet" | "archive" | "other";

const FORMAT_BY_EXTENSION: Record<string, FileFormat> = {
  PDF: "pdf",
  DOC: "word",
  DOCX: "word",
  RTF: "word",
  ODT: "word",
  TXT: "word",
  XLS: "sheet",
  XLSX: "sheet",
  CSV: "sheet",
  ODS: "sheet",
  ZIP: "archive",
  RAR: "archive",
  "7Z": "archive",
  GZ: "archive",
  JPG: "image",
  JPEG: "image",
  PNG: "image",
  WEBP: "image",
  GIF: "image",
  HEIC: "image",
  BMP: "image",
  TIF: "image",
  TIFF: "image",
};

/** Вид файла для цвета плитки: сначала по содержимому (PDF, картинка), потом по расширению. */
export function fileFormat(fileName: string, contentType: string): FileFormat {
  if (contentType === "application/pdf") return "pdf";
  if (contentType.startsWith("image/")) return "image";
  return FORMAT_BY_EXTENSION[fileExtension(fileName)] ?? "other";
}

/** Удалить файл может тот, кто его загрузил, руководитель и администратор. */
export function canDeleteOrderFile(
  file: { uploadedById: string | null },
  user: { id: string; role: UserRole },
): boolean {
  return user.role === "ADMIN" || user.role === "HEAD" || (file.uploadedById !== null && file.uploadedById === user.id);
}
