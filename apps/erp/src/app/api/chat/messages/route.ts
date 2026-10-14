import { NextResponse, type NextRequest } from "next/server";
import { chatChangesSince, listChatMessages, listChatRooms, othersChatReadAt } from "@/server/chat/service";
import { getSessionUser } from "@/server/session";

/**
 * Лента комнаты чата для опроса со страницы `/chat`. `?room=<id>` — какая комната;
 * `?since=<ISO>` — изменения после курсора (заодно список комнат с непрочитанными);
 * `?before=<id>` — страница истории раньше сообщения.
 * GET, а не Server Action: действия Next выполняются по очереди, и опрос раз в
 * несколько секунд задерживал бы отправку сообщения.
 */
export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return new NextResponse(null, { status: 401 });

  const params = request.nextUrl.searchParams;
  const roomId = params.get("room");
  if (!roomId) return new NextResponse("Нужен room", { status: 400 });

  const before = params.get("before");
  if (before) return NextResponse.json(await listChatMessages(roomId, before), { headers: NO_STORE });

  const since = new Date(params.get("since") ?? "");
  if (Number.isNaN(since.getTime())) return new NextResponse("Нужен since или before", { status: 400 });

  // Курсор следующего опроса — время сервера до запроса: часы браузера могут врать.
  const serverTime = new Date().toISOString();
  const [messages, othersReadAt, rooms] = await Promise.all([
    chatChangesSince(roomId, since),
    othersChatReadAt(roomId, user.id),
    listChatRooms(user.id),
  ]);
  return NextResponse.json({ messages, serverTime, othersReadAt, rooms }, { headers: NO_STORE });
}

const NO_STORE = { "Cache-Control": "no-store" };
