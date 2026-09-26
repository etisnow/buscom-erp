import Link from "next/link";
import { SITE_ORIGIN } from "@/config/company";

type Crumb = { name: string; slug: string };

/** Хлебные крошки с разметкой BreadcrumbList (docs/SITE-PRD.md, «Метатеги и разметка»). */
export function Breadcrumbs({ items, current }: { items: Crumb[]; current: string }) {
  const all = [
    { name: "Главная", url: `${SITE_ORIGIN}/` },
    ...items.map((item) => ({ name: item.name, url: `${SITE_ORIGIN}/${item.slug}` })),
  ];
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: all.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
  return (
    <nav aria-label="Хлебные крошки" className="text-muted mb-4 text-sm">
      <ol className="flex flex-wrap gap-x-2">
        <li>
          <Link href="/" className="hover:text-brand">
            Главная
          </Link>
        </li>
        {items.map((item) => (
          <li key={item.slug} className="before:mr-2 before:content-['/']">
            <Link href={`/${item.slug}`} className="hover:text-brand">
              {item.name}
            </Link>
          </li>
        ))}
        <li className="text-ink-2 before:mr-2 before:content-['/']">{current}</li>
      </ol>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </nav>
  );
}
