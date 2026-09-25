"use server";

import { after } from "next/server";
import { z } from "zod";
import { ChatError, MAX_ATTACHMENT_NAME } from "@/domain/chat/message";
import { pushChatMessage } from "@/server/chat/push";
import {
  deleteChatMessage,
  editChatMessage,
  markChatRead,
  postChatMessage,
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
  const text = form.get("text");
  const files = form.getAll("files").filter((file): file is File => file instanceof File);

  const inputs = await Promise.all(
    files.map(async (file) => ({
      fileName: file.name.slice(0, MAX_ATTACHMENT_NAME) || "файл",
      data: new Uint8Array(await file.arrayBuffer()),
    })),
  );

  try {
    const message = await postChatMessage(user, typeof text === "string" ? text : "", inputs);
    // Пуши — после ответа: отправитель не ждёт сервисы Google и Apple
    after(() => pushChatMessage(message));
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

/** `upTo` — время последнего сообщения, которое сотрудник увидел в ленте. */
export async function markChatReadAction(upTo: string): Promise<void> {
  const user = await requireUser();
  const date = z.iso.datetime().safeParse(upTo);
  if (!date.success) return;
  await markChatRead(user, new Date(date.data));
}
