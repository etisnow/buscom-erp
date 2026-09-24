"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

const ERP_VIEWS = [
  { view: "inbox", href: "/mail", label: "Входящие от клиентов", count: "unread" },
  { view: "unlinked", href: "/mail?view=unlinked", label: "Без клиента", count: "unlinked" },
  { view: "sent", href: "/mail?view=sent", label: "Отправленные из ERP", count: null },
] as const;

export type NavFolder = {
  path: string;
  label: string;
  depth: number;
  messages: number | null;
  unseen: number | null;
  selectable: boolean;
};

const itemClass = (active: boolean) =>
  cn(
    "flex items-baseline justify-between gap-2 rounded-md px-2 py-1 text-sm",
    active ? "bg-primary/10 text-primary font-medium" : "hover:bg-accent",
  );

/**
 * Левая колонка «Почты»: вкладки ERP (переписка с клиентами) и папки живого
 * ящика — как в Яндексе. Клиентская только ради подсветки текущего пункта.
 */
export function MailNav({ counts }: { counts: { unread: number; unlinked: number } }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const view = pathname === "/mail" ? (params.get("view") ?? "inbox") : null;

  return (
    <nav aria-label="Переписка в ERP" className="flex flex-col gap-0.5">
      <div className="text-muted-foreground px-2 pb-1 text-xs font-medium tracking-wide uppercase">Переписка в ERP</div>
      {ERP_VIEWS.map((item) => (
        <Link
          key={item.view}
          href={item.href}
          className={itemClass(view === item.view)}
          aria-current={view === item.view ? "page" : undefined}
        >
          <span>{item.label}</span>
          {item.count && counts[item.count] ? <span className="text-xs tabular-nums">{counts[item.count]}</span> : null}
        </Link>
      ))}
    </nav>
  );
}

export function MailboxFolderNav({ account, folders }: { account: string; folders: NavFolder[] }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const current = pathname.startsWith("/mail/box") ? params.get("folder") : null;

  return (
    <nav aria-label="Папки ящика" className="flex flex-col gap-0.5">
      <div
        className="text-muted-foreground truncate px-2 pb-1 text-xs font-medium tracking-wide uppercase"
        title={account}
      >
        Ящик {account}
      </div>
      {folders.map((folder) =>
        folder.selectable ? (
          <Link
            key={folder.path}
            href={`/mail/box?folder=${encodeURIComponent(folder.path)}`}
            className={itemClass(current === folder.path)}
            style={{ paddingLeft: `${0.5 + folder.depth}rem` }}
            aria-current={current === folder.path ? "page" : undefined}
          >
            <span className={cn("truncate", folder.unseen ? "font-semibold" : undefined)}>{folder.label}</span>
            <span className="text-muted-foreground text-xs tabular-nums">
              {folder.unseen ? (
                <span className="text-foreground font-semibold">{folder.unseen.toLocaleString("ru-RU")}</span>
              ) : null}
              {folder.unseen && folder.messages ? " / " : ""}
              {folder.messages ? folder.messages.toLocaleString("ru-RU") : ""}
            </span>
          </Link>
        ) : (
          <div
            key={folder.path}
            className="text-muted-foreground px-2 py-1 text-sm"
            style={{ paddingLeft: `${0.5 + folder.depth}rem` }}
          >
            {folder.label}
          </div>
        ),
      )}
    </nav>
  );
}
