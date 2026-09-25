import "server-only";
import {
  assertAttachments,
  attachmentExpiryCutoff,
  canDeleteMessage,
  canEditMessage,
  ChatError,
  normalizeMessageText,
} from "@/domain/chat/message";
import { orderNumbersIn } from "@/domain/chat/order-links";
import { detectDocumentType } from "@/domain/order/supplier-document";
import { db } from "@/server/db";
import { ForbiddenError } from "@/server/errors";
import type { SessionUser } from "@/server/session";

/**
 * Общий чат сотрудников. Лента обновляется опросом: клиент раз в несколько секунд
 * спрашивает сообщения, изменённые после курсора (`updatedAt`), — так приходят
 * и новые, и исправленные, и удалённые.
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

export type ChatMessageView = {
  id: string;
  author: { id: string; name: string };
  text: string;
  createdAt: string;
  updatedAt: string;
  editedAt: string | null;
  deleted: boolean;
  attachments: ChatAttachmentView[];
  /** Упомянутые в тексте номера, для которых заказ существует — их UI делает ссылками */
  orderNumbers: number[];
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
};

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
    orderNumbers: row.deletedAt ? [] : orderNumbersIn(row.text).filter((number) => existing.has(number)),
  }));
}

/**
 * Последние сообщения (или предшествующие сообщению `beforeId`) в порядке времени.
 * `hasMore` — есть ли что показать ещё раньше.
 */
export async function listChatMessages(beforeId?: string): Promise<{ messages: ChatMessageView[]; hasMore: boolean }> {
  let before: Date | undefined;
  if (beforeId) {
    const anchor = await db.chatMessage.findUnique({ where: { id: beforeId }, select: { createdAt: true } });
    if (!anchor) return { messages: [], hasMore: false };
    before = anchor.createdAt;
  }

  const rows = await db.chatMessage.findMany({
    where: before ? { createdAt: { lt: before } } : {},
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: PAGE_SIZE + 1,
    select: messageSelect,
  });
  const hasMore = rows.length > PAGE_SIZE;
  return { messages: await toViews(rows.slice(0, PAGE_SIZE).reverse()), hasMore };
}

/** Новые, исправленные и удалённые с момента `since` (с запасом, см. POLL_OVERLAP_MS). */
export async function chatChangesSince(since: Date): Promise<ChatMessageView[]> {
  const rows = await db.chatMessage.findMany({
    where: { updatedAt: { gte: new Date(since.getTime() - POLL_OVERLAP_MS) } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 500,
    select: messageSelect,
  });
  return toViews(rows);
}

export type ChatFileInput = { fileName: string; data: Uint8Array<ArrayBuffer> };

export async function postChatMessage(
  user: SessionUser,
  text: string,
  files: ChatFileInput[],
): Promise<ChatMessageView> {
  assertAttachments(files.map((file) => ({ byteSize: file.data.byteLength })));
  const normalized = normalizeMessageText(text, files.length);

  const row = await db.$transaction(async (tx) => {
    const created = await tx.chatMessage.create({
      data: {
        userId: user.id,
        text: normalized,
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
    // Кто пишет в чат, видит ленту: всё до его сообщения прочитано.
    await tx.user.update({ where: { id: user.id }, data: { chatReadAt: created.createdAt }, select: { id: true } });
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

/** Удаление мягкое: строка остаётся с пометкой, текст и файлы стираются. */
export async function deleteChatMessage(id: string, user: SessionUser): Promise<void> {
  const message = await loadMessage(id);
  if (!canDeleteMessage(message, user)) throw new ForbiddenError("Удалить можно только своё сообщение");
  await db.$transaction([
    db.chatAttachment.deleteMany({ where: { messageId: id } }),
    db.chatMessage.update({ where: { id }, data: { text: "", deletedAt: new Date() }, select: { id: true } }),
  ]);
}

/**
 * Чат прочитан до `upTo` — времени последнего сообщения, которое сотрудник увидел.
 * Отметка только двигается вперёд и не дальше текущего момента.
 */
export async function markChatRead(user: SessionUser, upTo: Date): Promise<void> {
  const now = new Date();
  const mark = upTo > now ? now : upTo;
  await db.user.updateMany({
    where: { id: user.id, OR: [{ chatReadAt: null }, { chatReadAt: { lt: mark } }] },
    data: { chatReadAt: mark },
  });
}

/** Чужие сообщения после отметки «прочитано». */
export async function unreadChatCount(userId: string): Promise<number> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { chatReadAt: true } });
  return db.chatMessage.count({
    where: {
      userId: { not: userId },
      deletedAt: null,
      ...(user?.chatReadAt ? { createdAt: { gt: user.chatReadAt } } : {}),
    },
  });
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
