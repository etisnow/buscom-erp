/**
 * Картинки товара (docs/DECISIONS.md, «Картинки товара»). Хранение множественное,
 * а показываем пока одну — аватарку: первую по `sortOrder`.
 */

/** Больше — это уже не фото товара, а исходник с фотоаппарата; такое сначала уменьшают. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export type ImageContentType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

export class ProductImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductImageError";
  }
}

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0) =>
  signature.every((byte, index) => bytes[offset + index] === byte);

/**
 * Тип картинки по сигнатуре файла. Заголовку `Content-Type` и расширению не
 * доверяем: браузер и чужой сервер могут прислать что угодно, а отдаём мы файл
 * с тем типом, что здесь определили.
 */
export function detectImageType(bytes: Uint8Array): ImageContentType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return "image/gif";
  // WebP: «RIFF», четыре байта длины, «WEBP».
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8))
    return "image/webp";
  return null;
}

/** Проверка файла перед сохранением. Возвращает определённый по содержимому тип. */
export function assertProductImage(bytes: Uint8Array): ImageContentType {
  if (bytes.byteLength === 0) throw new ProductImageError("Файл пустой");
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new ProductImageError(`Картинка больше ${MAX_IMAGE_BYTES / 1024 / 1024} МБ — уменьшите её перед загрузкой`);
  }
  const type = detectImageType(bytes);
  if (!type) throw new ProductImageError("Это не картинка: подойдут JPEG, PNG, WebP или GIF");
  return type;
}

