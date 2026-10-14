import "server-only";
import {
  assertAttachments,
  attachmentExpiryCutoff,
  canDeleteMessage,
  canEditMessage,
  ChatError,
  normalizeMessageText,
  replyPreview,
} from "@buscom/domain/chat/message";
import { orderNumbersIn } from "@buscom/domain/chat/order-links";
import { MAX_REACTION_KINDS, normalizeReaction } from "@buscom/domain/chat/reaction";
import { canDeleteRoom, canRenameRoom, GENERAL_CHAT_ROOM_ID, normalizeRoomName } from "@buscom/domain/chat/room";
import { detectDocumentType } from "@buscom/domain/order/supplier-document";
import { db } from "@/server/db";
import { ForbiddenError } from "@/server/errors";
import type { SessionUser } from "@/server/session";

/**
 * Чат сотрудников по комнатам. Лента комнаты обновляется опросом: клиент раз в несколько
 * секунд спрашивает её сообщения, изменённые после курсора (`updatedAt`), — так приходят
 * и новые, и исправленные, и удалённые. Отметка «прочитано» у каждого своя в каждой комнате.
 */

/** Страница истории: столько сообщений при открытии и при «Показать раньше». */
export const PAGE_SIZE = 50;
/**
 * Опрос берёт изменения с запасом назад от курсора. `updatedAt` ставится до коммита:
 * сообщение из медленной транзакции может оказаться видно позже соседа с более
 * поздним временем, и без запаса курсор проскочил бы его навсегда. Повторы клиент
 * отбрасывает по id.
 */
const POLL_OVERLAP_MS = 30_000;
/** Запас по времени на файлы до 15 МБ — как у документов заказа. */
const UPLOAD_TX = { timeout: 30_000 };

export type ChatAttachmentView = {
  id: string;
  fileName: string;
  byteSize: number;
  contentType: string;
  expired: boolean;
};

/** Реакция под сообщением: эмодзи и кто его поставил (в порядке постановки) */
export type ChatReactionView = { emoji: string; users: { id: string; name: string }[] };

export type ChatMessageView = {
  id: string;
  author: { id: string; name: string };
  text: string;
  createdAt: string;
  updatedAt: string;
  editedAt: string | null;
  deleted: boolean;
  attachments: ChatAttachmentView[];
  reactions: ChatReactionView[];
  /** Упомянутые в тексте номера, для которых заказ существует — их UI делает ссылками */
  orderNumbers: number[];
  /**
   * Цитата сообщения, на которое это — ответ. Снимок на момент выборки: если исходное
   * потом исправят, у тех, кто уже видит ленту, цитата обновится при следующей загрузке
   */
  replyTo: { id: string; authorName: string; preview: string } | null;
};

