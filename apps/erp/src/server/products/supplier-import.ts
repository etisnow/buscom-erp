import "server-only";
import type { Kopecks } from "@buscom/domain/money";
import { IMPORT_SITES } from "@buscom/domain/product/import-sites";
import { detectImageType, MAX_IMAGE_BYTES } from "@buscom/domain/product/images";
import {
  isBuskomplektUrl,
  parseBuskomplektProduct,
  suggestBuskomplektSku,
} from "@buscom/domain/product/buskomplekt-product";
import {
  isGruppaDetaleyUrl,
  parseGruppaDetaleyProduct,
  suggestGruppaDetaleySku,
} from "@buscom/domain/product/gruppa-detaley-product";
import {
  isTehprestigeUrl,
  parseTehprestigeProduct,
  suggestTehprestigeSku,
} from "@buscom/domain/product/tehprestige-product";
import { isEvrosidUrl, parseEvrosidProduct, suggestEvrosidSku } from "@buscom/domain/product/evrosid-product";
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
import { createImage } from "@/server/products/images";
import { canEditCatalog } from "@/server/products/service";
import { BROWSER_HEADERS, MAX_BYTES, priceCombos, request, statusError } from "@/server/products/supplier-price";
import type { SessionUser } from "@/server/session";

/**
 * Импорт товара со страницы поставщика (сайты — в `SOURCES` ниже):
 * страница → название, описание, варианты с закупками, снимки → черновик для формы нового товара. Ничего не сохраняет: товар заводит
 * человек кнопкой в форме, сверив и поправив поля (docs/DECISIONS.md, 28.09.2026).
 *
 * Снимки уходят в форму как есть (base64): снять знак или фон человек решает сам
 * у выбранных снимков в форме (`processImageAction`).
 */

/** Сайты, с которых умеем импортировать. Новый — парсер в domain + строка здесь + подпись в форме импорта. */
const SOURCES = [
  {
    name: "Фургон Проект",
    matches: isVanprojectUrl,
    parse: parseVanprojectProduct,
    suggestSku: suggestVanprojectSku,
    /** Поставщик в справочнике ищется по части названия (любой из вариантов) */
    supplierNameParts: ["Фургон"],
  },
  {
    name: "ЕвроСид",
    matches: isEvrosidUrl,
    parse: parseEvrosidProduct,
    suggestSku: suggestEvrosidSku,
    supplierNameParts: ["Евросид", "Eurosid", "Evrosid"],
  },
  {
    name: "Нижбаскомплект",
    matches: isBuskomplektUrl,
    parse: parseBuskomplektProduct,
    suggestSku: suggestBuskomplektSku,
    supplierNameParts: ["Нижбас", "Буском", "Buskomplekt"],
  },
  {
    name: "Техпрестиж",
    matches: isTehprestigeUrl,
    parse: parseTehprestigeProduct,
    suggestSku: suggestTehprestigeSku,
    supplierNameParts: ["Техпрестиж", "Tehprestige"],
  },
  {
    name: "Группа деталей",
    matches: isGruppaDetaleyUrl,
    parse: parseGruppaDetaleyProduct,
    suggestSku: suggestGruppaDetaleySku,
    supplierNameParts: ["Группа деталей", "Gruppa"],
  },
];
/** Больше снимков у карточки поставщика не бывает; больше — не качаем */
const MAX_IMAGES = 12;
const IMAGE_CONCURRENCY = 3;

export type ImportedImage = {
  sourceUrl: string;
  /** base64 и тип снимка как есть у поставщика */
  original: { base64: string; contentType: string };
};

