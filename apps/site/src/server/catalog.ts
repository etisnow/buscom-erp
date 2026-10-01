import "server-only";
import { unstable_cache } from "next/cache";
import { siteModels, type SiteModel } from "@buscom/domain/site/models";
import { parseSeatType, resolveSeatType, type SeatType } from "@buscom/domain/site/seats";
import { startingPrice } from "@buscom/domain/site/pricing";
import { db } from "@/server/db";

/**
 * Каталог для сайта — чтение общей с ERP базы (docs/SITE-PRD.md).
 *
 * Страницы рендерятся на каждый запрос, а данные берутся из кеша Next на
 * CATALOG_TTL секунд: так в Docker-сборке не нужна база (предрендера нет), а
 * запрос к Postgres случается раз в несколько минут на страницу. Правка товара
 * в ERP видна на сайте с этой задержкой — ERP другой процесс и сбросить кеш
 * сайта не может (docs/DECISIONS.md, запись от 26.09 про каталог сайта).
 *
 * Кеш сериализует ответ в JSON: даты приходят строками — поэтому их здесь нет,
 * кроме sitemap, где они строкой и нужны.
 */
const CATALOG_TTL = 300;
const cached = <A extends unknown[], R>(fn: (...args: A) => Promise<R>, key: string) =>
  unstable_cache(fn, [key], { revalidate: CATALOG_TTL, tags: ["catalog"] });

export type MenuCategory = { id: string; name: string; slug: string; children: MenuCategory[]; productCount: number };

/** Дерево категорий со слугами и числом товаров в продаже (вместе с подкатегориями). Пустые не показываем. */
export const getCategoryTree = cached(async (): Promise<MenuCategory[]> => {
  const categories = await db.productCategory.findMany({
    where: { slug: { not: null } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      parentId: true,
      _count: { select: { products: { where: { isActive: true, slug: { not: null } } } } },
    },
  });
  const build = (parentId: string | null): MenuCategory[] =>
    categories
      .filter((category) => category.parentId === parentId)
      .map((category) => {
        const children = build(category.id);
        return {
          id: category.id,
          name: category.name,
          slug: category.slug as string,
          children,
          productCount: category._count.products + children.reduce((sum, child) => sum + child.productCount, 0),
        };
      })
      .filter((category) => category.productCount > 0);
  return build(null);
}, "category-tree");

const cardSelect = {
  id: true,
  name: true,
  sku: true,
  slug: true,
  priceKopecks: true,
  isHit: true,
  compatibility: true,
  seatType: true,
  images: { orderBy: { sortOrder: "asc" }, take: 1, select: { id: true } },
  options: { select: { required: true, values: { select: { priceDeltaKopecks: true } } } },
} as const;

export type ProductCard = {
  id: string;
  name: string;
  sku: string;
  slug: string;
  priceKopecks: number;
  hasChoice: boolean;
  /** Есть обязательная опция: из списка в корзину не положить — сначала выбор в карточке */
  needsChoice: boolean;
  imageId: string | null;
  isHit: boolean;
  compatibility: string[];
  /** Тип сиденья — для фильтра в категории сидений; null — не сиденье */
  seatType: SeatType | null;
};

function toCard(
  product: {
    id: string;
    name: string;
    sku: string;
    slug: string | null;
    priceKopecks: number;
    isHit: boolean;
    compatibility: string[];
    seatType: string | null;
    images: { id: string }[];
    options: { required: boolean; values: { priceDeltaKopecks: number }[] }[];
  },
  categorySlugs: readonly string[] = [],
): ProductCard {
  const price = startingPrice(product.priceKopecks, product.options);
  return {
    id: product.id,
    name: product.name,
    sku: product.sku,
    slug: product.slug as string,
    priceKopecks: price.priceKopecks,
    hasChoice: price.hasChoice,
    needsChoice: product.options.some((option) => option.required && option.values.length > 0),
    imageId: product.images[0]?.id ?? null,
    isHit: product.isHit,
    compatibility: product.compatibility,
    seatType: resolveSeatType(parseSeatType(product.seatType), { name: product.name, categorySlugs }),
  };
}

