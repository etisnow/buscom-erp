import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Paperclip } from "lucide-react";
import { MailboxLetterActions } from "@/components/emails/mailbox-letter-actions";
import { formatMoscowDateTime } from "@/domain/datetime";
import { buildFolderTree, flattenFolderTree, SPECIAL_FOLDER_LABELS } from "@/domain/email/folders";
import { splitQuotedReply } from "@/domain/email/letters";
import { MAILBOX_ROLES } from "@/domain/user/role";
import { mailboxFolderList, readMailboxLetter } from "@/server/emails/mailbox-browser";
import { requirePageUser } from "@/server/session";
import { single } from "@/app/(app)/search-params";

export const metadata: Metadata = {
  title: "Письмо из ящика — BusCom ERP",
};

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
  return `${(bytes / 1024 / 1024).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} МБ`;
}

/** Письмо живого ящика целиком. Прочитанным его помечает открытие в браузере — как в Яндексе. */
export default async function MailboxLetterPage({ searchParams }: PageProps<"/mail/box/letter">) {
  await requirePageUser(MAILBOX_ROLES);
  const params = await searchParams;
  const folder = single(params.folder);
  const uid = Number(single(params.uid));
  if (!folder || !Number.isSafeInteger(uid) || uid <= 0) notFound();

  const [letter, folders] = await Promise.all([readMailboxLetter(folder, uid), mailboxFolderList()]);
  if (!letter) notFound();

  const { main, quoted } = splitQuotedReply(letter.body);
  const back = `/mail/box?folder=${encodeURIComponent(folder)}`;
  const folderOptions = flattenFolderTree(buildFolderTree(folders))
    .filter((item) => item.selectable)
    .map((item) => ({
      path: item.path,
      label: `${"· ".repeat(item.depth)}${(item.specialUse && SPECIAL_FOLDER_LABELS[item.specialUse]) || item.name}`,
    }));

  return (
    <main className="flex max-w-4xl flex-col gap-4">
      <Link href={back} className="text-muted-foreground inline-flex w-fit items-center gap-1 text-sm hover:underline">
        <ArrowLeft className="size-4" />К папке
      </Link>

      <article className="flex flex-col gap-3 rounded-lg border p-4">
        <h1 className="font-heading text-lg font-semibold">{letter.subject}</h1>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
          <dt className="text-muted-foreground">От</dt>
          <dd>
            {letter.from}
            {letter.fromEmail && letter.from !== letter.fromEmail ? (
              <span className="text-muted-foreground"> &lt;{letter.fromEmail}&gt;</span>
            ) : null}
          </dd>
          <dt className="text-muted-foreground">Кому</dt>
          <dd>{letter.to || "—"}</dd>
          {letter.cc ? (
            <>
              <dt className="text-muted-foreground">Копия</dt>
              <dd>{letter.cc}</dd>
            </>
          ) : null}
          <dt className="text-muted-foreground">Дата</dt>
          <dd>{letter.date ? formatMoscowDateTime(letter.date) : "—"}</dd>
        </dl>
        <p className="text-sm break-words whitespace-pre-line">{main || "(письмо без текста)"}</p>
        {quoted ? (
          <details className="group">
            <summary className="text-muted-foreground hover:text-foreground w-fit cursor-pointer list-none text-xs">
              <span className="group-open:hidden">··· Показать цитату</span>
              <span className="hidden group-open:inline">Скрыть цитату</span>
            </summary>
            <p className="text-muted-foreground mt-1 border-l-2 pl-3 text-sm break-words whitespace-pre-line">
              {quoted}
            </p>
          </details>
        ) : null}
        {letter.attachments.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {letter.attachments.map((file) => (
              <li key={file.part}>
                <a
                  href={`/api/mailbox/attachment?${new URLSearchParams({ folder, uid: String(uid), part: file.part })}`}
                  target="_blank"
                  rel="noopener"
                  className="hover:bg-muted inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs"
                >
                  <Paperclip className="size-3" />
                  {file.fileName} · {formatSize(file.size)}
                </a>
              </li>
            ))}
          </ul>
        ) : null}
      </article>

      <MailboxLetterActions folder={folder} uid={uid} folders={folderOptions} erp={letter.erp} seen={letter.seen} />
    </main>
  );
}
