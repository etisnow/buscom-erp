import type { Metadata } from "next";
import { requireUser } from "@/server/session";

export const metadata: Metadata = {
  title: "Клиенты — BusCom ERP",
};

// Заглушка: база клиентов — PRD, модуль M2.
export default async function CustomersPage() {
  await requireUser();

  return (
    <main className="flex flex-col gap-2">
      <h1 className="font-heading text-xl font-semibold">Клиенты</h1>
      <p className="text-muted-foreground text-sm">
        База клиентов: физлица и юрлица, контакты, адреса, история заказов. Модуль M2 — в работе.
      </p>
    </main>
  );
}
