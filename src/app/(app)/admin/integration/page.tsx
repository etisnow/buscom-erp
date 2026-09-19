import type { Metadata } from "next";
import Link from "next/link";
import { InboxTable } from "@/components/admin/inbox-table";
import type { InboxStatus } from "@/generated/prisma/enums";
import { listInbox } from "@/server/integrations/inbox";
import { requireUser } from "@/server/session";

export const metadata: Metadata = {
  title: "Журнал интеграции — BusCom ERP",
};

const FILTERS: { value: InboxStatus | "all"; label: string }[] = [
  { value: "all", label: "Все" },
  { value: "FAILED", label: "Ошибки" },
  { value: "PROCESSED", label: "Принятые" },
  { value: "PENDING", label: "В обработке" },
];

function parseStatus(value: string | string[] | undefined): InboxStatus | undefined {
  const single = Array.isArray(value) ? value[0] : value;
  return single === "FAILED" || single === "PROCESSED" || single === "PENDING" ? single : undefined;
}

export default async function AdminIntegrationPage({ searchParams }: PageProps<"/admin/integration">) {
  // Руководителю журнал доступен на чтение (PRD, «Карта экранов»).
  await requireUser(["ADMIN", "HEAD"]);

  const params = await searchParams;
  const status = parseStatus(params.status);
  const { rows, counts } = await listInbox(status);

  return (
    <main className="flex flex-col gap-4">
      <div>
        <h1 className="font-heading text-xl font-semibold">Журнал интеграции</h1>
        <p className="text-muted-foreground text-sm">
          Входящие заказы с сайта. Сырой JSON сохраняется до разбора, поэтому ничего не теряется — упавшие записи можно
          разобрать повторно.
        </p>
      </div>

      <nav className="flex flex-wrap gap-1" aria-label="Фильтр по статусу">
        {FILTERS.map((filter) => {
          const isActive = filter.value === "all" ? status === undefined : status === filter.value;
          const href = filter.value === "all" ? "/admin/integration" : `/admin/integration?status=${filter.value}`;
          const count =
            filter.value === "all" ? counts.PENDING + counts.PROCESSED + counts.FAILED : counts[filter.value];

          return (
            <Link
              key={filter.value}
              href={href}
              aria-current={isActive ? "page" : undefined}
              className={
                isActive
                  ? "bg-primary text-primary-foreground rounded-md px-3 py-1.5 text-sm font-medium"
                  : "hover:bg-accent rounded-md px-3 py-1.5 text-sm"
              }
            >
              {filter.label}
              <span className={isActive ? "ml-1.5 opacity-80" : "text-muted-foreground ml-1.5"}>{count}</span>
            </Link>
          );
        })}
      </nav>

      <InboxTable rows={rows} />
    </main>
  );
}
