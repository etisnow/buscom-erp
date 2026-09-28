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
import { createProduct, deleteProduct, updateProduct } from "@/server/products/service";
import { importFromSupplier, type SupplierImportResult } from "@/server/products/supplier-import";
import { requireUser } from "@/server/session";

export type ProductResult = { ok: true; message: string } | { ok: false; error: string };

const variantSchema = z.record(z.string().max(100), z.string().max(300));

/** Адрес и метатеги на сайте; формат слуга проверяет сервис (src/server/site/seo.ts) */
// Не экспортируется: из файла "use server" наружу можно отдавать только async-функции,
// иначе любое действие отсюда падает «A "use server" file can only export async functions»
const siteSeoSchema = z.object({
  slug: z.string().max(200).nullable(),
  metaTitle: z.string().max(300, { error: "Title не длиннее 300 знаков" }).nullable(),
  metaDescription: z.string().max(1000, { error: "Description не длиннее 1000 знаков" }).nullable(),
});

const draftSchema = z.object({
  site: siteSeoSchema.optional(),
  sku: z.string().min(1, { error: "Укажите артикул" }),
  name: z.string().min(1, { error: "Укажите название" }),
  description: z.string().max(20_000, { error: "Описание слишком длинное" }).nullable().optional(),
  categoryId: z.string().min(1).nullable().optional(),
  priceKopecks: z.number().int().min(0, { error: "Цена не может быть отрицательной" }),
  /** Совместимые модели авто вводятся через запятую */
  compatibility: z.array(z.string().min(1)).optional(),
  isActive: z.boolean().optional(),
  /** Метка «Хит» на сайте */
  isHit: z.boolean().optional(),
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

/** Снимки нового товара из импорта — base64; тип и размер проверяет сервис */
const newImagesSchema = z.array(z.string().min(1).max(8_000_000)).max(12, { error: "Не больше 12 снимков" });

export async function createProductAction(
  input: z.input<typeof draftSchema>,
  images: string[] = [],
): Promise<ProductResult> {
  const user = await requireUser();
  const parsed = draftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };
  const parsedImages = newImagesSchema.safeParse(images);
  if (!parsedImages.success) return { ok: false, error: z.prettifyError(parsedImages.error) };

  const files = parsedImages.data.map((base64) => new Uint8Array(Buffer.from(base64, "base64")));
  return run(() => createProduct(parsed.data, user, files), "Товар добавлен");
}

/**
 * «Импорт с сайта поставщика»: страница товара → черновик для формы нового товара.
 * Ничего не сохраняет — товар заводит человек кнопкой в форме.
 */
export async function importFromSupplierAction(url: string): Promise<SupplierImportResult> {
  const user = await requireUser();
  const parsed = z.url({ error: "Вставьте ссылку на товар — она начинается с https://" }).safeParse(url.trim());
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };
  try {
    return await importFromSupplier(parsed.data, user);
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, error: error.message };
    throw error;
  }
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

export async function deleteProductAction(id: string): Promise<ProductResult> {
  const user = await requireUser();
  let ordersCount = 0;
  const result = await run(async () => {
    ({ ordersCount } = await deleteProduct(id, user));
  }, "Товар удалён");
  if (result.ok && ordersCount > 0) {
    return { ok: true, message: `Товар удалён. В заказах (${ordersCount}) позиции остались как были` };
  }
  return result;
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

/** Разбор совместимости: сохраняется только список моделей, остальное в карточке не трогается. */
export async function setCompatibilityAction(id: string, models: string[]): Promise<ProductResult> {
  const user = await requireUser();
  const parsed = z.array(z.string().min(1).max(200)).max(100).safeParse(models);
  if (!parsed.success) return { ok: false, error: "Некорректный список моделей" };
  const result = await run(() => updateProduct(id, { compatibility: parsed.data }, user), "Совместимость сохранена");
  revalidatePath("/products/compatibility");
  return result;
}
