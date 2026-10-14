import type { Metadata } from "next";
import { GENERAL_CHAT_ROOM_ID } from "@buscom/domain/chat/room";
import { ChatScreen } from "./chat-screen";

export const metadata: Metadata = {
  title: "Чат — BusCom ERP",
};

/** «Общий чат» — комната по умолчанию; сюда ведут пункт меню и «Написать в чат» из заказа. */
export default async function ChatPage({ searchParams }: PageProps<"/chat">) {
  // «Написать в чат» из карточки заказа: /chat?order=3021 → черновик со ссылкой на заказ
  const { order } = await searchParams;
  const orderNumber = typeof order === "string" && /^\d{1,9}$/.test(order) ? order : null;
  return <ChatScreen roomId={GENERAL_CHAT_ROOM_ID} draft={orderNumber ? `Заказ №${orderNumber}: ` : ""} />;
}
