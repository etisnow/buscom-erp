/**
 * Комнаты чата сотрудников: название, адрес страницы, кто переименовывает и удаляет.
 * Комнаты открыты всем сотрудникам — участников и приглашений нет.
 */
import type { UserRole } from "@buscom/db/enums";
import { ChatError } from "./message";

/** «Общий чат»: заведён миграцией, в него перенесено всё, что было в чате до комнат. Не удаляется. */
export const GENERAL_CHAT_ROOM_ID = "chat_room_general";
export const MAX_ROOM_NAME = 60;

/** Название без лишних пробелов; пустое и слишком длинное не принимается. */
export function normalizeRoomName(name: string): string {
  const normalized = name.replace(/\s+/g, " ").trim();
  if (!normalized) throw new ChatError("Введите название комнаты");
  if (normalized.length > MAX_ROOM_NAME) throw new ChatError(`Название длиннее ${MAX_ROOM_NAME} символов`);
  return normalized;
}

/** Страница комнаты. «Общий чат» живёт на `/chat` — туда же ведут старые ссылки и «Написать в чат». */
export function chatRoomHref(roomId: string): string {
  return roomId === GENERAL_CHAT_ROOM_ID ? "/chat" : `/chat/${encodeURIComponent(roomId)}`;
}

type RoomOwner = { id: string; createdById: string | null };
type Actor = { id: string; role: UserRole };

/** Переименовать — тот, кто создал комнату, и администратор (он же — «Общий чат»). */
export function canRenameRoom(room: RoomOwner, user: Actor): boolean {
  return user.role === "ADMIN" || (room.createdById !== null && room.createdById === user.id);
}

/** Удалить — так же, но «Общий чат» не удаляется никем. */
export function canDeleteRoom(room: RoomOwner, user: Actor): boolean {
  return room.id !== GENERAL_CHAT_ROOM_ID && canRenameRoom(room, user);
}
