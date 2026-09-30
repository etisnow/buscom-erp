import type { Metadata } from "next";
import { pluralize } from "@buscom/domain/money-words";
import Image from "next/image";
import Link from "next/link";
import salonSeats from "@/assets/salon-seats.png";
import { catalogQueryHref, DEFAULT_CATALOG_QUERY } from "@buscom/domain/site/catalog-query";
import { PASSENGER_SEATS_CATEGORY } from "@buscom/domain/site/seats";
import { pageMetadata } from "@/config/metadata";
import { NoPhoto, ProductCard } from "@/components/catalog/product-card";
import { CatalogToggle } from "@/components/catalog-menu";
import { LeadForm } from "@/components/lead-form";
import { ModelPicker } from "@/components/model-picker";
import { OrderStatusCheck } from "@/components/order-status-check";
import { PageText } from "@/components/page-text";
import { COMPANY } from "@/config/company";
import { getHits, getModels, getPopularCategories } from "@/server/catalog";
import { getSitePage } from "@/server/pages";

// Заголовок, метатеги и текст о компании правятся в ERP («Страницы сайта», ключ home);
// исходные — со старого сайта (packages/domain/src/site/pages.ts)
export async function generateMetadata(): Promise<Metadata> {
  const page = await getSitePage("home");
  return pageMetadata({ title: page.metaTitle, description: page.metaDescription || undefined, path: "/" });
}

export const dynamic = "force-dynamic";

/** В подборе на главной — самые ходовые модели, остальные на странице «Все модели» */
const MODELS_ON_HOME = 8;

const STEPS = ["Присылаете модель и фото салона", "Считаем комплект и работы", "Устанавливаем в цехе"] as const;

