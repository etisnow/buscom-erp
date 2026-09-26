import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/catalog/breadcrumbs";
import { COMPANY } from "@/config/company";

// Метатеги — со старого сайта дословно (docs/site-snapshot/pages.json, «/kontakty»)
export const metadata: Metadata = {
  title: { absolute: "Контакты. Баском" },
  description: 'Контактная информация о компании "Баском"',
  alternates: { canonical: "/kontakty" },
};

/**
 * Экран 07 макета. Тексты — из COMPANY (src/config/company.ts); редактирование
 * из ERP — этап 6. Карта — виджет Яндекса со старого сайта, грузится лениво:
 * он тяжёлый и не должен мешать первому экрану.
 */
export default function ContactsPage() {
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
      <Breadcrumbs items={[]} current="Контакты" />
      <h1 className="mb-6 text-2xl font-bold md:text-3xl">Контакты</h1>
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
