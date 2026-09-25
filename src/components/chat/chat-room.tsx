"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useTransition, type DragEvent } from "react";
import { Loader2, Paperclip, Send, X } from "lucide-react";
import { toast } from "sonner";
import { ChatMessage, formatSize } from "@/components/chat/chat-message";
import { CHAT_UNREAD_EVENT } from "@/components/chat/events";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useCoarsePointer } from "@/hooks/use-mobile";
import { canDeleteMessage, canEditMessage, MAX_ATTACHMENTS } from "@/domain/chat/message";
import type { UserRole } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";
import {
  deleteChatMessageAction,
  editChatMessageAction,
  markChatReadAction,
  sendChatMessageAction,
} from "@/app/(app)/chat/actions";
import type { ChatMessageView } from "@/server/chat/service";

/** Раз в столько опрашиваем ленту, пока вкладка видна. */
const POLL_MS = 4_000;
/** Имя автора повторяется, если между его сообщениями прошло больше этого. */
const GROUP_GAP_MS = 5 * 60_000;
/** Отступ от низа, в пределах которого лента «прилипает» к новым сообщениям. */
const STICK_PX = 80;

function byTime(a: ChatMessageView, b: ChatMessageView): number {
  return a.createdAt === b.createdAt ? a.id.localeCompare(b.id) : a.createdAt.localeCompare(b.createdAt);
}

/** Сливает пришедшие сообщения в ленту: новые добавляются, изменённые заменяются по id. */
function merge(current: ChatMessageView[], incoming: ChatMessageView[]): ChatMessageView[] {
  if (!incoming.length) return current;
  const byId = new Map(current.map((message) => [message.id, message]));
  let changed = false;
  for (const message of incoming) {
    const existing = byId.get(message.id);
    if (existing && existing.updatedAt >= message.updatedAt) continue;
    byId.set(message.id, message);
    changed = true;
  }
  return changed ? [...byId.values()].sort(byTime) : current;
}

const hasFiles = (event: DragEvent) => event.dataTransfer.types.includes("Files");

