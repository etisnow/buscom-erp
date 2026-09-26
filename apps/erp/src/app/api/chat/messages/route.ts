import { NextResponse, type NextRequest } from "next/server";
import { chatChangesSince, listChatMessages } from "@/server/chat/service";
import { getSessionUser } from "@/server/session";

/**
 * Лента чата для опроса со страницы `/chat`.
 * `?since=<ISO>` — изменения после курсора; `?before=<id>` — страница истории раньше сообщения.
 * GET, а не Server Action: действия Next выполняются по очереди, и опрос раз в
 * несколько секунд задерживал бы отправку сообщения.
 */
export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return new NextResponse(null, { status: 401 });

  const params = request.nextUrl.searchParams;
  const before = params.get("before");
  if (before) return NextResponse.json(await listChatMessages(before), { headers: NO_STORE });

  const since = new Date(params.get("since") ?? "");
  if (Number.isNaN(since.getTime())) return new NextResponse("Нужен since или before", { status: 400 });

  // Курсор следующего опроса — время сервера до запроса: часы браузера могут врать.
  const serverTime = new Date().toISOString();
  const messages = await chatChangesSince(since);
  return NextResponse.json({ messages, serverTime }, { headers: NO_STORE });
}

const NO_STORE = { "Cache-Control": "no-store" };
