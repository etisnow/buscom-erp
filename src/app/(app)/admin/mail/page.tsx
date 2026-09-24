import type { Metadata } from "next";
import { EmailTemplatesEditor } from "@/components/admin/email-templates-editor";
import { ImapEditor, SmtpEditor } from "@/components/admin/mail-settings";
import { ADMIN_ROLES } from "@/domain/user/role";
import { resolveMailbox } from "@/server/integrations/mailbox";
import { getSettings } from "@/server/settings/service";
import { requirePageUser } from "@/server/session";

export const metadata: Metadata = {
  title: "Настройки почты — BusCom ERP",
};

export default async function AdminMailPage() {
  // Адрес администратора нужен проверке SMTP: тестовое письмо уходит ему
  const user = await requirePageUser(ADMIN_ROLES);
  const [settings, mailbox] = await Promise.all([getSettings(), resolveMailbox()]);

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
      <EmailTemplatesEditor templates={settings.emailTemplates} />
    </main>
  );
}
