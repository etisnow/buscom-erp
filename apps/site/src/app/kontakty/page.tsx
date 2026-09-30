import type { Metadata } from "next";
import { pageMetadata } from "@/config/metadata";
import { getSitePage } from "@/server/pages";
import { Breadcrumbs } from "@/components/catalog/breadcrumbs";
import { LeadForm } from "@/components/lead-form";
import { Messengers } from "@/components/messengers";
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
    ["Адрес", `${COMPANY.warehouse.city}, ${COMPANY.warehouse.street}`],
    ["Режим работы", COMPANY.hours],
  ] as const;
  return (
    <section>
      <Breadcrumbs items={[]} current={page.title} />
      <h1 className="page-title mb-4 md:mb-6">{page.title}</h1>
      <div className="grid grid-cols-1 gap-3 md:gap-6 lg:grid-cols-[460px_minmax(0,1fr)]">
        <div className="flex flex-col gap-3">
          <div className="card flex flex-col gap-4 p-5 md:p-7">
            <div className="flex flex-col gap-2">
              <p className="text-muted text-[13px]">Max, WhatsApp, Telegram</p>
              <p className="text-2xl font-bold md:text-[28px]">{COMPANY.max.display}</p>
              <Messengers size={48} />
            </div>
            {rows.map(([label, value]) => (
              <div key={label}>
                <p className="text-muted text-[13px]">{label}</p>
                <p className="text-[17px]">{value}</p>
              </div>
            ))}
            <div>
              <p className="text-muted text-[13px]">Почта</p>
              <a href={`mailto:${COMPANY.email}`} className="hover:text-brand text-[17px]">
                {COMPANY.email}
              </a>
            </div>
          </div>
          <div className="card flex flex-col gap-3 p-5 md:p-7">
            <h2 className="text-lg font-bold">Обратный звонок</h2>
            <LeadForm kind="callback" submitLabel="Перезвоните мне" />
          </div>
          <div className="card text-ink-2 p-5 text-sm md:p-7">
            <p className="text-ink font-semibold">Компания «{COMPANY.brand}»</p>
          </div>
        </div>
        <iframe
          title="Мы на карте"
          src="https://yandex.ru/map-widget/v1/?um=constructor%3AoVm42xd82asj5D_3UFrv1p6fQ5IN2-Ew&source=constructor"
          loading="lazy"
          className="border-line h-80 w-full rounded-2xl border md:h-[480px] lg:h-full lg:min-h-[640px]"
        />
      </div>
      {page.body && (
        <div className="card mt-3 p-5 text-[15px] leading-relaxed md:mt-6 md:p-7">
          <PageText text={page.body} />
        </div>
      )}
    </section>
  );
}

export const dynamic = "force-dynamic";
