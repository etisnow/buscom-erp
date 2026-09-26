import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, Paperclip } from "lucide-react";
import { ListPagination } from "@/components/layout/list-pagination";
import { formatMoscowDateTime } from "@buscom/domain/datetime";
import { splitQuotedReply } from "@buscom/domain/email/letters";
import { listMailbox, MAILBOX_PAGE_SIZE, MAILBOX_VIEWS, type MailboxView } from "@/server/emails/service";
import { isMailboxConfigured } from "@/server/integrations/mailbox";
import { requirePageUser } from "@/server/session";
import { pageNumber, single, toSearchParams } from "@/app/(app)/search-params";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Почта — BusCom ERP",
};

const VIEW_LABELS: Record<MailboxView, string> = {
  inbox: "Входящие от клиентов",
  unlinked: "Без клиента",
  sent: "Отправленные из ERP",
};

/**
 * Раздел «Почта» (PRD, M6.2): все письма клиентов из общего ящика, чтобы ни один
 * ответ не потерялся, — в том числе с незнакомых адресов, ждущие привязки к клиенту.
 * Непрочитанные сверху. Отвечают из карточки заказа: там шаблоны и счёт.
 */
export default async function MailPage({ searchParams }: PageProps<"/mail">) {
  await requirePageUser();
  const params = await searchParams;
  const requested = single(params.view);
  const view: MailboxView = (MAILBOX_VIEWS as readonly string[]).includes(requested ?? "")
    ? (requested as MailboxView)
    : "inbox";
  const page = pageNumber(params.page);
  const mailbox = await listMailbox(view, page);

  return (
    <main className="flex flex-col gap-4">
      <h1 className="font-heading text-xl font-semibold">{VIEW_LABELS[view]}</h1>

      {!(await isMailboxConfigured()) ? (
        <p className="text-muted-foreground rounded-md border border-dashed p-3 text-sm">
          Общий ящик не подключён — входящие письма не принимаются. Администратор задаёт его в «Администрирование →
          Настройки почты».
        </p>
      ) : null}

      {mailbox.items.length === 0 ? (
        <p className="text-muted-foreground text-sm">Писем нет.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {mailbox.items.map((email) => {
            const unread = email.direction === "INBOUND" && email.readAt === null;
            const Icon = email.direction === "INBOUND" ? ArrowDownLeft : ArrowUpRight;
            return (
              <li key={email.id}>
                <Link
                  href={`/mail/${email.id}`}
                  className="hover:bg-muted/50 grid grid-cols-[1.25rem_minmax(0,14rem)_minmax(0,1fr)_auto] items-baseline gap-3 px-3 py-2 text-sm max-sm:grid-cols-[1.25rem_minmax(0,1fr)_auto]"
                >
                  <Icon className="text-muted-foreground size-4 self-center" />
                  <span className={cn("truncate", unread && "font-semibold")}>
                    {email.direction === "INBOUND"
                      ? email.customer?.name || email.fromName || email.fromEmail
                      : email.toEmails.join(", ")}
                  </span>
                  <span className="min-w-0 truncate max-sm:col-start-2 max-sm:row-start-2">
                    <span className={cn(unread && "font-semibold")}>{email.subject}</span>
                    <span className="text-muted-foreground"> — {splitQuotedReply(email.body).main.slice(0, 160)}</span>
                  </span>
                  <span className="text-muted-foreground flex items-center gap-2 text-xs whitespace-nowrap">
                    {email.attachments.length > 0 ? <Paperclip className="size-3" aria-label="Есть вложения" /> : null}
                    {!email.customer && email.direction === "INBOUND" ? (
                      <span className="text-amber-700 dark:text-amber-400">без клиента</span>
                    ) : null}
                    {formatMoscowDateTime(email.sentAt)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <ListPagination
        page={page}
        pageCount={Math.max(1, Math.ceil(mailbox.total / MAILBOX_PAGE_SIZE))}
        total={mailbox.total}
        params={toSearchParams(params)}
        basePath="/mail"
        label="Всего писем"
      />
    </main>
  );
}
