import { NextResponse, type NextRequest } from "next/server";
import { readChatAttachment } from "@/server/chat/service";
import { getSessionUser } from "@/server/session";

/**
 * Во вкладке открываются только PDF и картинки — тип определён по содержимому при
 * загрузке (src/server/chat/service.ts). Остальное отдаётся скачиванием: HTML или SVG,
 * открытый на нашем домене, выполнил бы свои скрипты с сессией сотрудника.
 */
const INLINE_TYPES = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp"]);

export async function GET(_request: NextRequest, { params }: RouteContext<"/api/chat-attachments/[id]">) {
  // Маршрут под общей защитой proxy, но сессию проверяем и здесь: файл отдаётся напрямую.
  const user = await getSessionUser();
  if (!user) return new NextResponse(null, { status: 401 });

  const { id } = await params;
  const file = await readChatAttachment(id);
  if (!file) return new NextResponse("Файла нет: удалён вместе с сообщением или истёк срок хранения", { status: 404 });

  const inline = INLINE_TYPES.has(file.contentType);
  // Имя файла может быть кириллицей — filename* по RFC 5987 для не-ASCII
  const disposition = `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.fileName)}`;

  return new NextResponse(new Uint8Array(file.data), {
    headers: {
      "Content-Type": inline ? file.contentType : "application/octet-stream",
      "Content-Disposition": disposition,
      "Content-Security-Policy": "sandbox",
      // Не immutable: файл пропадает при удалении сообщения и по сроку хранения
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
