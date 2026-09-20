import type { Metadata } from "next";
import { DictionaryEditor } from "@/components/admin/dictionary-editor";
import { DiscountLimitEditor, RequisitesEditor, SlaEditor } from "@/components/admin/settings-editor";
import { ADMIN_ROLES } from "@/domain/user/role";
import { getSettings, listDictionary } from "@/server/settings/service";
import { requirePageUser } from "@/server/session";

export const metadata: Metadata = {
  title: "Справочники и настройки — BusCom ERP",
};

export default async function AdminDictionariesPage() {
  await requirePageUser(ADMIN_ROLES);

  const [settings, cancelReasons, carriers] = await Promise.all([
    getSettings(),
    listDictionary("CANCEL_REASON"),
    listDictionary("CARRIER"),
  ]);

  return (
    <main className="flex flex-col gap-4">
      <h1 className="font-heading text-xl font-semibold">Справочники и настройки</h1>

      <DictionaryEditor
        type="CANCEL_REASON"
        title="Причины отмены"
        description="Из этого списка менеджер выбирает причину при отмене заказа."
        items={cancelReasons}
        fallbackNote="Список пуст — пока работает набор причин по умолчанию, зашитый в код. Как только добавите первую причину, будет использоваться ваш список."
      />

      <DictionaryEditor
        type="CARRIER"
        title="Транспортные компании"
        description="Подсказки для поля «Транспортная компания» в доставке."
        items={carriers}
      />

      <DiscountLimitEditor percent={settings.discountLimitPercent} />
      <SlaEditor slaMinutes={settings.slaMinutes} />
      <RequisitesEditor requisites={settings.sellerRequisites} />
    </main>
  );
}
