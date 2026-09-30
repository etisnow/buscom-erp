import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/catalog/breadcrumbs";
import { OrderStatusCheck } from "@/components/order-status-check";
import { pageMetadata } from "@/config/metadata";

export const metadata: Metadata = pageMetadata({
  title: "Проверить статус заказа — Баском",
  description: "Узнайте, на каком этапе ваш заказ: номер заказа из письма и телефон, указанный при оформлении.",
  path: "/status-zakaza",
});

/** Отдельная страница «Проверить статус заказа» — ссылка в шапке и подвале; тот же блок, что на главной. */
export default function OrderStatusPage() {
  return (
    <section className="flex flex-col gap-4 md:gap-6">
      <Breadcrumbs items={[]} current="Проверить статус заказа" />
      <OrderStatusCheck as="page" />
    </section>
  );
}
