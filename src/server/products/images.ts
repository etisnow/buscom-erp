import "server-only";
import { assertProductImage, detectImageType } from "@/domain/product/images";
import { db } from "@/server/db";
import { ForbiddenError } from "@/server/errors";
import type { Tx } from "@/server/orders/internal";
import { canEditCatalog } from "@/server/products/service";
import type { SessionUser } from "@/server/session";

export type NewImage = {
  data: Uint8Array<ArrayBuffer>;
  /** Уменьшенная копия; у загруженной руками её нет — в списках покажется полная */
  thumbData?: Uint8Array<ArrayBuffer> | null;
  /** Адрес на сайте — ключ повторного импорта */
  sourceUrl?: string | null;
};

/**
 * Замена аватарки. Новая картинка — новая запись с новым id, старая удаляется:
 * адрес картинки меняется вместе с файлом, поэтому её можно кешировать в
 * браузере навсегда. Остальные картинки галереи (когда появятся) не трогаются.
 */
export async function replaceMainImage(tx: Tx, productId: string, image: NewImage): Promise<{ id: string }> {
  const contentType = assertProductImage(image.data);
  const thumbType = image.thumbData ? detectImageType(image.thumbData) : null;

  const current = await tx.productImage.findFirst({
    where: { productId },
    orderBy: { sortOrder: "asc" },
    select: { id: true, sortOrder: true },
  });

  const created = await tx.productImage.create({
    data: {
      productId,
      sortOrder: current?.sortOrder ?? 0,
      contentType,
      data: image.data,
      byteSize: image.data.byteLength,
      // Превью с неопознанным типом не храним — лучше показать полную картинку.
      thumbData: thumbType ? image.thumbData : null,
      thumbContentType: thumbType,
      sourceUrl: image.sourceUrl ?? null,
    },
    select: { id: true },
  });
  if (current) await tx.productImage.delete({ where: { id: current.id } });
  return created;
}

export async function uploadMainImage(
  productId: string,
  data: Uint8Array<ArrayBuffer>,
  user: SessionUser,
): Promise<void> {
  if (!canEditCatalog(user.role)) throw new ForbiddenError("Недостаточно прав, чтобы менять картинку товара");
  await db.$transaction((tx) => replaceMainImage(tx, productId, { data }));
}

export async function deleteMainImage(productId: string, user: SessionUser): Promise<void> {
  if (!canEditCatalog(user.role)) throw new ForbiddenError("Недостаточно прав, чтобы менять картинку товара");
  const current = await db.productImage.findFirst({
    where: { productId },
    orderBy: { sortOrder: "asc" },
    select: { id: true },
  });
  if (current) await db.productImage.delete({ where: { id: current.id } });
}

/** Байты картинки для отдачи браузеру. Превью нет — отдаём полную. */
export async function readImage(
  id: string,
  size: "full" | "thumb",
): Promise<{ data: Uint8Array; contentType: string } | null> {
  if (size === "thumb") {
    const thumb = await db.productImage.findUnique({
      where: { id },
      select: { thumbData: true, thumbContentType: true },
    });
    if (!thumb) return null;
    if (thumb.thumbData && thumb.thumbContentType)
      return { data: thumb.thumbData, contentType: thumb.thumbContentType };
  }

  const image = await db.productImage.findUnique({ where: { id }, select: { data: true, contentType: true } });
  return image ? { data: image.data, contentType: image.contentType } : null;
}
