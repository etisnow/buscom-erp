import type { Metadata } from "next";
import { NotificationEmailForm } from "@/components/settings/notification-email-form";
import { NotificationTopicsForm } from "@/components/settings/notification-topics-form";
import { PushSettings } from "@/components/settings/push-settings";
import { countPushDevices, vapidPublicKey } from "@/server/push/service";
import { requirePageUser } from "@/server/session";
import { getUserSettings, listSupplierStagesForTopics } from "@/server/users/settings";

export const metadata: Metadata = {
  title: "Настройки — BusCom ERP",
};

/** Личные настройки: доступны любому сотруднику, каждый видит и правит только свои. */
export default async function UserSettingsPage() {
  const user = await requirePageUser();
  const [settings, suppliers, publicKey, deviceCount] = await Promise.all([
    getUserSettings(user.id),
    listSupplierStagesForTopics(),
    vapidPublicKey(),
    countPushDevices(user.id),
  ]);

  return (
    <main className="flex max-w-3xl flex-col gap-4">
      <h1 className="font-heading text-xl font-semibold">Настройки</h1>

      <PushSettings publicKey={publicKey} deviceCount={deviceCount} />
      <NotificationEmailForm loginEmail={settings.email} notificationEmail={settings.notificationEmail} />
      <NotificationTopicsForm topics={settings.notificationTopics} suppliers={suppliers} />
    </main>
  );
}