export type SupplierImportDraft = {
  url: string;
  sku: string;
  name: string;
  description: string;
  categoryId: string | null;
  /** Путь раздела у поставщика — подсказка, если категорию не подобрали */
  categoryPath: string[];
  /** Поставщик этого сайта в справочнике; null — такого нет, выберет человек */
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

type SupplierPage = {
  url: string;
  source: (typeof SOURCES)[number];
  product: NonNullable<ReturnType<(typeof SOURCES)[number]["parse"]>>;
};

/** Страница товара у поставщика: адрес, сайт-источник и разобранная карточка. */
async function loadSupplierPage(rawUrl: string): Promise<({ ok: true } & SupplierPage) | { ok: false; error: string }> {
  const typed = rawUrl.trim();
  // Ссылку часто вставляют без «https://»
  const url = /^[a-z][a-z0-9+.-]*:\/\//i.test(typed) ? typed : `https://${typed}`;
  const source = SOURCES.find((candidate) => candidate.matches(url));
  if (!source) {
    const sites = IMPORT_SITES.map((site) => `«${site.name}» (${site.host})`).join(", ");
    return { ok: false, error: `Пока умею импортировать только с сайтов ${sites}` };
  }

  const page = await request(
    url,
    { headers: { ...BROWSER_HEADERS, accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" } },
    source.name,
  );
  if (!page.ok) return page;
  const pageError = statusError(page.response, source.name);
  if (pageError) return { ok: false, error: pageError };
  const product = source.parse((await page.response.text()).slice(0, MAX_BYTES));
  if (!product)
    return { ok: false, error: "По ссылке не карточка товара — откройте товар на сайте и скопируйте адрес" };
  return { ok: true, url, source, product };
}

/**
 * «Импорт с сайта поставщика» в галерее готового товара: снимки со страницы поставщика
 * добавляются в конец галереи. Уже загруженные раньше (тот же адрес снимка) пропускаются,
 * так что повторный импорт не плодит дубли.
 */
export async function importImagesFromSupplier(
  productId: string,
  rawUrl: string,
  user: SessionUser,
): Promise<{ ok: true; added: number; skipped: number; warnings: string[] } | { ok: false; error: string }> {
  if (!canEditCatalog(user.role)) throw new ForbiddenError("Недостаточно прав, чтобы менять картинки товара");
  const page = await loadSupplierPage(rawUrl);
  if (!page.ok) return page;

  const warnings: string[] = [];
  const urls = page.product.imageUrls.slice(0, MAX_IMAGES);
  if (urls.length === 0) return { ok: false, error: "На странице поставщика нет снимков товара" };
  if (page.product.imageUrls.length > MAX_IMAGES) {
    warnings.push(`У товара ${page.product.imageUrls.length} снимков — взяты первые ${MAX_IMAGES}`);
  }

  const known = new Set(
    (
      await db.productImage.findMany({ where: { productId, sourceUrl: { not: null } }, select: { sourceUrl: true } })
    ).map((image) => image.sourceUrl),
  );
  const fresh = urls.filter((url) => !known.has(url));
  const images = await downloadImages(fresh, warnings, page.source.name);

  if (images.length > 0) {
    await db.$transaction(async (tx) => {
      for (const image of images) {
        await createImage(tx, productId, {
          data: new Uint8Array(Buffer.from(image.original.base64, "base64")),
          sourceUrl: image.sourceUrl,
        });
      }
    });
  }
  return { ok: true, added: images.length, skipped: urls.length - fresh.length, warnings };
}

export async function importFromSupplier(rawUrl: string, user: SessionUser): Promise<SupplierImportResult> {
  if (!canEditCatalog(user.role)) throw new ForbiddenError("Недостаточно прав, чтобы заводить товары");
  const page = await loadSupplierPage(rawUrl);
  if (!page.ok) return page;
  const { url, source, product } = page;

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
    const combos = await priceCombos(product.form, url, source.name);
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
      where: {
        OR: source.supplierNameParts.map((part) => ({ name: { contains: part, mode: "insensitive" as const } })),
      },
      select: { id: true },
    }),
    db.productSupplier.findFirst({ where: { url }, select: { product: { select: { sku: true, name: true } } } }),
  ]);
  if (existing) {
    warnings.push(`Этот товар уже заведён: ${existing.product.sku} «${existing.product.name}»`);
  }
  if (!supplier) warnings.push(`Поставщика «${source.name}» нет в справочнике — выберите поставщика вручную`);
  const categoryId = matchCategory(product.categoryPath, categories);
  if (!categoryId && product.categoryPath.length > 0) {
    warnings.push(`Категорию не подобрал — у поставщика раздел «${product.categoryPath.join(" / ")}»`);
  }

  const imageUrls = product.imageUrls.slice(0, MAX_IMAGES);
  if (product.imageUrls.length > MAX_IMAGES) {
    warnings.push(`У товара ${product.imageUrls.length} снимков — взяты первые ${MAX_IMAGES}`);
  }
  const images = await downloadImages(imageUrls, warnings, source.name);

  return {
    ok: true,
    draft: {
      url,
      sku: source.suggestSku(product.productId),
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

async function downloadImages(urls: string[], warnings: string[], sourceName: string): Promise<ImportedImage[]> {
  const results: (ImportedImage | null)[] = new Array(urls.length).fill(null);
  let next = 0;
  let failed = 0;
  const worker = async () => {
    while (next < urls.length) {
      const index = next++;
      const url = urls[index]!;
      const fetched = await request(url, { headers: BROWSER_HEADERS }, sourceName);
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
      };
    }
  };
  await Promise.all(Array.from({ length: Math.min(IMAGE_CONCURRENCY, urls.length) }, worker));
  if (failed > 0) warnings.push(`Не скачалось снимков: ${failed} из ${urls.length}`);
  return results.filter((image): image is ImportedImage => image !== null);
}
