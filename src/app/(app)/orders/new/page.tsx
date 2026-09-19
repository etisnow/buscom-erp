import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { NewOrderForm } from "@/components/orders/new-order-form";
import { ORDER_CREATE_ROLES } from "@/domain/user/role";
import { requireUser } from "@/server/session";

export const metadata: Metadata = {
  title: "Новый заказ — BusCom ERP",
};

export default async function NewOrderPage() {
  // Склад заказы не создаёт (PRD, «Карта экранов»).
  await requireUser(ORDER_CREATE_ROLES);

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

      <NewOrderForm />
    </main>
  );
}
