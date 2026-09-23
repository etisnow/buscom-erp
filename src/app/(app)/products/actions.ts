"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ForbiddenError } from "@/server/errors";
import {
  fetchSupplierCombos,
  fetchSupplierPrice,
  type SupplierCombosResult,
  type SupplierPriceResult,
} from "@/server/products/supplier-price";
import { addImages, deleteImage, makeImageMain } from "@/server/products/images";
import { createProduct, updateProduct } from "@/server/products/service";
import { requireUser } from "@/server/session";

export type ProductResult = { ok: true; message: string } | { ok: false; error: string };

const variantSchema = z.record(z.string().max(100), z.string().max(300));

const draftSchema = z.object({
  sku: z.string().min(1, { error: "Укажите артикул" }),
  name: z.string().min(1, { error: "Укажите название" }),
  description: z.string().max(20_000, { error: "Описание слишком длинное" }).nullable().optional(),
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
        /** Выбранные варианты товара на странице поставщика */
        variant: variantSchema.nullable().optional(),
        /** Закупка вариантов опций у этого поставщика — по названиям группы и варианта */
        optionPrices: z
          .array(
            z.object({
              group: z.string().min(1),
              value: z.string().min(1),
              purchasePriceKopecks: z.number().int().min(0, { error: "Закупка опции не может быть отрицательной" }),
              variant: variantSchema.nullable().optional(),
            }),
          )
          .optional(),
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
 * Загрузка картинок в галерею товара — можно выбрать сразу несколько. Файлы
 * приходят в FormData; тип и размер проверяет сервер по содержимому — расширению
 * и типу из браузера не доверяем.
 */
export async function uploadProductImagesAction(productId: string, form: FormData): Promise<ProductResult> {
  const user = await requireUser();
  const files = form.getAll("file").filter((item): item is File => item instanceof File);
  if (files.length === 0) return { ok: false, error: "Выберите файл картинки" };

  const data = await Promise.all(files.map(async (file) => new Uint8Array(await file.arrayBuffer())));
  return run(() => addImages(productId, data, user), files.length === 1 ? "Картинка сохранена" : "Картинки сохранены");
}

export async function deleteProductImageAction(imageId: string): Promise<ProductResult> {
  const user = await requireUser();
  return run(() => deleteImage(imageId, user), "Картинка удалена");
}

/** Картинка становится аватаркой: её видно в списках и в позициях заказа. */
export async function makeProductImageMainAction(imageId: string): Promise<ProductResult> {
  const user = await requireUser();
  return run(() => makeImageMain(imageId, user), "Картинка стала главной");
}

/** Цена со страницы поставщика; `variants` — списки вариантов товара, если цена от них зависит. */
export type FetchedPrice = SupplierPriceResult;

/**
 * Цена со страницы товара у поставщика (avito.ru, vanproject.ru) — кнопка
 * «Подтянуть цену» в карточке товара. Ходит в сеть сервер, а не браузер:
 * у сайтов поставщиков нет заголовков CORS, запрос из страницы не дошёл бы.
 *
 * Ничего не сохраняет: подставляет значение в поле, сохранять его или нет —
 * решает человек. Неудача — обычный ответ с текстом, кнопка не должна
 * превращаться в источник ошибок.
 */
export async function fetchSupplierPriceAction(
  url: string,
  selection: Record<string, string> = {},
): Promise<FetchedPrice> {
  await requireUser();

  const parsed = z.string().min(1, { error: "Сначала вставьте ссылку" }).safeParse(url);
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };
  const parsedSelection = variantSchema.safeParse(selection);
  if (!parsedSelection.success) return { ok: false, error: "Непонятный выбор вариантов — выберите их заново" };

  return fetchSupplierPrice(parsed.data.trim(), parsedSelection.data);
}

/** Все варианты товара на странице поставщика с ценами — для «Подтянуть цены опций». Ничего не сохраняет. */
export async function fetchSupplierCombosAction(url: string): Promise<SupplierCombosResult> {
  await requireUser();

  const parsed = z.string().min(1, { error: "Сначала вставьте ссылку" }).safeParse(url);
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };

  return fetchSupplierCombos(parsed.data.trim());
}
