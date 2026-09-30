import { NextResponse } from "next/server";
import { readSalonLayoutImage } from "@/server/settings/salon-layouts";
import { getSessionUser } from "@/server/session";

/** Чертёж схемы салона. Как и картинки товаров — только для вошедших в ERP. */
export async function GET(_request: Request, { params }: RouteContext<"/api/salon-layouts/[id]/image">) {
  const user = await getSessionUser();
  if (!user) return new NextResponse(null, { status: 401 });

  const { id } = await params;
  const image = await readSalonLayoutImage(id);
  if (!image) return new NextResponse(null, { status: 404 });

  return new NextResponse(new Uint8Array(image.data), {
    headers: {
      "Content-Type": image.contentType,
      // Картинка схемы меняется редко, но по одному адресу — не «навсегда», как у товаров.
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
