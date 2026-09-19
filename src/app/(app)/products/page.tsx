import type { Metadata } from "next";
import { requireUser } from "@/server/session";

export const metadata: Metadata = {
  title: "Товары — BusCom ERP",
};

// Заглушка: каталог с остатками и резервом — PRD, модуль M3.
export default async function ProductsPage() {
  await requireUser();

  return (
    <main className="flex flex-col gap-2">
      <h1 className="font-heading text-xl font-semibold">Товары</h1>
      <p className="text-muted-foreground text-sm">
        Каталог, синхронизируемый с сайта: артикул, цена, остаток и резерв. Модуль M3 — в работе.
      </p>
    </main>
  );
}
