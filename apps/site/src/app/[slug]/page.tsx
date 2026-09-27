import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatRubPlain } from "@buscom/domain/money";
import { defaultCategoryDescription, defaultTitle, descriptionSnippet } from "@buscom/domain/site/meta";
import {
  applyCatalogQuery,
  catalogModels,
  isCatalogQueryActive,
  parseCatalogQuery,
  type CatalogQuery,
} from "@buscom/domain/site/catalog-query";
import { Breadcrumbs } from "@/components/catalog/breadcrumbs";
import { Description } from "@/components/catalog/description";
import { CategoryFilters } from "@/components/catalog/category-filters";
import { HitBadge, ProductCard } from "@/components/catalog/product-card";
import { ProductConfigurator } from "@/components/catalog/product-configurator";
import { ProductGallery } from "@/components/catalog/product-gallery";
import { COMPANY, SITE_ORIGIN } from "@/config/company";
import { getPageBySlug, type CategoryPage, type ProductPage } from "@/server/catalog";

/**
 * Товар и категория живут на одном уровне адресов: bus-com.ru/{slug}, как на
 * старом сайте (docs/SITE-PRD.md, «Адреса»). Старые пути с разделами сюда не
 * доходят — их уводит 301 proxy.ts.
 */

export async function generateMetadata({ params, searchParams }: PageProps<"/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  // Выборка фильтром — не отдельная страница для поиска: canonical на категорию, в индекс не берём
  const filtered = isCatalogQueryActive(parseCatalogQuery(await searchParams));
  const page = await getPageBySlug(slug);
  if (!page) return {};
  const title = page.metaTitle ?? defaultTitle(page.name);
  const description =
    page.metaDescription ??
    (page.kind === "product" ? descriptionSnippet(page.description) : defaultCategoryDescription(page.name));
  const image = page.kind === "product" && page.imageIds[0] ? `/img/${page.imageIds[0]}` : undefined;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: `/${page.slug}` },
    ...(filtered && { robots: { index: false, follow: true } }),
    openGraph: { title, description, url: `/${page.slug}`, images: image ? [image] : undefined },
  };
}

export default async function SlugPage({ params, searchParams }: PageProps<"/[slug]">) {
  const { slug } = await params;
  const page = await getPageBySlug(slug);
  if (!page) notFound();
  if (page.kind === "product") return <ProductView product={page} />;
  return <CategoryView category={page} query={parseCatalogQuery(await searchParams)} />;
}

function ProductView({ product }: { product: ProductPage }) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    sku: product.sku,
    url: `${SITE_ORIGIN}/${product.slug}`,
    image: product.imageIds.map((id) => `${SITE_ORIGIN}/img/${id}`),
    description: descriptionSnippet(product.description),
    brand: { "@type": "Brand", name: COMPANY.brand },
    ...(product.priceKopecks > 0 && {
      offers: {
        "@type": "Offer",
        priceCurrency: "RUB",
        price: formatRubPlain(product.priceKopecks).replace(",", "."),
        availability: product.isActive ? "https://schema.org/InStock" : "https://schema.org/Discontinued",
        url: `${SITE_ORIGIN}/${product.slug}`,
      },
    }),
  };
  return (
    <article>
      <Breadcrumbs items={product.breadcrumbs} current={product.name} />
      <div className="grid gap-8 lg:grid-cols-2">
        <ProductGallery imageIds={product.imageIds} name={product.name} />
        <div className="space-y-5">
          <div>
            {product.isHit && <HitBadge className="mb-2 inline-block" />}
            <h1 className="text-2xl font-bold md:text-3xl">{product.name}</h1>
            <p className="text-subtle mt-2 font-mono text-sm">Код товара: {product.sku}</p>
          </div>
          <ProductConfigurator
            productId={product.id}
            sku={product.sku}
            name={product.name}
            basePriceKopecks={product.basePriceKopecks}
            groups={product.options}
            isActive={product.isActive}
          />
          {product.compatibility.length > 0 && (
            <div>
              <h2 className="mb-2 font-semibold">Подходит для</h2>
              <ul className="flex flex-wrap gap-2 text-sm">
                {product.compatibility.map((model) => (
                  <li key={model} className="bg-surface rounded px-2 py-1">
                    {model}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {product.description && (
        <section className="mt-10 max-w-3xl">
          <h2 className="mb-3 text-xl font-semibold">Описание</h2>
          <Description text={product.description} />
        </section>
      )}

      {product.related.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-4 text-xl font-semibold">Похожие товары</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {product.related.map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>
        </section>
      )}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </article>
  );
}

function CategoryView({ category, query }: { category: CategoryPage; query: CatalogQuery }) {
  const products = applyCatalogQuery(category.products, query);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: category.name,
    url: `${SITE_ORIGIN}/${category.slug}`,
    numberOfItems: products.length,
    itemListElement: products.map((product, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: `${SITE_ORIGIN}/${product.slug}`,
      name: product.name,
    })),
  };
  return (
    <section>
      <Breadcrumbs items={category.breadcrumbs} current={category.name} />
      <h1 className="text-2xl font-bold md:text-3xl">
        {category.name} <span className="text-subtle text-lg font-normal">{category.products.length}</span>
      </h1>

      {category.children.length > 0 && (
        <ul className="mt-6 flex flex-wrap gap-2">
          {category.children.map((child) => (
            <li key={child.slug}>
              <Link
                href={`/${child.slug}`}
                className="border-line hover:border-brand hover:text-brand inline-flex items-center gap-2 rounded-md border bg-white px-4 py-2"
              >
                {child.name}
                <span className="text-subtle text-sm">{child.productCount}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {category.products.length > 1 && (
        <div className="mt-6">
          <CategoryFilters slug={category.slug} query={query} models={catalogModels(category.products)} />
        </div>
      )}

      {products.length > 0 ? (
        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      ) : (
        <p className="text-ink-2 mt-6">
          По этим условиям товаров нет.{" "}
          <Link href={`/${category.slug}`} className="text-brand hover:underline">
            Показать все {category.products.length}
          </Link>
        </p>
      )}

      <aside className="bg-brand-soft mt-10 rounded-lg p-5">
        <p className="font-semibold">Нужно много мест на автопарк?</p>
        <p className="text-ink-2 mt-1">
          Посчитаем комплект и сроки — позвоните {COMPANY.phone.display} или напишите в Max {COMPANY.max.display}.
        </p>
      </aside>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </section>
  );
}

// Страница рендерится на запрос из кеша данных (src/server/catalog.ts): при сборке базы нет
export const dynamic = "force-dynamic";