export type ProductPage = {
  kind: "product";
  id: string;
  name: string;
  sku: string;
  slug: string;
  isActive: boolean;
  isHit: boolean;
  /** Настройка блока «Комплект на салон»: true/false — как задано в ERP, null — автоматически */
  salonKit: boolean | null;
  /** Тип сиденья, заданный в ERP; null — автоматически */
  seatType: SeatType | null;
  description: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  /** Цена без опций — от неё считает конфигуратор */
  basePriceKopecks: number;
  /** Цена «от»: с самыми дешёвыми вариантами обязательных опций */
  priceKopecks: number;
  hasChoice: boolean;
  compatibility: string[];
  imageIds: string[];
  options: {
    id: string;
    name: string;
    required: boolean;
    values: { id: string; name: string; priceDeltaKopecks: number }[];
  }[];
  breadcrumbs: { name: string; slug: string }[];
  related: ProductCard[];
};

export type CategoryPage = {
  kind: "category";
  id: string;
  name: string;
  slug: string;
  metaTitle: string | null;
  metaDescription: string | null;
  breadcrumbs: { name: string; slug: string }[];
  children: { name: string; slug: string; productCount: number }[];
  /** Подразделы плашками над списком: у раздела — свои, у подраздела — соседи по разделу (макет, экран 02) */
  siblings: { name: string; slug: string; productCount: number }[];
  products: ProductCard[];
};

/** Цепочка категорий от корня до данной — для крошек. */
async function categoryChain(categoryId: string | null): Promise<{ id: string; name: string; slug: string | null }[]> {
  const chain: { id: string; name: string; slug: string | null }[] = [];
  let id = categoryId;
  while (id && chain.length < 10) {
    const category = await db.productCategory.findUnique({
      where: { id },
      select: { id: true, name: true, slug: true, parentId: true },
    });
    if (!category) break;
    chain.unshift(category);
    id = category.parentId;
  }
  return chain;
}

const crumbs = (chain: { name: string; slug: string | null }[]) =>
  chain.filter((item): item is { name: string; slug: string } => item.slug !== null);

/** Страница по слугу: товар или категория. Слуг у них общий на весь сайт. */
export const getPageBySlug = cached(async (slug: string): Promise<ProductPage | CategoryPage | null> => {
  const product = await db.product.findUnique({
    where: { slug },
    select: {
      ...cardSelect,
      isActive: true,
      salonKit: true,
      description: true,
      metaTitle: true,
      metaDescription: true,
      compatibility: true,
      categoryId: true,
      images: { orderBy: { sortOrder: "asc" }, select: { id: true } },
      options: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          name: true,
          required: true,
          values: { orderBy: { sortOrder: "asc" }, select: { id: true, name: true, priceDeltaKopecks: true } },
        },
      },
    },
  });
  if (product) {
    const price = startingPrice(product.priceKopecks, product.options);
    const related = product.categoryId
      ? await db.product.findMany({
          where: { categoryId: product.categoryId, isActive: true, slug: { not: null }, id: { not: product.id } },
          orderBy: { name: "asc" },
          take: 4,
          select: cardSelect,
        })
      : [];
    return {
      kind: "product",
      id: product.id,
      name: product.name,
      sku: product.sku,
      slug,
      isActive: product.isActive,
      isHit: product.isHit,
      salonKit: product.salonKit,
      seatType: parseSeatType(product.seatType),
      description: product.description,
      metaTitle: product.metaTitle,
      metaDescription: product.metaDescription,
      basePriceKopecks: product.priceKopecks,
      priceKopecks: price.priceKopecks,
      hasChoice: price.hasChoice,
      compatibility: product.compatibility,
      imageIds: product.images.map((image) => image.id),
      options: product.options,
      breadcrumbs: crumbs(await categoryChain(product.categoryId)),
      related: related.map((item) => toCard(item)),
    };
  }

  const category = await db.productCategory.findUnique({
    where: { slug },
    select: { id: true, name: true, metaTitle: true, metaDescription: true, parentId: true },
  });
  if (!category) return null;
  const tree = await getCategoryTree();
  const find = (nodes: MenuCategory[], id: string): MenuCategory | undefined =>
    nodes.map((node) => (node.id === id ? node : find(node.children, id))).find(Boolean);
  const node = find(tree, category.id);
  const parent = category.parentId ? find(tree, category.parentId) : undefined;
  const ids = [category.id, ...(node?.children.map((child) => child.id) ?? [])];
  const products = await db.product.findMany({
    where: { categoryId: { in: ids }, isActive: true, slug: { not: null } },
    orderBy: { name: "asc" },
    select: cardSelect,
  });
  const breadcrumbs = crumbs(await categoryChain(category.parentId));
  const categorySlugs = [slug, ...breadcrumbs.map((crumb) => crumb.slug)];
  return {
    kind: "category",
    id: category.id,
    name: category.name,
    slug,
    metaTitle: category.metaTitle,
    metaDescription: category.metaDescription,
    breadcrumbs,
    children: (node?.children ?? []).map((child) => ({
      name: child.name,
      slug: child.slug,
      productCount: child.productCount,
    })),
    siblings: (parent?.children ?? []).map((sibling) => ({
      name: sibling.name,
      slug: sibling.slug,
      productCount: sibling.productCount,
    })),
    products: products.map((product) => toCard(product, categorySlugs)),
  };
}, "page-by-slug");

