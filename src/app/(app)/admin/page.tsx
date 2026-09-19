import type { Metadata } from "next";
import { ADMIN_ROLES } from "@/domain/user/role";
import { requireUser } from "@/server/session";

export const metadata: Metadata = {
  title: "Администрирование — BusCom ERP",
};

// Заглушка: пользователи, справочники и журнал интеграции — PRD, модуль M8.
export default async function AdminPage() {
  await requireUser(ADMIN_ROLES);

  return (
    <main className="flex flex-col gap-2">
      <h1 className="font-heading text-xl font-semibold">Администрирование</h1>
      <p className="text-muted-foreground text-sm">
        Пользователи и роли, справочники и SLA, журнал интеграции с сайтом. Модуль M8 — в работе.
      </p>
    </main>
  );
}
