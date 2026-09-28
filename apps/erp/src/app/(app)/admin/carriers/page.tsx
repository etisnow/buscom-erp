import type { Metadata } from "next";
import { CarrierKeysEditor, MapsKeyEditor, PecKeysEditor, type TerminalsView } from "@/components/admin/carrier-keys";
import { formatMoscowDateTime } from "@buscom/domain/datetime";
import { ADMIN_ROLES } from "@buscom/domain/user/role";
import { getTerminalStats } from "@/server/carriers/terminals";
import { getSettings } from "@/server/settings/service";
import { requirePageUser } from "@/server/session";

export const metadata: Metadata = {
  title: "Транспортные компании — BusCom ERP",
};

export default async function AdminCarriersPage() {
  await requirePageUser(ADMIN_ROLES);
  const [settings, dellin, pec] = await Promise.all([
    getSettings(),
    getTerminalStats("DELLIN"),
    getTerminalStats("PEC"),
  ]);
  const view = (stats: typeof dellin): TerminalsView => ({
    active: stats.active,
    givingOut: stats.givingOut,
    syncedAt: stats.syncedAt ? formatMoscowDateTime(stats.syncedAt) : null,
  });

  return (
    <main className="flex flex-col gap-4">
      <h1 className="font-heading text-xl font-semibold">Транспортные компании</h1>
      {/* Ключ в браузер не отдаём — только признак, что он задан. */}
      <CarrierKeysEditor hasDellinKey={settings.carriers.dellinAppKey.length > 0} terminals={view(dellin)} />
      <PecKeysEditor
        pecLogin={settings.carriers.pecLogin}
        hasPecKey={settings.carriers.pecApiKey.length > 0}
        terminals={view(pec)}
      />
      <MapsKeyEditor yandexMapsApiKey={settings.carriers.yandexMapsApiKey} />
    </main>
  );
}
