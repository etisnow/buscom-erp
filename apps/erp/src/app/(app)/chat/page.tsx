import type { Metadata } from "next";
import { ChatRoom } from "@/components/chat/chat-room";
import { listChatMessages, othersChatReadAt } from "@/server/chat/service";
import { requirePageUser } from "@/server/session";

export const metadata: Metadata = {
  title: "Чат — BusCom ERP",
};

/**
 * Общий чат сотрудников: один канал на всех. Лента обновляется опросом
 * (src/components/chat/chat-room.tsx), номера заказов в тексте — ссылки на карточки.
 */
export default async function ChatPage({ searchParams }: PageProps<"/chat">) {
  const user = await requirePageUser();
  // «Написать в чат» из карточки заказа: /chat?order=3021 → черновик со ссылкой на заказ
  const { order } = await searchParams;
  const orderNumber = typeof order === "string" && /^\d{1,9}$/.test(order) ? order : null;
  // Курсор опроса берём до выборки: что изменится между ними, придёт с первым опросом.
  const cursor = new Date().toISOString();
  const [{ messages, hasMore }, othersReadAt] = await Promise.all([listChatMessages(), othersChatReadAt(user.id)]);

  return (
    // Высота — экран минус шапка и отступы. На телефоне чат во весь экран между шапкой и нижним меню:
    // отступы контейнера (p-4 по краям, gap-4 и запас под меню внизу) гасятся отрицательными полями,
    // высота — экран минус шапка (3.5rem) и меню (3.5rem)
    <main className="flex h-[calc(100svh-3.5rem-2rem-env(safe-area-inset-top))] flex-col gap-4 max-md:-mx-4 max-md:-mt-4 max-md:-mb-8 max-md:h-[calc(100svh-7rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] max-md:gap-0">
      <h1 className="font-heading text-xl font-semibold max-md:hidden">Чат</h1>
      <ChatRoom
        initialMessages={messages}
        initialHasMore={hasMore}
        initialCursor={cursor}
        initialOthersReadAt={othersReadAt}
        user={{ id: user.id, role: user.role }}
        initialDraft={orderNumber ? `Заказ №${orderNumber}: ` : ""}
      />
    </main>
  );
}
