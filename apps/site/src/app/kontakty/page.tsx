import type { Metadata } from "next";
import { pageMetadata } from "@/config/metadata";
import { getSitePage } from "@/server/pages";
import { Breadcrumbs } from "@/components/catalog/breadcrumbs";
import { PageText } from "@/components/page-text";
import { COMPANY } from "@/config/company";

// Метатеги и текст под контактами правятся в ERP («Страницы сайта»); исходные — со старого сайта
export async function generateMetadata(): Promise<Metadata> {
  const page = await getSitePage("kontakty");
  return pageMetadata({ title: page.metaTitle, description: page.metaDescription || undefined, path: "/kontakty" });
}

/**
 * Экран 07 макета. Контакты — из COMPANY (packages/domain/src/company.ts), их же
 * берут письма ERP; из ERP правятся заголовок, метатеги и текст под контактами. Карта — виджет Яндекса со старого сайта, грузится лениво:
 * он тяжёлый и не должен мешать первому экрану.
 */
export default async function ContactsPage() {
  const page = await getSitePage("kontakty");
  const rows = [
    [
      "Отдел продаж",
      <a key="phone" href={COMPANY.phone.href} className="hover:text-brand font-semibold">
        {COMPANY.phone.display}
      </a>,
    ],
    ["Max", COMPANY.max.display],
    [
      "Почта",
      <a key="mail" href={`mailto:${COMPANY.email}`} className="hover:text-brand">
        {COMPANY.email}
      </a>,
    ],
    ["Адрес склада", `${COMPANY.warehouse.city}, ${COMPANY.warehouse.street}`],
    ["Время работы", COMPANY.hours],
  ] as const;
  return (
    <section>
      <Breadcrumbs items={[]} current={page.title} />
      <h1 className="mb-6 text-2xl font-bold md:text-3xl">{page.title}</h1>
      <div className="grid gap-8 lg:grid-cols-2">
        <div className="space-y-6">
          <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-3">
            {rows.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-muted">{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <div className="bg-surface text-ink-2 rounded-lg p-4 text-sm">
            <p className="text-ink font-semibold">{COMPANY.legalName}</p>
            <p>ИНН {COMPANY.inn}</p>
            <p>ОГРН {COMPANY.ogrn}</p>
          </div>
          {page.body && <PageText text={page.body} />}
        </div>
        <iframe
          title="Склад на карте"
          src="https://yandex.ru/map-widget/v1/?um=constructor%3AoVm42xd82asj5D_3UFrv1p6fQ5IN2-Ew&source=constructor"
          loading="lazy"
          className="border-line h-96 w-full rounded-lg border"
        />
      </div>
    </section>
  );
}

export const dynamic = "force-dynamic";
