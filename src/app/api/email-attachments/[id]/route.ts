import { NextResponse, type NextRequest } from "next/server";
import { readEmailAttachment } from "@/server/emails/service";
import { getSessionUser } from "@/server/session";

/**
 * Типы, которые можно открыть прямо во вкладке. Всё остальное — только скачиванием:
 * вложения входящих присылают посторонние люди, и HTML или SVG из письма, открытый
 * на нашем домене, выполнил бы свои скрипты с сессией сотрудника.
 */
const INLINE_TYPES = new Set(["application/pdf", "image/png", "image/jpeg", "image/gif", "image/webp"]);

export async function GET(_request: NextRequest, { params }: RouteContext<"/api/email-attachments/[id]">) {
  // Маршрут под общей защитой proxy, но сессию проверяем и здесь: файл отдаётся напрямую.
  const user = await getSessionUser();
  if (!user) return new NextResponse(null, { status: 401 });

  const { id } = await params;
  const file = await readEmailAttachment(id);
  if (!file?.data) return new NextResponse(null, { status: 404 });

  const inline = INLINE_TYPES.has(file.contentType.toLowerCase());
  // Имя файла может быть кириллицей — filename* по RFC 5987 для не-ASCII
  const disposition = `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.fileName)}`;

  return new NextResponse(new Uint8Array(file.data), {
    headers: {
      "Content-Type": inline ? file.contentType : "application/octet-stream",
      "Content-Disposition": disposition,
      "Content-Security-Policy": "sandbox",
      // Вложение не меняется: письмо хранится как пришло
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
