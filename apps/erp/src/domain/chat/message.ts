/**
 * Правила общего чата сотрудников: размер сообщения и файлов, кто правит и удаляет,
 * срок хранения файлов.
 */
import type { UserRole } from "@/generated/prisma/enums";

export const MAX_MESSAGE_LENGTH = 4000;
export const MAX_ATTACHMENTS = 10;
/** Все файлы сообщения вместе: запрос к Server Action ограничен 16 МБ (next.config.ts). */
export const MAX_ATTACHMENTS_BYTES = 15 * 1024 * 1024;
/** Файлы чата хранятся год, потом байты стираются, а отметка о файле остаётся. */
export const ATTACHMENT_RETENTION_DAYS = 365;
export const MAX_ATTACHMENT_NAME = 200;

export class ChatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChatError";
  }
}

/**
 * Текст сообщения перед сохранением: без пробелов по краям и без лишних пустых строк.
 * Пустой текст допустим только с файлами.
 */
export function normalizeMessageText(text: string, attachmentCount: number): string {
  const normalized = text
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!normalized && attachmentCount === 0) throw new ChatError("Напишите сообщение или прикрепите файл");
  if (normalized.length > MAX_MESSAGE_LENGTH) {
    throw new ChatError(`Сообщение длиннее ${MAX_MESSAGE_LENGTH} символов`);
  }
  return normalized;
}

export function assertAttachments(files: { byteSize: number }[]): void {
  if (files.length > MAX_ATTACHMENTS) throw new ChatError(`Не больше ${MAX_ATTACHMENTS} файлов в сообщении`);
  if (files.some((file) => file.byteSize === 0)) throw new ChatError("Один из файлов пустой");
  const total = files.reduce((sum, file) => sum + file.byteSize, 0);
  if (total > MAX_ATTACHMENTS_BYTES) {
    throw new ChatError(`Файлы вместе больше ${MAX_ATTACHMENTS_BYTES / 1024 / 1024} МБ`);
  }
}

type MessageOwner = { userId: string; deletedAt: Date | null };
type Actor = { id: string; role: UserRole };

/** Исправить можно только своё и не удалённое. */
export function canEditMessage(message: MessageOwner, user: Actor): boolean {
  return message.deletedAt === null && message.userId === user.id;
}

/** Удалить — своё; администратор удаляет и чужое (например, отправленное по ошибке). */
export function canDeleteMessage(message: MessageOwner, user: Actor): boolean {
  return message.deletedAt === null && (message.userId === user.id || user.role === "ADMIN");
}

/** Файлы, загруженные раньше этого момента, пора стирать. */
export function attachmentExpiryCutoff(now: Date): Date {
  return new Date(now.getTime() - ATTACHMENT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

/** Длина цитаты в ответе: одна-две строки на телефоне. */
export const REPLY_PREVIEW_LENGTH = 120;

/**
 * Цитата сообщения, на которое отвечают: текст в одну строку, обрезанный,
 * а у сообщения только с файлами — «📎 файл». Удалённое цитируется пометкой.
 */
export function replyPreview(message: { text: string; attachmentCount: number; deleted: boolean }): string {
  if (message.deleted) return "Сообщение удалено";
  const flat = message.text.replace(/\s+/g, " ").trim();
  if (flat) return flat.length > REPLY_PREVIEW_LENGTH ? `${flat.slice(0, REPLY_PREVIEW_LENGTH - 1)}…` : flat;
  return message.attachmentCount ? "📎 файл" : "";
}
