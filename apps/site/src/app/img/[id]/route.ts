import { NextResponse, type NextRequest } from "next/server";
import { readProductImage } from "@/server/catalog";

/**
 * Картинка товара: `?size=thumb` — превью для списков, без параметра — полная.
 * Замена картинки в ERP создаёт новую запись с новым id, поэтому ответ по id не
 * меняется никогда и кешируется надолго — и браузером, и прокси по пути.
 * До переезда картинок в хранилище с CDN (этап 3) отдаём из базы.
 */
export async function GET(request: NextRequest, { params }: RouteContext<"/img/[id]">) {
  const { id } = await params;
  const size = request.nextUrl.searchParams.get("size") === "thumb" ? "thumb" : "full";
  const image = await readProductImage(id, size);
  if (!image) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(image.data), {
    headers: {
      "Content-Type": image.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
