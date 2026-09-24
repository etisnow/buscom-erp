import { Suspense } from "react";
import { MailboxFolderNav, MailNav } from "@/components/emails/mail-nav";
import { buildFolderTree, flattenFolderTree, SPECIAL_FOLDER_LABELS } from "@/domain/email/folders";
import { hasRole, MAILBOX_ROLES } from "@/domain/user/role";
import { mailboxFolders } from "@/server/emails/mailbox-browser";
import { mailboxCounts } from "@/server/emails/service";
import { resolveMailbox } from "@/server/integrations/mailbox";
import { requirePageUser } from "@/server/session";

/** Дерево папок живого ящика — отдельно, чтобы медленный IMAP не держал всю страницу. */
async function MailboxFolders() {
  const connection = await resolveMailbox();
  if (!connection) return null;
  let folders;
  try {
    folders = flattenFolderTree(buildFolderTree(await mailboxFolders())).map((folder) => ({
      path: folder.path,
      label: (folder.specialUse && SPECIAL_FOLDER_LABELS[folder.specialUse]) || folder.name,
      depth: folder.depth,
      messages: folder.messages,
      unseen: folder.unseen,
      selectable: folder.selectable,
    }));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return <p className="text-muted-foreground px-2 text-xs">Ящик сейчас недоступен: {reason}</p>;
  }
  return <MailboxFolderNav account={connection.user} folders={folders} />;
}

/**
 * «Почта»: слева переписка с клиентами в ERP и, для руководителя и администратора,
 * папки живого ящика — как в Яндексе (src/server/emails/mailbox-browser.ts).
 */
export default async function MailLayout({ children }: LayoutProps<"/mail">) {
  const user = await requirePageUser();
  const counts = await mailboxCounts();
  const showMailbox = hasRole(user.role, MAILBOX_ROLES);

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <aside className="flex shrink-0 flex-col gap-4 lg:sticky lg:top-18 lg:max-h-[calc(100vh-5.5rem)] lg:w-64 lg:overflow-y-auto">
        <Suspense fallback={null}>
          <MailNav counts={counts} />
        </Suspense>
        {showMailbox ? (
          <Suspense fallback={<p className="text-muted-foreground px-2 text-xs">Читаю папки ящика…</p>}>
            <MailboxFolders />
          </Suspense>
        ) : null}
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
