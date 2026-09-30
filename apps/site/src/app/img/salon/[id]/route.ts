import { NextResponse, type NextRequest } from "next/server";
import { readSalonLayoutImage } from "@/server/catalog";

/**
 * Чертёж схемы салона (блок «Комплект на салон»). Адрес несёт версию (`?v=`) — заменили чертёж в
 * ERP, адрес новый, поэтому с версией кешируем надолго, без неё — коротко.
 */
export async function GET(request: NextRequest, { params }: RouteContext<"/img/salon/[id]">) {
  const { id } = await params;
  const image = await readSalonLayoutImage(id);
  if (!image) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(image.data), {
    headers: {
      "Content-Type": image.contentType,
      "Cache-Control": request.nextUrl.searchParams.has("v")
        ? "public, max-age=31536000, immutable"
        : "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
