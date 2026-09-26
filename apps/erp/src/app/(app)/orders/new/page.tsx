import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { NewOrderForm } from "@/components/orders/new-order-form";
import { ORDER_CREATE_ROLES } from "@/domain/user/role";
import { findCustomerMatch } from "@/server/customers/lookup";
import { getCarriers, getOrderSources } from "@/server/settings/service";
import { requirePageUser } from "@/server/session";

export const metadata: Metadata = {
  title: "Новый заказ — BusCom ERP",
};

export default async function NewOrderPage({ searchParams }: PageProps<"/orders/new">) {
  // Склад заказы не создаёт (PRD, «Карта экранов»).
  await requirePageUser(ORDER_CREATE_ROLES);
  const { customerId } = await searchParams;

  const [sources, carriers, initialCustomer] = await Promise.all([
    getOrderSources(),
    getCarriers(),
    // Кнопка «Новый заказ» из карточки клиента подставляет его сюда готовым
    typeof customerId === "string" ? findCustomerMatch(customerId) : Promise.resolve(null),
  ]);

  return (
    <main className="flex flex-col gap-4">
      <Link
        href="/orders"
        className="text-muted-foreground inline-flex w-fit items-center gap-1 text-sm hover:underline"
      >
        <ArrowLeft className="size-4" />К списку заказов
      </Link>

      <div>
        <h1 className="font-heading text-xl font-semibold">Новый заказ</h1>
        <p className="text-muted-foreground text-sm">Заказ сразу попадёт в работу, ответственным станете вы.</p>
      </div>

      <NewOrderForm sources={sources} carriers={carriers} initialCustomer={initialCustomer} />
    </main>
  );
}
