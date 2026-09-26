import { NextResponse } from "next/server";
import { unreadChatCount } from "@/server/chat/service";
import { getSessionUser } from "@/server/session";

/** Число непрочитанных в чате — для значка у пункта меню, который обновляется сам. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return new NextResponse(null, { status: 401 });
  return NextResponse.json({ count: await unreadChatCount(user.id) }, { headers: { "Cache-Control": "no-store" } });
}
