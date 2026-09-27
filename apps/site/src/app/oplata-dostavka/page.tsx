import type { Metadata } from "next";
import { pageFaq, parsePageText } from "@buscom/domain/site/page-text";
import { Breadcrumbs } from "@/components/catalog/breadcrumbs";
import { PageSections } from "@/components/page-text";
import { pageMetadata } from "@/config/metadata";
import { getSitePage } from "@/server/pages";

/**
 * Экран 06 макета. Текст правится в ERP («Страницы сайта»), исходный — в
 * packages/domain/src/site/pages.ts. Вопросы «? …» дают блок «Частые вопросы» и
 * разметку FAQPage (SITE-PRD, «Метатеги и разметка»).
 */
export async function generateMetadata(): Promise<Metadata> {
  const page = await getSitePage("oplata-dostavka");
  return pageMetadata({
    title: page.metaTitle,
    description: page.metaDescription || undefined,
    path: "/oplata-dostavka",
  });
}

export default async function DeliveryPage() {
  const page = await getSitePage("oplata-dostavka");
  const faq = pageFaq(parsePageText(page.body));
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
  return (
    <article>
      <Breadcrumbs items={[]} current={page.title} />
      <h1 className="page-title mb-4 md:mb-6">{page.title}</h1>
      <PageSections text={page.body} />
      {faq.length > 0 && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      )}
    </article>
  );
}

// Текст из базы — рендер на запрос из кеша данных (src/server/pages.ts): при сборке базы нет
export const dynamic = "force-dynamic";