export function ChatRoom({
  initialMessages,
  initialHasMore,
  initialCursor,
  user,
}: {
  initialMessages: ChatMessageView[];
  initialHasMore: boolean;
  /** Время сервера на момент загрузки страницы — с него начинается опрос */
  initialCursor: string;
  user: { id: string; role: UserRole };
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [sending, startSending] = useTransition();
  // На экранной клавиатуре Enter — перевод строки, как в мессенджерах; отправка — кнопкой
  const touch = useCoarsePointer();

  const cursor = useRef(initialCursor);
  const scroller = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  /** Прокрутить вниз после следующей отрисовки — лента была у низа или отправили своё */
  const stickToBottom = useRef(true);
  /** Высота ленты до подгрузки истории — чтобы экран не прыгнул */
  const heightBeforeOlder = useRef<number | null>(null);
  const lastReadMark = useRef<string | null>(null);

  const nearBottom = () => {
    const el = scroller.current;
    return !el || el.scrollHeight - el.scrollTop - el.clientHeight < STICK_PX;
  };

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (heightBeforeOlder.current !== null) {
      el.scrollTop += el.scrollHeight - heightBeforeOlder.current;
      heightBeforeOlder.current = null;
    } else if (stickToBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  /** Отметить прочитанным всё, что видно, — только когда вкладка на экране. */
  const markRead = useCallback((list: ChatMessageView[]) => {
    const last = list.at(-1)?.createdAt;
    if (!last || document.visibilityState !== "visible" || lastReadMark.current === last) return;
    lastReadMark.current = last;
    void markChatReadAction(last);
    window.dispatchEvent(new CustomEvent(CHAT_UNREAD_EVENT, { detail: 0 }));
  }, []);

  const poll = useCallback(async () => {
    try {
      const response = await fetch(`/api/chat/messages?since=${encodeURIComponent(cursor.current)}`, {
        cache: "no-store",
      });
      if (!response.ok) return;
      const data = (await response.json()) as { messages: ChatMessageView[]; serverTime: string };
      cursor.current = data.serverTime;
      stickToBottom.current = nearBottom();
      setMessages((current) => merge(current, data.messages));
      markRead(data.messages);
    } catch {
      // Сеть моргнула — следующий опрос попробует снова.
    }
  }, [markRead]);

  useEffect(() => {
    markRead(initialMessages);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void poll();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [initialMessages, markRead, poll]);

  async function loadOlder() {
    const first = messages[0];
    if (!first || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const response = await fetch(`/api/chat/messages?before=${encodeURIComponent(first.id)}`, { cache: "no-store" });
      if (!response.ok) throw new Error();
      const data = (await response.json()) as { messages: ChatMessageView[]; hasMore: boolean };
      heightBeforeOlder.current = scroller.current?.scrollHeight ?? null;
      setMessages((current) => merge(current, data.messages));
      setHasMore(data.hasMore);
    } catch {
      toast.error("Не удалось загрузить историю");
    } finally {
      setLoadingOlder(false);
    }
  }

  function addFiles(list: FileList | File[]) {
    const incoming = [...list];
    if (!incoming.length) return;
    setFiles((current) => {
      const next = [...current, ...incoming];
      if (next.length > MAX_ATTACHMENTS) toast.info(`Не больше ${MAX_ATTACHMENTS} файлов в сообщении`);
      return next.slice(0, MAX_ATTACHMENTS);
    });
  }

  function send() {
    if (sending || (!text.trim() && !files.length)) return;
    const form = new FormData();
    form.set("text", text);
    for (const file of files) form.append("files", file);
    startSending(async () => {
      const result = await sendChatMessageAction(form);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setText("");
      setFiles([]);
      stickToBottom.current = true;
      setMessages((current) => merge(current, [result.message]));
      lastReadMark.current = result.message.createdAt;
      textarea.current?.focus();
    });
  }

  async function edit(id: string, draft: string) {
    const result = await editChatMessageAction({ id, text: draft });
    if (result.ok) void poll();
    return result;
  }

  async function remove(id: string) {
    const result = await deleteChatMessageAction(id);
    if (result.ok) void poll();
    else toast.error(result.error);
  }

  return (
    <div
      className={cn(
        "bg-card relative flex min-h-0 flex-1 flex-col rounded-lg border",
        dragging && "border-primary bg-primary/5",
      )}
      onDragOver={(event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        setDragging(false);
        addFiles(event.dataTransfer.files);
      }}
    >
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto p-2">
        {hasMore ? (
          <div className="flex justify-center py-2">
            <Button variant="outline" size="sm" disabled={loadingOlder} onClick={() => void loadOlder()}>
              {loadingOlder ? <Loader2 className="animate-spin" /> : null}
              Показать раньше
            </Button>
          </div>
        ) : null}
        {messages.length === 0 ? (
          <p className="text-muted-foreground py-10 text-center text-sm">
            Сообщений пока нет. Номер заказа вида №3021 или #3021 станет ссылкой на карточку.
          </p>
        ) : null}
        {messages.map((message, index) => {
          const previous = messages[index - 1];
          const showAuthor =
            !previous ||
            previous.author.id !== message.author.id ||
            new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime() > GROUP_GAP_MS;
          const owner = { userId: message.author.id, deletedAt: message.deleted ? new Date(0) : null };
          return (
            <ChatMessage
              key={message.id}
              message={message}
              showAuthor={showAuthor}
              canEdit={canEditMessage(owner, user)}
              canDelete={canDeleteMessage(owner, user)}
              onEdit={(draft) => edit(message.id, draft)}
              onDelete={() => setToDelete(message.id)}
            />
          );
        })}
      </div>

      <div className="flex flex-col gap-2 border-t p-2">
        {files.length ? (
          <div className="flex flex-wrap gap-2">
            {files.map((file, index) => (
              <span
                key={`${file.name}-${index}`}
                className="bg-muted inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs"
              >
                <span className="max-w-40 truncate">{file.name}</span>
                <span className="text-muted-foreground">{formatSize(file.size)}</span>
                <button
                  type="button"
                  aria-label={`Убрать ${file.name}`}
                  className="hover:text-destructive"
                  onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        ) : null}
        <div className="flex items-end gap-2">
          <input
            ref={fileInput}
            type="file"
            multiple
            className="hidden"
            onChange={(event) => {
              if (event.target.files) addFiles(event.target.files);
              event.target.value = "";
            }}
          />
          <Button
            variant="ghost"
            size="icon"
            aria-label="Прикрепить файлы"
            title="Прикрепить файлы (или перетащите их в чат)"
            disabled={sending}
            onClick={() => fileInput.current?.click()}
          >
            <Paperclip />
          </Button>
          <Textarea
            ref={textarea}
            value={text}
            placeholder={touch ? "Сообщение…" : "Сообщение… Enter — отправить, Shift+Enter — новая строка"}
            className="max-h-48 min-h-9 flex-1 resize-none"
            rows={1}
            onChange={(event) => setText(event.target.value)}
            onPaste={(event) => {
              if (event.clipboardData.files.length) {
                event.preventDefault();
                addFiles(event.clipboardData.files);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !touch && !event.nativeEvent.isComposing) {
                event.preventDefault();
                send();
              }
            }}
          />
          <Button
            size="icon"
            aria-label="Отправить"
            disabled={sending || (!text.trim() && !files.length)}
            onClick={send}
          >
            {sending ? <Loader2 className="animate-spin" /> : <Send />}
          </Button>
        </div>
      </div>

      <Dialog open={toDelete !== null} onOpenChange={(open) => !open && setToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Удалить сообщение?</DialogTitle>
            <DialogDescription>
              Текст и файлы сообщения сотрутся без возможности вернуть. В ленте останется пометка «Сообщение удалено».
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm">
                Отмена
              </Button>
            </DialogClose>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                const id = toDelete;
                setToDelete(null);
                if (id) void remove(id);
              }}
            >
              Удалить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
