import type { Metadata } from "next";
import { DewatermarkKeyEditor, CarveKeyEditor } from "@/components/admin/service-keys";
import { ADMIN_ROLES } from "@buscom/domain/user/role";
import { env } from "@/server/env";
import { getSettings } from "@/server/settings/service";
import { requirePageUser } from "@/server/session";

export const metadata: Metadata = {
  title: "Внешние сервисы — BusCom ERP",
};

export default async function AdminServicesPage() {
  await requirePageUser(ADMIN_ROLES);
  const settings = await getSettings();

  return (
    <main className="flex flex-col gap-4">
      <h1 className="font-heading text-xl font-semibold">Внешние сервисы</h1>
      {/* Ключ в браузер не отдаём — только признаки, что он задан здесь или в окружении сервера. */}
      <DewatermarkKeyEditor
        hasKey={settings.services.dewatermarkApiKey.length > 0}
        hasEnvKey={Boolean(env.DEWATERMARK_API_KEY)}
      />
      <CarveKeyEditor hasKey={settings.services.carveApiKey.length > 0} />
    </main>
  );
}
