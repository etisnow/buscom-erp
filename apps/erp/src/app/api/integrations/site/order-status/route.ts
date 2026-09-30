import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { env } from "@/server/env";
import { verifySignature } from "@/server/integrations/signature";
import { findClientOrderStatus } from "@/server/orders/client-status";

const bodySchema = z.object({
  number: z.number().int().positive().max(2_000_000_000),
  phone: z.string().min(1).max(40),
});

/**
 * Статус заказа для клиента (блок «Проверить статус заказа» на сайте): подписанный
 * запрос сайта с номером заказа и телефоном. Чужой заказ и неверный телефон
 * неотличимы — 404; частые попытки по одному номеру — 429.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  if (!verifySignature(rawBody, request.headers.get("x-signature"), env.SITE_WEBHOOK_SECRET)) {
    return new NextResponse(null, { status: 401 });
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(JSON.parse(rawBody));
  } catch {
    return NextResponse.json({ error: "Тело запроса не той формы" }, { status: 400 });
  }

  const result = await findClientOrderStatus(body.number, body.phone);
  if (result.ok) return NextResponse.json(result.status);
  return NextResponse.json({ error: result.reason }, { status: result.reason === "too-many" ? 429 : 404 });
}
