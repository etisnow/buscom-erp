import { NextResponse, type NextRequest } from "next/server";
import { readOrderDocument } from "@/server/orders/order-documents";
import { getSessionUser } from "@/server/session";

/**
 * Файл заказа (транспортная накладная и т.п.): id не меняется, пока файл не
 * заменят — замена создаёт новую запись с новым id (src/server/orders/order-documents.ts),
 * поэтому ответ по этому адресу можно кешировать в браузере надолго.
 */
export async function GET(_request: NextRequest, { params }: RouteContext<"/api/order-documents/[id]">) {
  // Маршрут под общей защитой proxy, но сессию проверяем и здесь: файл отдаётся напрямую.
  const user = await getSessionUser();
  if (!user) return new NextResponse(null, { status: 401 });

  const { id } = await params;
  const doc = await readOrderDocument(id);
  if (!doc) return new NextResponse(null, { status: 404 });

  // Имя файла может быть кириллицей — filename* по RFC 5987 для не-ASCII
  const disposition = `inline; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`;

  return new NextResponse(new Uint8Array(doc.data), {
    headers: {
      "Content-Type": doc.contentType,
      "Content-Disposition": disposition,
      // private: файлы за авторизацией, в общие кеши по пути им нечего попадать.
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
