import "server-only";
import type { Kopecks } from "@buscom/domain/money";
import { detectImageType, MAX_IMAGE_BYTES } from "@buscom/domain/product/images";
import { isVanprojectUrl, type VariantOption, type VariantSelection } from "@buscom/domain/product/vanproject";
import {
  matchCategory,
  parseVanprojectProduct,
  pricingFromCombos,
  suggestVanprojectSku,
  type ImportedOptionGroup,
} from "@buscom/domain/product/vanproject-product";
import { db } from "@/server/db";
import { ForbiddenError } from "@/server/errors";
import { isDewatermarkConfigured, removeWatermark } from "@/server/products/dewatermark";
import { canEditCatalog } from "@/server/products/service";
import { BROWSER_HEADERS, MAX_BYTES, priceCombos, request, statusError } from "@/server/products/supplier-price";
import type { SessionUser } from "@/server/session";

/**
 * Импорт товара со страницы поставщика (пока «Фургон Проект», vanproject.ru):
 * страница → название, описание, варианты с закупками, снимки без водяного
 * знака → черновик для формы нового товара. Ничего не сохраняет: товар заводит
 * человек кнопкой в форме, сверив и поправив поля (docs/DECISIONS.md, 28.09.2026).
 *
 * Снимки уходят в форму base64 — и оригинал, и очищенный: сервис снятия знака
 * перерисовывает участок, и человек выбирает, что оставить.
 */

const SOURCE_NAME = "Фургон Проект";
/** Больше снимков у карточки поставщика не бывает; больше — не качаем */
const MAX_IMAGES = 12;
const IMAGE_CONCURRENCY = 3;
const DEWATERMARK_CONCURRENCY = 2;

export type ImportedImage = {
  sourceUrl: string;
  /** base64 и тип оригинала со знаком */
  original: { base64: string; contentType: string };
  /** Без знака; null — не сняли (нет ключа или сервис не справился) */
  cleaned: { base64: string; contentType: string } | null;
  /** Почему знак не снят */
  error: string | null;
};

export type SupplierImportDraft = {
  url: string;
  sku: string;
  name: string;
  description: string;
  categoryId: string | null;
  /** Путь раздела у поставщика — подсказка, если категорию не подобрали */
  categoryPath: string[];
  /** Поставщик «Фургон Проект» в справочнике; null — такого нет, выберет человек */
  supplierId: string | null;
  purchaseKopecks: Kopecks | null;
  variant: VariantSelection;
  variantOptions: VariantOption[];
  optionGroups: ImportedOptionGroup[];
  images: ImportedImage[];
  /** Что пошло не так, но импорту не помешало — показываем над формой */
  warnings: string[];
};

export type SupplierImportResult = { ok: true; draft: SupplierImportDraft } | { ok: false; error: string };

