"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ForbiddenError } from "@/server/errors";
import { deleteMainImage, uploadMainImage } from "@/server/products/images";
import { createProduct, updateProduct } from "@/server/products/service";
import { requireUser } from "@/server/session";

export type ProductResult = { ok: true; message: string } | { ok: false; error: string };

const draftSchema = z.object({
  sku: z.string().min(1, { error: "Укажите артикул" }),
  name: z.string().min(1, { error: "Укажите название" }),
  categoryId: z.string().min(1).nullable().optional(),
  priceKopecks: z.number().int().min(0, { error: "Цена не может быть отрицательной" }),
  /** Совместимые модели авто вводятся через запятую */
  compatibility: z.array(z.string().min(1)).optional(),
  isActive: z.boolean().optional(),
  suppliers: z
    .array(
      z.object({
        supplierId: z.string().min(1, { error: "Выберите поставщика" }),
        purchasePriceKopecks: z.number().int().min(0, { error: "Закупочная цена не может быть отрицательной" }),
        // Адрес проверяем схемой: неверная ссылка в карточке бесполезна, а ошибку лучше показать сразу
        url: z.union([z.literal(""), z.url({ error: "Ссылка должна начинаться с http:// или https://" })]).optional(),
      }),
    )
    .optional(),
  options: z
    .array(
      z.object({
        id: z.string().min(1).optional(),
        name: z.string(),
        required: z.boolean(),
        values: z.array(
          z.object({ id: z.string().min(1).optional(), name: z.string(), priceDeltaKopecks: z.number().int() }),
        ),
      }),
    )
    .optional(),
});

async function run(action: () => Promise<unknown>, message: string): Promise<ProductResult> {
  try {
    await action();
    revalidatePath("/products");
    // Карточку товара открывают и из заказа: поставщики и опции там должны обновиться сразу.
    revalidatePath("/orders/[number]", "page");
    return { ok: true, message };
  } catch (error) {
    if (error instanceof ForbiddenError || error instanceof Error) {
      return { ok: false, error: error.message };
    }
    throw error;
  }
}

export async function createProductAction(input: z.input<typeof draftSchema>): Promise<ProductResult> {
  const user = await requireUser();
  const parsed = draftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };

  return run(() => createProduct(parsed.data, user), "Товар добавлен");
}

export async function updateProductAction(id: string, input: z.input<typeof draftSchema>): Promise<ProductResult> {
  const user = await requireUser();
  const parsed = draftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };

  return run(() => updateProduct(id, parsed.data, user), "Товар сохранён");
}

export async function toggleProductAction(id: string, isActive: boolean): Promise<ProductResult> {
  const user = await requireUser();
  return run(
    () => updateProduct(id, { isActive }, user),
    isActive ? "Товар снова в каталоге" : "Товар скрыт из каталога",
  );
}

/**
 * Загрузка аватарки товара. Файл приходит в FormData; тип и размер проверяет
 * сервер по содержимому — расширению и типу из браузера не доверяем.
 */
export async function uploadProductImageAction(productId: string, form: FormData): Promise<ProductResult> {
  const user = await requireUser();
  const file = form.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Выберите файл картинки" };

  const data = new Uint8Array(await file.arrayBuffer());
  return run(() => uploadMainImage(productId, data, user), "Картинка сохранена");
}

export async function deleteProductImageAction(productId: string): Promise<ProductResult> {
  const user = await requireUser();
  return run(() => deleteMainImage(productId, user), "Картинка удалена");
}