/** «Хиты продаж» на главной: метку ставят в карточке товара в ERP. */
export const getHits = cached(async (): Promise<ProductCard[]> => {
  const products = await db.product.findMany({
    where: { isHit: true, isActive: true, slug: { not: null } },
    orderBy: { name: "asc" },
    take: 12,
    select: cardSelect,
  });
  return products.map((item) => toCard(item));
}, "hits");

export type PopularCategory = { id: string; name: string; slug: string; productCount: number; imageId: string | null };

/**
 * «Популярные категории» на главной: подкатегории, где больше хитов, затем — товаров.
 * По продажам не ранжируем: роль базы сайта заказов не видит (scripts/site-db-role.sql).
 * Картинка — первый снимок хита раздела, а нет хита — любого товара со снимком.
 */
export const getPopularCategories = cached(async (): Promise<PopularCategory[]> => {
  const categories = await db.productCategory.findMany({
    where: { slug: { not: null }, children: { none: {} } },
    select: {
      id: true,
      name: true,
      slug: true,
      products: {
        where: { isActive: true, slug: { not: null } },
        orderBy: [{ isHit: "desc" }, { name: "asc" }],
        select: { isHit: true, images: { orderBy: { sortOrder: "asc" }, take: 1, select: { id: true } } },
      },
    },
  });
  return categories
    .filter((category) => category.products.length > 0)
    .map((category) => ({
      id: category.id,
      name: category.name,
      slug: category.slug as string,
      productCount: category.products.length,
      hitCount: category.products.filter((product) => product.isHit).length,
      imageId: category.products.find((product) => product.images.length > 0)?.images[0].id ?? null,
    }))
    .sort((a, b) => b.hitCount - a.hitCount || b.productCount - a.productCount)
    .slice(0, 8)
    .map(({ id, name, slug, productCount, imageId }) => ({ id, name, slug, productCount, imageId }));
}, "popular-categories");

/** Семейства моделей авто, для которых есть товары в продаже (этап 7, `/modeli/{slug}`). */
export const getModels = cached(async (): Promise<SiteModel[]> => {
  const products = await db.product.findMany({
    where: { isActive: true, slug: { not: null }, compatibility: { isEmpty: false } },
    select: { compatibility: true },
  });
  return siteModels(products);
}, "models");

export type ModelPage = SiteModel & {
  /** Товары по разделам каталога — в порядке меню; без раздела — в конце */
  sections: { name: string; slug: string | null; products: ProductCard[] }[];
};