export async function importFromSupplier(rawUrl: string, user: SessionUser): Promise<SupplierImportResult> {
  if (!canEditCatalog(user.role)) throw new ForbiddenError("Недостаточно прав, чтобы заводить товары");
  const url = rawUrl.trim();
  if (!isVanprojectUrl(url)) {
    return { ok: false, error: "Пока умею импортировать только с сайта «Фургон Проект» (vanproject.ru)" };
  }

  const page = await request(
    url,
    { headers: { ...BROWSER_HEADERS, accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" } },
    SOURCE_NAME,
  );
  if (!page.ok) return page;
  const pageError = statusError(page.response, SOURCE_NAME);
  if (pageError) return { ok: false, error: pageError };
  const product = parseVanprojectProduct((await page.response.text()).slice(0, MAX_BYTES));
  if (!product)
    return { ok: false, error: "По ссылке не карточка товара — откройте товар на сайте и скопируйте адрес" };

  const warnings: string[] = [];

  let purchaseKopecks = product.priceKopecks;
  let variant: VariantSelection = {};
  let optionGroups: ImportedOptionGroup[] = [];
  const variantOptions = product.form?.options ?? [];
  if (variantOptions.some((option) => option.values.some((value) => Object.keys(value.requires).length > 0))) {
    // У поставщика размеры зависят от положения и т. п.; наши группы опций независимы
    warnings.push(
      "Варианты у поставщика зависят друг от друга, а наши опции — нет: доплата варианта взята по самому дешёвому сочетанию, проверьте",
    );
  }
  if (product.form && variantOptions.length > 0) {
    const combos = await priceCombos(product.form, url, SOURCE_NAME);
    if (combos.ok) {
      const pricing = pricingFromCombos(variantOptions, combos.combos);
      purchaseKopecks = pricing.basePurchaseKopecks ?? purchaseKopecks;
      variant = pricing.baseSelection;
      optionGroups = pricing.groups;
    } else {
      warnings.push("Отдельных цен у вариантов сайт не дал — опции перенесены без доплат, закупка — цена карточки");
      optionGroups = pricingFromCombos(variantOptions, []).groups;
    }
  }

  const [categories, supplier, existing] = await Promise.all([
    db.productCategory.findMany({ select: { id: true, name: true, parentId: true } }),
    db.supplier.findFirst({
      where: { name: { contains: "Фургон", mode: "insensitive" } },
      select: { id: true },
    }),
    db.productSupplier.findFirst({ where: { url }, select: { product: { select: { sku: true, name: true } } } }),
  ]);
  if (existing) {
    warnings.push(`Этот товар уже заведён: ${existing.product.sku} «${existing.product.name}»`);
  }
  if (!supplier) warnings.push(`Поставщика «${SOURCE_NAME}» нет в справочнике — выберите поставщика вручную`);
  const categoryId = matchCategory(product.categoryPath, categories);
  if (!categoryId && product.categoryPath.length > 0) {
    warnings.push(`Категорию не подобрал — у поставщика раздел «${product.categoryPath.join(" / ")}»`);
  }

  const imageUrls = product.imageUrls.slice(0, MAX_IMAGES);
  if (product.imageUrls.length > MAX_IMAGES) {
    warnings.push(`У товара ${product.imageUrls.length} снимков — взяты первые ${MAX_IMAGES}`);
  }
  const images = await downloadImages(imageUrls, warnings);
  if (images.length > 0) {
    if (isDewatermarkConfigured()) {
      await cleanImages(images);
      const failed = images.filter((image) => !image.cleaned).length;
      if (failed > 0)
        warnings.push(
          `Водяной знак не снят с ${failed} из ${images.length} снимков: ${images.find((image) => image.error)?.error}`,
        );
    } else {
      warnings.push("Водяной знак не снимался: не задан ключ DEWATERMARK_API_KEY — снимки со знаком");
      for (const image of images) image.error = "не настроено";
    }
  }

  return {
    ok: true,
    draft: {
      url,
      sku: suggestVanprojectSku(product.productId),
      name: product.name,
      description: product.description ?? "",
      categoryId,
      categoryPath: product.categoryPath,
      supplierId: supplier?.id ?? null,
      purchaseKopecks,
      variant,
      variantOptions,
      optionGroups,
      images,
      warnings,
    },
  };
}

async function downloadImages(urls: string[], warnings: string[]): Promise<ImportedImage[]> {
  const results: (ImportedImage | null)[] = new Array(urls.length).fill(null);
  let next = 0;
  let failed = 0;
  const worker = async () => {
    while (next < urls.length) {
      const index = next++;
      const url = urls[index]!;
      const fetched = await request(url, { headers: BROWSER_HEADERS }, SOURCE_NAME);
      if (!fetched.ok || !fetched.response.ok) {
        failed++;
        continue;
      }
      const data = new Uint8Array(await fetched.response.arrayBuffer());
      const contentType = detectImageType(data);
      if (!contentType || data.byteLength > MAX_IMAGE_BYTES) {
        failed++;
        continue;
      }
      results[index] = {
        sourceUrl: url,
        original: { base64: Buffer.from(data).toString("base64"), contentType },
        cleaned: null,
        error: null,
      };
    }
  };
  await Promise.all(Array.from({ length: Math.min(IMAGE_CONCURRENCY, urls.length) }, worker));
  if (failed > 0) warnings.push(`Не скачалось снимков: ${failed} из ${urls.length}`);
  return results.filter((image): image is ImportedImage => image !== null);
}

async function cleanImages(images: ImportedImage[]): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < images.length) {
      const image = images[next++]!;
      const original = new Uint8Array(Buffer.from(image.original.base64, "base64"));
      const fileName = image.sourceUrl.split("/").pop() || "image.jpg";
      const result = await removeWatermark(original, fileName);
      if (result.ok) {
        image.cleaned = {
          base64: Buffer.from(result.data).toString("base64"),
          contentType: detectImageType(result.data) ?? "image/jpeg",
        };
      } else {
        image.error = result.error;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(DEWATERMARK_CONCURRENCY, images.length) }, worker));
}
