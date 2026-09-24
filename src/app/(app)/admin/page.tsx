import type { Metadata } from "next";
import Link from "next/link";
import { BookMarked, PlugZap, Users } from "lucide-react";
import { requirePageUser } from "@/server/session";

export const metadata: Metadata = {
  title: "Администрирование — BusCom ERP",
};

const SECTIONS = [
  {
    href: "/admin/users",
    icon: Users,
    title: "Пользователи",
    description: "Сотрудники, роли, отключение доступа и выдача временных паролей.",
    adminOnly: true,
  },
  {
    href: "/admin/dictionaries",
    icon: BookMarked,
    title: "Справочники и настройки",
    description:
      "Источники заказов, причины отмены, транспортные компании, модели авто, лимит скидки, реквизиты продавца, почта.",
    adminOnly: true,
  },
  {
    href: "/admin/integration",
    icon: PlugZap,
    title: "Журнал интеграции",
    description: "Входящие заказы с сайта, ошибки разбора и повторная обработка.",
    adminOnly: false,
  },
];

export default async function AdminPage() {
  // Журнал интеграции доступен и руководителю, остальное — только администратору.
  const user = await requirePageUser(["ADMIN", "HEAD"]);
  const sections = SECTIONS.filter((section) => !section.adminOnly || user.role === "ADMIN");

  return (
    <main className="flex flex-col gap-4">
      <h1 className="font-heading text-xl font-semibold">Администрирование</h1>

      <div className="grid gap-3 sm:grid-cols-2">
        {sections.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="hover:bg-accent flex gap-3 rounded-lg border p-4 transition-colors"
          >
            <section.icon className="text-muted-foreground mt-0.5 size-5 shrink-0" />
            <span className="flex flex-col gap-1">
              <span className="font-medium">{section.title}</span>
              <span className="text-muted-foreground text-sm">{section.description}</span>
            </span>
          </Link>
        ))}
      </div>
    </main>
  );
}
