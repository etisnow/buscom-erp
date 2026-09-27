import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { COMPANY } from "@buscom/domain/company";
import { leadLetter, leadSchema } from "@buscom/domain/site/lead";
import { env } from "@/server/env";
import { verifySignature } from "@/server/integrations/signature";
import { mailConfigured, sendLetter } from "@/server/mail";

const bodySchema = z.object({ lead: leadSchema, page: z.url().max(500) });

/**
 * Заявка с сайта — письмом на почту компании (решение владельца 27.09, DECISIONS).
 * Без настроенной почты — 503, а не запись в лог, как у `sendLetter`: заявка
 * потерялась бы молча, а так сайт попросит покупателя позвонить.
 *
 * Повтор той же формы (`requestId`) второго письма не шлёт. Помним в памяти процесса:
 * контейнер ERP один, а после перезапуска повтор старой формы маловероятен.
 */
const sent = new Map<string, number>();
const REMEMBER_MS = 24 * 60 * 60 * 1000;

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

  const now = Date.now();
  for (const [id, at] of sent) if (now - at > REMEMBER_MS) sent.delete(id);
  if (sent.has(body.lead.requestId)) return NextResponse.json({ ok: true, duplicate: true });

  if (!(await mailConfigured())) {
    console.error("[site/lead] Почта не настроена — заявка не отправлена");
    return NextResponse.json({ error: "Почта не настроена" }, { status: 503 });
  }
  try {
    await sendLetter({ to: COMPANY.email, ...leadLetter(body.lead, body.page) });
  } catch (error) {
    console.error("[site/lead] Письмо с заявкой не отправлено", error);
    return NextResponse.json({ error: "Письмо не отправлено" }, { status: 502 });
  }
  sent.set(body.lead.requestId, now);
  return NextResponse.json({ ok: true });
}
