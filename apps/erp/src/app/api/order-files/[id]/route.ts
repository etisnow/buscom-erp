import { NextResponse, type NextRequest } from "next/server";
import { isGalleryImage } from "@buscom/domain/order/order-files";
import { readOrderFile } from "@/server/orders/order-files";
import { getSessionUser } from "@/server/session";

/**
 * Файл из галереи заказа. `?size=thumb` — миниатюра картинки для плитки (если её нет —
 * оригинал). Картинки открываются в браузере; всё остальное, включая PDF, отдаётся
 * скачиванием: так просили для документов галереи, а файл, который браузер мог бы
 * выполнить (HTML, SVG), на нашем домене не откроется с сессией сотрудника.
 */
export async function GET(request: NextRequest, { params }: RouteContext<"/api/order-files/[id]">) {
  // Маршрут под общей защитой proxy, но сессию проверяем и здесь: файл отдаётся напрямую.
  const user = await getSessionUser();
  if (!user) return new NextResponse(null, { status: 401 });

  const { id } = await params;
  const size = request.nextUrl.searchParams.get("size") === "thumb" ? "thumb" : "full";
  const file = await readOrderFile(id, size);
  if (!file) return new NextResponse("Файла нет: его удалили из заказа", { status: 404 });

  const inline = isGalleryImage(file.contentType);
  // Имя файла может быть кириллицей — filename* по RFC 5987 для не-ASCII
  const disposition = `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.fileName)}`;

  return new NextResponse(new Uint8Array(file.data), {
    headers: {
      "Content-Type": inline ? file.contentType : "application/octet-stream",
      "Content-Disposition": disposition,
      "Content-Security-Policy": "sandbox",
      // Файл по id не меняется (замены нет), но удаляется — поэтому не immutable навсегда
      "Cache-Control": "private, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
