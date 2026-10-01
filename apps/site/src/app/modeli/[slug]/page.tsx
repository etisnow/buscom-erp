import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { landingPhrase } from "@buscom/domain/site/model-landing";
import { MODELS_PATH, familyDisplayName, modelDescription, modelTitle } from "@buscom/domain/site/models";
import { Breadcrumbs } from "@/components/catalog/breadcrumbs";
import { ProductCard } from "@/components/catalog/product-card";
import { COMPANY, SITE_ORIGIN } from "@/config/company";
import { pageMetadata } from "@/config/metadata";
import { getModelPage } from "@/server/catalog";

/**
 * Страница модели авто: всё, что к ней подходит, по разделам каталога
 * (docs/SITE-PLAN.md, этап 7; адрес `/modeli/{slug}` утверждён владельцем 27.09).
 */
export async function generateMetadata({ params }: PageProps<"/modeli/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const model = await getModelPage(slug);
  if (!model) return {};
  return pageMetadata({
    title: modelTitle(familyDisplayName(model.name)),
    description: modelDescription(familyDisplayName(model.name), model.productCount),
    path: `${MODELS_PATH}/${model.slug}`,
  });
}

export default async function ModelPage({ params }: PageProps<"/modeli/[slug]">) {
  const { slug } = await params;
  const model = await getModelPage(slug);
  if (!model) notFound();
  const products = model.sections.flatMap((section) => section.products);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Комплектующие для ${model.name}`,
    url: `${SITE_ORIGIN}${MODELS_PATH}/${model.slug}`,
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
      <Breadcrumbs items={[{ name: "Подбор по модели", slug: MODELS_PATH.slice(1) }]} current={model.name} />
      <h1 className="page-title">
        Комплектующие для {familyDisplayName(model.name)}{" "}
        <span className="text-muted align-middle text-sm font-normal tracking-normal md:text-[15px]">
          {model.productCount}
        </span>
      </h1>
      {model.members.length > 1 || model.members[0] !== model.name ? (
        <p className="text-muted mt-2 text-sm md:text-[15px]">Версии и поколения: {model.members.join(", ")}</p>
      ) : null}
      {model.landings.length > 0 ? (
        <ul className="mt-4 flex flex-wrap gap-2">
          {model.landings.map((landing) => (
            <li key={landing.path}>
              <Link
                href={landing.path}
                className="border-line-strong hover:border-brand flex h-[38px] items-center gap-2 rounded-full border bg-white px-4 text-sm"
              >
                {landingPhrase(landing.categoryName, model.name)}
                <span className="text-subtle text-sm">{landing.productCount}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {model.sections.map((section, sectionIndex) => (
        <section key={section.name} className="mt-8 md:mt-10">
          <h2 className="mb-4 text-[22px] font-bold md:text-[26px]">
            {section.slug ? (
              <Link href={`/${section.slug}`} className="hover:text-brand">
                {section.name}
              </Link>
            ) : (
              section.name
            )}
          </h2>
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 md:gap-3 lg:grid-cols-4 xl:grid-cols-5">
            {section.products.map((product, index) => (
              <ProductCard
                key={product.id}
                product={product}
                eager={sectionIndex === 0 && index < 4}
                priority={sectionIndex === 0 && index === 0}
              />
            ))}
          </div>
        </section>
      ))}
      <aside className="bg-brand-soft mt-10 rounded-2xl p-5 md:p-7">
        <p className="font-semibold">Не нашли нужное для {model.name}?</p>
        <p className="text-ink-2 mt-1">
          Подберём под вашу машину — напишите в Max, WhatsApp или Telegram {COMPANY.max.display}.
        </p>
      </aside>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </section>
  );
}

export const dynamic = "force-dynamic";
