import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, Paperclip } from "lucide-react";
import { ListPagination } from "@/components/layout/list-pagination";
import { formatMoscowDateTime } from "@/domain/datetime";
import { listMailbox, MAILBOX_PAGE_SIZE, MAILBOX_VIEWS, type MailboxView } from "@/server/emails/service";
import { isMailboxConfigured } from "@/server/integrations/mailbox";
import { requirePageUser } from "@/server/session";
import { pageNumber, single, toSearchParams } from "@/app/(app)/search-params";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Почта — BusCom ERP",
};

const VIEW_LABELS: Record<MailboxView, string> = {
  inbox: "Входящие",
  unlinked: "Без заказа",
  sent: "Отправленные",
};

/**
 * Раздел «Почта» (PRD, M6.2): все письма клиентов из общего ящика, чтобы ни один
 * ответ не потерялся, — в том числе те, что не удалось привязать к заказу.
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
  const counts: Partial<Record<MailboxView, number>> = { inbox: mailbox.unread, unlinked: mailbox.unlinked };

  return (
    <main className="flex flex-col gap-4">
      <h1 className="font-heading text-xl font-semibold">Почта</h1>

      {!isMailboxConfigured() ? (
        <p className="text-muted-foreground rounded-md border border-dashed p-3 text-sm">
          Общий ящик не подключён (IMAP_HOST, IMAP_USER, IMAP_PASSWORD) — входящие письма не принимаются. Отправка из
          карточки заказа работает, если настроен раздел «Почта» в справочниках.
        </p>
      ) : null}

      <nav className="flex flex-wrap gap-1" aria-label="Папки">
        {MAILBOX_VIEWS.map((item) => {
          const isActive = item === view;
          return (
            <Link
              key={item}
              href={item === "inbox" ? "/mail" : `/mail?view=${item}`}
              aria-current={isActive ? "page" : undefined}
              className={
                isActive
                  ? "bg-primary text-primary-foreground rounded-md px-3 py-1.5 text-sm font-medium"
                  : "hover:bg-accent rounded-md px-3 py-1.5 text-sm"
              }
            >
              {VIEW_LABELS[item]}
              {counts[item] ? (
                <span className={isActive ? "ml-1.5 opacity-80" : "text-muted-foreground ml-1.5"}>{counts[item]}</span>
              ) : null}
            </Link>
          );
        })}
      </nav>

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
                    <span className="text-muted-foreground"> — {email.body.slice(0, 160)}</span>
                  </span>
                  <span className="text-muted-foreground flex items-center gap-2 text-xs whitespace-nowrap">
                    {email.attachments.length > 0 ? <Paperclip className="size-3" aria-label="Есть вложения" /> : null}
                    {email.order ? (
                      <span className="text-foreground">№{email.order.number}</span>
                    ) : email.direction === "INBOUND" ? (
                      <span className="text-amber-700 dark:text-amber-400">без заказа</span>
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
