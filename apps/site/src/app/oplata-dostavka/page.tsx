import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/catalog/breadcrumbs";
import { COMPANY } from "@/config/company";

// Метатеги — со старого сайта дословно (docs/site-snapshot/pages.json, «/oplata-dostavka»)
export const metadata: Metadata = {
  title: { absolute: "Баском. Оплата и доставка" },
  description: "Баском. Оплата и доставка",
  alternates: { canonical: "/oplata-dostavka" },
};

/**
 * Экран 06 макета. Текст — со старого сайта; перевозчики — как в справочнике ТК
 * ERP (GTD теперь «КИТ (GTD)»). Онлайн-оплаты нет (решение владельца 24.09):
 * счёт или ссылку на оплату присылает менеджер. FAQ и редактирование из ERP — этап 6.
 */
export default function DeliveryPage() {
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
      </div>
    </article>
  );
}
