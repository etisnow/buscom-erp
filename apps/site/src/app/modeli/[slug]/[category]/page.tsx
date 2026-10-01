import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { landingDescription, landingPhrase, landingTitle } from "@buscom/domain/site/model-landing";
import { MODELS_PATH, familyDisplayName } from "@buscom/domain/site/models";
import { pluralize } from "@buscom/domain/money-words";
import { Breadcrumbs } from "@/components/catalog/breadcrumbs";
import { ProductCard } from "@/components/catalog/product-card";
import { COMPANY, SITE_ORIGIN } from "@/config/company";
import { pageMetadata } from "@/config/metadata";
import { getLandingPage } from "@/server/catalog";

/**
 * Посадочная «категория + семейство модели» — `/modeli/gazel-next/sidenja-dlya-microavtobusov`
 * (docs/SITE-PLAN.md, этап 7; адрес утверждён владельцем 27.09.2026). Есть только у пар, где
 * товаров не меньше порога (`MIN_LANDING_PRODUCTS`): остальные отвечают 404.
 */
export async function generateMetadata({ params }: PageProps<"/modeli/[slug]/[category]">): Promise<Metadata> {
  const { slug, category } = await params;
  const landing = await getLandingPage(slug, category);
  if (!landing) return {};
  // Заголовки — с русским названием семейства: «Сиденья для Ford Transit (Форд Транзит)»
  const heading = landingPhrase(landing.categoryName, familyDisplayName(landing.family));
  return pageMetadata({
    title: landingTitle(heading),
    description: landingDescription(heading, landing.productCount),
    path: landing.path,
  });
}

export default async function ModelLandingPage({ params }: PageProps<"/modeli/[slug]/[category]">) {
  const { slug, category } = await params;
  const landing = await getLandingPage(slug, category);
  if (!landing) notFound();
  const heading = landingPhrase(landing.categoryName, familyDisplayName(landing.family));
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: heading,
    url: `${SITE_ORIGIN}${landing.path}`,
    numberOfItems: landing.products.length,
    itemListElement: landing.products.map((product, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: `${SITE_ORIGIN}/${product.slug}`,
      name: product.name,
    })),
  };
  return (
    <section>
      <Breadcrumbs
        items={[
          { name: "Подбор по модели", slug: MODELS_PATH.slice(1) },
          { name: landing.family, slug: `${MODELS_PATH.slice(1)}/${landing.familySlug}` },
        ]}
        current={landing.categoryName}
      />
      <h1 className="page-title">
        {heading}{" "}
        <span className="text-muted align-middle text-sm font-normal tracking-normal md:text-[15px]">
          {landing.products.length} {pluralize(landing.products.length, ["товар", "товара", "товаров"])}
        </span>
      </h1>
      {landing.members.length > 1 || landing.members[0] !== landing.family ? (
        <p className="text-muted mt-2 text-sm md:text-[15px]">Версии и поколения: {landing.members.join(", ")}</p>
      ) : null}
      <ul className="mt-4 flex flex-wrap gap-2">
        <li>
          <Link
            href={`${MODELS_PATH}/${landing.familySlug}`}
            className="border-line-strong hover:border-brand flex h-[38px] items-center rounded-full border bg-white px-4 text-sm"
          >
            Всё для {landing.family}
          </Link>
        </li>
        <li>
          <Link
            href={`/${landing.categorySlug}`}
            className="border-line-strong hover:border-brand flex h-[38px] items-center rounded-full border bg-white px-4 text-sm"
          >
            {landing.categoryName} — весь раздел
          </Link>
        </li>
      </ul>
      <div className="mt-6 grid grid-cols-2 gap-2.5 md:grid-cols-3 md:gap-3 lg:grid-cols-4 xl:grid-cols-5">
        {landing.products.map((product, index) => (
          <ProductCard key={product.id} product={product} eager={index < 4} priority={index === 0} />
        ))}
      </div>
      <aside className="bg-brand-soft mt-10 rounded-2xl p-5 md:p-7">
        <p className="font-semibold">Не нашли нужное для {landing.family}?</p>
        <p className="text-ink-2 mt-1">
          Подберём под вашу машину — напишите в Max, WhatsApp или Telegram {COMPANY.max.display}.
        </p>
      </aside>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </section>
  );
}

export const dynamic = "force-dynamic";
