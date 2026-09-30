import { NextResponse, type NextRequest } from "next/server";
import { readSalonLayoutImage } from "@/server/settings/salon-layouts";
import { getSessionUser } from "@/server/session";

/** Чертёж схемы салона. Как и картинки товаров — только для вошедших в ERP. */
export async function GET(request: NextRequest, { params }: RouteContext<"/api/salon-layouts/[id]/image">) {
  const user = await getSessionUser();
  if (!user) return new NextResponse(null, { status: 401 });

  const { id } = await params;
  const image = await readSalonLayoutImage(id);
  if (!image) return new NextResponse(null, { status: 404 });

  return new NextResponse(new Uint8Array(image.data), {
    headers: {
      "Content-Type": image.contentType,
      // С версией в адресе (?v=) файл по этому адресу не меняется — кешируем надолго. Без версии
      // чертёж могли заменить, поэтому кеш короткий.
      "Cache-Control": request.nextUrl.searchParams.has("v")
        ? "private, max-age=31536000, immutable"
        : "private, max-age=60",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
