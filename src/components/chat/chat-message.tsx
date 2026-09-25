"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { FileText, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { splitOrderLinks } from "@/domain/chat/order-links";
import { formatMoscowDateTime } from "@/domain/datetime";
import { cn } from "@/lib/utils";
import type { ChatActionResult } from "@/app/(app)/chat/actions";
import type { ChatAttachmentView, ChatMessageView } from "@/server/chat/service";

export function formatSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} КБ` : `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

/** Текст с номерами заказов-ссылками. Ссылка — только если такой заказ есть (решил сервер). */
function MessageText({ text, orderNumbers }: { text: string; orderNumbers: number[] }) {
  return (
    <p className="text-sm break-words whitespace-pre-wrap">
      {splitOrderLinks(text).map((segment, index) =>
        segment.type === "order" && orderNumbers.includes(segment.number) ? (
          <Link key={index} href={`/orders/${segment.number}`} className="text-primary font-medium hover:underline">
            {segment.text}
          </Link>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </p>
  );
}

function Attachment({ file }: { file: ChatAttachmentView }) {
  if (file.expired) {
    return (
      <span className="text-muted-foreground inline-flex items-center gap-1.5 rounded-md border border-dashed px-2 py-1 text-xs">
        <FileText className="size-4 shrink-0" />
        <span className="max-w-48 truncate">{file.fileName}</span> — удалён: прошёл год
      </span>
    );
  }
  const href = `/api/chat-attachments/${file.id}`;
  if (file.contentType.startsWith("image/")) {
    return (
      <a href={href} target="_blank" rel="noopener" className="block">
        {/* eslint-disable-next-line @next/next/no-img-element -- файл из нашего API, оптимизатор тут не нужен */}
        <img src={href} alt={file.fileName} className="max-h-48 max-w-64 rounded-md border object-contain" />
      </a>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      className="bg-background inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-sm hover:underline"
    >
      <FileText className="size-4 shrink-0" />
      <span className="max-w-48 truncate">{file.fileName}</span>
      <span className="text-muted-foreground text-xs whitespace-nowrap">{formatSize(file.byteSize)}</span>
    </a>
  );
}

/**
 * Одно сообщение ленты. Меню «…» — только если есть что делать: своё можно
 * исправить и удалить, администратор удаляет и чужое.
 */
export function ChatMessage({
  message,
  showAuthor,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
}: {
  message: ChatMessageView;
  /** Имя над сообщением — если предыдущее от другого человека или давно */
  showAuthor: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: (text: string) => Promise<ChatActionResult>;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.text);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const result = await onEdit(draft);
      if (result.ok) setEditing(false);
      else toast.error(result.error);
    });
  }

  const time = formatMoscowDateTime(new Date(message.createdAt));

  return (
    <div
      className={cn(
        "group hover:bg-muted/50 relative rounded-md px-2 py-1",
        (canEdit || canDelete) && !message.deleted && "pointer-coarse:pr-11",
        showAuthor && "mt-2",
      )}
    >
      {showAuthor ? (
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold">{message.author.name}</span>
          <span className="text-muted-foreground text-xs">{time}</span>
        </div>
      ) : null}

      {message.deleted ? (
        <p className="text-muted-foreground text-sm italic">Сообщение удалено</p>
      ) : editing ? (
        <div className="flex flex-col gap-2 py-1">
          <Textarea
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setEditing(false);
                setDraft(message.text);
              } else if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                save();
              }
            }}
            className="min-h-16"
          />
          <div className="flex gap-2">
            <Button size="sm" disabled={pending} onClick={save}>
              Сохранить
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => {
                setEditing(false);
                setDraft(message.text);
              }}
            >
              Отмена
            </Button>
          </div>
        </div>
      ) : (
        <>
          {message.text ? <MessageText text={message.text} orderNumbers={message.orderNumbers} /> : null}
          {message.attachments.length ? (
            <div className="flex flex-wrap items-end gap-2 py-1">
              {message.attachments.map((file) => (
                <Attachment key={file.id} file={file} />
              ))}
            </div>
          ) : null}
          {message.editedAt ? (
            <span className="text-muted-foreground text-xs" title={formatMoscowDateTime(new Date(message.editedAt))}>
              (изменено)
            </span>
          ) : null}
        </>
      )}

      {!showAuthor && !message.deleted ? (
        <span className="text-muted-foreground absolute top-1.5 right-10 hidden text-xs group-hover:inline">
          {time}
        </span>
      ) : null}

      {!message.deleted && !editing && (canEdit || canDelete) ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Действия с сообщением"
              className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 pointer-coarse:opacity-100"
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {canEdit ? (
              <DropdownMenuItem
                onSelect={() => {
                  setDraft(message.text);
                  setEditing(true);
                }}
              >
                <Pencil />
                Исправить
              </DropdownMenuItem>
            ) : null}
            {canDelete ? (
              <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                <Trash2 />
                Удалить
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}
