"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Hash, Loader2, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { CHAT_ROOMS_EVENT, CHAT_UNREAD_EVENT } from "@/components/chat/events";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { canDeleteRoom, canRenameRoom, chatRoomHref, MAX_ROOM_NAME } from "@buscom/domain/chat/room";
import type { UserRole } from "@buscom/db/enums";
import { cn } from "@/lib/utils";
import { createChatRoomAction, deleteChatRoomAction, renameChatRoomAction } from "@/app/(app)/chat/actions";
import type { ChatRoomView } from "@/server/chat/service";

type Room = { id: string; name: string; createdById: string | null };

function UnreadBadge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="bg-primary text-primary-foreground ml-auto min-w-5 shrink-0 rounded-full px-1.5 text-center text-xs leading-5 font-medium">
      {count > 99 ? "99+" : count}
    </span>
  );
}

/**
 * Комнаты чата: на компьютере — колонка слева от ленты, на телефоне — строка над ней.
 * Непрочитанные приходят с опросом ленты (событие CHAT_ROOMS_EVENT); у открытой комнаты их нет —
 * её читают сейчас. Меню «…» у открытой комнаты — переименовать и удалить, если можно.
 */
export function ChatRooms({
  initialRooms,
  current,
  user,
}: {
  initialRooms: ChatRoomView[];
  current: Room;
  user: { id: string; role: UserRole };
}) {
  const router = useRouter();
  const [rooms, setRooms] = useState(initialRooms);
  const [dialog, setDialog] = useState<"create" | "rename" | "delete" | null>(null);
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();

  // Сервер прислал список заново (переход, переименование) — он свежее того, что принёс опрос
  const [serverRooms, setServerRooms] = useState(initialRooms);
  if (serverRooms !== initialRooms) {
    setServerRooms(initialRooms);
    setRooms(initialRooms);
  }

  useEffect(() => {
    const onRooms = (event: Event) => setRooms((event as CustomEvent<ChatRoomView[]>).detail);
    window.addEventListener(CHAT_ROOMS_EVENT, onRooms);
    return () => window.removeEventListener(CHAT_ROOMS_EVENT, onRooms);
  }, []);

  // Значок у пункта меню — непрочитанное в остальных комнатах: открытую сотрудник читает сейчас
  useEffect(() => {
    const total = rooms.reduce((sum, room) => sum + (room.id === current.id ? 0 : room.unread), 0);
    window.dispatchEvent(new CustomEvent(CHAT_UNREAD_EVENT, { detail: total }));
  }, [rooms, current.id]);

  const canRename = canRenameRoom(current, user);
  const canDelete = canDeleteRoom(current, user);

  function open(kind: "create" | "rename" | "delete") {
    setName(kind === "rename" ? current.name : "");
    setDialog(kind);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      if (dialog === "create") {
        const result = await createChatRoomAction(name);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        setDialog(null);
        router.push(chatRoomHref(result.id));
      } else if (dialog === "rename") {
        const result = await renameChatRoomAction({ id: current.id, name });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        setDialog(null);
        router.refresh();
      }
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteChatRoomAction(current.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setDialog(null);
      toast.success(`Комната «${current.name}» удалена`);
      router.push("/chat");
    });
  }

  const menu =
    canRename || canDelete ? (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-xs" aria-label="Действия с комнатой" className="shrink-0">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canRename ? (
            <DropdownMenuItem onSelect={() => open("rename")}>
              <Pencil />
              Переименовать
            </DropdownMenuItem>
          ) : null}
          {canDelete ? (
            <DropdownMenuItem variant="destructive" onSelect={() => open("delete")}>
              <Trash2 />
              Удалить комнату
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    ) : null;

  return (
    <>
      {/* Компьютер: колонка комнат */}
      <nav
        aria-label="Комнаты чата"
        className="bg-card flex w-60 shrink-0 flex-col gap-1 overflow-y-auto rounded-lg border p-2 max-md:hidden"
      >
        <div className="flex items-center justify-between px-2 py-1">
          <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Комнаты</span>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Новая комната"
            title="Новая комната"
            onClick={() => open("create")}
          >
            <Plus />
          </Button>
        </div>
        {rooms.map((room) => {
          const active = room.id === current.id;
          return (
            <div
              key={room.id}
              className={cn(
                "flex items-center gap-1 rounded-md pr-1 text-sm",
                active ? "bg-accent text-accent-foreground font-medium" : "hover:bg-accent/60",
              )}
            >
              <Link
                href={chatRoomHref(room.id)}
                aria-current={active ? "page" : undefined}
                className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 pl-2"
              >
                <Hash className="text-muted-foreground size-4 shrink-0" />
                <span className="truncate">{room.name}</span>
                <UnreadBadge count={active ? 0 : room.unread} />
              </Link>
              {active ? menu : null}
            </div>
          );
        })}
      </nav>

      {/* Телефон: комнаты строкой над лентой, прокручиваются вбок */}
      <nav aria-label="Комнаты чата" className="bg-card flex items-center gap-1 border-b px-2 py-1.5 md:hidden">
        <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
          {rooms.map((room) => {
            const active = room.id === current.id;
            return (
              <Link
                key={room.id}
                href={chatRoomHref(room.id)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-sm whitespace-nowrap",
                  active ? "bg-primary text-primary-foreground border-primary" : "bg-background",
                )}
              >
                {room.name}
                <UnreadBadge count={active ? 0 : room.unread} />
              </Link>
            );
          })}
        </div>
        <Button variant="ghost" size="icon-sm" aria-label="Новая комната" onClick={() => open("create")}>
          <Plus />
        </Button>
        {menu}
      </nav>

      <Dialog open={dialog === "create" || dialog === "rename"} onOpenChange={(value) => !value && setDialog(null)}>
        <DialogContent>
          <form onSubmit={submit} className="contents">
            <DialogHeader>
              <DialogTitle>{dialog === "rename" ? "Переименовать комнату" : "Новая комната"}</DialogTitle>
              <DialogDescription>
                {dialog === "rename"
                  ? "Новое название увидят все сотрудники."
                  : "Комната видна всем сотрудникам: в ней можно вести отдельный разговор — по складу, поставщику, задаче."}
              </DialogDescription>
            </DialogHeader>
            <Input
              autoFocus
              value={name}
              maxLength={MAX_ROOM_NAME}
              placeholder="Например, Склад"
              aria-label="Название комнаты"
              onChange={(event) => setName(event.target.value)}
            />
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" size="sm">
                  Отмена
                </Button>
              </DialogClose>
              <Button type="submit" size="sm" disabled={pending || !name.trim()}>
                {pending ? <Loader2 className="animate-spin" /> : null}
                {dialog === "rename" ? "Сохранить" : "Создать"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "delete"} onOpenChange={(value) => !value && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Удалить комнату «{current.name}»?</DialogTitle>
            <DialogDescription>
              Комната пропадёт из списка у всех сотрудников вместе с перепиской. Вернуть её из ERP нельзя.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm">
                Отмена
              </Button>
            </DialogClose>
            <Button size="sm" variant="destructive" disabled={pending} onClick={remove}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              Удалить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
