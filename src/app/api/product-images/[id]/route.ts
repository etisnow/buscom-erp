import { NextResponse, type NextRequest } from "next/server";
import { readImage } from "@/server/products/images";
import { getSessionUser } from "@/server/session";

/**
 * Картинка товара: `?size=thumb` — превью для списков, без параметра — полная.
 * Замена картинки создаёт новую запись с новым id, поэтому ответ по id не меняется
 * никогда и кешируется браузером надолго.
 */
export async function GET(request: NextRequest, { params }: RouteContext<"/api/product-images/[id]">) {
  // Маршрут под общей защитой proxy, но сессию проверяем и здесь: файл отдаётся напрямую.
  const user = await getSessionUser();
  if (!user) return new NextResponse(null, { status: 401 });

  const { id } = await params;
  const size = request.nextUrl.searchParams.get("size") === "thumb" ? "thumb" : "full";
  const image = await readImage(id, size);
  if (!image) return new NextResponse(null, { status: 404 });

  return new NextResponse(new Uint8Array(image.data), {
    headers: {
      "Content-Type": image.contentType,
      // private: картинки за авторизацией, в общие кеши по пути им нечего попадать.
      "Cache-Control": "private, max-age=31536000, immutable",
      // Тип определён по содержимому — браузеру не угадывать его по-своему.
      "X-Content-Type-Options": "nosniff",
    },
  });
}
