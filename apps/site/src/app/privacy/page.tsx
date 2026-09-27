import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/catalog/breadcrumbs";
import { PageText } from "@/components/page-text";
import { COMPANY } from "@/config/company";
import { pageMetadata } from "@/config/metadata";
import { getSitePage } from "@/server/pages";

/**
 * Политика обработки ПДн (152-ФЗ). Текст правится в ERP («Страницы сайта»),
 * исходный — черновик в packages/domain/src/site/pages.ts, его до запуска проверяет
 * владелец или юрист (docs/STATUS.md). Адрес `/privacy` — из старой карты сайта.
 */
export async function generateMetadata(): Promise<Metadata> {
  const page = await getSitePage("privacy");
  return pageMetadata({ title: page.metaTitle, description: page.metaDescription || undefined, path: "/privacy" });
}

export default async function PrivacyPage() {
  const page = await getSitePage("privacy");
  return (
    <article className="max-w-3xl">
      <Breadcrumbs items={[]} current={page.title} />
      <h1 className="mb-6 text-2xl font-bold md:text-3xl">{page.title}</h1>
      <PageText text={page.body} />
      <p className="text-ink-2 mt-6 text-sm">
        Контакты Оператора: {COMPANY.legalName}, {COMPANY.email}, {COMPANY.phone.display}.
      </p>
    </article>
  );
}

export const dynamic = "force-dynamic";