/** Страница семейства: товары, у которых любое из его поколений в совместимости, по разделам каталога. */
export const getModelPage = cached(async (slug: string): Promise<ModelPage | null> => {
  const model = (await getModels()).find((item) => item.slug === slug);
  if (!model) return null;
  const [products, tree] = await Promise.all([
    db.product.findMany({
      where: { isActive: true, slug: { not: null }, compatibility: { hasSome: model.members } },
      orderBy: { name: "asc" },
      select: { ...cardSelect, categoryId: true },
    }),
    getCategoryTree(),
  ]);
  // Раздел верхнего уровня для каждой категории дерева
  const sectionOf = new Map<string, MenuCategory>();
  const walk = (nodes: MenuCategory[], top?: MenuCategory) =>
    nodes.forEach((node) => {
      sectionOf.set(node.id, top ?? node);
      walk(node.children, top ?? node);
    });
  walk(tree);
  const sections = [
    ...tree.map((section) => ({
      name: section.name,
      slug: section.slug as string | null,
      products: [] as ProductCard[],
    })),
    { name: "Другое", slug: null, products: [] as ProductCard[] },
  ];
  for (const product of products) {
    const section = product.categoryId ? sectionOf.get(product.categoryId) : undefined;
    const target = sections.find((item) => item.slug === (section?.slug ?? null)) ?? sections[sections.length - 1];
    target.products.push(toCard(product));
  }
  return { ...model, sections: sections.filter((section) => section.products.length > 0) };
}, "model-page");

/** Все товары в продаже — для поиска по сайту (ищем в памяти: @buscom/domain/site/search). */
export const getSearchIndex = cached(async (): Promise<ProductCard[]> => {
  const products = await db.product.findMany({
    where: { isActive: true, slug: { not: null } },
    select: cardSelect,
  });
  return products.map((item) => toCard(item));
}, "search-index");

/** Адреса для sitemap.xml: товары в продаже и непустые категории. */
export const getSitemapEntries = cached(async () => {
  const [products, categories] = await Promise.all([
    db.product.findMany({
      where: { isActive: true, slug: { not: null } },
      select: { slug: true, updatedAt: true },
    }),
    db.productCategory.findMany({ where: { slug: { not: null } }, select: { id: true, slug: true, updatedAt: true } }),
  ]);
  const tree = await getCategoryTree();
  const visible = new Set<string>();
  const walk = (nodes: MenuCategory[]) =>
    nodes.forEach((node) => {
      visible.add(node.id);
      walk(node.children);
    });
  walk(tree);
  return [
    ...categories
      .filter((category) => visible.has(category.id))
      .map((category) => ({ slug: category.slug as string, updatedAt: category.updatedAt.toISOString() })),
    ...products.map((product) => ({ slug: product.slug as string, updatedAt: product.updatedAt.toISOString() })),
  ];
}, "sitemap");

/**
 * Схемы салона для блока «Комплект на салон» — включённые, в порядке справочника ERP
 * («Схемы салонов»). `imageVersion` — часть адреса картинки: заменили чертёж, адрес новый.
 */
export const getKitLayouts = cached(async () => {
  const rows = await db.salonLayout.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      seats: true,
      armrests: true,
      reclinerBacks: true,
      updatedAt: true,
      imageContentType: true,
    },
  });
  return rows.map(({ updatedAt, imageContentType, ...layout }) => ({
    ...layout,
    hasImage: imageContentType !== null,
    imageVersion: updatedAt.getTime(),
  }));
}, "kit-layouts");

/** Чертёж схемы салона для публичной выдачи. */
export async function readSalonLayoutImage(id: string) {
  const row = await db.salonLayout.findFirst({
    where: { id, isActive: true },
    select: { imageData: true, imageContentType: true },
  });
  if (!row?.imageData || !row.imageContentType) return null;
  return { data: row.imageData, contentType: row.imageContentType };
}

/** Картинка товара для публичной выдачи. Не кешируется здесь: байты не сериализуются в JSON. */
export async function readProductImage(id: string, size: "thumb" | "full") {
  const image = await db.productImage.findUnique({
    where: { id },
    select: { contentType: true, data: size === "full", thumbData: size === "thumb", thumbContentType: true },
  });
  if (!image) return null;
  if (size === "thumb" && image.thumbData) {
    return { data: image.thumbData, contentType: image.thumbContentType ?? image.contentType };
  }
  if (size === "thumb") {
    const full = await db.productImage.findUnique({ where: { id }, select: { data: true } });
    return full ? { data: full.data, contentType: image.contentType } : null;
  }
  return image.data ? { data: image.data, contentType: image.contentType } : null;
}
