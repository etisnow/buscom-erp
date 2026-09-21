import type { Metadata } from "next";
import { DictionaryEditor } from "@/components/admin/dictionary-editor";
import { DiscountLimitEditor, RequisitesEditor, SlaEditor, SmtpEditor } from "@/components/admin/settings-editor";
import { ADMIN_ROLES } from "@/domain/user/role";
import { getSettings, listDictionary } from "@/server/settings/service";
import { requirePageUser } from "@/server/session";

export const metadata: Metadata = {
  title: "Справочники и настройки — BusCom ERP",
};

export default async function AdminDictionariesPage() {
  // Адрес администратора нужен разделу почты: проверочное письмо уходит ему
  const user = await requirePageUser(ADMIN_ROLES);

  const [settings, orderSources, cancelReasons, carriers] = await Promise.all([
    getSettings(),
    listDictionary("ORDER_SOURCE"),
    listDictionary("CANCEL_REASON"),
    listDictionary("CARRIER"),
  ]);

  return (
    <main className="flex flex-col gap-4">
      <h1 className="font-heading text-xl font-semibold">Справочники и настройки</h1>

      <DictionaryEditor
        type="ORDER_SOURCE"
        title="Источники заказов"
        description="Откуда пришёл заказ: выбирается при заведении заказа и в его карточке, по нему фильтруется список. «Сайт» и «Прежнюю ERP» ставит сама система — их можно только переименовать. Выключенный источник пропадёт из форм, но останется у старых заказов."
        items={orderSources}
      />

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
        description="Из этого списка выбирается перевозчик в доставке заказа. Выключенная компания пропадает из выбора, но остаётся в старых заказах."
        items={carriers}
      />

      <DiscountLimitEditor percent={settings.discountLimitPercent} />
      <SlaEditor slaMinutes={settings.slaMinutes} />
      <RequisitesEditor requisites={settings.sellerRequisites} />
      {/* Пароль в браузер не отдаём — только признак, что он задан. */}
      <SmtpEditor
        smtp={{ ...settings.smtp, password: "" }}
        hasPassword={settings.smtp.password.length > 0}
        testRecipient={user.email}
      />
    </main>
  );
}
