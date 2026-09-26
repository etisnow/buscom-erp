import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/server/env";
import { ingestSiteOrder } from "@/server/integrations/site-orders";
import { verifySignature } from "@/server/integrations/signature";

/**
 * Приём заказов с bus-com.ru (PRD, «Контракт входящего заказа (v1)»).
 * Маршрут выведен из-под проверки сессии в src/proxy.ts — у него своя подпись HMAC.
 */
export async function POST(request: NextRequest) {
  // Подпись считается от сырого тела: любая пересериализация JSON её сломает.
  const rawBody = await request.text();

  if (!verifySignature(rawBody, request.headers.get("x-signature"), env.SITE_WEBHOOK_SECRET)) {
    // 401 — в inbox не пишем: неподписанный запрос не считается заказом.
    return new NextResponse(null, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Тело запроса не является корректным JSON" }, { status: 400 });
  }

  const result = await ingestSiteOrder(payload);

  switch (result.status) {
    case 201:
      return NextResponse.json({ orderNumber: result.orderNumber }, { status: 201 });
    case 200:
      return NextResponse.json({ orderNumber: result.orderNumber, duplicate: true }, { status: 200 });
    case 202:
      return NextResponse.json({ inboxId: result.inboxId, error: result.error }, { status: 202 });
    case 400:
      return NextResponse.json({ error: result.error }, { status: 400 });
  }
}
