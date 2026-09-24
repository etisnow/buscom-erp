import type { EmailView } from "@/components/emails/email-thread";
import type { EmailListItem } from "@/server/emails/service";

/** Письмо из базы — в вид для ленты. Байты вложений сюда не попадают: их отдаёт отдельный маршрут. */
export function toEmailView(email: EmailListItem): EmailView {
  return {
    id: email.id,
    direction: email.direction,
    fromEmail: email.fromEmail,
    fromName: email.fromName,
    toEmails: email.toEmails,
    subject: email.subject,
    body: email.body,
    template: email.template,
    unread: email.direction === "INBOUND" && email.readAt === null,
    sentAt: email.sentAt,
    authorName: email.user?.name ?? null,
    orderNumber: email.order?.number ?? null,
    attachments: email.attachments,
  };
}
