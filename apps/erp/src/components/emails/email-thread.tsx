import { ArrowDownLeft, ArrowUpRight, Paperclip } from "lucide-react";
import Link from "next/link";
import { formatMoscowDateTime } from "@buscom/domain/datetime";
import { splitQuotedReply } from "@buscom/domain/email/letters";
import { EMAIL_TEMPLATE_LABELS, type EmailTemplateKey } from "@buscom/domain/email/templates";
import { cn } from "@/lib/utils";

export type EmailView = {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  fromEmail: string;
  fromName: string | null;
  toEmails: string[];
  subject: string;
  body: string;
  template: string | null;
  unread: boolean;
  sentAt: Date;
  authorName: string | null;
  /** Клиент письма — если он определён */
  customer: { id: string; name: string } | null;
  attachments: { id: string; fileName: string; byteSize: number; skippedReason: string | null }[];
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / 1024 / 1024).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} МБ`;
}

export function EmailAttachments({ attachments }: { attachments: EmailView["attachments"] }) {
  if (attachments.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {attachments.map((file) => (
        <li key={file.id}>
          {file.skippedReason ? (
            <span
              className="text-muted-foreground inline-flex items-center gap-1 rounded-md border border-dashed px-2 py-1 text-xs"
              title={file.skippedReason}
            >
              <Paperclip className="size-3" />
              {file.fileName} · {formatSize(file.byteSize)} — не сохранён
            </span>
          ) : (
            <a
              href={`/api/email-attachments/${file.id}`}
              target="_blank"
              rel="noopener"
              className="hover:bg-muted inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs"
            >
              <Paperclip className="size-3" />
              {file.fileName} · {formatSize(file.byteSize)}
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Текст письма: ответ целиком, процитированная переписка под ним — свёрнута. */
function EmailBody({ body }: { body: string }) {
  const { main, quoted } = splitQuotedReply(body);
  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm break-words whitespace-pre-line">{main || "(письмо без текста)"}</p>
      {quoted ? (
        <details className="group">
          <summary className="text-muted-foreground hover:text-foreground w-fit cursor-pointer list-none text-xs">
            <span className="group-open:hidden">··· Показать цитату</span>
            <span className="hidden group-open:inline">Скрыть цитату</span>
          </summary>
          <p className="text-muted-foreground mt-1 border-l-2 pl-3 text-sm break-words whitespace-pre-line">{quoted}</p>
        </details>
      ) : null}
    </div>
  );
}

/** Одно письмо переписки: кто, кому, когда, текст и вложения. */
export function EmailMessage({ email, showCustomer = false }: { email: EmailView; showCustomer?: boolean }) {
  const inbound = email.direction === "INBOUND";
  const Icon = inbound ? ArrowDownLeft : ArrowUpRight;
  return (
    <article
      className={cn(
        "flex flex-col gap-2 rounded-lg border p-3",
        inbound ? "bg-muted/40" : "bg-background",
        email.unread && "border-primary/60",
      )}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs">
        <div className="flex min-w-0 items-center gap-1.5">
          <Icon className={cn("size-3.5 shrink-0", inbound ? "text-primary" : "text-muted-foreground")} />
          <span className="truncate font-medium">
            {inbound
              ? `${email.fromName ? `${email.fromName} ` : ""}<${email.fromEmail}>`
              : `${email.authorName ?? "ERP"} → ${email.toEmails.join(", ")}`}
          </span>
          {email.unread ? (
            <span className="bg-primary size-1.5 shrink-0 rounded-full" aria-label="Не прочитано" />
          ) : null}
        </div>
        <div className="text-muted-foreground flex items-center gap-2">
          {email.template ? (
            <span>{EMAIL_TEMPLATE_LABELS[email.template as EmailTemplateKey] ?? email.template}</span>
          ) : null}
          {showCustomer && email.customer ? (
            <Link href={`/customers/${email.customer.id}`} className="text-foreground hover:underline">
              {email.customer.name}
            </Link>
          ) : null}
          <time dateTime={email.sentAt.toISOString()}>{formatMoscowDateTime(email.sentAt)}</time>
        </div>
      </header>
      <div className="text-sm font-medium">{email.subject}</div>
      <EmailBody body={email.body} />
      <EmailAttachments attachments={email.attachments} />
    </article>
  );
}
