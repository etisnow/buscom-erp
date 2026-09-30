"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { FileText, MoreHorizontal, Pencil, Reply, SmilePlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ImageLightbox } from "@/components/ui/image-lightbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { EmojiPicker } from "@/components/chat/emoji-picker";
import { chatAvatar } from "@buscom/domain/chat/avatar";
import { splitOrderLinks } from "@buscom/domain/chat/order-links";
import { formatMoscowDateTime } from "@buscom/domain/datetime";
import { cn } from "@/lib/utils";
import type { ChatActionResult } from "@/app/(app)/chat/actions";
import type { ChatAttachmentView, ChatMessageView } from "@/server/chat/service";

/** Цвета фона аватарок; их столько же, сколько AVATAR_COLOR_COUNT в домене. Все — с белым текстом. */
const AVATAR_COLORS = [
  "bg-rose-600",
  "bg-orange-600",
  "bg-amber-700",
  "bg-lime-700",
  "bg-emerald-600",
  "bg-teal-600",
  "bg-sky-600",
  "bg-blue-600",
  "bg-indigo-600",
  "bg-violet-600",
  "bg-fuchsia-600",
  "bg-pink-700",
];

/** Кружок с двумя заглавными буквами слева от первого сообщения автора; цвет зависит от сотрудника. */
function AuthorAvatar({ author }: { author: { id: string; name: string } }) {
  const { initials, colorIndex } = chatAvatar(author);
  return (
    <span
      aria-hidden
      title={author.name}
      className={cn(
        "absolute top-1.5 left-2 flex size-8 items-center justify-center rounded-full text-xs font-semibold text-white select-none",
        AVATAR_COLORS[colorIndex],
      )}
    >
      {initials}
    </span>
  );
}

export function formatSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} КБ` : `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

/** Текст с номерами заказов-ссылками. Ссылка — только если такой заказ есть (решил сервер). */
function MessageText({ text, orderNumbers }: { text: string; orderNumbers: number[] }) {
  return (
    <p className="text-sm break-words whitespace-pre-wrap">
      {splitOrderLinks(text).map((segment, index) =>
        segment.type === "link" ? (
          <a
            key={index}
            href={segment.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary break-all underline underline-offset-2 hover:no-underline"
          >
            {segment.text}
          </a>
        ) : segment.type === "order" && orderNumbers.includes(segment.number) ? (
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
  const [viewing, setViewing] = useState<number | null>(null);
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
      <>
        <button type="button" onClick={() => setViewing(0)} title="Открыть на весь экран" className="block">
          {/* eslint-disable-next-line @next/next/no-img-element -- файл из нашего API, оптимизатор тут не нужен */}
          <img src={href} alt={file.fileName} className="max-h-48 max-w-64 rounded-md border object-contain" />
        </button>
        <ImageLightbox
          images={[{ src: href, alt: file.fileName, openHref: href }]}
          index={viewing}
          onIndexChange={setViewing}
        />
      </>
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
 * Одно сообщение ленты. Меню «…»: ответить — на любое, своё можно исправить
 * и удалить, администратор удаляет и чужое. Ответ показывает цитату исходного —
 * нажатие прокручивает к нему.
 */
export function ChatMessage({
  message,
  currentUserId,
  showAuthor,
  unread,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
  onReply,
  onReact,
  onJump,
}: {
  /** Ид того, кто смотрит ленту: свои реакции подсвечиваются */
  currentUserId: string;
  message: ChatMessageView;
  /** Имя над сообщением — если предыдущее от другого человека или давно */
  showAuthor: boolean;
  /** Своё сообщение, которое пока никто не прочитал — слегка затемнено */
  unread: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: (text: string) => Promise<ChatActionResult>;
  onDelete: () => void;
  onReply: () => void;
  /** Поставить реакцию или снять свою */
  onReact: (emoji: string) => void;
  /** Прокрутить к сообщению, на которое это — ответ */
  onJump: (id: string) => void;
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
      id={`msg-${message.id}`}
      className={cn(
        "group hover:bg-muted/50 relative scroll-mt-2 rounded-md py-1 pr-2 pl-12 transition-colors",
        unread && "bg-muted/60 hover:bg-muted/80",
        !message.deleted && "pointer-coarse:pr-[4.5rem]",
        showAuthor && "mt-2",
      )}
    >
      {showAuthor ? <AuthorAvatar author={message.author} /> : null}
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
          {message.replyTo ? (
            <button
              type="button"
              onClick={() => message.replyTo && onJump(message.replyTo.id)}
              className="border-primary/60 bg-muted/60 hover:bg-muted my-0.5 flex max-w-full flex-col rounded-r-md border-l-2 px-2 py-1 text-left text-xs"
            >
              <span className="text-primary font-medium">{message.replyTo.authorName}</span>
              <span className="text-muted-foreground line-clamp-2 break-words">{message.replyTo.preview}</span>
            </button>
          ) : null}
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
          {message.reactions.length ? (
            <div className="flex flex-wrap items-center gap-1 pt-1">
              {message.reactions.map((reaction) => {
                const mine = reaction.users.some((person) => person.id === currentUserId);
                return (
                  <button
                    key={reaction.emoji}
                    type="button"
                    onClick={() => onReact(reaction.emoji)}
                    title={reaction.users.map((person) => person.name).join(", ")}
                    aria-pressed={mine}
                    className={cn(
                      "hover:bg-muted flex h-6 items-center gap-1 rounded-full border px-2 text-xs",
                      mine && "border-primary/60 bg-primary/10",
                    )}
                  >
                    <span className="text-sm leading-none">{reaction.emoji}</span>
                    <span className="tabular-nums">{reaction.users.length}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </>
      )}

      {!showAuthor && !message.deleted ? (
        <span className="text-muted-foreground absolute top-1.5 right-16 hidden text-xs group-hover:inline">
          {time}
        </span>
      ) : null}

      {!message.deleted && !editing ? (
        <EmojiPicker
          onPick={onReact}
          closeOnPick
          side="bottom"
          trigger={
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Поставить реакцию"
              title="Поставить реакцию"
              className="absolute top-1 right-8 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 pointer-coarse:opacity-100"
            >
              <SmilePlus />
            </Button>
          }
        />
      ) : null}

      {!message.deleted && !editing ? (
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
            <DropdownMenuItem onSelect={onReply}>
              <Reply />
              Ответить
            </DropdownMenuItem>
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
