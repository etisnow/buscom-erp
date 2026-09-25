import "server-only";
import { chatPushPayload } from "@/domain/push/payload";
import type { ChatMessageView } from "@/server/chat/service";
import { db } from "@/server/db";
import { sendPush } from "@/server/push/service";

/** Пуш о новом сообщении всем, кроме автора. Вызывается после ответа (`after`), ошибки — только в лог. */
export async function pushChatMessage(message: ChatMessageView): Promise<void> {
  try {
    const recipients = await db.user.findMany({
      where: { isActive: true, id: { not: message.author.id }, pushDevices: { some: {} } },
      select: { id: true },
    });
    await sendPush(
      { userIds: recipients.map((user) => user.id) },
      chatPushPayload({
        authorName: message.author.name,
        text: message.text,
        attachmentCount: message.attachments.length,
      }),
    );
  } catch (error) {
    console.error(`[push] Пуш о сообщении чата не отправлен: ${error instanceof Error ? error.message : error}`);
  }
}
