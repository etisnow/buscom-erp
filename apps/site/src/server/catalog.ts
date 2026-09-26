import "server-only";
import { unstable_cache } from "next/cache";
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
  imageId: string | null;
};

function toCard(product: {
  id: string;
  name: string;
  sku: string;
  slug: string | null;
  priceKopecks: number;
  images: { id: string }[];
  options: { required: boolean; values: { priceDeltaKopecks: number }[] }[];
}): ProductCard {
  const price = startingPrice(product.priceKopecks, product.options);
  return {
    id: product.id,
    name: product.name,
    sku: product.sku,
    slug: product.slug as string,
    priceKopecks: price.priceKopecks,
    hasChoice: price.hasChoice,
    imageId: product.images[0]?.id ?? null,
  };
}

export type ProductPage = {
  kind: "product";
  id: string;
  name: string;
  sku: string;
  slug: string;
  isActive: boolean;
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
      related: related.map(toCard),
    };
  }

  const category = await db.productCategory.findUnique({
    where: { slug },
    select: { id: true, name: true, metaTitle: true, metaDescription: true, parentId: true },
  });
  if (!category) return null;
  const tree = await getCategoryTree();
  const find = (nodes: MenuCategory[]): MenuCategory | undefined =>
    nodes.map((node) => (node.id === category.id ? node : find(node.children))).find(Boolean);
  const node = find(tree);
  const ids = [category.id, ...(node?.children.map((child) => child.id) ?? [])];
  const products = await db.product.findMany({
    where: { categoryId: { in: ids }, isActive: true, slug: { not: null } },
    orderBy: { name: "asc" },
    select: cardSelect,
  });
  return {
    kind: "category",
    id: category.id,
    name: category.name,
    slug,
    metaTitle: category.metaTitle,
    metaDescription: category.metaDescription,
    breadcrumbs: crumbs(await categoryChain(category.parentId)),
    children: (node?.children ?? []).map((child) => ({
      name: child.name,
      slug: child.slug,
      productCount: child.productCount,
    })),
    products: products.map(toCard),
  };
}, "page-by-slug");

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
