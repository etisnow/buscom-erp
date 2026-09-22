/**
 * Артефакт по поставщику в заказе — сейчас только счёт от поставщика клиенту
 * (`OrderSupplierDocument`, ключ `"SUPPLIER_INVOICE"` из `src/domain/supplier/actions.ts`).
 * Разбор — по сигнатуре файла: PDF или фото счёта, Content-Type из формы не доверяем.
 */
import type { OrderStatus, UserRole } from "@/generated/prisma/enums";
import { TERMINAL_STATUSES } from "@/domain/order/status";

/** Счёт — обычно скан на несколько страниц; больше уже подозрительно. */
export const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;

export type DocumentContentType = "application/pdf" | "image/jpeg" | "image/png" | "image/webp";

export class SupplierDocumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupplierDocumentError";
  }
}

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0) =>
  signature.every((byte, index) => bytes[offset + index] === byte);

/** Тип файла по сигнатуре. Расширению и Content-Type из формы не доверяем. */
export function detectDocumentType(bytes: Uint8Array): DocumentContentType | null {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) return "application/pdf"; // %PDF
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  // WebP: «RIFF», четыре байта длины, «WEBP».
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8))
    return "image/webp";
  return null;
}

/** Проверка файла перед сохранением. Возвращает определённый по содержимому тип. */
export function assertSupplierDocument(bytes: Uint8Array): DocumentContentType {
  if (bytes.byteLength === 0) throw new SupplierDocumentError("Файл пустой");
  if (bytes.byteLength > MAX_DOCUMENT_BYTES) {
    throw new SupplierDocumentError(`Файл больше ${MAX_DOCUMENT_BYTES / 1024 / 1024} МБ`);
  }
  const type = detectDocumentType(bytes);
  if (!type) throw new SupplierDocumentError("Это не PDF и не картинка: подойдут PDF, JPEG, PNG или WebP");
  return type;
}

const DOCUMENT_ROLES: readonly UserRole[] = ["MANAGER", "HEAD", "ADMIN"];

/** Прикреплять и убирать артефакты можно, пока заказ не в финальном статусе. */
export function canManageSupplierDocuments(status: OrderStatus, role: UserRole): boolean {
  return !TERMINAL_STATUSES.includes(status) && DOCUMENT_ROLES.includes(role);
}
