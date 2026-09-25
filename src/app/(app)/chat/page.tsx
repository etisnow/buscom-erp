import type { Metadata } from "next";
import { ChatRoom } from "@/components/chat/chat-room";
import { listChatMessages } from "@/server/chat/service";
import { requirePageUser } from "@/server/session";

export const metadata: Metadata = {
  title: "Чат — BusCom ERP",
};

/**
 * Общий чат сотрудников: один канал на всех. Лента обновляется опросом
 * (src/components/chat/chat-room.tsx), номера заказов в тексте — ссылки на карточки.
 */
export default async function ChatPage() {
  const user = await requirePageUser();
  // Курсор опроса берём до выборки: что изменится между ними, придёт с первым опросом.
  const cursor = new Date().toISOString();
  const { messages, hasMore } = await listChatMessages();

  return (
    <main className="flex h-[calc(100svh-3.5rem-2rem)] flex-col gap-4">
      <h1 className="font-heading text-xl font-semibold">Чат</h1>
      <ChatRoom
        initialMessages={messages}
        initialHasMore={hasMore}
        initialCursor={cursor}
        user={{ id: user.id, role: user.role }}
      />
    </main>
  );
}
