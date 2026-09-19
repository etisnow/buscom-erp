import type { Metadata } from "next";
import { requireUser } from "@/server/session";

export const metadata: Metadata = {
  title: "Заказы — BusCom ERP",
};

// Заглушка: список заказов с фильтрами и видами делается на этапе 1 (PRD, M1).
export default async function OrdersPage() {
  const user = await requireUser();

  return (
    <main className="flex flex-col gap-2">
      <h1 className="font-heading text-xl font-semibold">Заказы</h1>
      <p className="text-muted-foreground text-sm">
        Привет, {user.name}. Список заказов появится на этапе 1 — см. docs/PRD.md, модуль M1.
      </p>
    </main>
  );
}
