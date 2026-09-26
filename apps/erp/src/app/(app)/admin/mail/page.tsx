import type { Metadata } from "next";
import { EmailTemplatesEditor } from "@/components/admin/email-templates-editor";
import { HistoryImportPanel } from "@/components/admin/history-import-panel";
import { ImapEditor, SmtpEditor } from "@/components/admin/mail-settings";
import { ADMIN_ROLES } from "@buscom/domain/user/role";
import { historyImportRunning, readHistoryImport } from "@/server/emails/history-import";
import { resolveMailbox } from "@/server/integrations/mailbox";
import { getSettings } from "@/server/settings/service";
import { requirePageUser } from "@/server/session";

export const metadata: Metadata = {
  title: "Настройки почты — BusCom ERP",
};

export default async function AdminMailPage() {
  // Адрес администратора нужен проверке SMTP: тестовое письмо уходит ему
  const user = await requirePageUser(ADMIN_ROLES);
  const [settings, mailbox, history] = await Promise.all([getSettings(), resolveMailbox(), readHistoryImport()]);

  return (
    <main className="flex flex-col gap-4">
      <h1 className="font-heading text-xl font-semibold">Настройки почты</h1>

      {/* Пароли в браузер не отдаём — только признак, что они заданы. */}
      <SmtpEditor
        smtp={{ ...settings.smtp, password: "" }}
        hasPassword={settings.smtp.password.length > 0}
        testRecipient={user.email}
      />
      <ImapEditor
        imap={{ ...settings.imap, password: "" }}
        hasPassword={settings.imap.password.length > 0}
        envFallback={mailbox?.source === "env" ? `${mailbox.user} на ${mailbox.host}` : null}
      />
      {mailbox ? <HistoryImportPanel state={history} running={historyImportRunning()} /> : null}
      <EmailTemplatesEditor templates={settings.emailTemplates} />
    </main>
  );
}
