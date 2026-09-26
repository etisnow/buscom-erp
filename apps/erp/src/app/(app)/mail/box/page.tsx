import type { Metadata } from "next";
import Link from "next/link";
import { Paperclip } from "lucide-react";
import { ListPagination } from "@/components/layout/list-pagination";
import { formatMoscowDateTime } from "@buscom/domain/datetime";
import { SPECIAL_FOLDER_LABELS } from "@buscom/domain/email/folders";
import { MAILBOX_ROLES } from "@buscom/domain/user/role";
import { listFolderLetters, mailboxFolderList, MAILBOX_PAGE_SIZE } from "@/server/emails/mailbox-browser";
import { requirePageUser } from "@/server/session";
import { pageNumber, single } from "@/app/(app)/search-params";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Ящик — BusCom ERP",
};

/** Папка живого ящика: письма прямо из IMAP, свежие сверху, по 50. */
export default async function MailboxFolderPage({ searchParams }: PageProps<"/mail/box">) {
  await requirePageUser(MAILBOX_ROLES);
  const params = await searchParams;
  const path = single(params.folder) ?? "INBOX";
  const page = pageNumber(params.page);

  let loaded;
  try {
    loaded = await Promise.all([mailboxFolderList(), listFolderLetters(path, page)]);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return (
      <main className="flex flex-col gap-4">
        <p className="text-muted-foreground rounded-md border border-dashed p-3 text-sm">Папку не открыть: {reason}</p>
      </main>
    );
  }
  const [folders, letters] = loaded;
  const folder = folders.find((item) => item.path === path);
  const title = (folder?.specialUse && SPECIAL_FOLDER_LABELS[folder.specialUse]) || folder?.name || path;
  const isSent = folder?.specialUse === "\\Sent";

  return (
    <main className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-heading text-xl font-semibold">{title}</h1>
        <span className="text-muted-foreground text-sm">
          {letters.total.toLocaleString("ru-RU")} писем · прямо из ящика
        </span>
      </div>

      {letters.items.length === 0 ? (
        <p className="text-muted-foreground text-sm">Папка пуста.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {letters.items.map((letter) => (
            <li key={letter.uid}>
              <Link
                href={`/mail/box/letter?folder=${encodeURIComponent(path)}&uid=${letter.uid}`}
                className="hover:bg-muted/50 grid grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto] items-baseline gap-3 px-3 py-2 text-sm max-sm:grid-cols-[minmax(0,1fr)_auto]"
              >
                <span className={cn("truncate", !letter.seen && "font-semibold")}>
                  {isSent ? `→ ${letter.to}` : letter.from}
                </span>
                <span
                  className={cn(
                    "min-w-0 truncate max-sm:col-span-2 max-sm:row-start-2",
                    !letter.seen && "font-semibold",
                  )}
                >
                  {letter.subject}
                </span>
                <span className="text-muted-foreground flex items-center gap-2 text-xs whitespace-nowrap max-sm:col-start-2 max-sm:row-start-1">
                  {letter.hasAttachments ? <Paperclip className="size-3" aria-label="Есть вложения" /> : null}
                  {letter.erp ? (
                    <span className="bg-primary/10 text-primary rounded px-1.5">
                      {letter.erp.customer ? "в переписке" : "в ERP"}
                    </span>
                  ) : null}
                  {letter.date ? formatMoscowDateTime(letter.date) : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <ListPagination
        page={letters.page}
        pageCount={letters.pageCount}
        total={letters.total}
        params={new URLSearchParams({ folder: path })}
        basePath="/mail/box"
        label="Всего писем"
      />
      <p className="text-muted-foreground text-xs">
        Жирным — непрочитанные в ящике. Метка «в переписке» — письмо уже в переписке клиента в ERP. По{" "}
        {MAILBOX_PAGE_SIZE} на странице.
      </p>
    </main>
  );
}
