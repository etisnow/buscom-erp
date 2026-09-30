import type { Metadata } from "next";
import { ClientStatusesEditor } from "@/components/admin/client-statuses";
import { ADMIN_ROLES } from "@buscom/domain/user/role";
import { db } from "@/server/db";
import { getSettings } from "@/server/settings/service";
import { requirePageUser } from "@/server/session";

export const metadata: Metadata = {
  title: "Статусы для клиента — BusCom ERP",
};

export default async function AdminClientStatusesPage() {
  await requirePageUser(ADMIN_ROLES);
  const [settings, suppliers] = await Promise.all([
    getSettings(),
    db.supplier.findMany({
      where: { stages: { some: {} } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, stages: { orderBy: { sortOrder: "asc" }, select: { id: true, name: true } } },
    }),
  ]);

  return (
    <main className="flex flex-col gap-4">
      <div>
        <h1 className="font-heading text-xl font-semibold">Статусы для клиента</h1>
        <p className="text-muted-foreground text-sm">
          Что видит покупатель в блоке «Проверить статус заказа» на сайте. Внутренние статусы ERP и этапы поставщиков
          сопоставляются клиентским статусам двумя таблицами ниже.
        </p>
      </div>
      <ClientStatusesEditor mapping={settings.clientStatuses} suppliers={suppliers} />
    </main>
  );
}
