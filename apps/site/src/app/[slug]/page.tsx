import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatRubPlain } from "@buscom/domain/money";
import { pluralize } from "@buscom/domain/money-words";
import { defaultCategoryDescription, defaultTitle, descriptionSnippet } from "@buscom/domain/site/meta";
import { modelPath } from "@buscom/domain/site/models";
import { showSalonKit } from "@buscom/domain/site/seats";
import {
  applyCatalogQuery,
  catalogModels,
  catalogSeatTypes,
  isCatalogQueryActive,
  parseCatalogQuery,
  type CatalogQuery,
} from "@buscom/domain/site/catalog-query";
import { Breadcrumbs } from "@/components/catalog/breadcrumbs";
import { PageText } from "@/components/page-text";
import { CategoryFilters, SortTabs } from "@/components/catalog/category-filters";
import { HitBadge, ProductCard } from "@/components/catalog/product-card";
import { ProductConfigurator } from "@/components/catalog/product-configurator";
import { ProductGallery } from "@/components/catalog/product-gallery";
import { COMPANY, SITE_ORIGIN } from "@/config/company";
import { pageMetadata } from "@/config/metadata";
import { getKitLayouts, getPageBySlug, type CategoryPage, type ProductPage } from "@/server/catalog";

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
    ...pageMetadata({ title, description, path: `/${page.slug}`, image }),
    ...(filtered && { robots: { index: false, follow: true } }),
  };
}

export default async function SlugPage({ params, searchParams }: PageProps<"/[slug]">) {
  const { slug } = await params;
  const page = await getPageBySlug(slug);
  if (!page) notFound();
  if (page.kind === "product") {
    const kit = showSalonKit(page.salonKit, {
      name: page.name,
      seatType: page.seatType,
      categorySlugs: page.breadcrumbs.map((crumb) => crumb.slug),
    });
    // Схемы — из справочника ERP; блок «Комплект на салон» показываем, только если они есть
    const kitLayouts = kit ? await getKitLayouts() : [];
    return <ProductView product={page} kitLayouts={kitLayouts} />;
  }
  return <CategoryView category={page} query={parseCatalogQuery(await searchParams)} />;
}

function ProductView({
  product,
  kitLayouts,
}: {
  product: ProductPage;
  kitLayouts: Awaited<ReturnType<typeof getKitLayouts>>;
}) {
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
      {/* minmax(0, 1fr) — лента превью галереи не распирает страницу на телефоне */}
      <div className="grid grid-cols-1 gap-3 md:gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)]">
        <div className="flex flex-col gap-3 md:gap-6">
          <ProductGallery
            imageIds={product.imageIds}
            name={product.name}
            badges={product.isHit ? <HitBadge /> : undefined}
          />
          <div className="max-lg:hidden">
            <ProductDetails product={product} />
          </div>
        </div>
        <div className="card flex flex-col gap-5 self-start p-5 md:p-7">
          <div className="flex flex-col gap-2">
            <p className="text-muted text-[13px]">
              Код <span className="text-ink-2 ml-1 font-mono">{product.sku}</span>
            </p>
            <h1 className="text-2xl leading-tight font-bold tracking-[-.01em] md:text-[30px]">{product.name}</h1>
          </div>
          <ProductConfigurator
            productId={product.id}
            sku={product.sku}
            name={product.name}
            basePriceKopecks={product.basePriceKopecks}
            groups={product.options}
            isActive={product.isActive}
            kitLayouts={kitLayouts}
          />
        </div>
        <div className="lg:hidden">
          <ProductDetails product={product} />
        </div>
      </div>

      {product.related.length > 0 && (
        <section className="mt-10 flex flex-col gap-4 md:mt-14 md:gap-5">
          <h2 className="text-[22px] font-bold tracking-[-.01em] md:text-[30px]">Похожие товары</h2>
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 md:gap-3 lg:grid-cols-4">
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

/** Описание и совместимость — белой карточкой под галереей (макет, экран 03). Характеристик в данных пока нет. */
function ProductDetails({ product }: { product: ProductPage }) {
  if (!product.description && product.compatibility.length === 0) return null;
  return (
    <section className="card flex flex-col gap-6 p-5 md:p-8">
      {product.description && (
        <div>
          <h2 className="mb-3 text-[22px] font-bold">Описание</h2>
          <div className="text-ink-2 text-[15px] leading-[1.65]">
            <PageText text={product.description} />
          </div>
        </div>
      )}
      {product.compatibility.length > 0 && (
        <div>
          <h3 className="mb-2.5 text-[15px] font-semibold">Подходит для</h3>
          <ul className="flex flex-wrap gap-2">
            {product.compatibility.map((model) => (
              <li key={model}>
                <Link
                  href={modelPath(model)}
                  className="bg-brand-soft text-brand hover:bg-brand flex h-8 items-center rounded-full px-3 text-[13px] font-medium hover:text-white"
                >
                  {model}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
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
  // У подраздела текущий — первым: на телефоне ряд прокручивается, и он не уедет за край
  const pills =
    category.children.length > 0
      ? category.children
      : [...category.siblings].sort((a, b) => Number(b.slug === category.slug) - Number(a.slug === category.slug));
  return (
    <section>
      <Breadcrumbs items={category.breadcrumbs} current={category.name} />
      <h1 className="text-[26px] leading-tight font-bold tracking-[-.02em] md:text-[34px]">
        {category.name}{" "}
        <span className="text-muted align-middle text-sm font-normal tracking-normal md:text-[15px]">
          {category.products.length} {pluralize(category.products.length, ["товар", "товара", "товаров"])}
        </span>
      </h1>

      {pills.length > 0 && (
        <ul className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
          {pills.map((item) => {
            const current = item.slug === category.slug;
            return (
              <li key={item.slug} className="shrink-0">
                <Link
                  href={`/${item.slug}`}
                  aria-current={current ? "page" : undefined}
                  className={`flex h-[38px] items-center rounded-full border px-4 text-sm ${
                    current ? "bg-brand border-brand text-white" : "border-line-strong hover:border-brand bg-white"
                  }`}
                >
                  {item.name}
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-5 grid grid-cols-1 gap-4 md:mt-6 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-6">
        <aside>
          {category.products.length > 1 && (
            <CategoryFilters
              slug={category.slug}
              query={query}
              models={catalogModels(category.products)}
              seatTypes={catalogSeatTypes(category.products)}
            />
          )}
        </aside>
        <div className="flex flex-col gap-4">
          {category.products.length > 1 && <SortTabs slug={category.slug} query={query} />}
          {products.length > 0 ? (
            <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 md:gap-3 xl:grid-cols-4">
              {products.map((product, index) => (
                <ProductCard key={product.id} product={product} eager={index < 4} priority={index === 0} />
              ))}
            </div>
          ) : (
            <p className="text-ink-2 card p-5">
              По этим условиям товаров нет.{" "}
              <Link href={`/${category.slug}`} className="text-brand hover:underline">
                Показать все {category.products.length}
              </Link>
            </p>
          )}
        </div>
      </div>
      {category.seoText && (
        <div className="card mt-6 p-5 text-[15px] leading-relaxed md:mt-8 md:p-7">
          <PageText text={category.seoText} />
        </div>
      )}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </section>
  );
}

// Страница рендерится на запрос из кеша данных (src/server/catalog.ts): при сборке базы нет
export const dynamic = "force-dynamic";
