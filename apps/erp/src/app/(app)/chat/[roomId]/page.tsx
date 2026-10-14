import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { GENERAL_CHAT_ROOM_ID } from "@buscom/domain/chat/room";
import { findChatRoom } from "@/server/chat/service";
import { ChatScreen } from "../chat-screen";

export async function generateMetadata({ params }: PageProps<"/chat/[roomId]">): Promise<Metadata> {
  const { roomId } = await params;
  const room = await findChatRoom(roomId);
  return { title: room ? `${room.name} — Чат — BusCom ERP` : "Чат — BusCom ERP" };
}

/** Комната чата по id. У «Общего чата» свой адрес — `/chat`. */
export default async function ChatRoomPage({ params }: PageProps<"/chat/[roomId]">) {
  const { roomId } = await params;
  if (roomId === GENERAL_CHAT_ROOM_ID) redirect("/chat");
  return <ChatScreen roomId={roomId} />;
}