const messageSelect = {
  id: true,
  userId: true,
  text: true,
  createdAt: true,
  updatedAt: true,
  editedAt: true,
  deletedAt: true,
  user: { select: { id: true, name: true } },
  attachments: {
    select: { id: true, fileName: true, byteSize: true, contentType: true, expiredAt: true },
    orderBy: { createdAt: "asc" as const },
  },
  reactions: {
    select: { emoji: true, user: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" as const },
  },
  replyTo: {
    select: {
      id: true,
      text: true,
      deletedAt: true,
      user: { select: { name: true } },
      _count: { select: { attachments: true } },
    },
  },
};

type MessageRow = {
  id: string;
  text: string;
  createdAt: Date;
  updatedAt: Date;
  editedAt: Date | null;
  deletedAt: Date | null;
  user: { id: string; name: string };
  attachments: { id: string; fileName: string; byteSize: number; contentType: string; expiredAt: Date | null }[];
  reactions: { emoji: string; user: { id: string; name: string } }[];
  replyTo: {
    id: string;
    text: string;
    deletedAt: Date | null;
    user: { name: string };
    _count: { attachments: number };
  } | null;
};

/** Реакции по эмодзи: порядок — по первой постановке, люди внутри — по времени. */
function groupReactions(rows: MessageRow["reactions"]): ChatReactionView[] {
  const byEmoji = new Map<string, ChatReactionView>();
  for (const { emoji, user } of rows) {
    const group = byEmoji.get(emoji) ?? { emoji, users: [] };
    group.users.push(user);
    byEmoji.set(emoji, group);
  }
  return [...byEmoji.values()];
}

async function toViews(rows: MessageRow[]): Promise<ChatMessageView[]> {
  const mentioned = new Set(rows.flatMap((row) => (row.deletedAt ? [] : orderNumbersIn(row.text))));
  const existing = mentioned.size
    ? new Set(
        (
          await db.order.findMany({
            where: { number: { in: [...mentioned] }, deletedAt: null },
            select: { number: true },
          })
        ).map((order) => order.number),
      )
    : new Set<number>();

  return rows.map((row) => ({
    id: row.id,
    author: row.user,
    text: row.deletedAt ? "" : row.text,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    editedAt: row.editedAt?.toISOString() ?? null,
    deleted: row.deletedAt !== null,
    attachments: row.deletedAt
      ? []
      : row.attachments.map((file) => ({
          id: file.id,
          fileName: file.fileName,
          byteSize: file.byteSize,
          contentType: file.contentType,
          expired: file.expiredAt !== null,
        })),
    reactions: row.deletedAt ? [] : groupReactions(row.reactions),
    orderNumbers: row.deletedAt ? [] : orderNumbersIn(row.text).filter((number) => existing.has(number)),
    replyTo:
      row.replyTo && !row.deletedAt
        ? {
            id: row.replyTo.id,
            authorName: row.replyTo.user.name,
            preview: replyPreview({
              text: row.replyTo.text,
              attachmentCount: row.replyTo._count.attachments,
              deleted: row.replyTo.deletedAt !== null,
            }),
          }
        : null,
  }));
}

// --- Комнаты ---------------------------------------------------------------

export type ChatRoomView = {
  id: string;
  name: string;
  /** Кто создал; null — «Общий чат» или автор удалён */
  createdById: string | null;
  /** Чужие сообщения после отметки «прочитано» этого сотрудника */
  unread: number;
};

/** Непрочитанные по комнатам одним запросом: у каждой комнаты своя отметка «прочитано». */
async function unreadByRoom(userId: string, roomIds: string[]): Promise<Map<string, number>> {
  if (!roomIds.length) return new Map();
  const reads = await db.chatRoomRead.findMany({
    where: { userId, roomId: { in: roomIds } },
    select: { roomId: true, readAt: true },
  });
  const readAt = new Map(reads.map((read) => [read.roomId, read.readAt]));
  const groups = await db.chatMessage.groupBy({
    by: ["roomId"],
    where: {
      userId: { not: userId },
      deletedAt: null,
      OR: roomIds.map((roomId) => {
        const mark = readAt.get(roomId);
        return mark ? { roomId, createdAt: { gt: mark } } : { roomId };
      }),
    },
    _count: { _all: true },
  });
  return new Map(groups.map((group) => [group.roomId, group._count._all]));
}

/** Комнаты для списка слева: «Общий чат» первым, остальные — в порядке создания. */
export async function listChatRooms(userId: string): Promise<ChatRoomView[]> {
  const rooms = await db.chatRoom.findMany({
    where: { deletedAt: null },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, name: true, createdById: true },
  });
  const unread = await unreadByRoom(
    userId,
    rooms.map((room) => room.id),
  );
  return rooms
    .map((room) => ({ ...room, unread: unread.get(room.id) ?? 0 }))
    .sort((a, b) => Number(b.id === GENERAL_CHAT_ROOM_ID) - Number(a.id === GENERAL_CHAT_ROOM_ID));
}

/** Комната для страницы; удалённой для системы нет. */
export async function findChatRoom(
  id: string,
): Promise<{ id: string; name: string; createdById: string | null } | null> {
  return db.chatRoom.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, name: true, createdById: true },
  });
}

async function requireRoom(id: string) {
  const room = await findChatRoom(id);
  if (!room) throw new ChatError("Комната не найдена — возможно, её удалили");
  return room;
}

export async function createChatRoom(user: SessionUser, name: string): Promise<{ id: string }> {
  return db.chatRoom.create({
    data: { name: normalizeRoomName(name), createdById: user.id },
    select: { id: true },
  });
}

export async function renameChatRoom(id: string, name: string, user: SessionUser): Promise<void> {
  const room = await requireRoom(id);
  if (!canRenameRoom(room, user)) {
    throw new ForbiddenError("Переименовать комнату может тот, кто её создал, или администратор");
  }
  await db.chatRoom.update({ where: { id }, data: { name: normalizeRoomName(name) }, select: { id: true } });
}

/** Удаление мягкое: комната пропадает из списка, сообщения остаются в базе. */
export async function deleteChatRoom(id: string, user: SessionUser): Promise<void> {
  const room = await requireRoom(id);
  if (!canDeleteRoom(room, user)) {
    throw new ForbiddenError(
      room.id === GENERAL_CHAT_ROOM_ID
        ? "«Общий чат» удалить нельзя"
        : "Удалить комнату может тот, кто её создал, или администратор",
    );
  }
  await db.chatRoom.update({ where: { id }, data: { deletedAt: new Date() }, select: { id: true } });
}