/** Главная по макету (экран 01): подбор по модели, цех, разделы, хиты, проверка статуса заказа, заявка и текст о компании. */
export default async function HomePage() {
  const [categories, hits, page, models] = await Promise.all([
    getPopularCategories(),
    getHits(),
    getSitePage("home"),
    getModels(),
  ]);
  return (
    <div className="flex flex-col gap-10 md:gap-14">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-[minmax(0,1fr)_540px] lg:gap-6">
        <section className="card flex flex-col justify-between gap-5 p-5 md:gap-7 md:p-10">
          <div className="flex flex-col gap-3.5">
            <h1 className="text-[26px] leading-[1.1] font-bold tracking-[-.02em] text-balance md:text-[46px]">
              {page.title}
            </h1>
            <p className="text-ink-2 hidden max-w-[580px] text-[17px] leading-normal md:block">
              Сиденья, полки, шторки, люки, климат и детали кузова для отечественных и зарубежных моделей.
            </p>
          </div>
          <div className="md:bg-surface flex flex-col gap-3.5 overflow-hidden md:rounded-xl md:p-5">
            <h2 className="font-semibold md:text-base">Подбор по модели автомобиля</h2>
            {models.length > 0 ? (
              <ModelPicker models={models.slice(0, MODELS_ON_HOME)} />
            ) : (
              <p className="text-ink-2 text-sm leading-normal">
                Напишите модель и пришлите фото в Max, WhatsApp или Telegram {COMPANY.max.display} — подберём детали и
                назовём цену.
              </p>
            )}
          </div>
        </section>
        <SeatCalculatorBanner />
      </div>

      {categories.length > 0 && (
        <section className="flex flex-col gap-4 md:gap-5">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[22px] font-bold tracking-[-.01em] md:text-[30px]">Популярные категории</h2>
            <CatalogToggle className="text-brand hover:text-brand-hover hidden text-[15px] font-medium md:block">
              Весь каталог →
            </CatalogToggle>
          </div>
          <ul className="grid grid-cols-2 gap-2.5 md:gap-3 lg:grid-cols-4">
            {categories.map((category) => (
              <li key={category.id}>
                <Link
                  href={`/${category.slug}`}
                  className="card hover:border-brand flex h-[140px] flex-col justify-between gap-3 rounded-[14px] p-3.5 md:h-[150px] md:flex-row md:p-5"
                >
                  <span className="flex flex-col justify-between">
                    <span className="text-[15px] leading-tight font-semibold md:text-[17px]">{category.name}</span>
                    <span className="text-muted hidden text-[13px] md:block">
                      {category.productCount} {pluralize(category.productCount, ["товар", "товара", "товаров"])}
                    </span>
                  </span>
                  <span className="relative size-[70px] shrink-0 self-end md:size-[110px]">
                    {category.imageId ? (
                      <Image src={`/img/${category.imageId}`} alt="" fill sizes="110px" className="object-contain" />
                    ) : (
                      <NoPhoto />
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <CatalogToggle className="card h-12 rounded-xl text-[15px] font-medium md:hidden">Весь каталог</CatalogToggle>
        </section>
      )}

      {hits.length > 0 && (
        <section className="flex flex-col gap-4 md:gap-5">
          <h2 className="text-[22px] font-bold tracking-[-.01em] md:text-[30px]">Хиты продаж</h2>
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 md:gap-3 lg:grid-cols-6">
            {hits.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      )}

      <OrderStatusCheck />

      <section
        id="zayavka"
        className="bg-brand grid scroll-mt-4 grid-cols-[minmax(0,1fr)] gap-6 rounded-[18px] p-5 text-white md:p-10 lg:grid-cols-[minmax(0,1fr)_460px] lg:gap-10"
      >
        <div className="flex flex-col gap-[18px]">
          <h2 className="text-[22px] leading-[1.15] font-bold tracking-[-.01em] md:text-[32px]">
            Обновляете салон целиком?
          </h2>
          <p className="max-w-[560px] text-[15px] leading-[1.55] text-[#e1efe4] md:text-base">
            Подберём сиденья, шторки, полки и климат под вашу модель, посчитаем комплект и установим в нашем цехе. Для
            автопарков — оптовые цены.
          </p>
          <ol className="mt-2 hidden gap-3 md:grid md:grid-cols-3">
            {STEPS.map((step, index) => (
              <li key={step} className="border-accent flex flex-col gap-1 border-t-2 pt-3">
                <span className="text-brand-pale font-mono text-xs">{String(index + 1).padStart(2, "0")}</span>
                <span className="text-[15px] leading-[1.35] font-medium">{step}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="text-ink flex flex-col gap-3 rounded-[14px] bg-white p-5 md:p-6">
          <h3 className="text-lg font-bold">Получить расчёт</h3>
          <LeadForm kind="salon" submitLabel="Отправить заявку" />
        </div>
      </section>

      {page.body && (
        <section className="text-ink-2 [&_h2]:text-ink text-[15px] leading-[1.6] lg:columns-2 lg:gap-12 [&_h2]:text-[22px] [&_h2]:font-bold">
          <PageText text={page.body} />
        </section>
      )}
    </div>
  );
}

/**
 * Баннер калькулятора сидений для салона (решение владельца 30.09.2026, вместо баннера цеха).
 * Страницы калькулятора пока нет — кнопка ведёт к заявке на главной.
 */
function SeatCalculatorBanner() {
  return (
    <section className="relative flex min-h-[210px] flex-col justify-end overflow-hidden rounded-2xl bg-[#2a2f2b] p-4 text-white md:min-h-[440px] md:p-7">
      <Image
        src={salonSeats}
        alt=""
        fill
        sizes="(min-width: 1024px) 540px, 100vw"
        className="object-cover object-[35%_50%]"
        priority
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/60 to-black/35" />
      <div className="relative flex flex-col gap-2 md:gap-3">
        <span className="bg-accent text-ink flex h-[26px] items-center self-start rounded-md px-2.5 text-xs font-bold tracking-[.04em]">
          КАЛЬКУЛЯТОР
        </span>
        <h2 className="text-xl leading-[1.15] font-bold md:text-[28px]">Калькулятор сидений для салона</h2>
        <p className="hidden text-[15px] leading-[1.45] text-[#e6ebe7] md:block">
          Подберите сиденья под ваш салон и узнайте стоимость комплекта
        </p>
        <div className="mt-1 flex gap-2.5">
          <Link
            href={catalogQueryHref(`/${PASSENGER_SEATS_CATEGORY}`, { ...DEFAULT_CATALOG_QUERY, seat: "passenger" })}
            className="text-ink flex h-11 items-center rounded-[9px] bg-white px-[18px] text-sm font-semibold"
          >
            Рассчитать стоимость
          </Link>
        </div>
      </div>
    </section>
  );
}
