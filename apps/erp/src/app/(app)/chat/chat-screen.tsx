import { notFound } from "next/navigation";
import { ChatRoom } from "@/components/chat/chat-room";
import { ChatRooms } from "@/components/chat/chat-rooms";
import { findChatRoom, listChatMessages, listChatRooms, othersChatReadAt } from "@/server/chat/service";
import { requirePageUser } from "@/server/session";

/**
 * Экран чата: слева комнаты (на телефоне — строка над лентой), справа лента выбранной.
 * Лента обновляется опросом (src/components/chat/chat-room.tsx), номера заказов в тексте —
 * ссылки на карточки. Общий для `/chat` («Общий чат») и `/chat/[roomId]`.
 */
export async function ChatScreen({ roomId, draft = "" }: { roomId: string; draft?: string }) {
  const user = await requirePageUser();
  const room = await findChatRoom(roomId);
  if (!room) notFound();

  // Курсор опроса берём до выборки: что изменится между ними, придёт с первым опросом.
  const cursor = new Date().toISOString();
  const [{ messages, hasMore }, othersReadAt, rooms] = await Promise.all([
    listChatMessages(room.id),
    othersChatReadAt(room.id, user.id),
    listChatRooms(user.id),
  ]);

  return (
    // Высота — экран минус шапка и отступы. На телефоне чат во весь экран между шапкой и нижним меню:
    // отступы контейнера (p-4 по краям, gap-4 и запас под меню внизу) гасятся отрицательными полями,
    // высота — экран минус шапка (3.5rem) и меню (3.5rem)
    <main className="flex h-[calc(100svh-3.5rem-2rem-env(safe-area-inset-top))] flex-col gap-4 max-md:-mx-4 max-md:-mt-4 max-md:-mb-8 max-md:h-[calc(100svh-7rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] max-md:gap-0">
      <h1 className="font-heading text-xl font-semibold max-md:hidden">Чат</h1>
      <div className="flex min-h-0 flex-1 gap-4 max-md:flex-col max-md:gap-0">
        <ChatRooms initialRooms={rooms} current={room} user={{ id: user.id, role: user.role }} />
        <ChatRoom
          // Своя лента на комнату: при переходе состояние (черновик, курсор, ответ) начинается заново
          key={room.id}
          roomId={room.id}
          initialMessages={messages}
          initialHasMore={hasMore}
          initialCursor={cursor}
          initialOthersReadAt={othersReadAt}
          user={{ id: user.id, role: user.role }}
          initialDraft={draft}
        />
      </div>
    </main>
  );
}