// --- Сообщения -------------------------------------------------------------

/**
 * Последние сообщения комнаты (или предшествующие сообщению `beforeId`) в порядке времени.
 * `hasMore` — есть ли что показать ещё раньше.
 */
export async function listChatMessages(
  roomId: string,
  beforeId?: string,
): Promise<{ messages: ChatMessageView[]; hasMore: boolean }> {
  let before: Date | undefined;
  if (beforeId) {
    const anchor = await db.chatMessage.findFirst({ where: { id: beforeId, roomId }, select: { createdAt: true } });
    if (!anchor) return { messages: [], hasMore: false };
    before = anchor.createdAt;
  }

  const rows = await db.chatMessage.findMany({
    where: { roomId, ...(before ? { createdAt: { lt: before } } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: PAGE_SIZE + 1,
    select: messageSelect,
  });
  const hasMore = rows.length > PAGE_SIZE;
  return { messages: await toViews(rows.slice(0, PAGE_SIZE).reverse()), hasMore };
}

/** Новые, исправленные и удалённые в комнате с момента `since` (с запасом, см. POLL_OVERLAP_MS). */
export async function chatChangesSince(roomId: string, since: Date): Promise<ChatMessageView[]> {
  const rows = await db.chatMessage.findMany({
    where: { roomId, updatedAt: { gte: new Date(since.getTime() - POLL_OVERLAP_MS) } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 500,
    select: messageSelect,
  });
  return toViews(rows);
}

export type ChatFileInput = { fileName: string; data: Uint8Array<ArrayBuffer> };

export async function postChatMessage(
  user: SessionUser,
  roomId: string,
  text: string,
  files: ChatFileInput[],
  replyToId: string | null = null,
): Promise<ChatMessageView> {
  assertAttachments(files.map((file) => ({ byteSize: file.data.byteLength })));
  const normalized = normalizeMessageText(text, files.length);
  await requireRoom(roomId);
  if (replyToId) {
    const original = await db.chatMessage.findUnique({
      where: { id: replyToId },
      select: { deletedAt: true, roomId: true },
    });
    if (!original || original.roomId !== roomId) throw new ChatError("Сообщение, на которое вы отвечаете, не найдено");
    if (original.deletedAt) throw new ChatError("Сообщение, на которое вы отвечаете, удалено");
  }

  const row = await db.$transaction(async (tx) => {
    const created = await tx.chatMessage.create({
      data: {
        roomId,
        userId: user.id,
        text: normalized,
        replyToId,
        attachments: {
          create: files.map((file) => ({
            fileName: file.fileName,
            // Тип — по содержимому: имени и Content-Type из формы не доверяем.
            // Неузнанное отдаётся только скачиванием (маршрут /api/chat-attachments)
            contentType: detectDocumentType(file.data) ?? "application/octet-stream",
            byteSize: file.data.byteLength,
            data: file.data,
          })),
        },
      },
      select: messageSelect,
    });
    // Кто пишет в комнату, видит её ленту: всё до его сообщения прочитано.
    await tx.chatRoomRead.upsert({
      where: { roomId_userId: { roomId, userId: user.id } },
      create: { roomId, userId: user.id, readAt: created.createdAt },
      update: { readAt: created.createdAt },
      select: { roomId: true },
    });
    return created;
  }, UPLOAD_TX);

  const [view] = await toViews([row]);
  return view;
}

async function loadMessage(id: string) {
  const message = await db.chatMessage.findUnique({ where: { id }, select: { userId: true, deletedAt: true } });
  if (!message) throw new ChatError("Сообщение не найдено");
  return message;
}

export async function editChatMessage(id: string, text: string, user: SessionUser): Promise<void> {
  const message = await loadMessage(id);
  if (!canEditMessage(message, user)) throw new ForbiddenError("Исправить можно только своё сообщение");
  const attachmentCount = await db.chatAttachment.count({ where: { messageId: id } });
  const normalized = normalizeMessageText(text, attachmentCount);
  await db.chatMessage.update({
    where: { id },
    data: { text: normalized, editedAt: new Date() },
    select: { id: true },
  });
}

/**
 * Поставить реакцию или снять, если она уже стоит. `updatedAt` сообщения обновляется в той же
 * транзакции — по нему опрос ленты приносит изменение остальным. Возвращает сообщение как оно
 * теперь выглядит, чтобы автор нажатия увидел результат сразу.
 */
export async function toggleChatReaction(id: string, emoji: string, user: SessionUser): Promise<ChatMessageView> {
  const value = normalizeReaction(emoji);
  const message = await loadMessage(id);
  if (message.deletedAt) throw new ChatError("Сообщение удалено");

  const row = await db.$transaction(async (tx) => {
    const key = { messageId_userId_emoji: { messageId: id, userId: user.id, emoji: value } };
    const existing = await tx.chatReaction.findUnique({ where: key, select: { id: true } });
    if (existing) {
      await tx.chatReaction.delete({ where: key });
    } else {
      const kinds = await tx.chatReaction.groupBy({ by: ["emoji"], where: { messageId: id } });
      if (kinds.length >= MAX_REACTION_KINDS && !kinds.some((kind) => kind.emoji === value)) {
        throw new ChatError(`На сообщении не больше ${MAX_REACTION_KINDS} разных реакций`);
      }
      await tx.chatReaction.create({ data: { messageId: id, userId: user.id, emoji: value } });
    }
    return tx.chatMessage.update({ where: { id }, data: { updatedAt: new Date() }, select: messageSelect });
  });

  const [view] = await toViews([row]);
  return view;
}

/** Удаление мягкое: строка остаётся с пометкой, текст и файлы стираются. */
export async function deleteChatMessage(id: string, user: SessionUser): Promise<void> {
  const message = await loadMessage(id);
  if (!canDeleteMessage(message, user)) throw new ForbiddenError("Удалить можно только своё сообщение");
  await db.$transaction([
    db.chatAttachment.deleteMany({ where: { messageId: id } }),
    db.chatReaction.deleteMany({ where: { messageId: id } }),
    db.chatMessage.update({ where: { id }, data: { text: "", deletedAt: new Date() }, select: { id: true } }),
  ]);
}

/**
 * Комната прочитана до `upTo` — времени последнего сообщения, которое сотрудник в ней увидел.
 * Отметка только двигается вперёд и не дальше текущего момента.
 */
export async function markChatRead(user: SessionUser, roomId: string, upTo: Date): Promise<void> {
  const now = new Date();
  const mark = upTo > now ? now : upTo;
  const { count } = await db.chatRoomRead.updateMany({
    where: { roomId, userId: user.id, readAt: { lt: mark } },
    data: { readAt: mark },
  });
  if (count) return;
  // Строки нет (комнату открыл впервые) — заводим; если она есть и новее, повтор ничего не меняет
  if (!(await findChatRoom(roomId))) return;
  await db.chatRoomRead.createMany({ data: [{ roomId, userId: user.id, readAt: mark }], skipDuplicates: true });
}

/** Чужие сообщения после отметки «прочитано» — во всех комнатах вместе, для значка у пункта меню. */
export async function unreadChatCount(userId: string): Promise<number> {
  const rooms = await db.chatRoom.findMany({ where: { deletedAt: null }, select: { id: true } });
  const unread = await unreadByRoom(
    userId,
    rooms.map((room) => room.id),
  );
  return [...unread.values()].reduce((sum, count) => sum + count, 0);
}

/** Байты файла для маршрута `/api/chat-attachments/[id]`. null — нет или срок хранения вышел. */
export async function readChatAttachment(
  id: string,
): Promise<{ data: Uint8Array; contentType: string; fileName: string } | null> {
  const file = await db.chatAttachment.findUnique({
    where: { id },
    select: { data: true, contentType: true, fileName: true },
  });
  if (!file?.data) return null;
  return { data: file.data, contentType: file.contentType, fileName: file.fileName };
}

/** Стирает байты файлов старше года. Запись о файле остаётся. */
export async function purgeExpiredChatAttachments(now: Date = new Date()): Promise<number> {
  const { count } = await db.chatAttachment.updateMany({
    where: { createdAt: { lt: attachmentExpiryCutoff(now) }, expiredAt: null },
    data: { data: null, expiredAt: now },
  });
  return count;
}

/**
 * До какого момента комнату прочитал хоть кто-то из других сотрудников — самая поздняя отметка
 * «прочитано» среди действующих. Своё сообщение старше этого момента кто-то уже видел;
 * новее — его пока не читал никто, и лента подсвечивает такие сообщения.
 */
export async function othersChatReadAt(roomId: string, userId: string): Promise<string | null> {
  const row = await db.chatRoomRead.aggregate({
    where: { roomId, userId: { not: userId }, user: { isActive: true } },
    _max: { readAt: true },
  });
  return row._max.readAt?.toISOString() ?? null;
}
