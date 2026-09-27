import type { Metadata } from "next";
import { pageMetadata } from "@/config/metadata";
import { Breadcrumbs } from "@/components/catalog/breadcrumbs";
import { COMPANY } from "@/config/company";

// Метатеги — со старого сайта дословно (docs/site-snapshot/pages.json, «/oplata-dostavka»)
export const metadata: Metadata = pageMetadata({
  title: "Баском. Оплата и доставка",
  description: "Баском. Оплата и доставка",
  path: "/oplata-dostavka",
});

/**
 * Экран 06 макета. Текст — со старого сайта; перевозчики — как в справочнике ТК
 * ERP (GTD теперь «КИТ (GTD)»). Онлайн-оплаты нет (решение владельца 24.09):
 * счёт или ссылку на оплату присылает менеджер. Редактирование из ERP — этап 6.
 */
/**
 * Вопросы — только из того, что уже сказано на странице: новых обещаний покупателю
 * здесь нет. Разметка FAQPage — по SITE-PRD, «Метатеги и разметка».
 */
const FAQ = [
  {
    question: "Входит ли доставка в сумму заказа?",
    answer:
      "Нет. Доставку оплачиваете транспортной компании при получении или отправке — в сумму заказа она не входит.",
  },
  {
    question: "Как узнать стоимость доставки?",
    answer:
      "Рассчитайте на сайте транспортной компании: СДЭК, Деловые Линии, ПЭК или КИТ (GTD). Или попросите рассчитать менеджера.",
  },
  {
    question: "Куда вы доставляете?",
    answer: `${COMPANY.delivery} — транспортными компаниями.`,
  },
  {
    question: "Можно забрать заказ самому?",
    answer: `Да, со склада: ${COMPANY.warehouse.city}, ${COMPANY.warehouse.street}. ${COMPANY.hours}.`,
  },
  {
    question: "Можно оплатить заказ на сайте картой?",
    answer:
      "Онлайн-оплаты на сайте нет. После оформления менеджер подтвердит наличие и сроки и пришлёт счёт или реквизиты для оплаты.",
  },
  {
    question: "Как оплатить заказ организации?",
    answer:
      "Безналичным расчётом по счёту, добавляется НДС 20%. При оформлении укажите ИНН — реквизиты подставятся сами.",
  },
];

export default function DeliveryPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
  return (
    <article className="max-w-3xl">
      <Breadcrumbs items={[]} current="Оплата и доставка" />
      <h1 className="mb-6 text-2xl font-bold md:text-3xl">Оплата и доставка</h1>
      <div className="text-ink-2 space-y-8">
        <section>
          <h2 className="text-ink mb-3 text-xl font-semibold">Способы доставки</h2>
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              Самовывоз со склада: {COMPANY.warehouse.city}, {COMPANY.warehouse.street}. {COMPANY.hours}.
            </li>
            <li>Доставка транспортной компанией: СДЭК, Деловые Линии, ПЭК, КИТ (GTD).</li>
          </ol>
          <p className="mt-3">
            {COMPANY.delivery}. Стоимость доставки можно рассчитать на сайте транспортной компании или попросить
            рассчитать менеджера. Доставку оплачиваете транспортной компании — в сумму заказа она не входит.
          </p>
        </section>
        <section>
          <h2 className="text-ink mb-3 text-xl font-semibold">Способы оплаты</h2>
          <ol className="list-decimal space-y-2 pl-5">
            <li>Наличными при самовывозе.</li>
            <li>Оплата по карте Сбербанка.</li>
            <li>Безналичный расчёт по счёту, добавляется НДС 20%.</li>
          </ol>
          <p className="mt-3">
            После оформления заказа менеджер подтвердит наличие и сроки и пришлёт счёт или реквизиты для оплаты.
          </p>
        </section>
        <section>
          <h2 className="text-ink mb-3 text-xl font-semibold">Частые вопросы</h2>
          <div className="divide-line border-line divide-y rounded-lg border bg-white">
            {FAQ.map((item) => (
              <details key={item.question} className="group p-4">
                <summary className="text-ink cursor-pointer font-medium">{item.question}</summary>
                <p className="mt-2">{item.answer}</p>
              </details>
            ))}
          </div>
        </section>
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </article>
  );
}
