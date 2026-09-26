import { NextResponse, type NextRequest } from "next/server";
import { hasRole, MAILBOX_ROLES } from "@buscom/domain/user/role";
import { downloadLetterPart } from "@/server/emails/mailbox-browser";
import { getSessionUser } from "@/server/session";

/** Как у вложений переписки: во вкладке — только PDF и картинки без SVG, остальное скачиванием. */
const INLINE_TYPES = new Set(["application/pdf", "image/png", "image/jpeg", "image/gif", "image/webp"]);

/** Вложение письма живого ящика — прямо из IMAP, в ERP не сохраняется. */
export async function GET(request: NextRequest) {
  // Маршрут под общей защитой proxy, но сессию и роль проверяем и здесь: файл отдаётся напрямую.
  const user = await getSessionUser();
  if (!user) return new NextResponse(null, { status: 401 });
  if (!hasRole(user.role, MAILBOX_ROLES)) return new NextResponse(null, { status: 403 });

  const folder = request.nextUrl.searchParams.get("folder");
  const uid = Number(request.nextUrl.searchParams.get("uid"));
  const part = request.nextUrl.searchParams.get("part");
  if (!folder || !part || !/^[\d.]+$/.test(part) || !Number.isSafeInteger(uid) || uid <= 0) {
    return new NextResponse(null, { status: 400 });
  }

  const file = await downloadLetterPart(folder, uid, part);
  const inline = INLINE_TYPES.has(file.contentType.toLowerCase());
  // Имя файла может быть кириллицей — filename* по RFC 5987 для не-ASCII
  const disposition = `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.fileName)}`;

  return new NextResponse(new Uint8Array(file.data), {
    headers: {
      "Content-Type": inline ? file.contentType : "application/octet-stream",
      "Content-Disposition": disposition,
      "Content-Security-Policy": "sandbox",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
