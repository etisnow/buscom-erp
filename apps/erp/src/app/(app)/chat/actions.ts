"use server";

import { after } from "next/server";
import { z } from "zod";
import { ChatError, MAX_ATTACHMENT_NAME } from "@buscom/domain/chat/message";
import { pushChatMessage } from "@/server/chat/push";
import {
  createChatRoom,
  deleteChatMessage,
  deleteChatRoom,
  editChatMessage,
  markChatRead,
  postChatMessage,
  renameChatRoom,
  toggleChatReaction,
  type ChatMessageView,
} from "@/server/chat/service";
import { ForbiddenError } from "@/server/errors";
import { requireUser } from "@/server/session";

export type ChatActionResult = { ok: true } | { ok: false; error: string };

/** Ошибки правил и прав — в текст для тоста, остальное — настоящая поломка. */
async function run(action: () => Promise<unknown>): Promise<ChatActionResult> {
  try {
    await action();
    return { ok: true };
  } catch (error) {
    if (error instanceof ChatError || error instanceof ForbiddenError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }
}

export async function sendChatMessageAction(
  form: FormData,
): Promise<{ ok: true; message: ChatMessageView } | { ok: false; error: string }> {
  const user = await requireUser();
  const roomId = form.get("roomId");
  const text = form.get("text");
  const replyTo = form.get("replyToId");
  const files = form.getAll("files").filter((file): file is File => file instanceof File);
  if (typeof roomId !== "string" || !roomId) return { ok: false, error: "Неизвестная комната" };

  const inputs = await Promise.all(
    files.map(async (file) => ({
      fileName: file.name.slice(0, MAX_ATTACHMENT_NAME) || "файл",
      data: new Uint8Array(await file.arrayBuffer()),
    })),
  );

  try {
    const message = await postChatMessage(
      user,
      roomId,
      typeof text === "string" ? text : "",
      inputs,
      typeof replyTo === "string" && replyTo ? replyTo : null,
    );
    // Пуши — после ответа: отправитель не ждёт сервисы Google и Apple
    after(() => pushChatMessage(roomId, message));
    return { ok: true, message };
  } catch (error) {
    if (error instanceof ChatError) return { ok: false, error: error.message };
    throw error;
  }
}

const editSchema = z.object({ id: z.string().min(1), text: z.string() });

export async function editChatMessageAction(input: z.input<typeof editSchema>): Promise<ChatActionResult> {
  const user = await requireUser();
  const parsed = editSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };
  return run(() => editChatMessage(parsed.data.id, parsed.data.text, user));
}

export async function deleteChatMessageAction(id: string): Promise<ChatActionResult> {
  const user = await requireUser();
  const parsed = z.string().min(1).safeParse(id);
  if (!parsed.success) return { ok: false, error: "Неизвестное сообщение" };
  return run(() => deleteChatMessage(parsed.data, user));
}

const reactionSchema = z.object({ id: z.string().min(1), emoji: z.string() });

/** Поставить или снять реакцию; в ответе — сообщение в новом виде. */
export async function toggleChatReactionAction(
  input: z.input<typeof reactionSchema>,
): Promise<{ ok: true; message: ChatMessageView } | { ok: false; error: string }> {
  const user = await requireUser();
  const parsed = reactionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Неизвестное сообщение" };
  try {
    return { ok: true, message: await toggleChatReaction(parsed.data.id, parsed.data.emoji, user) };
  } catch (error) {
    if (error instanceof ChatError || error instanceof ForbiddenError) return { ok: false, error: error.message };
    throw error;
  }
}

const readSchema = z.object({ roomId: z.string().min(1), upTo: z.iso.datetime() });

/** `upTo` — время последнего сообщения, которое сотрудник увидел в ленте комнаты. */
export async function markChatReadAction(input: z.input<typeof readSchema>): Promise<void> {
  const user = await requireUser();
  const parsed = readSchema.safeParse(input);
  if (!parsed.success) return;
  await markChatRead(user, parsed.data.roomId, new Date(parsed.data.upTo));
}

/** Новая комната; в ответе — её id, чтобы сразу в неё перейти. */
export async function createChatRoomAction(
  name: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = await requireUser();
  const parsed = z.string().safeParse(name);
  if (!parsed.success) return { ok: false, error: "Введите название комнаты" };
  try {
    const room = await createChatRoom(user, parsed.data);
    return { ok: true, id: room.id };
  } catch (error) {
    if (error instanceof ChatError) return { ok: false, error: error.message };
    throw error;
  }
}

const renameSchema = z.object({ id: z.string().min(1), name: z.string() });

export async function renameChatRoomAction(input: z.input<typeof renameSchema>): Promise<ChatActionResult> {
  const user = await requireUser();
  const parsed = renameSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Неизвестная комната" };
  return run(() => renameChatRoom(parsed.data.id, parsed.data.name, user));
}

export async function deleteChatRoomAction(id: string): Promise<ChatActionResult> {
  const user = await requireUser();
  const parsed = z.string().min(1).safeParse(id);
  if (!parsed.success) return { ok: false, error: "Неизвестная комната" };
  return run(() => deleteChatRoom(parsed.data, user));
}
